import { z } from "zod";

export const counterpartyRouteTrustSchema = z.enum([
  "verified",
  "known_historical",
  "claimed",
  "unknown"
]);

export const moneySchema = z.object({
  value: z.number().nonnegative(),
  currency: z.string().min(3).max(8)
});

export const x402Schema = z.object({
  endpoint: z.string().url(),
  maxAmount: moneySchema,
  network: z.string().optional(),
  scheme: z.string().optional(),
  facilitator: z.string().optional()
});

export const contextSchema = z.object({
  source: z.enum(["direct_user", "email", "chat", "tool_output", "system", "unknown"]),
  sourceTrust: z.enum(["trusted", "mixed", "untrusted"]),
  originalUserRequest: z.string().optional(),
  expectedCounterparty: z.string().optional(),
  expectedCounterpartyIdentity: z.string().optional(),
  expectedCounterpartyRouteTrust: counterpartyRouteTrustSchema.optional(),
  expectedAmount: moneySchema.optional()
});

export const requestSchema = z.object({
  requestId: z.string(),
  userId: z.string(),
  agentId: z.string(),
  service: z.string(),
  action: z.enum(["read", "write", "send", "pay", "share", "delete", "trade", "configure"]),
  resource: z.string(),
  intent: z.string(),
  counterparty: z.string().optional(),
  counterpartyIdentity: z.string().optional(),
  counterpartyRouteTrust: counterpartyRouteTrustSchema.optional(),
  amount: moneySchema.optional(),
  dataSensitivity: z.enum(["public", "internal", "personal", "financial", "secret"]),
  reversibility: z.enum(["reversible", "compensatable", "irreversible"]),
  x402: x402Schema.optional(),
  context: contextSchema.optional(),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional()
});

export const eventSchema = z.object({
  eventId: z.string(),
  occurredAt: z.string(),
  request: requestSchema,
  outcome: z.enum(["allow", "allow_with_audit", "step_up", "deny"]),
  verifiedWith: z.enum(["voice_biometric_callback", "passkey", "none"]).optional()
});

export const stepUpChallengeIdSchema = z.object({
  challengeId: z.string()
});

export const stepUpRejectSchema = z.object({
  challengeId: z.string(),
  reason: z.enum(["user_denied", "duress"])
});

export const phoneConfirmationProviderSchema = z.object({
  challengeId: z.string(),
  provider: z.enum(["elevenlabs", "manual"]).optional()
});
