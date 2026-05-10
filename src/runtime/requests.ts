import type { Address } from "viem";
import { demoProfile } from "../demoFixtures";
import type { AgentActionRequest, CounterpartyRouteTrust, PermissionContext } from "../domain/types";

function buildDemoRequestMetadata() {
  const username = process.env.DEMO_USERNAME?.trim() || process.env.USERNAME?.trim();
  if (!username) {
    return undefined;
  }

  return {
    username,
    userName: username
  };
}

export function buildWalletReadRequest(input: {
  requestId?: string;
  agentId?: string;
  intent?: string;
  source?: PermissionContext["source"];
  sourceTrust?: PermissionContext["sourceTrust"];
  originalUserRequest?: string;
}): AgentActionRequest {
  return {
    requestId: input.requestId ?? "req_wallet_balance",
    userId: demoProfile.userId,
    agentId: input.agentId ?? "finance_agent",
    service: "wallet",
    action: "read",
    resource: "usdc_balance",
    intent: input.intent ?? "Read the current USDC balance of the demo wallet.",
    dataSensitivity: "financial",
    reversibility: "reversible",
    context: {
      source: input.source ?? "direct_user",
      sourceTrust: input.sourceTrust ?? "trusted",
      originalUserRequest: input.originalUserRequest
    },
    metadata: buildDemoRequestMetadata()
  };
}

export function buildWalletTransferRequest(input: {
  to: Address;
  amount: string;
  requestId?: string;
  agentId?: string;
  intent?: string;
  counterpartyIdentity?: string;
  counterpartyRouteTrust?: CounterpartyRouteTrust;
  source?: PermissionContext["source"];
  sourceTrust?: PermissionContext["sourceTrust"];
  originalUserRequest?: string;
  expectedCounterparty?: string;
  expectedCounterpartyIdentity?: string;
  expectedCounterpartyRouteTrust?: CounterpartyRouteTrust;
}): AgentActionRequest {
  return {
    requestId: input.requestId ?? `req_wallet_transfer_${Date.now()}`,
    userId: demoProfile.userId,
    agentId: input.agentId ?? "finance_agent",
    service: "wallet",
    action: "pay",
    resource: "usdc_transfer",
    intent: input.intent ?? `Send ${input.amount} USDC to ${input.to}.`,
    counterparty: input.to,
    counterpartyIdentity: input.counterpartyIdentity,
    counterpartyRouteTrust: input.counterpartyRouteTrust ?? "unknown",
    amount: {
      value: Number(input.amount),
      currency: "USDC"
    },
    dataSensitivity: "financial",
    reversibility: "compensatable",
    context: {
      source: input.source ?? "direct_user",
      sourceTrust: input.sourceTrust ?? "trusted",
      originalUserRequest: input.originalUserRequest,
      expectedCounterparty: input.expectedCounterparty,
      expectedCounterpartyIdentity: input.expectedCounterpartyIdentity,
      expectedCounterpartyRouteTrust: input.expectedCounterpartyRouteTrust
    },
    metadata: buildDemoRequestMetadata()
  };
}
