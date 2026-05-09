import { actionHash } from "../domain/narrative.js";
import type {
  AgentActionRequest,
  DecisionSignal,
  PermissionDecision,
  PermissionOutcome,
  ProjectedEffect,
  SimilarAction,
  UserTrustProfile
} from "../domain/types.js";
import type { GraphEvidence } from "../memory/behaviorGraph.js";

export interface RiskEngineInput {
  request: AgentActionRequest;
  profile: UserTrustProfile;
  graph: GraphEvidence;
  similarActions: SimilarAction[];
  projectedEffects: ProjectedEffect[];
}

interface Thresholds {
  allow: number;
  audit: number;
  stepUp: number;
}

const thresholdsByMode: Record<UserTrustProfile["conservatism"], Thresholds> = {
  fast: { allow: 0.52, audit: 0.66, stepUp: 0.88 },
  balanced: { allow: 0.38, audit: 0.52, stepUp: 0.78 },
  paranoid: { allow: 0.24, audit: 0.36, stepUp: 0.62 }
};

export class RiskEngine {
  assess(input: RiskEngineInput): PermissionDecision {
    const { request, profile, graph, similarActions, projectedEffects } = input;
    const signals: DecisionSignal[] = [...graph.signals];
    const hardViolations = hardPolicyViolations(request, profile, graph);
    const baseRisk = baseActionRisk(request);
    const sensitivityRisk = sensitivityRiskScore(request);
    const reversibilityRisk = reversibilityRiskScore(request);
    const amountRisk = amountRiskScore(request, profile, graph.amountMultiple);
    const contextRisk = permissionViabilityRisk(request);
    const vectorRisk = vectorNoveltyRisk(similarActions);
    const blastRadius = projectedEffects.length
      ? projectedEffects.reduce((sum, effect) => sum + effect.severity * effect.confidence, 0) / projectedEffects.length
      : 0.05;
    const familiarityCredit = graph.familiarityScore * 0.28;
    const trustedDeviceCredit = profile.trustedDevice ? 0.05 : 0;

    signals.push(
      {
        name: "risk.base_action",
        score: baseRisk,
        rationale: `Base risk for action=${request.action}.`
      },
      {
        name: "risk.sensitivity",
        score: sensitivityRisk,
        rationale: `Data sensitivity risk for ${request.dataSensitivity}.`
      },
      {
        name: "risk.reversibility",
        score: reversibilityRisk,
        rationale: `Reversibility risk for ${request.reversibility}.`
      },
      {
        name: "risk.amount",
        score: amountRisk,
        rationale: request.amount
          ? `Amount risk for ${request.amount.value} ${request.amount.currency}, including autonomous spend policy.`
          : "No value transfer amount was attached."
      },
      {
        name: "risk.permission_viability",
        score: contextRisk.score,
        rationale: contextRisk.rationale
      },
      {
        name: "risk.vector_novelty",
        score: vectorRisk,
        rationale: similarActions.length
          ? `Top precedent similarity is ${similarActions[0]?.similarity.toFixed(2)}.`
          : "No prior vector precedents exist for this user."
      },
      {
        name: "risk.projected_blast_radius",
        score: blastRadius,
        rationale: "Estimated downstream impact if this permission is granted."
      },
      {
        name: "credit.familiarity",
        score: familiarityCredit,
        rationale: "Risk reduction from known graph relationships."
      }
    );

    for (const violation of hardViolations) {
      signals.push({
        name: "policy.hard_violation",
        score: 1,
        rationale: violation
      });
    }

    const rawScore =
      baseRisk * 0.18 +
      sensitivityRisk * 0.14 +
      reversibilityRisk * 0.12 +
      amountRisk * 0.14 +
      contextRisk.score * 0.22 +
      vectorRisk * 0.12 +
      blastRadius * 0.18 -
      familiarityCredit -
      trustedDeviceCredit +
      hardViolations.length * 0.22;

    const riskScore = clamp(rawScore, 0, 1);
    const outcome = chooseOutcome(riskScore, profile, hardViolations);
    const requiredStepUp = outcome === "step_up" ? profile.preferredStepUp : undefined;

    return {
      requestId: request.requestId,
      outcome,
      riskScore,
      actionHash: actionHash(request),
      signals,
      similarActions,
      projectedEffects,
      requiredStepUp,
      explanation: explainOutcome(outcome, riskScore, hardViolations, request)
    };
  }
}

function chooseOutcome(
  riskScore: number,
  profile: UserTrustProfile,
  hardViolations: string[]
): PermissionOutcome {
  if (hardViolations.some((violation) => violation.startsWith("DENY:"))) return "deny";
  if (hardViolations.some((violation) => violation.startsWith("STEP_UP:"))) return "step_up";

  const thresholds = thresholdsByMode[profile.conservatism];
  if (riskScore < thresholds.allow) return "allow";
  if (riskScore < thresholds.audit) return "allow_with_audit";
  if (riskScore < thresholds.stepUp) return "step_up";
  return "deny";
}

function hardPolicyViolations(
  request: AgentActionRequest,
  profile: UserTrustProfile,
  graph: GraphEvidence
): string[] {
  const violations: string[] = [];

  if (request.action === "share" && request.dataSensitivity === "secret") {
    violations.push("DENY: secret data cannot be shared autonomously.");
  }

  if (request.action === "delete" && request.reversibility === "irreversible") {
    violations.push("DENY: irreversible delete requires a separate recovery workflow.");
  }

  if (request.amount && request.amount.value > profile.maxAutonomousSpend.value * 4) {
    violations.push("DENY: amount exceeds four times the user's autonomous spend ceiling.");
  }

  if (request.amount && graph.newCounterparty && request.amount.value > profile.maxAutonomousSpend.value) {
    violations.push("STEP_UP: new counterparty exceeds autonomous spend ceiling.");
  }

  if (
    request.context?.expectedCounterparty &&
    request.counterparty &&
    normalize(request.context.expectedCounterparty) !== normalize(request.counterparty) &&
    request.context.sourceTrust === "untrusted"
  ) {
    violations.push("STEP_UP: action diverges from the delegated recipient under untrusted context.");
  }

  return violations;
}

function baseActionRisk(request: AgentActionRequest): number {
  const actionRisk: Record<AgentActionRequest["action"], number> = {
    read: 0.12,
    write: 0.28,
    send: 0.42,
    pay: 0.58,
    share: 0.54,
    delete: 0.74,
    trade: 0.66,
    configure: 0.68
  };
  return actionRisk[request.action] + (request.x402 ? 0.06 : 0);
}

function sensitivityRiskScore(request: AgentActionRequest): number {
  const sensitivity: Record<AgentActionRequest["dataSensitivity"], number> = {
    public: 0.05,
    internal: 0.18,
    personal: 0.36,
    financial: 0.56,
    secret: 0.86
  };
  return sensitivity[request.dataSensitivity];
}

function reversibilityRiskScore(request: AgentActionRequest): number {
  const reversibility: Record<AgentActionRequest["reversibility"], number> = {
    reversible: 0.08,
    compensatable: 0.34,
    irreversible: 0.78
  };
  return reversibility[request.reversibility];
}

function amountRiskScore(
  request: AgentActionRequest,
  profile: UserTrustProfile,
  amountMultiple: number
): number {
  if (!request.amount) return 0.04;

  const spendRatio = request.amount.value / Math.max(profile.maxAutonomousSpend.value, 1);
  const ratioRisk = Math.min(spendRatio, 2) / 2;
  const anomalyRisk = amountMultiple > 0 ? Math.min(Math.max(amountMultiple - 1, 0) / 4, 1) : 0.24;

  return clamp(ratioRisk * 0.72 + anomalyRisk * 0.28, 0, 1);
}

function vectorNoveltyRisk(similarActions: SimilarAction[]): number {
  if (!similarActions.length) return 0.62;
  const top = similarActions[0];
  const deniedNeighborPenalty = similarActions.some((action) => action.outcome === "deny" && action.similarity > 0.72)
    ? 0.22
    : 0;
  return clamp(1 - Math.max(top.similarity, 0) + deniedNeighborPenalty, 0, 1);
}

function permissionViabilityRisk(request: AgentActionRequest): { score: number; rationale: string } {
  const context = request.context;
  if (!context) {
    return {
      score: 0.18,
      rationale: "No explicit delegated-action context was supplied, so viability is inferred from behavior only."
    };
  }

  const sourceRisk: Record<NonNullable<AgentActionRequest["context"]>["sourceTrust"], number> = {
    trusted: 0.04,
    mixed: 0.34,
    untrusted: 0.72
  };

  const counterpartyMismatch =
    context.expectedCounterparty && request.counterparty
      ? normalize(context.expectedCounterparty) === normalize(request.counterparty)
        ? 0
        : 1
      : 0;

  const amountMismatch =
    context.expectedAmount && request.amount
      ? clamp((request.amount.value / Math.max(context.expectedAmount.value, 1) - 1) / 2, 0, 1)
      : 0;

  const intentDrift = context.originalUserRequest
    ? 1 - tokenOverlap(context.originalUserRequest, buildActionNarrative(request))
    : 0.12;

  const score = clamp(
    sourceRisk[context.sourceTrust] * 0.3 +
      counterpartyMismatch * 0.34 +
      amountMismatch * 0.18 +
      intentDrift * 0.18,
    0,
    1
  );

  const rationale = [
    `Source=${context.source} trust=${context.sourceTrust}.`,
    counterpartyMismatch
      ? `Requested counterparty ${request.counterparty ?? "none"} differs from expected ${context.expectedCounterparty}.`
      : "Requested counterparty matches delegated expectations.",
    context.expectedAmount && request.amount
      ? `Requested amount is ${request.amount.value} vs expected ${context.expectedAmount.value}.`
      : "No explicit expected amount was supplied.",
    context.originalUserRequest
      ? `Intent overlap with the original user request is ${(1 - intentDrift).toFixed(2)}.`
      : "No original user request text was supplied for drift comparison."
  ].join(" ");

  return { score, rationale };
}

function explainOutcome(
  outcome: PermissionOutcome,
  riskScore: number,
  violations: string[],
  request: AgentActionRequest
): string {
  if (outcome === "deny") {
    return `Denied ${request.action} on ${request.service}: ${violations.join(" ") || "risk exceeded deny threshold."}`;
  }

  if (outcome === "step_up") {
    return `Step-up required before ${request.action} on ${request.service}; risk=${riskScore.toFixed(2)} and action must be verified out-of-band.`;
  }

  if (outcome === "allow_with_audit") {
    return `Allowed with audit because risk=${riskScore.toFixed(2)} is moderate but within policy.`;
  }

  return `Allowed autonomously because risk=${riskScore.toFixed(2)} is low for this user's track record.`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function buildActionNarrative(request: AgentActionRequest): string {
  return [request.action, request.resource, request.intent, request.counterparty ?? ""].join(" ");
}

function tokenOverlap(left: string, right: string): number {
  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1;
  }

  const denominator = Math.max(leftTokens.size, rightTokens.size);
  return denominator === 0 ? 0 : intersection / denominator;
}

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function normalize(input: string): string {
  return input.trim().toLowerCase();
}
