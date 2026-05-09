"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import { useEventStream } from "@/lib/hooks/use-event-stream";
import { VoiceCircle } from "@/components/voice-circle";
import type { ScenarioId, ScenarioMeta } from "@/lib/agent/scenarios";

// Top-level client component that owns the demo state machine:
//
//   click scenario → POST /api/agent/action
//     ↘ allow / deny → SSE drives the circle to the terminal state
//     ↘ step_up_required → store the challenge → VoiceCircle launches
//       ElevenLabs SDK → user speaks → server tools fire → SSE drives
//       step_up{passkey} → triggers WebAuthn → /api/agent/passkey-complete
//       → SSE drives the final allow / deny.

interface DemoOrchestratorProps {
  username: string;
}

interface PendingChallenge {
  challengeId: string;
  requestId: string;
  phrase: string;
  actionSummary: string;
  actionHash: string;
}

const SCENARIO_LIST: { id: ScenarioId; label: string; blurb: string }[] = [
  {
    id: "aligned_transfer",
    label: "Aligned transfer",
    blurb: "Send 20 USDC to Juan, like the user has done before."
  },
  {
    id: "recipient_swap",
    label: "Recipient swap",
    blurb: "Same intent, but the wallet was swapped via email."
  },
  {
    id: "amount_spike",
    label: "Amount spike",
    blurb: "350 USDC to Juan — far above the historical pattern."
  }
];

export function DemoOrchestrator({ username }: DemoOrchestratorProps) {
  const [challenge, setChallenge] = useState<PendingChallenge | null>(null);
  const [pendingScenario, setPendingScenario] = useState<ScenarioId | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const { events } = useEventStream();
  const passkeyHandledRef = useRef<string | null>(null);

  const fireScenario = useCallback(async (id: ScenarioId) => {
    setPendingScenario(id);
    setStatusMessage(null);
    setChallenge(null);
    passkeyHandledRef.current = null;

    try {
      const res = await fetch("/api/agent/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario: id })
      });
      const data = (await res.json()) as ActionResponse;

      if (!data.ok) {
        setStatusMessage(`Error: ${data.error ?? "unknown"}`);
        return;
      }

      if (data.status === "step_up_required" && data.challenge) {
        setChallenge(data.challenge);
        setStatusMessage("Voice biometric required — speak to confirm.");
      } else if (data.status === "deny") {
        setStatusMessage(
          data.decision?.explanation ?? "Action blocked by kernel."
        );
      } else if (data.status === "allow" || data.status === "allow_with_audit") {
        setStatusMessage(
          data.decision?.explanation ?? "Action authorized."
        );
      }
    } catch (err) {
      setStatusMessage(
        `Network error: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setPendingScenario(null);
    }
  }, []);

  // Watch for step_up{passkey} events that bind to the active challenge,
  // and trigger the WebAuthn flow exactly once per challenge.
  useEffect(() => {
    if (!challenge) return;
    if (passkeyHandledRef.current === challenge.challengeId) return;

    const wantsPasskey = events.some(
      (e) =>
        e.type === "step_up" &&
        e.channel === "passkey" &&
        e.requestId === challenge.requestId
    );
    if (!wantsPasskey) return;

    passkeyHandledRef.current = challenge.challengeId;
    runPasskey({ username, challengeId: challenge.challengeId })
      .then((outcome) => {
        if (outcome.ok) {
          setStatusMessage("Passkey verified — action authorized.");
        } else {
          setStatusMessage(`Passkey failed: ${outcome.reason}`);
        }
      })
      .catch((err) => {
        setStatusMessage(
          `Passkey error: ${err instanceof Error ? err.message : String(err)}`
        );
      });
  }, [events, challenge, username]);

  // Also watch for terminal decisions to clear local state so the next
  // scenario starts clean.
  useEffect(() => {
    if (!challenge) return;
    const terminal = events.find(
      (e) =>
        e.type === "decision" &&
        e.requestId === challenge.requestId &&
        (e.outcome === "allow" ||
          e.outcome === "allow_with_audit" ||
          e.outcome === "deny")
    );
    if (terminal) {
      // Hold on the challenge for a beat so the circle finishes its allow/deny
      // animation, then drop it.
      const t = setTimeout(() => setChallenge(null), 2400);
      return () => clearTimeout(t);
    }
  }, [events, challenge]);

  return (
    <div className="flex flex-col gap-5">
      <VoiceCircle challenge={challenge} />

      <div className="rounded-2xl border border-border bg-surface px-5 py-4">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
          Demo scenarios
        </p>
        <p className="mt-1 text-sm text-text">
          Pick one — the kernel will decide allow / deny / step-up live.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {SCENARIO_LIST.map((s) => (
            <button
              key={s.id}
              onClick={() => fireScenario(s.id)}
              disabled={pendingScenario !== null}
              className="rounded-xl border border-border bg-bg px-3 py-3 text-left transition hover:border-text disabled:cursor-not-allowed disabled:opacity-50"
            >
              <p className="font-mono text-xs uppercase tracking-wider text-text">
                {s.label}
              </p>
              <p className="mt-1 text-xs text-muted">{s.blurb}</p>
            </button>
          ))}
        </div>
        {statusMessage && (
          <p className="mt-3 font-mono text-xs text-muted">{statusMessage}</p>
        )}
      </div>
    </div>
  );
}

// ---- Helpers ---------------------------------------------------------------

interface ActionResponse {
  ok: boolean;
  status?:
    | "allow"
    | "allow_with_audit"
    | "deny"
    | "step_up_required"
    | "step_up";
  challenge?: PendingChallenge;
  decision?: {
    requestId: string;
    outcome: string;
    riskScore: number;
    explanation: string;
    actionHash: string;
  };
  error?: string;
  detail?: string;
}

async function runPasskey(opts: { username: string; challengeId: string }) {
  const begin = await fetch("/api/auth/login/begin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: opts.username })
  });

  if (!begin.ok) {
    return await reportPasskey(
      opts.challengeId,
      false,
      `login/begin failed (${begin.status})`
    );
  }

  const options = await begin.json();

  let assertion;
  try {
    assertion = await startAuthentication(options);
  } catch (err) {
    return await reportPasskey(
      opts.challengeId,
      false,
      `webauthn cancelled: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const finish = await fetch("/api/auth/login/finish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: opts.username, response: assertion })
  });

  if (!finish.ok) {
    return await reportPasskey(
      opts.challengeId,
      false,
      `login/finish failed (${finish.status})`
    );
  }

  return await reportPasskey(opts.challengeId, true);
}

async function reportPasskey(
  challengeId: string,
  verified: boolean,
  reason?: string
) {
  await fetch("/api/agent/passkey-complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challengeId, verified, reason })
  });
  return verified
    ? { ok: true as const }
    : { ok: false as const, reason: reason ?? "unknown" };
}
