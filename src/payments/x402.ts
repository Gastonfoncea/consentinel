import type { AgentActionRequest, MoneyAmount, X402Context } from "../domain/types.js";

export interface X402PaymentPermission {
  protocol: "x402";
  endpoint: string;
  maximumSpend: MoneyAmount;
  counterparty?: string;
  reason: string;
  policyTags: string[];
}

export function buildX402Permission(request: AgentActionRequest): X402PaymentPermission | undefined {
  if (!request.x402) return undefined;

  return {
    protocol: "x402",
    endpoint: request.x402.endpoint,
    maximumSpend: request.x402.maxAmount,
    counterparty: request.counterparty,
    reason: request.intent,
    policyTags: [
      "agent_native_payment",
      `service:${request.service}`,
      `action:${request.action}`,
      `sensitivity:${request.dataSensitivity}`,
      `reversibility:${request.reversibility}`,
      request.x402.network ? `network:${request.x402.network}` : "network:any",
      request.x402.scheme ? `scheme:${request.x402.scheme}` : "scheme:any"
    ]
  };
}

export function x402ContextFromEndpoint(
  endpoint: string,
  maxAmount: MoneyAmount,
  options: Pick<X402Context, "network" | "scheme" | "facilitator"> = {}
): X402Context {
  return {
    endpoint,
    maxAmount,
    ...options
  };
}
