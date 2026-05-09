import assert from "node:assert/strict";
import test from "node:test";
import { demoProfile, demoRequests, seedEvents } from "../demoFixtures.js";
import type { IntentDriftInput, IntentDriftResult } from "../domain/types.js";
import { PermissionKernel } from "../kernel.js";
import { assessAgentAction } from "./handlers.js";

const deterministicDrift = {
  async evaluate(input: IntentDriftInput): Promise<IntentDriftResult> {
    return this.evaluateSync(input);
  },
  evaluateSync(input: IntentDriftInput): IntentDriftResult {
    return {
      driftDetected: input.actualCounterparty === "0x4a8b...evil",
      confidence: 0.81,
      score: input.actualCounterparty === "0x4a8b...evil" ? 0.76 : 0.1,
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
