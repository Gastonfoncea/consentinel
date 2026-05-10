import type { AgentActionRequest, TrackRecordEvent } from "../domain/types";
import { buildX402Permission } from "../payments/x402";
import type { KernelRuntime } from "../runtime/runtime";

export function recordTrackEvent(runtime: KernelRuntime, event: TrackRecordEvent) {
  return runtime.recordTrackEvent(event);
}

export async function assessAgentAction(runtime: KernelRuntime, request: AgentActionRequest) {
  const evaluation = await runtime.assessAgentAction(request);

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

export function explainPermissionMemory(runtime: KernelRuntime, request: AgentActionRequest) {
  return runtime.explainPermissionMemory(request);
}

export async function createStepUpChallengeResponse(runtime: KernelRuntime, request: AgentActionRequest) {
  return runtime.createStandaloneStepUpChallenge(request);
}

export async function getStepUpChallenge(runtime: KernelRuntime, challengeId: string) {
  return runtime.getPendingStepUp(challengeId);
}

export async function confirmPhoneStepUp(
  runtime: KernelRuntime,
  challengeId: string,
  provider: "elevenlabs" | "manual" = "manual"
) {
  return runtime.confirmPhoneStepUp(challengeId, provider);
}

export async function rejectStepUp(runtime: KernelRuntime, challengeId: string, reason: "user_denied" | "duress") {
  return runtime.rejectStepUp(challengeId, reason);
}

export async function prepareWalletTransfer(runtime: KernelRuntime, request: AgentActionRequest, now = new Date()) {
  return runtime.prepareWalletTransfer(request, now);
}

export async function mockExecuteWalletTransfer(
  runtime: KernelRuntime,
  request: AgentActionRequest,
  now = new Date()
) {
  return runtime.mockExecuteWalletTransfer(request, now);
}
