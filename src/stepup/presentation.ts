import { randomBytes } from "node:crypto";
import type { AgentActionRequest, MoneyAmount } from "../domain/types";
import { RP_ORIGIN } from "../../lib/auth/config";

const HANDOFF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const RESOURCE_LABELS: Record<string, string> = {
  usdc_balance: "el saldo de USDC",
  usdc_transfer: "la transferencia de USDC"
};

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeHandoffCode(value: string): string {
  return value.trim().toUpperCase();
}

export function deriveVerificationUsername(request: AgentActionRequest): string {
  const metadataCandidates = [
    request.metadata?.username,
    request.metadata?.passkeyUsername,
    request.metadata?.authUsername,
    request.metadata?.auth_username
  ];

  for (const candidate of metadataCandidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return normalizeUsername(candidate);
    }
  }

  return normalizeUsername(request.userId.replace(/^user_/i, "")) || normalizeUsername(request.userId);
}

export function deriveUserDisplayName(request: AgentActionRequest, verificationUsername: string): string {
  const metadataCandidates = [request.metadata?.userName, request.metadata?.user_name];
  for (const candidate of metadataCandidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return titleCase(verificationUsername || request.userId.replace(/^user_/i, "") || request.userId);
}

export function buildHandoffCode(): string {
  let code = "";
  const bytes = randomBytes(8);
  for (const byte of bytes) {
    code += HANDOFF_ALPHABET[byte % HANDOFF_ALPHABET.length];
  }

  return normalizeHandoffCode(`${code.slice(0, 4)}-${code.slice(4, 8)}`);
}

export function buildWhatsAppVerificationUrl(handoffCode: string): string {
  return new URL(`/dashboard?challenge=${handoffCode}`, RP_ORIGIN).toString();
}

export function buildSpokenOperationSummary(request: AgentActionRequest): string {
  const amount = request.amount ? formatAmount(request.amount) : null;
  const counterparty = counterpartyLabel(request);
  const serviceLabel = humanizeToken(request.service);
  const resourceLabel = humanizeResource(request.resource);

  switch (request.action) {
    case "pay":
    case "send":
      if (amount && counterparty) {
        return `enviar ${amount} ${paymentTarget(counterparty)}`;
      }
      if (amount) {
        return `enviar ${amount}`;
      }
      if (counterparty) {
        return `enviar fondos ${paymentTarget(counterparty)}`;
      }
      return `enviar fondos desde ${serviceLabel}`;
    case "read":
      return `consultar ${resourceLabel} en ${serviceLabel}`;
    case "share":
      return counterparty
        ? `compartir ${resourceLabel} con ${counterparty}`
        : `compartir ${resourceLabel}`;
    case "delete":
      return `eliminar ${resourceLabel} en ${serviceLabel}`;
    case "trade":
      return amount ? `operar ${amount} en ${serviceLabel}` : `operar en ${serviceLabel}`;
    case "configure":
      return `configurar ${resourceLabel} en ${serviceLabel}`;
    case "write":
    default:
      return `modificar ${resourceLabel} en ${serviceLabel}`;
  }
}

export function buildSpokenRiskHint(request: AgentActionRequest): string | undefined {
  const expectedIdentity = request.context?.expectedCounterpartyIdentity;
  if (
    request.counterpartyIdentity &&
    request.counterpartyIdentity === expectedIdentity &&
    (request.counterpartyRouteTrust === "claimed" || request.counterpartyRouteTrust === "unknown")
  ) {
    return "usando un destino nuevo";
  }

  if (!request.counterpartyIdentity && request.counterpartyRouteTrust === "unknown" && request.counterparty) {
    return "hacia un destinatario no verificado";
  }

  return undefined;
}

export function composeActionPhrase(summary: string, riskHint?: string): string {
  return riskHint ? `${summary} ${riskHint}` : summary;
}

function formatAmount(amount: MoneyAmount): string {
  const fixed = Number.isInteger(amount.value)
    ? amount.value.toString()
    : amount.value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  return `${fixed} ${amount.currency.toUpperCase()}`;
}

function counterpartyLabel(request: AgentActionRequest): string | undefined {
  if (request.counterpartyIdentity) {
    return titleCase(request.counterpartyIdentity);
  }

  if (request.counterparty) {
    return "el destinatario indicado";
  }

  return undefined;
}

function paymentTarget(counterparty: string): string {
  return counterparty === "el destinatario indicado"
    ? "al destinatario indicado"
    : `a ${counterparty}`;
}

function humanizeResource(resource: string): string {
  return RESOURCE_LABELS[resource] ?? `el recurso ${humanizeToken(resource)}`;
}

function humanizeToken(value: string): string {
  return value.replace(/[_-]+/g, " ").trim();
}

function titleCase(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
