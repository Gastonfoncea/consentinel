import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { demoProfile, demoRequests, demoUnknownCounterparty, seedEvents } from "../demoFixtures.js";
import type { IntentDriftInput, IntentDriftResult, TrackRecordEvent } from "../domain/types.js";
import { FileDurableEventRepository, FilePendingStepUpRepository } from "../runtime/repositories.js";
import { KernelRuntime } from "../runtime/runtime.js";
import { assessAgentAction, mockExecuteWalletTransfer, prepareWalletTransfer } from "./handlers.js";

process.env.WALLET_PRIVATE_KEY ??=
  "0x1111111111111111111111111111111111111111111111111111111111111111";
process.env.USDC_CONTRACT ??= "0x2222222222222222222222222222222222222222";

const deterministicDrift = {
  async evaluate(input: IntentDriftInput): Promise<IntentDriftResult> {
    return this.evaluateSync(input);
  },
  evaluateSync(input: IntentDriftInput): IntentDriftResult {
    return {
      driftDetected: input.actualCounterparty === demoUnknownCounterparty,
      confidence: 0.81,
      score: input.actualCounterparty === demoUnknownCounterparty ? 0.76 : 0.1,
      reasoning: "Deterministic test evaluator.",
      provider: "heuristic"
    };
  }
};

function seededRuntime() {
  const tempDir = mkdtempSync(join(tmpdir(), "handlers-runtime-"));
  const runtime = new KernelRuntime({
    profile: demoProfile,
    seedTrackEvents: seedEvents,
    durableEvents: new FileDurableEventRepository(join(tempDir, "durable-events.jsonl")),
    pendingStepUps: new FilePendingStepUpRepository(join(tempDir, "pending-stepups.json")),
    intentDriftEvaluator: deterministicDrift,
    clock: () => new Date("2026-05-09T12:00:00.000Z")
  });

  return {
    runtime,
    cleanup() {
      rmSync(tempDir, { recursive: true, force: true });
    }
  };
}

test("MCP assessment handler returns decision, explanation inputs, and emitted events", async () => {
  const { runtime, cleanup } = seededRuntime();
  const result = await assessAgentAction(runtime, demoRequests[1]!);

  assert.equal(result.decision.outcome, "step_up");
  assert.ok(result.events.length >= 8);
  assert.equal(result.events[0]?.type, "request.received");
  assert.ok(result.graphEvidence.familiarityScore >= 0);
  assert.equal(result.intentDrift.provider, "heuristic");
  assert.equal(result.similarActions.length, result.decision.similarActions.length);

  cleanup();
});

test("mock wallet transfer executes only after kernel allow path", async () => {
  const { runtime, cleanup } = seededRuntime();
  const result = await mockExecuteWalletTransfer(runtime, demoRequests[0]!, new Date("2026-05-09T12:00:00.000Z"));

  assert.equal(result.ok, true);
  assert.equal(result.status, "mock_executed");
  assert.equal(result.execution.mode, "mock");
  assert.match(result.execution.hash, /^0x[a-f0-9]{64}$/);
  assert.equal(result.preparation.asset, "USDC");
  assert.match(result.preparation.transaction.data, /^0xa9059cbb[a-f0-9]+$/);

  cleanup();
});

test("wallet transfer preparation returns the real ERC-20 payload after kernel allow", async () => {
  const { runtime, cleanup } = seededRuntime();
  const result = await prepareWalletTransfer(runtime, demoRequests[0]!, new Date("2026-05-09T12:00:00.000Z"));

  assert.equal(result.ok, true);
  assert.equal(result.status, "prepared");
  assert.equal(result.preparation.transaction.to, "0x2222222222222222222222222222222222222222");
  assert.equal(result.preparation.amountBaseUnits, "20000000");
  assert.equal(result.preparation.transaction.value, "0x0");

  cleanup();
});

test("mock wallet transfer returns step-up instead of executing for a claimed new wallet", async () => {
  const { runtime, cleanup } = seededRuntime();
  const result = await mockExecuteWalletTransfer(runtime, demoRequests[3]!, new Date("2026-05-09T12:00:00.000Z"));

  assert.equal(result.ok, false);
  assert.equal(result.status, "step_up_required");
  assert.equal(result.decision.outcome, "step_up");
  assert.ok(result.challenge);
  assert.ok(result.challengeId);

  cleanup();
});

test("mock wallet transfer can execute after the route has verified history", async () => {
  const { runtime, cleanup } = seededRuntime();
  const verifiedEvent: TrackRecordEvent = {
    eventId: "evt_promote_route",
    occurredAt: "2026-05-08T12:00:00.000Z",
    request: demoRequests[3]!,
    outcome: "allow",
    verifiedWith: "passkey"
  };
  await runtime.recordTrackEvent(verifiedEvent, "manual");

  const result = await mockExecuteWalletTransfer(runtime, demoRequests[3]!, new Date("2026-05-09T12:00:00.000Z"));

  assert.equal(result.ok, true);
  assert.equal(result.status, "mock_executed");
  assert.equal(result.decision.outcome, "allow");

  cleanup();
});
