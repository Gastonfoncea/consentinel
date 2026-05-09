import assert from "node:assert/strict";
import test from "node:test";
import {
  demoProfile,
  demoRequests,
  demoUnknownCounterparty,
  seedEvents
} from "../demoFixtures.js";
import type { IntentDriftInput, IntentDriftResult, TrackRecordEvent } from "../domain/types.js";
import { PermissionKernel } from "../kernel.js";
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

function seededKernel() {
  const kernel = new PermissionKernel(demoProfile, {
    intentDriftEvaluator: deterministicDrift,
    clock: () => new Date("2026-05-09T12:00:00.000Z")
  });

  for (const event of seedEvents) {
    kernel.record(event);
  }

  return kernel;
}

test("MCP assessment handler returns decision, explanation inputs, and emitted events", async () => {
  const result = await assessAgentAction(seededKernel(), demoRequests[1]!);

  assert.equal(result.decision.outcome, "step_up");
  assert.ok(result.events.length >= 8);
  assert.equal(result.events[0]?.type, "request.received");
  assert.ok(result.graphEvidence.familiarityScore >= 0);
  assert.equal(result.intentDrift.provider, "heuristic");
  assert.equal(result.similarActions.length, result.decision.similarActions.length);
});

test("mock wallet transfer executes only after kernel allow path", async () => {
  const result = await mockExecuteWalletTransfer(seededKernel(), demoRequests[0]!, new Date("2026-05-09T12:00:00.000Z"));

  assert.equal(result.ok, true);
  assert.equal(result.status, "mock_executed");
  assert.equal(result.execution.mode, "mock");
  assert.match(result.execution.hash, /^0x[a-f0-9]{64}$/);
  assert.equal(result.preparation.asset, "USDC");
  assert.match(result.preparation.transaction.data, /^0xa9059cbb[a-f0-9]+$/);
});

test("wallet transfer preparation returns the real ERC-20 payload after kernel allow", async () => {
  const result = await prepareWalletTransfer(seededKernel(), demoRequests[0]!, new Date("2026-05-09T12:00:00.000Z"));

  assert.equal(result.ok, true);
  assert.equal(result.status, "prepared");
  assert.equal(result.preparation.transaction.to, "0x2222222222222222222222222222222222222222");
  assert.equal(result.preparation.amountBaseUnits, "20000000");
  assert.equal(result.preparation.transaction.value, "0x0");
});

test("mock wallet transfer returns step-up instead of executing for a claimed new wallet", async () => {
  const result = await mockExecuteWalletTransfer(seededKernel(), demoRequests[3]!, new Date("2026-05-09T12:00:00.000Z"));

  assert.equal(result.ok, false);
  assert.equal(result.status, "step_up_required");
  assert.equal(result.decision.outcome, "step_up");
  assert.ok(result.challenge);
});

test("mock wallet transfer can execute after the route has verified history", async () => {
  const kernel = seededKernel();
  const verifiedEvent: TrackRecordEvent = {
    eventId: "evt_promote_route",
    occurredAt: "2026-05-08T12:00:00.000Z",
    request: demoRequests[3]!,
    outcome: "allow",
    verifiedWith: "passkey"
  };
  kernel.record(verifiedEvent);

  const result = await mockExecuteWalletTransfer(kernel, demoRequests[3]!, new Date("2026-05-09T12:00:00.000Z"));

  assert.equal(result.ok, true);
  assert.equal(result.status, "mock_executed");
  assert.equal(result.decision.outcome, "allow");
});
