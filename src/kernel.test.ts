import assert from "node:assert/strict";
import test from "node:test";
import { demoKnownCounterparty, demoRequests, demoProfile, seedEvents } from "./demoFixtures.js";
import type { AgentActionRequest, IntentDriftInput, IntentDriftResult } from "./domain/types.js";
import { PermissionKernel } from "./kernel.js";
import { FileIntentDriftCache } from "./intent/intentDriftCache.js";
import { AnthropicIntentDriftEvaluator } from "./intent/intentDrift.js";
import { normalizeX402Context } from "./payments/x402.js";

const deterministicDrift = {
  async evaluate(input: IntentDriftInput): Promise<IntentDriftResult> {
    return this.evaluateSync(input);
  },
  evaluateSync(input: IntentDriftInput): IntentDriftResult {
    const counterpartyChanged = counterpartyIdentityChanged(input);
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
    toLabel: demoKnownCounterparty,
    relation: "interacted_with"
  });

  assert.ok(relationship);
  assert.equal(relationship?.frequency, 3);
  assert.equal(Number(relationship?.averageAmount.toFixed(2)), 19.33);
});

test("behavior graph aggregates identity trust separately from the direct wallet route", () => {
  const kernel = seededKernel();
  const identityRelationship = kernel.queryGraphRelationship({
    fromKind: "user",
    fromLabel: "user_alba",
    toKind: "counterparty_identity",
    toLabel: "juan",
    relation: "trusts_identity"
  });

  assert.ok(identityRelationship);
  assert.equal(identityRelationship?.frequency, 3);
  assert.equal(Number(identityRelationship?.averageAmount.toFixed(2)), 19.33);
});

test("behavior graph classifies the seeded exact route as known historical", async () => {
  const kernel = seededKernel();
  const evaluation = await kernel.decide(demoRequests[0]!);

  assert.equal(evaluation.graphEvidence.routeTrust, "known_historical");
  assert.equal(evaluation.graphEvidence.routeNovelty, 0);
  assert.equal(evaluation.graphEvidence.newRouteForKnownIdentity, false);
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

test("a claimed new wallet route for a known identity requires first-use verification", async () => {
  const kernel = seededKernel();
  const request: AgentActionRequest = {
    ...demoRequests[3]!
  };

  const evaluation = await kernel.decide(request);
  const routeTrustSignal = evaluation.graphEvidence.signals.find(
    (signal) => signal.name === "graph.counterparty_route_trust"
  );

  assert.equal(evaluation.graphEvidence.newCounterparty, false);
  assert.equal(evaluation.graphEvidence.routeTrust, "claimed");
  assert.equal(evaluation.graphEvidence.routeNovelty, 1);
  assert.equal(evaluation.graphEvidence.newRouteForKnownIdentity, true);
  assert.ok(evaluation.graphEvidence.amountMultiple > 0.9 && evaluation.graphEvidence.amountMultiple < 1.1);
  assert.ok((routeTrustSignal?.score ?? 0) > 0);
  assert.equal(evaluation.decision.outcome, "step_up");
  assert.match(evaluation.decision.explanation, /routeTrust=claimed/);
  assert.match(evaluation.decision.explanation, /newRouteForKnownIdentity=true/);
});

test("a verified exact route is promoted after a successful verified event on that wallet", async () => {
  const kernel = seededKernel();
  const request: AgentActionRequest = {
    ...demoRequests[3]!
  };

  kernel.record({
    eventId: "evt_verified_new_wallet",
    occurredAt: "2026-05-04T10:00:00.000Z",
    request,
    outcome: "allow",
    verifiedWith: "passkey"
  });

  const evaluation = await kernel.decide(request);

  assert.equal(evaluation.graphEvidence.routeTrust, "verified");
  assert.equal(evaluation.graphEvidence.routeNovelty, 0);
  assert.notEqual(evaluation.decision.outcome, "step_up");
});

test("a claimed route is not promoted by successful unverified history alone", async () => {
  const kernel = seededKernel();
  const request: AgentActionRequest = {
    ...demoRequests[3]!
  };

  kernel.record({
    eventId: "evt_unverified_new_wallet",
    occurredAt: "2026-05-04T09:00:00.000Z",
    request,
    outcome: "allow",
    verifiedWith: "none"
  });

  const evaluation = await kernel.decide({
    ...request,
    requestId: "req_claimed_route_after_unverified_history"
  });

  assert.equal(evaluation.graphEvidence.routeTrust, "known_historical");
  assert.equal(evaluation.graphEvidence.routeNovelty, 0);
  assert.notEqual(evaluation.decision.outcome, "step_up");
});

test("an unknown new route with no known identity still behaves like a new counterparty", async () => {
  const kernel = seededKernel();
  const request: AgentActionRequest = {
    ...demoRequests[1]!,
    requestId: "req_unknown_new_counterparty",
    counterparty: "0x85aa1c2d3e4f5061728394a5b6c7d8e9f0011223",
    counterpartyIdentity: undefined,
    counterpartyRouteTrust: "unknown",
    context: {
      ...demoRequests[1]!.context!,
      expectedCounterpartyIdentity: undefined
    }
  };

  const evaluation = await kernel.decide(request);

  assert.equal(evaluation.graphEvidence.newCounterparty, true);
  assert.equal(evaluation.graphEvidence.routeTrust, "unknown");
});

test("kernel decide can resolve the seeded aligned request from the checked-in drift cache without live Claude", async () => {
  let fetchCalls = 0;
  const kernel = new PermissionKernel(demoProfile, {
    intentDriftEvaluator: new AnthropicIntentDriftEvaluator({
      apiKey: "demo-key",
      cache: new FileIntentDriftCache(),
      fetchImpl: async () => {
        fetchCalls += 1;
        throw new Error("cache should satisfy this seeded request");
      }
    }),
    clock: () => new Date("2026-05-09T12:00:00.000Z")
  });

  for (const event of seedEvents) {
    kernel.record(event);
  }

  const evaluation = await kernel.decide(demoRequests[0]!);

  assert.equal(fetchCalls, 0);
  assert.equal(evaluation.intentDrift.cacheStatus, "hit");
  assert.equal(evaluation.intentDrift.provider, "anthropic");
});

function counterpartyIdentityChanged(input: IntentDriftInput): boolean {
  if (input.expectedCounterpartyIdentity && input.actualCounterpartyIdentity) {
    return input.expectedCounterpartyIdentity.toLowerCase() !== input.actualCounterpartyIdentity.toLowerCase();
  }

  if (input.expectedCounterparty && input.actualCounterparty) {
    return input.expectedCounterparty.toLowerCase() !== input.actualCounterparty.toLowerCase();
  }

  return false;
}
