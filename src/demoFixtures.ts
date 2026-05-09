import type { AgentActionRequest, TrackRecordEvent, UserTrustProfile } from "./domain/types.js";
import { x402ContextFromEndpoint } from "./payments/x402.js";

export const demoProfile: UserTrustProfile = {
  userId: "user_alba",
  conservatism: "balanced",
  trustedDevice: true,
  maxAutonomousSpend: { value: 75, currency: "USD" },
  preferredStepUp: "voice_biometric_callback",
  phoneE164: "+15550101111"
};

export const seedEvents: TrackRecordEvent[] = [
  event("evt_001", "2026-05-01T10:15:00.000Z", {
    requestId: "req_seed_001",
    userId: "user_alba",
    agentId: "finance_agent",
    service: "wallet",
    action: "pay",
    resource: "usdc_transfer",
    intent: "Send 20 USDC to Juan for dinner.",
    counterparty: "0x9f2c...juan",
    amount: { value: 20, currency: "USDC" },
    dataSensitivity: "financial",
    reversibility: "compensatable",
    context: {
      source: "direct_user",
      sourceTrust: "trusted",
      originalUserRequest: "Send 20 USDC to Juan for dinner.",
      expectedCounterparty: "0x9f2c...juan",
      expectedAmount: { value: 20, currency: "USDC" }
    }
  }),
  event("evt_002", "2026-05-02T15:30:00.000Z", {
    requestId: "req_seed_002",
    userId: "user_alba",
    agentId: "finance_agent",
    service: "wallet",
    action: "pay",
    resource: "usdc_transfer",
    intent: "Send 20 USDC to Juan for dinner.",
    counterparty: "0x9f2c...juan",
    amount: { value: 20, currency: "USDC" },
    dataSensitivity: "financial",
    reversibility: "compensatable",
    context: {
      source: "direct_user",
      sourceTrust: "trusted",
      originalUserRequest: "Send 20 USDC to Juan for dinner.",
      expectedCounterparty: "0x9f2c...juan",
      expectedAmount: { value: 20, currency: "USDC" }
    }
  }),
  event("evt_003", "2026-05-03T15:30:00.000Z", {
    requestId: "req_seed_003",
    userId: "user_alba",
    agentId: "finance_agent",
    service: "wallet",
    action: "pay",
    resource: "usdc_transfer",
    intent: "Send 18 USDC to Juan for dinner after splitting the tip.",
    counterparty: "0x9f2c...juan",
    amount: { value: 18, currency: "USDC" },
    dataSensitivity: "financial",
    reversibility: "compensatable",
    context: {
      source: "direct_user",
      sourceTrust: "trusted",
      originalUserRequest: "Send Juan the dinner split.",
      expectedCounterparty: "0x9f2c...juan",
      expectedAmount: { value: 20, currency: "USDC" }
    }
  })
];

export const demoRequests: AgentActionRequest[] = [
  {
    requestId: "req_demo_aligned_transfer",
    userId: "user_alba",
    agentId: "finance_agent",
    service: "wallet",
    action: "pay",
    resource: "usdc_transfer",
    intent: "Send 20 USDC to Juan for dinner.",
    counterparty: "0x9f2c...juan",
    amount: { value: 20, currency: "USDC" },
    dataSensitivity: "financial",
    reversibility: "compensatable",
    context: {
      source: "direct_user",
      sourceTrust: "trusted",
      originalUserRequest: "Send 20 USDC to Juan for dinner.",
      expectedCounterparty: "0x9f2c...juan",
      expectedAmount: { value: 20, currency: "USDC" }
    }
  },
  {
    requestId: "req_demo_recipient_swap",
    userId: "user_alba",
    agentId: "finance_agent",
    service: "wallet",
    action: "pay",
    resource: "usdc_transfer",
    intent: "Send 20 USDC to Juan using the wallet address mentioned in the latest email thread.",
    counterparty: "0x4a8b...evil",
    amount: { value: 20, currency: "USDC" },
    dataSensitivity: "financial",
    reversibility: "compensatable",
    context: {
      source: "email",
      sourceTrust: "untrusted",
      originalUserRequest: "Send 20 USDC to Juan for dinner.",
      expectedCounterparty: "0x9f2c...juan",
      expectedAmount: { value: 20, currency: "USDC" }
    }
  },
  {
    requestId: "req_demo_amount_spike",
    userId: "user_alba",
    agentId: "finance_agent",
    service: "wallet",
    action: "pay",
    resource: "usdc_transfer",
    intent: "Send 350 USDC to Juan because the dinner total changed in a follow-up message.",
    counterparty: "0x9f2c...juan",
    amount: { value: 350, currency: "USDC" },
    dataSensitivity: "financial",
    reversibility: "irreversible",
    context: {
      source: "chat",
      sourceTrust: "mixed",
      originalUserRequest: "Send 20 USDC to Juan for dinner.",
      expectedCounterparty: "0x9f2c...juan",
      expectedAmount: { value: 20, currency: "USDC" }
    },
    x402: x402ContextFromEndpoint("https://wallet.example/transfer", { value: 350, currency: "USDC" }, {
      network: "base",
      scheme: "exact"
    })
  }
];

function event(
  eventId: string,
  occurredAt: string,
  request: AgentActionRequest,
  outcome: TrackRecordEvent["outcome"] = "allow"
): TrackRecordEvent {
  return {
    eventId,
    occurredAt,
    request,
    outcome,
    verifiedWith: "none"
  };
}
