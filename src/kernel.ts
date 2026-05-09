import type {
  AgentActionRequest,
  ConsentinelEvent,
  IntentDriftResult,
  NormalizedX402Context,
  PermissionDecision,
  StepUpChallenge,
  TrackRecordEvent,
  UserTrustProfile
} from "./domain/types.js";
import {
  BehaviorGraph,
  type GraphEvidence,
  type GraphRelationship,
  type GraphRelationshipQuery
} from "./memory/behaviorGraph.js";
import { HashingVectorMemory } from "./memory/vectorMemory.js";
import { AnthropicIntentDriftEvaluator, type IntentDriftEvaluator } from "./intent/intentDrift.js";
import { normalizeX402Context } from "./payments/x402.js";
import { RiskEngine } from "./policy/riskEngine.js";
import { VoiceBiometricStepUp } from "./stepup/voiceBiometric.js";

export interface KernelDecisionTrace {
  decision: PermissionDecision;
  events: ConsentinelEvent[];
  graphEvidence: GraphEvidence;
  similarActions: PermissionDecision["similarActions"];
  projectedEffects: PermissionDecision["projectedEffects"];
  intentDrift: IntentDriftResult;
  normalizedX402?: NormalizedX402Context;
}

interface PermissionKernelOptions {
  intentDriftEvaluator?: IntentDriftEvaluator;
  clock?: () => Date;
}

export class PermissionKernel {
  private readonly graph = new BehaviorGraph();
  private readonly vectors = new HashingVectorMemory();
  private readonly risk = new RiskEngine();
  private readonly stepUp = new VoiceBiometricStepUp();
  private readonly intentDrift: IntentDriftEvaluator;
  private readonly clock: () => Date;

  constructor(
    private readonly profile: UserTrustProfile,
    options: PermissionKernelOptions = {}
  ) {
    this.intentDrift = options.intentDriftEvaluator ?? new AnthropicIntentDriftEvaluator();
    this.clock = options.clock ?? (() => new Date());
  }

  record(event: TrackRecordEvent): void {
    this.graph.ingest(event);
    this.vectors.addEvent(event);
  }

  async decide(request: AgentActionRequest): Promise<KernelDecisionTrace> {
    const events: ConsentinelEvent[] = [];
    const at = this.clock().toISOString();
    const graphEvidence = this.graph.explain(request);
    const similarActions = this.vectors.findSimilarActions(request);
    const projectedEffects = this.graph.projectEffects(request);
    const intentDrift = await this.intentDrift.evaluate(buildIntentDriftInput(request));
    const normalizedX402 = normalizeX402Context(request);
    const decision = this.risk.assess({
      request,
      profile: this.profile,
      graph: graphEvidence,
      similarActions,
      projectedEffects,
      intentDrift,
      normalizedX402
    });

    events.push(
      event(at, "request.received", "Normalized agent action received for evaluation.", {
        requestId: request.requestId,
        action: request.action,
        service: request.service
      }),
      event(at, "graph.evaluated", "Behavior graph evidence computed.", {
        familiarityScore: graphEvidence.familiarityScore,
        newCounterparty: graphEvidence.newCounterparty,
        amountMultiple: graphEvidence.amountMultiple
      }),
      event(at, "memory.similarity_retrieved", "Vector precedents retrieved for the action narrative.", {
        similarCount: similarActions.length,
        topSimilarity: similarActions[0]?.similarity ?? 0
      }),
      event(at, "intent_drift.evaluated", "Intent drift evaluated against the delegated request.", {
        provider: intentDrift.provider,
        driftDetected: intentDrift.driftDetected,
        confidence: intentDrift.confidence,
        score: intentDrift.score
      }),
      event(at, "x402.normalized", normalizedX402 ? "x402 payment context normalized for policy scoring." : "No x402 payment context attached to this action.", {
        hasX402: Boolean(normalizedX402),
        withinConfiguredSpend: normalizedX402?.withinConfiguredSpend ?? true,
        requestedToMaximumRatio: normalizedX402?.requestedToMaximumRatio ?? 0
      }),
      event(at, "risk.scored", "Risk engine aggregated signals and computed the final score.", {
        riskScore: decision.riskScore,
        signalCount: decision.signals.length
      }),
      event(at, "decision.made", `Final outcome selected: ${decision.outcome}.`, {
        outcome: decision.outcome,
        requiredStepUp: decision.requiredStepUp ?? null
      }),
      event(at, "step_up.required", decision.outcome === "step_up" ? "Out-of-band verification is required before execution." : "No step-up is required for this action.", {
        required: decision.outcome === "step_up",
        channel: decision.requiredStepUp ?? null
      })
    );

    return {
      decision,
      events,
      graphEvidence,
      similarActions,
      projectedEffects,
      intentDrift,
      normalizedX402
    };
  }

  assess(request: AgentActionRequest): PermissionDecision {
    const graphEvidence = this.graph.explain(request);
    const similarActions = this.vectors.findSimilarActions(request);
    const projectedEffects = this.graph.projectEffects(request);
    const intentDrift = this.intentDrift.evaluateSync(buildIntentDriftInput(request));
    const normalizedX402 = normalizeX402Context(request);

    return this.risk.assess({
      request,
      profile: this.profile,
      graph: graphEvidence,
      similarActions,
      projectedEffects,
      intentDrift,
      normalizedX402
    });
  }

  createStepUpChallenge(
    request: AgentActionRequest,
    decision: PermissionDecision,
    now = new Date()
  ): StepUpChallenge {
    return this.stepUp.createChallenge(request, this.profile, decision, now);
  }

  explainMemory(request: AgentActionRequest) {
    return {
      graph: this.graph.explain(request),
      similarActions: this.vectors.findSimilarActions(request),
      vectorMemorySize: this.vectors.size(),
      graphSnapshot: this.graph.snapshot()
    };
  }

  queryGraphRelationship(query: GraphRelationshipQuery): GraphRelationship | undefined {
    return this.graph.queryRelationship(query);
  }

  findSimilarActions(request: AgentActionRequest, limit = 5) {
    return this.vectors.findSimilarActions(request, limit);
  }
}

function buildIntentDriftInput(request: AgentActionRequest) {
  return {
    originalUserRequest: request.context?.originalUserRequest,
    proposedActionNarrative: compactActionNarrative(request),
    source: request.context?.source ?? "unknown",
    sourceTrust: request.context?.sourceTrust ?? "mixed",
    expectedCounterparty: request.context?.expectedCounterparty,
    actualCounterparty: request.counterparty,
    expectedAmount: request.context?.expectedAmount,
    actualAmount: request.amount
  } as const;
}

function compactActionNarrative(request: AgentActionRequest): string {
  return [
    `intent=${request.intent}`,
    `counterparty=${request.counterparty ?? "none"}`,
    request.amount ? `amount=${request.amount.value} ${request.amount.currency}` : "amount=none"
  ].join(" ");
}

function event(
  at: string,
  type: ConsentinelEvent["type"],
  summary: string,
  payload?: Record<string, unknown>
): ConsentinelEvent {
  return { type, at, summary, payload };
}
