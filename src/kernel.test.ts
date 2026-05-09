import assert from "node:assert/strict";
import test from "node:test";
import { demoProfile, demoRequests, seedEvents } from "./demoFixtures.js";
import type { AgentActionRequest, IntentDriftInput, IntentDriftResult } from "./domain/types.js";
import { PermissionKernel } from "./kernel.js";
import { normalizeX402Context } from "./payments/x402.js";

const deterministicDrift = {
  async evaluate(input: IntentDriftInput): Promise<IntentDriftResult> {
    return this.evaluateSync(input);
  },
  evaluateSync(input: IntentDriftInput): IntentDriftResult {
    const counterpartyChanged =
      input.expectedCounterparty && input.actualCounterparty
        ? input.expectedCounterparty.toLowerCase() !== input.actualCounterparty.toLowerCase()
        : false;
    const score = counterpartyChanged ? 0.8 : 0.12;
    return {
      driftDetected: counterpartyChanged,
      confidence: counterpartyChanged ? 0.88 : 0.42,
      score,
      reasoning: counterpartyChanged ? "Counterparty changed from the delegated recipient." : "Request remains aligned.",
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

test("kernel decide returns the ordered event trace for a single decision", async () => {
  const kernel = seededKernel();
  const evaluation = await kernel.decide(demoRequests[0]);

  assert.deepEqual(
    evaluation.events.map((entry) => entry.type),
    [
      "request.received",
      "graph.evaluated",
      "memory.similarity_retrieved",
      "intent_drift.evaluated",
      "x402.normalized",
      "risk.scored",
      "decision.made",
      "step_up.required"
    ]
  );
  assert.equal(evaluation.events[0]?.at, "2026-05-09T12:00:00.000Z");
});

test("behavior graph query reports familiarity metadata and amount history", () => {
  const kernel = seededKernel();
  const relationship = kernel.queryGraphRelationship({
    fromKind: "user",
    fromLabel: "user_alba",
    toKind: "counterparty",
    toLabel: "0x9f2c...juan",
    relation: "interacted_with"
  });

  assert.ok(relationship);
  assert.equal(relationship?.frequency, 3);
  assert.equal(Number(relationship?.averageAmount.toFixed(2)), 19.33);
});

test("vector similarity lookup is deterministic for seeded actions", () => {
  const kernel = seededKernel();
  const similar = kernel.findSimilarActions(seedEvents[0]!.request, 3);

  assert.equal(similar.length, 3);
  assert.ok(similar[0]);
  assert.equal(similar[0]?.eventId, "evt_001");
  assert.ok((similar[0]?.similarity ?? 0) > 0.99);
});

test("normalized x402 context and risk signals appear in the decision output", async () => {
  const kernel = seededKernel();
  const request: AgentActionRequest = {
    ...demoRequests[0]!,
    requestId: "req_x402_step_up",
    amount: { value: 80, currency: "USDC" },
    x402: {
      endpoint: "https://wallet.example/pay",
      maxAmount: { value: 50, currency: "USDC" },
      network: "base",
      scheme: "exact"
    }
  };

  const normalized = normalizeX402Context(request);
  const evaluation = await kernel.decide(request);

  assert.ok(normalized);
  assert.equal(normalized?.withinConfiguredSpend, false);
  assert.ok(evaluation.decision.signals.some((signal) => signal.name === "risk.x402_payment_context"));
  assert.match(evaluation.decision.explanation, /x402 ratio=/);
  assert.equal(evaluation.decision.outcome, "step_up");
});
