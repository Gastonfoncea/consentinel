import type { AgentActionRequest, TrackRecordEvent } from "../domain/types.js";
import type { PermissionKernel } from "../kernel.js";
import { buildX402Permission } from "../payments/x402.js";

export function recordTrackEvent(kernel: PermissionKernel, event: TrackRecordEvent) {
  kernel.record(event);
  return { ok: true, eventId: event.eventId };
}

export async function assessAgentAction(kernel: PermissionKernel, request: AgentActionRequest) {
  const evaluation = await kernel.decide(request);

  return {
    decision: evaluation.decision,
    events: evaluation.events,
    graphEvidence: evaluation.graphEvidence,
    intentDrift: evaluation.intentDrift,
    similarActions: evaluation.similarActions,
    projectedEffects: evaluation.projectedEffects,
    normalizedX402: evaluation.normalizedX402,
    x402: buildX402Permission(request)
  };
}

export function explainPermissionMemory(kernel: PermissionKernel, request: AgentActionRequest) {
  return kernel.explainMemory(request);
}

export async function createStepUpChallengeResponse(kernel: PermissionKernel, request: AgentActionRequest) {
  const evaluation = await kernel.decide(request);
  if (evaluation.decision.outcome !== "step_up") {
    return {
      ok: false,
      reason: `Decision was ${evaluation.decision.outcome}; no step-up challenge is required.`,
      decision: evaluation.decision,
      events: evaluation.events
    };
  }

  return {
    ok: true,
    decision: evaluation.decision,
    events: evaluation.events,
    challenge: kernel.createStepUpChallenge(request, evaluation.decision)
  };
}
