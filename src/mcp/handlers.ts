import type { AgentActionRequest, TrackRecordEvent } from "../domain/types.js";
import type { PermissionKernel } from "../kernel.js";
import { buildX402Permission } from "../payments/x402.js";
import { isAddress, type Address } from "viem";
import {
  WalletConfigError,
  prepareUsdcTransfer
} from "../wallet/wallet.js";

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

export async function prepareWalletTransfer(kernel: PermissionKernel, request: AgentActionRequest, now = new Date()) {
  const evaluation = await kernel.decide(request);

  if (evaluation.decision.outcome === "deny") {
    return {
      ok: false,
      status: "blocked",
      reason: "Decision was deny; wallet transfer was not prepared.",
      decision: evaluation.decision,
      events: evaluation.events
    };
  }

  if (evaluation.decision.outcome === "step_up") {
    return {
      ok: false,
      status: "step_up_required",
      reason: "Wallet transfer requires step-up before preparation can produce an executable payload.",
      decision: evaluation.decision,
      events: evaluation.events,
      challenge: kernel.createStepUpChallenge(request, evaluation.decision, now)
    };
  }

  if (!request.counterparty) {
    return {
      ok: false,
      status: "invalid_request",
      reason: "Wallet transfer preparation requires an explicit destination address.",
      decision: evaluation.decision,
      events: evaluation.events
    };
  }

  if (!isAddress(request.counterparty)) {
    return {
      ok: false,
      status: "invalid_request",
      reason: "Wallet transfer preparation requires a valid EVM destination address.",
      decision: evaluation.decision,
      events: evaluation.events
    };
  }

  if (!request.amount) {
    return {
      ok: false,
      status: "invalid_request",
      reason: "Wallet transfer preparation requires an explicit amount.",
      decision: evaluation.decision,
      events: evaluation.events
    };
  }

  try {
    const preparation = prepareUsdcTransfer(request.counterparty as Address, request.amount.value.toString());
    return {
      ok: true,
      status: "prepared",
      decision: evaluation.decision,
      events: evaluation.events,
      preparation
    };
  } catch (error) {
    if (error instanceof WalletConfigError) {
      return {
        ok: false,
        status: "wallet_unavailable",
        reason: error.message,
        decision: evaluation.decision,
        events: evaluation.events
      };
    }

    throw error;
  }
}

export async function mockExecuteWalletTransfer(
  kernel: PermissionKernel,
  request: AgentActionRequest,
  now = new Date()
) {
  const prepared = await prepareWalletTransfer(kernel, request, now);
  if (!prepared.ok) {
    return {
      ...prepared,
      reason:
        prepared.status === "blocked"
          ? "Decision was deny; mock wallet transfer was not executed."
          : prepared.reason
    };
  }

  const preparation = prepared.preparation;
  if (!preparation) {
    return {
      ok: false,
      status: "invalid_request",
      reason: "Wallet transfer execution requires a prepared transaction payload.",
      decision: prepared.decision,
      events: prepared.events
    };
  }

  const executionEvent: TrackRecordEvent = {
    eventId: `evt_exec_${prepared.decision.actionHash.slice(0, 12)}`,
    occurredAt: now.toISOString(),
    request,
    outcome: prepared.decision.outcome,
    verifiedWith: "none"
  };
  kernel.record(executionEvent);

  return {
    ok: true,
    status: "mock_executed",
    decision: prepared.decision,
    events: prepared.events,
    preparation,
    execution: {
      mode: "mock" as const,
      eventId: executionEvent.eventId,
      hash: `0x${prepared.decision.actionHash}`,
      from: preparation.from,
      to: preparation.to,
      amount: request.amount?.value ?? 0,
      asset: request.amount?.currency ?? "USDC",
      transaction: preparation.transaction
    }
  };
}
