import { createHash } from "node:crypto";
import type { AgentActionRequest } from "./types.js";

export function canonicalizeAction(request: AgentActionRequest): string {
  const amount = request.amount
    ? `${request.amount.value.toFixed(2)} ${request.amount.currency.toUpperCase()}`
    : "none";
  const context = request.context
    ? [
        `source=${request.context.source}`,
        `trust=${request.context.sourceTrust}`,
        `original_request=${request.context.originalUserRequest ?? "none"}`,
        `expected_counterparty=${request.context.expectedCounterparty ?? "none"}`,
        `expected_amount=${
          request.context.expectedAmount
            ? `${request.context.expectedAmount.value.toFixed(2)} ${request.context.expectedAmount.currency.toUpperCase()}`
            : "none"
        }`
      ].join(" ")
    : "context none";

  const x402 = request.x402
    ? `x402 endpoint=${request.x402.endpoint} max=${request.x402.maxAmount.value.toFixed(2)} ${request.x402.maxAmount.currency.toUpperCase()} network=${request.x402.network ?? "any"} scheme=${request.x402.scheme ?? "any"}`
    : "x402 none";

  return [
    `user=${request.userId}`,
    `agent=${request.agentId}`,
    `service=${request.service}`,
    `action=${request.action}`,
    `resource=${request.resource}`,
    `counterparty=${request.counterparty ?? "none"}`,
    `amount=${amount}`,
    `sensitivity=${request.dataSensitivity}`,
    `reversibility=${request.reversibility}`,
    `intent=${request.intent}`,
    context,
    x402
  ].join(" ");
}

export function actionHash(request: AgentActionRequest): string {
  return createHash("sha256").update(canonicalizeAction(request)).digest("hex");
}

export function amountBucket(value?: number): string {
  if (value === undefined) return "no_amount";
  if (value <= 10) return "micro";
  if (value <= 100) return "small";
  if (value <= 1_000) return "medium";
  if (value <= 10_000) return "large";
  return "very_large";
}
