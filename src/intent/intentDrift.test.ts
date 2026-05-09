import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  AnthropicIntentDriftEvaluator,
  buildAnthropicPrompt,
  heuristicIntentDrift,
  requestToIntentDriftInput
} from "./intentDrift.js";
import { FileIntentDriftCache } from "./intentDriftCache.js";
import { demoRequests } from "../demoFixtures.js";

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

test("Anthropic intent drift evaluator returns cached result on exact cache hit", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "intent-drift-hit-"));
  const cachePath = join(tempDir, "intent-cache.json");
  const cache = new FileIntentDriftCache(cachePath);
  const key = cache.cacheKey(driftInput);

  writeFileSync(
    cachePath,
    JSON.stringify(
      {
        version: 1,
        entries: {
          [key]: {
            driftDetected: false,
            confidence: 0.9,
            score: 0.1,
            reasoning: "cached",
            provider: "anthropic"
          }
        }
      },
      null,
      2
    ),
    "utf8"
  );

  let fetchCalls = 0;
  const evaluator = new AnthropicIntentDriftEvaluator({
    apiKey: "test-key",
    cache,
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error("network should not be reached on cache hit");
    }
  });

  const result = await evaluator.evaluate(driftInput);

  assert.equal(fetchCalls, 0);
  assert.equal(result.cacheStatus, "hit");
  assert.equal(result.reasoning, "cached");

  rmSync(tempDir, { recursive: true, force: true });
});

test("Anthropic intent drift evaluator falls through to live call on miss and persists the response", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "intent-drift-miss-"));
  const cachePath = join(tempDir, "intent-cache.json");
  const cache = new FileIntentDriftCache(cachePath);
  let fetchCalls = 0;
  const evaluator = new AnthropicIntentDriftEvaluator({
    apiKey: "test-key",
    cache,
    fetchImpl: async () => {
      fetchCalls += 1;
      return {
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
      } as Response;
    }
  });

  const result = await evaluator.evaluate(driftInput);
  const persisted = JSON.parse(readFileSync(cachePath, "utf8")) as {
    entries: Record<string, { reasoning: string }>;
  };

  assert.equal(fetchCalls, 1);
  assert.equal(result.provider, "anthropic");
  assert.equal(result.cacheStatus, "write");
  assert.equal(
    persisted.entries[cache.cacheKey(driftInput)]?.reasoning,
    "The requested wallet recipient diverges from the user's stated intent."
  );

  rmSync(tempDir, { recursive: true, force: true });
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

  assert.equal(result.driftDetected, expected.driftDetected);
  assert.equal(result.confidence, expected.confidence);
  assert.equal(result.score, expected.score);
  assert.equal(result.reasoning, expected.reasoning);
  assert.equal(result.provider, expected.provider);
  assert.equal(result.cacheStatus, "fallback");
});

test("Anthropic intent drift evaluator bypasses live call when no API key is present", async () => {
  const evaluator = new AnthropicIntentDriftEvaluator({
    fetchImpl: async () => {
      throw new Error("network should not be reached without API key");
    }
  });

  const result = await evaluator.evaluate(driftInput);

  assert.equal(result.provider, "heuristic");
  assert.equal(result.cacheStatus, "bypass");
});

test("demo cache fixture contains the aligned seeded request and can satisfy it without a live call", async () => {
  const fixtureCache = new FileIntentDriftCache(join(process.cwd(), "data", "intent-drift-cache.json"));
  const input = requestToIntentDriftInput(demoRequests[0]!);
  const key = fixtureCache.cacheKey(input);

  assert.equal(buildAnthropicPrompt(input).includes("Original user request: Send 20 USDC to Juan for dinner."), true);
  const cached = fixtureCache.read(key);
  assert.ok(cached);

  let fetchCalls = 0;
  const evaluator = new AnthropicIntentDriftEvaluator({
    apiKey: "demo-key",
    cache: fixtureCache,
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error("fixture should satisfy the aligned request");
    }
  });

  const result = await evaluator.evaluate(input);

  assert.equal(fetchCalls, 0);
  assert.equal(result.cacheStatus, "hit");
  assert.equal(result.provider, "anthropic");
});
