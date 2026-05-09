import type { AgentActionRequest } from "@/src/domain/types";

// Demo scenarios the UI can fire with one click. Same shapes as the old
// simulator, but now they hit the real kernel and emit real events instead
// of replaying hardcoded responses.

const KNOWN_COUNTERPARTY = "0x9f2c4a6b8d0e1f2233445566778899aabbccddee";
const ATTACKER_COUNTERPARTY = "0xBaD000C0Ffee0001Deadbeef00000000000Bad42";

export type ScenarioId =
  | "aligned_transfer"
  | "recipient_swap"
  | "amount_spike";

export interface ScenarioMeta {
  id: ScenarioId;
  label: string;
  blurb: string;
  expectedOutcome: "allow" | "step_up" | "deny";
}

export const SCENARIOS: Record<ScenarioId, ScenarioMeta> = {
  aligned_transfer: {
    id: "aligned_transfer",
    label: "Aligned transfer",
    blurb: "Send 20 USDC to Juan, like the user has done before.",
    expectedOutcome: "allow"
  },
  recipient_swap: {
    id: "recipient_swap",
    label: "Recipient swap",
    blurb: "Same intent, but the wallet is swapped for an attacker's via email.",
    expectedOutcome: "deny"
  },
  amount_spike: {
    id: "amount_spike",
    label: "Amount spike",
    blurb: "Send 350 USDC to Juan — far above the historical pattern.",
    expectedOutcome: "step_up"
  }
};

export function buildRequest(id: ScenarioId): AgentActionRequest {
  const requestId = `req_${id}_${Date.now()}`;
  switch (id) {
    case "aligned_transfer":
      return {
        requestId,
        userId: "user_alba",
        agentId: "finance_agent",
        service: "wallet",
        action: "pay",
        resource: "usdc_transfer",
        intent: "Send 20 USDC to Juan for dinner.",
        counterparty: KNOWN_COUNTERPARTY,
        counterpartyIdentity: "juan",
        counterpartyRouteTrust: "known_historical",
        amount: { value: 20, currency: "USDC" },
        dataSensitivity: "financial",
        reversibility: "compensatable",
        context: {
          source: "direct_user",
          sourceTrust: "trusted",
          originalUserRequest: "Send 20 USDC to Juan for dinner.",
          expectedCounterparty: KNOWN_COUNTERPARTY,
          expectedCounterpartyIdentity: "juan",
          expectedCounterpartyRouteTrust: "known_historical",
          expectedAmount: { value: 20, currency: "USDC" }
        }
      };
    case "recipient_swap":
      return {
        requestId,
        userId: "user_alba",
        agentId: "finance_agent",
        service: "wallet",
        action: "pay",
        resource: "usdc_transfer",
        intent: "Send 20 USDC to wallet from latest email thread.",
        counterparty: ATTACKER_COUNTERPARTY,
        counterpartyIdentity: "unknown",
        counterpartyRouteTrust: "unknown",
        amount: { value: 20, currency: "USDC" },
        dataSensitivity: "financial",
        reversibility: "compensatable",
        context: {
          source: "email",
          sourceTrust: "untrusted",
          originalUserRequest: "Send 20 USDC to Juan for dinner.",
          expectedCounterparty: KNOWN_COUNTERPARTY,
          expectedCounterpartyIdentity: "juan",
          expectedCounterpartyRouteTrust: "known_historical",
          expectedAmount: { value: 20, currency: "USDC" }
        }
      };
    case "amount_spike":
      return {
        requestId,
        userId: "user_alba",
        agentId: "finance_agent",
        service: "wallet",
        action: "pay",
        resource: "usdc_transfer",
        intent: "Send 350 USDC to Juan after follow-up changed total.",
        counterparty: KNOWN_COUNTERPARTY,
        counterpartyIdentity: "juan",
        counterpartyRouteTrust: "known_historical",
        amount: { value: 350, currency: "USDC" },
        dataSensitivity: "financial",
        reversibility: "compensatable",
        context: {
          source: "chat",
          sourceTrust: "mixed",
          originalUserRequest: "Send Juan 20 USDC for dinner.",
          expectedCounterparty: KNOWN_COUNTERPARTY,
          expectedCounterpartyIdentity: "juan",
          expectedCounterpartyRouteTrust: "known_historical",
          expectedAmount: { value: 20, currency: "USDC" }
        }
      };
  }
}

export function buildPhraseForChallenge(request: AgentActionRequest): string {
  const amount = request.amount
    ? `${request.amount.value} ${request.amount.currency.toUpperCase()}`
    : "una operación sin monto";
  const target =
    request.counterpartyIdentity && request.counterpartyIdentity !== "unknown"
      ? request.counterpartyIdentity
      : request.counterparty
      ? `la dirección ${shortAddr(request.counterparty)}`
      : request.resource;
  const code = shortCode(request.requestId);

  return `Confirmar transferencia de ${amount} a ${target}. Código de seguridad ${code}.`;
}

function shortAddr(addr: string): string {
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function shortCode(seed: string): string {
  // Take 6 hex-ish chars from the seed for a memorable code.
  const cleaned = seed.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return cleaned.slice(-6).padStart(6, "X");
}
