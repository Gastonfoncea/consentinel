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

export async function mockExecuteWalletTransfer(
  kernel: PermissionKernel,
  request: AgentActionRequest,
  now = new Date()
) {
  const evaluation = await kernel.decide(request);

  if (evaluation.decision.outcome === "deny") {
    return {
      ok: false,
      status: "blocked",
      reason: "Decision was deny; mock wallet transfer was not executed.",
      decision: evaluation.decision,
      events: evaluation.events
    };
  }

  if (evaluation.decision.outcome === "step_up") {
    return {
      ok: false,
      status: "step_up_required",
      reason: "Mock wallet transfer requires step-up before execution.",
      decision: evaluation.decision,
      events: evaluation.events,
      challenge: kernel.createStepUpChallenge(request, evaluation.decision, now)
    };
  }

  const executionEvent: TrackRecordEvent = {
    eventId: `evt_exec_${evaluation.decision.actionHash.slice(0, 12)}`,
    occurredAt: now.toISOString(),
    request,
    outcome: evaluation.decision.outcome,
    verifiedWith: "none"
  };
  kernel.record(executionEvent);

  return {
    ok: true,
    status: "mock_executed",
    decision: evaluation.decision,
    events: evaluation.events,
    execution: {
      mode: "mock" as const,
      eventId: executionEvent.eventId,
      hash: `0x${evaluation.decision.actionHash}`,
      from: "mock_wallet",
      to: request.counterparty ?? "unknown",
      amount: request.amount?.value ?? 0,
      asset: request.amount?.currency ?? "USDC"
    }
  };
}
