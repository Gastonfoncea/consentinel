import { BehaviorGraph } from "./memory/behaviorGraph.js";
import { HashingVectorMemory } from "./memory/vectorMemory.js";
import { RiskEngine } from "./policy/riskEngine.js";
import { VoiceBiometricStepUp } from "./stepup/voiceBiometric.js";
import type {
  AgentActionRequest,
  PermissionDecision,
  StepUpChallenge,
  TrackRecordEvent,
  UserTrustProfile
} from "./domain/types.js";

export class PermissionKernel {
  private readonly graph = new BehaviorGraph();
  private readonly vectors = new HashingVectorMemory();
  private readonly risk = new RiskEngine();
  private readonly stepUp = new VoiceBiometricStepUp();

  constructor(private readonly profile: UserTrustProfile) {}

  record(event: TrackRecordEvent): void {
    this.graph.ingest(event);
    this.vectors.addEvent(event);
  }

  assess(request: AgentActionRequest): PermissionDecision {
    const graphEvidence = this.graph.explain(request);
    const similarActions = this.vectors.searchSimilar(request);
    const projectedEffects = this.graph.projectEffects(request);

    return this.risk.assess({
      request,
      profile: this.profile,
      graph: graphEvidence,
      similarActions,
      projectedEffects
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
      similarActions: this.vectors.searchSimilar(request),
      vectorMemorySize: this.vectors.size(),
      graphSnapshot: this.graph.snapshot()
    };
  }
}
