import { createHash, randomUUID } from "node:crypto";

// Tracks voice biometric challenges in flight. Pinned to globalThis so the
// state survives Next.js HMR + per-route module isolation in dev (same
// pattern as `lib/auth/store.ts`).
//
// Browser flow:
//   1. UI calls POST /api/agent/action
//   2. If kernel decides step_up, server creates a challenge and returns
//      it to the browser along with dynamic variables for ElevenLabs.
//   3. Browser starts the @elevenlabs/react conversation with those vars.
//   4. User says "sí" / "no" — the ElevenLabs agent calls our server tool
//      `approve_action` / `deny_action`.
//   5. POST /api/elevenlabs/decision arrives → resolveChallenge() flips the
//      status and publishes the next-stage event (step_up{passkey} or
//      decision{deny}) to the SSE bus.
//
// We do NOT keep an in-memory Promise here — the flow is event-driven via
// the SSE bus, so the orchestrator just owns the binding between
// challenge_id and the original action.

export type VoiceChallengeStatus =
  | "pending"
  | "approved"
  | "denied"
  | "expired";

export interface VoiceChallenge {
  challengeId: string;
  requestId: string;
  userId: string;
  agentId: string;
  actionHash: string;
  phrase: string;
  actionSummary: string;
  expiresAt: number;
  status: VoiceChallengeStatus;
  reason?: string;
  resolvedAt?: number;
}

interface ChallengeStore {
  byId: Map<string, VoiceChallenge>;
}

const KEY = "__consentinel_voice_challenges__";

declare global {
  // eslint-disable-next-line no-var
  var __consentinel_voice_challenges__: ChallengeStore | undefined;
}

function getStore(): ChallengeStore {
  if (!globalThis[KEY]) {
    globalThis[KEY] = { byId: new Map<string, VoiceChallenge>() };
  }
  return globalThis[KEY]!;
}

const TTL_MS = 60_000;

export interface CreateChallengeInput {
  requestId: string;
  userId: string;
  agentId: string;
  phrase: string;
  actionSummary: string;
  // canonical action hash — sha256 of a stable shape, used for binding
  actionHash?: string;
  // canonical input that we'll hash if actionHash isn't supplied
  canonicalAction?: Record<string, unknown>;
}

export function createChallenge(input: CreateChallengeInput): VoiceChallenge {
  const challengeId = `voice_${randomUUID()}`;
  const actionHash = input.actionHash ?? hashCanonicalAction(input.canonicalAction ?? {});

  const challenge: VoiceChallenge = {
    challengeId,
    requestId: input.requestId,
    userId: input.userId,
    agentId: input.agentId,
    actionHash,
    phrase: input.phrase,
    actionSummary: input.actionSummary,
    expiresAt: Date.now() + TTL_MS,
    status: "pending"
  };

  const store = getStore();
  cleanupExpired(store);
  store.byId.set(challengeId, challenge);
  return challenge;
}

export function getChallenge(challengeId: string): VoiceChallenge | null {
  const store = getStore();
  cleanupExpired(store);
  return store.byId.get(challengeId) ?? null;
}

export interface ResolveChallengeInput {
  challengeId: string;
  outcome: "approve" | "deny";
  reason?: string;
}

export type ResolveChallengeResult =
  | { ok: true; challenge: VoiceChallenge }
  | { ok: false; reason: "not_found" | "expired" | "already_resolved" };

export function resolveChallenge(input: ResolveChallengeInput): ResolveChallengeResult {
  const store = getStore();
  cleanupExpired(store);
  const challenge = store.byId.get(input.challengeId);
  if (!challenge) {
    return { ok: false, reason: "not_found" };
  }
  if (challenge.status !== "pending") {
    return { ok: false, reason: "already_resolved" };
  }
  if (challenge.expiresAt < Date.now()) {
    challenge.status = "expired";
    challenge.resolvedAt = Date.now();
    return { ok: false, reason: "expired" };
  }

  challenge.status = input.outcome === "approve" ? "approved" : "denied";
  challenge.resolvedAt = Date.now();
  if (input.reason) {
    challenge.reason = input.reason;
  }
  return { ok: true, challenge };
}

export function listActiveChallenges(): VoiceChallenge[] {
  const store = getStore();
  cleanupExpired(store);
  return Array.from(store.byId.values()).filter((c) => c.status === "pending");
}

function cleanupExpired(store: ChallengeStore): void {
  const now = Date.now();
  for (const [id, challenge] of store.byId.entries()) {
    if (challenge.status === "pending" && challenge.expiresAt < now) {
      challenge.status = "expired";
      challenge.resolvedAt = now;
    }
    // Drop fully resolved challenges older than 5 minutes to bound memory.
    if (
      challenge.status !== "pending" &&
      challenge.resolvedAt &&
      now - challenge.resolvedAt > 5 * 60_000
    ) {
      store.byId.delete(id);
    }
  }
}

function hashCanonicalAction(payload: Record<string, unknown>): string {
  const stable = JSON.stringify(payload, Object.keys(payload).sort());
  return "0x" + createHash("sha256").update(stable).digest("hex");
}
