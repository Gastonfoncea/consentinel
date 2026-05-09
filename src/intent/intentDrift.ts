import { z } from "zod";
import type { AgentActionRequest, IntentDriftInput, IntentDriftResult } from "../domain/types.js";
import { FileIntentDriftCache } from "./intentDriftCache.js";

export interface IntentDriftEvaluator {
  evaluate(input: IntentDriftInput): Promise<IntentDriftResult>;
  evaluateSync(input: IntentDriftInput): IntentDriftResult;
}

interface IntentDriftOptions {
  apiKey?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  cache?: FileIntentDriftCache;
}

const anthropicToolSchema = z.object({
  drift_detected: z.boolean(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(1)
});

export class AnthropicIntentDriftEvaluator implements IntentDriftEvaluator {
  private readonly apiKey?: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;
  private readonly cache: FileIntentDriftCache;

  constructor(options: IntentDriftOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
    this.model = options.model ?? process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514";
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.cache = options.cache ?? new FileIntentDriftCache();
  }

  async evaluate(input: IntentDriftInput): Promise<IntentDriftResult> {
    const cacheKey = this.cache.cacheKey(input);
    const cached = this.cache.read(cacheKey);
    if (cached) {
      return {
        ...cached,
        cacheStatus: "hit",
        cacheKey
      };
    }

    if (!this.apiKey || !input.originalUserRequest) {
      return {
        ...this.evaluateSync(input),
        cacheStatus: "bypass",
        cacheKey
      };
    }

    try {
      const live = await this.evaluateWithAnthropic(input, cacheKey);
      this.cache.write(cacheKey, live);
      return {
        ...live,
        cacheStatus: "write",
        cacheKey
      };
    } catch {
      return {
        ...this.evaluateSync(input),
        cacheStatus: "fallback",
        cacheKey
      };
    }
  }

  evaluateSync(input: IntentDriftInput): IntentDriftResult {
    return heuristicIntentDrift(input);
  }

  cacheKey(input: IntentDriftInput): string {
    return this.cache.cacheKey(input);
  }

  private async evaluateWithAnthropic(input: IntentDriftInput, cacheKey: string): Promise<IntentDriftResult> {
    const response = await this.fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": this.apiKey ?? ""
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 256,
        tools: [
          {
            name: "report_intent_drift",
            description: "Return whether the proposed action drifts from the original user intent.",
            input_schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                drift_detected: { type: "boolean" },
                confidence: { type: "number", minimum: 0, maximum: 1 },
                reasoning: { type: "string", minLength: 1 }
              },
              required: ["drift_detected", "confidence", "reasoning"]
            }
          }
        ],
        system: [
          "You are the user's advocate.",
          "Decide whether the proposed action still serves the original delegated user intent.",
          "Use the provided tool exactly once with strict JSON output.",
          "Treat counterparty swaps and suspicious amount changes as strong drift indicators."
        ].join(" "),
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: buildAnthropicPrompt(input)
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Anthropic request failed with status ${response.status}.`);
    }

    const payload = (await response.json()) as {
      content?: Array<{ type?: string; name?: string; input?: unknown }>;
    };
    const toolUse = payload.content?.find(
      (block) => block.type === "tool_use" && block.name === "report_intent_drift"
    );

    if (!toolUse?.input) {
      throw new Error("Anthropic response did not contain a report_intent_drift tool_use block.");
    }

    const parsed = anthropicToolSchema.parse(toolUse.input);

    return {
      driftDetected: parsed.drift_detected,
      confidence: parsed.confidence,
      score: anthropicScore(parsed.drift_detected, parsed.confidence),
      reasoning: parsed.reasoning,
      provider: "anthropic",
      cacheStatus: "miss",
      cacheKey
    };
  }
}

export function heuristicIntentDrift(input: IntentDriftInput): IntentDriftResult {
  if (!input.originalUserRequest) {
    return {
      driftDetected: false,
      confidence: 0.28,
      score: 0.12,
      reasoning: "No original user request was available, so drift was estimated with a conservative local fallback.",
      provider: "heuristic"
    };
  }

  const overlap = tokenOverlap(input.originalUserRequest, input.proposedActionNarrative);
  const counterpartyMismatch = counterpartyMatchesExpectation(input) ? 0 : hasCounterpartyComparison(input) ? 1 : 0;
  const identityAligned = counterpartyIdentityMatches(input);
  const routeChangedWithinKnownIdentity =
    identityAligned &&
    input.expectedCounterparty &&
    input.actualCounterparty &&
    normalize(input.expectedCounterparty) !== normalize(input.actualCounterparty);
  const amountMismatch =
    input.expectedAmount && input.actualAmount
      ? clamp((input.actualAmount.value / Math.max(input.expectedAmount.value, 1) - 1) / 2, 0, 1)
      : 0;
  const identityCredit = routeChangedWithinKnownIdentity ? 0.22 : identityAligned ? 0.08 : 0;
  const score = clamp((1 - overlap) * 0.76 + counterpartyMismatch * 0.16 + amountMismatch * 0.08 - identityCredit, 0, 1);
  const driftDetected = score >= 0.42;
  const confidence = clamp(0.52 + Math.abs(score - 0.42) * 0.9, 0, 0.96);

  return {
    driftDetected,
    confidence,
    score,
    reasoning: [
      "Heuristic fallback compared the original request to the proposed action narrative.",
      `Token overlap=${overlap.toFixed(2)}.`,
      counterpartyMismatch
        ? "Counterparty changed from the delegated expectation."
        : "Counterparty stayed aligned, including known identity aliases when present.",
      routeChangedWithinKnownIdentity
        ? "The direct wallet route changed, but it still resolves to the delegated identity."
        : "No route-level identity inheritance adjustment was needed.",
      amountMismatch ? "Requested amount drifted from the delegated amount." : "Requested amount stayed close to the delegated amount."
    ].join(" "),
    provider: "heuristic"
  };
}

export function buildAnthropicPrompt(input: IntentDriftInput): string {
  return [
    `Original user request: ${input.originalUserRequest ?? "none"}`,
    `Proposed action narrative: ${input.proposedActionNarrative}`,
    `Source: ${input.source} trust=${input.sourceTrust}`,
    `Expected counterparty: ${input.expectedCounterparty ?? "none"}`,
    `Expected counterparty identity: ${input.expectedCounterpartyIdentity ?? "none"}`,
    `Actual counterparty: ${input.actualCounterparty ?? "none"}`,
    `Actual counterparty identity: ${input.actualCounterpartyIdentity ?? "none"}`,
    `Expected amount: ${formatAmount(input.expectedAmount)}`,
    `Actual amount: ${formatAmount(input.actualAmount)}`
  ].join("\n");
}

export function refreshIntentDriftCache(
  evaluator: Pick<AnthropicIntentDriftEvaluator, "evaluate">,
  inputs: IntentDriftInput[]
): Promise<IntentDriftResult[]> {
  return Promise.all(inputs.map((input) => evaluator.evaluate(input)));
}

export function requestToIntentDriftInput(request: AgentActionRequest): IntentDriftInput {
  return {
    originalUserRequest: request.context?.originalUserRequest,
    proposedActionNarrative: compactActionNarrative(request),
    source: request.context?.source ?? "unknown",
    sourceTrust: request.context?.sourceTrust ?? "mixed",
    expectedCounterparty: request.context?.expectedCounterparty,
    expectedCounterpartyIdentity: request.context?.expectedCounterpartyIdentity,
    actualCounterparty: request.counterparty,
    actualCounterpartyIdentity: request.counterpartyIdentity,
    expectedAmount: request.context?.expectedAmount,
    actualAmount: request.amount
  };
}

function anthropicScore(driftDetected: boolean, confidence: number): number {
  if (driftDetected) {
    return clamp(0.52 + confidence * 0.42, 0, 1);
  }

  return clamp(0.08 + (1 - confidence) * 0.16, 0, 0.32);
}

function formatAmount(amount?: IntentDriftInput["expectedAmount"]): string {
  return amount ? `${amount.value} ${amount.currency}` : "none";
}

function compactActionNarrative(request: AgentActionRequest): string {
  return [
    `intent=${request.intent}`,
    `counterparty=${request.counterparty ?? "none"}`,
    `counterparty_identity=${request.counterpartyIdentity ?? "none"}`,
    request.amount ? `amount=${request.amount.value} ${request.amount.currency}` : "amount=none"
  ].join(" ");
}

function hasCounterpartyComparison(input: IntentDriftInput): boolean {
  return Boolean(
    (input.expectedCounterpartyIdentity && input.actualCounterpartyIdentity) ||
      (input.expectedCounterparty && input.actualCounterparty)
  );
}

function counterpartyMatchesExpectation(input: IntentDriftInput): boolean {
  if (input.expectedCounterpartyIdentity && input.actualCounterpartyIdentity) {
    return normalize(input.expectedCounterpartyIdentity) === normalize(input.actualCounterpartyIdentity);
  }

  if (input.expectedCounterparty && input.actualCounterparty) {
    return normalize(input.expectedCounterparty) === normalize(input.actualCounterparty);
  }

  return false;
}

function counterpartyIdentityMatches(input: IntentDriftInput): boolean {
  return Boolean(
    input.expectedCounterpartyIdentity &&
      input.actualCounterpartyIdentity &&
      normalize(input.expectedCounterpartyIdentity) === normalize(input.actualCounterpartyIdentity)
  );
}

function tokenOverlap(left: string, right: string): number {
  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      intersection += 1;
    }
  }

  return intersection / Math.max(leftTokens.size, rightTokens.size);
}

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function normalize(input: string): string {
  return input.trim().toLowerCase();
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
