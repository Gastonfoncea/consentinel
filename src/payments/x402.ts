import type {
  AgentActionRequest,
  MoneyAmount,
  NormalizedX402Context,
  X402Context
} from "../domain/types";

export interface X402PaymentPermission {
  protocol: "x402";
  endpoint: string;
  maximumSpend: MoneyAmount;
  counterparty?: string;
  reason: string;
  policyTags: string[];
}

export function buildX402Permission(request: AgentActionRequest): X402PaymentPermission | undefined {
  const normalized = normalizeX402Context(request);
  if (!normalized) return undefined;

  return {
    protocol: normalized.protocol,
    endpoint: normalized.endpoint,
    maximumSpend: normalized.maxAmount,
    counterparty: normalized.counterparty,
    reason: request.intent,
    policyTags: normalized.policyTags
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

export function normalizeX402Context(request: Pick<
  AgentActionRequest,
  "x402" | "amount" | "counterparty" | "service" | "action" | "dataSensitivity" | "reversibility"
>): NormalizedX402Context | undefined {
  if (!request.x402) return undefined;

  const network = request.x402.network ?? "any";
  const scheme = request.x402.scheme ?? "any";
  const requestedAmount = request.amount;
  const maxAmountValue = Math.max(request.x402.maxAmount.value, 0);
  const requestedToMaximumRatio = requestedAmount
    ? maxAmountValue === 0
      ? 1
      : requestedAmount.value / maxAmountValue
    : 0;

  return {
    protocol: "x402",
    endpoint: request.x402.endpoint,
    maxAmount: request.x402.maxAmount,
    requestedAmount,
    counterparty: request.counterparty,
    asset: requestedAmount?.currency ?? request.x402.maxAmount.currency,
    network,
    scheme,
    facilitator: request.x402.facilitator,
    withinConfiguredSpend: requestedAmount ? requestedAmount.value <= maxAmountValue : true,
    requestedToMaximumRatio,
    policyTags: [
      "agent_native_payment",
      `service:${request.service}`,
      `action:${request.action}`,
      `sensitivity:${request.dataSensitivity}`,
      `reversibility:${request.reversibility}`,
      `network:${network}`,
      `scheme:${scheme}`
    ]
  };
}
