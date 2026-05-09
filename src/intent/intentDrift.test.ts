import assert from "node:assert/strict";
import test from "node:test";
import { AnthropicIntentDriftEvaluator, heuristicIntentDrift } from "./intentDrift.js";

const driftInput = {
  originalUserRequest: "Send 20 USDC to Juan for dinner.",
  proposedActionNarrative: "Send 20 USDC to attacker wallet from email thread.",
  source: "email" as const,
  sourceTrust: "untrusted" as const,
  expectedCounterparty: "0x9f2c...juan",
  actualCounterparty: "0x4a8b...evil",
  expectedAmount: { value: 20, currency: "USDC" },
  actualAmount: { value: 20, currency: "USDC" }
};

test("Anthropic intent drift evaluator accepts structured tool output", async () => {
  const evaluator = new AnthropicIntentDriftEvaluator({
    apiKey: "test-key",
    fetchImpl: async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          content: [
            {
              type: "tool_use",
              name: "report_intent_drift",
              input: {
                drift_detected: true,
                confidence: 0.93,
                reasoning: "The requested wallet recipient diverges from the user's stated intent."
              }
            }
          ]
        })
      }) as Response
  });

  const result = await evaluator.evaluate(driftInput);

  assert.equal(result.provider, "anthropic");
  assert.equal(result.driftDetected, true);
  assert.equal(result.confidence, 0.93);
  assert.ok(result.score > 0.9);
});

test("Anthropic intent drift evaluator falls back predictably on malformed responses", async () => {
  const evaluator = new AnthropicIntentDriftEvaluator({
    apiKey: "test-key",
    fetchImpl: async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          content: [{ type: "text", text: "not structured" }]
        })
      }) as Response
  });

  const result = await evaluator.evaluate(driftInput);
  const expected = heuristicIntentDrift(driftInput);

  assert.deepEqual(result, expected);
});
