export type ActionKind =
  | "read"
  | "write"
  | "send"
  | "pay"
  | "share"
  | "delete"
  | "trade"
  | "configure";

export type DataSensitivity = "public" | "internal" | "personal" | "financial" | "secret";

export type Reversibility = "reversible" | "compensatable" | "irreversible";

export type PermissionOutcome = "allow" | "allow_with_audit" | "step_up" | "deny";

export type Conservatism = "fast" | "balanced" | "paranoid";

export type ContextSource = "direct_user" | "email" | "chat" | "tool_output" | "system" | "unknown";

export type SourceTrust = "trusted" | "mixed" | "untrusted";

export type CounterpartyRouteTrust = "verified" | "known_historical" | "claimed" | "unknown";

export interface MoneyAmount {
  value: number;
  currency: string;
}

export interface X402Context {
  endpoint: string;
  maxAmount: MoneyAmount;
  network?: string;
  scheme?: string;
  facilitator?: string;
}

export interface NormalizedX402Context {
  protocol: "x402";
  endpoint: string;
  maxAmount: MoneyAmount;
  requestedAmount?: MoneyAmount;
  counterparty?: string;
  asset: string;
  network: string;
  scheme: string;
  facilitator?: string;
  withinConfiguredSpend: boolean;
  requestedToMaximumRatio: number;
  policyTags: string[];
}

export interface PermissionContext {
  source: ContextSource;
  sourceTrust: SourceTrust;
  originalUserRequest?: string;
  expectedCounterparty?: string;
  expectedCounterpartyIdentity?: string;
  expectedCounterpartyRouteTrust?: CounterpartyRouteTrust;
  expectedAmount?: MoneyAmount;
}

export interface AgentActionRequest {
  requestId: string;
  userId: string;
  agentId: string;
  service: string;
  action: ActionKind;
  resource: string;
  intent: string;
  counterparty?: string;
  counterpartyIdentity?: string;
  counterpartyRouteTrust?: CounterpartyRouteTrust;
  amount?: MoneyAmount;
  dataSensitivity: DataSensitivity;
  reversibility: Reversibility;
  x402?: X402Context;
  context?: PermissionContext;
  metadata?: Record<string, string | number | boolean>;
}

export interface UserTrustProfile {
  userId: string;
  conservatism: Conservatism;
  trustedDevice: boolean;
  maxAutonomousSpend: MoneyAmount;
  preferredStepUp: "voice_biometric_callback" | "passkey";
  phoneE164?: string;
}

export interface TrackRecordEvent {
  eventId: string;
  occurredAt: string;
  request: AgentActionRequest;
  outcome: PermissionOutcome;
  verifiedWith?: "voice_biometric_callback" | "passkey" | "none";
}

export interface DecisionSignal {
  name: string;
  score: number;
  weight: number;
  contribution: number;
  rationale: string;
}

export interface SimilarAction {
  eventId: string;
  similarity: number;
  outcome: PermissionOutcome;
  occurredAt: string;
  narrative: string;
}

export interface IntentDriftInput {
  originalUserRequest?: string;
  proposedActionNarrative: string;
  source: ContextSource;
  sourceTrust: SourceTrust;
  expectedCounterparty?: string;
  expectedCounterpartyIdentity?: string;
  actualCounterparty?: string;
  actualCounterpartyIdentity?: string;
  expectedAmount?: MoneyAmount;
  actualAmount?: MoneyAmount;
}

export interface IntentDriftResult {
  driftDetected: boolean;
  confidence: number;
  score: number;
  reasoning: string;
  provider: "anthropic" | "heuristic";
  cacheStatus?: "hit" | "miss" | "write" | "bypass" | "fallback";
  cacheKey?: string;
}

export interface ProjectedEffect {
  label: string;
  severity: number;
  confidence: number;
  rationale: string;
}

export interface PermissionDecision {
  requestId: string;
  outcome: PermissionOutcome;
  riskScore: number;
  actionHash: string;
  signals: DecisionSignal[];
  similarActions: SimilarAction[];
  projectedEffects: ProjectedEffect[];
  requiredStepUp?: "voice_biometric_callback" | "passkey";
  explanation: string;
}

export interface StepUpChallenge {
  challengeId: string;
  requestId: string;
  userId: string;
  channel: "voice_biometric_callback" | "passkey";
  boundActionHash: string;
  expiresAt: string;
  prompt: string;
  deliveryTarget?: string;
}

export type ConsentinelEventType =
  | "request.received"
  | "graph.evaluated"
  | "memory.similarity_retrieved"
  | "intent_drift.evaluated"
  | "x402.normalized"
  | "risk.scored"
  | "decision.made"
  | "step_up.required";

export interface ConsentinelEvent {
  type: ConsentinelEventType;
  at: string;
  summary: string;
  payload?: Record<string, unknown>;
}
