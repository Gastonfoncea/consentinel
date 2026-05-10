"use client";

import { useEffect, useRef } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import { useEventStream } from "@/lib/hooks/use-event-stream";

// AutoPasskeyTrigger
//
// Invisible glue that closes the demo's two-factor loop:
//   1. Voice scenario fires → step_up.challenge_created
//   2. Melisa speaks via the SDK
//   3. User says "sí" → /api/elevenlabs/decision emits step_up.phone_confirmed
//   4. THIS COMPONENT picks that up and immediately runs the WebAuthn
//      passkey assertion — Touch ID / Face ID / Windows Hello dialog.
//   5. /api/step-up/passkey/finish completes the step-up, kernel resumes
//      and broadcasts the real on-chain transfer.
//
// Without this, the user has to click "Verificar" in the activity panel
// after the voice flow ends. With it, the verbal "sí" hands off to the
// biometric prompt automatically — single tap of biometric per scenario.
//
// Notes on browser policy: WebAuthn typically requires a user gesture
// in the same task as the call. Some browsers (Safari, Firefox) block
// auto-triggered prompts. Chrome usually allows it within a few seconds
// of the previous gesture (the dev launcher click counts). On gesture
// rejection we surface the failure quietly — the manual "Verificar"
// button in the activity panel still works as fallback.

export function AutoPasskeyTrigger() {
  const { events } = useEventStream();
  // Track which challenges we already kicked off so the same
  // phone_confirmed event arriving twice (HMR, SSE reconnect, etc.)
  // doesn't double-prompt the user. Persists across renders via ref.
  const attemptedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const target = findFreshlyConfirmed(events, attemptedRef.current);
    if (!target) return;

    attemptedRef.current.add(target.challengeId);
    runPasskeyVerification(target.challengeId).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn(
        "[auto-passkey] verification failed:",
        err instanceof Error ? err.message : err
      );
    });
  }, [events]);

  return null;
}

function findFreshlyConfirmed(
  events: ReturnType<typeof useEventStream>["events"],
  attempted: Set<string>
): { challengeId: string; requestId: string } | null {
  // Walk the rolling window backward and return the most recent
  // phone_confirmed we haven't acted on. Backward because we want to
  // act on the latest scenario, not replay every historical one.
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type !== "step_up.phone_confirmed") continue;
    if (attempted.has(e.challengeId)) continue;
    return { challengeId: e.challengeId, requestId: e.requestId };
  }
  return null;
}

async function runPasskeyVerification(challengeId: string): Promise<void> {
  // 1. Ask the server for WebAuthn options (challenge, allowCredentials).
  const beginRes = await fetch("/api/step-up/passkey/begin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challengeId })
  });
  if (!beginRes.ok) {
    const detail = await beginRes.json().catch(() => ({}));
    throw new Error(`begin failed: ${detail.error ?? beginRes.status}`);
  }
  const options = await beginRes.json();

  // 2. Browser prompts the user for Touch ID / Face ID / passkey.
  //    This is where the OS-level dialog appears.
  const assertion = await startAuthentication(options);

  // 3. Server verifies the signature and completes the step-up. Kernel
  //    runtime picks up the verified state and resumes the wallet
  //    execution — that's where transferUsdc actually broadcasts to
  //    Base Sepolia. We don't need to do anything else here; the SSE
  //    will deliver step_up.verified + wallet.transfer_mock_executed
  //    and the dashboard updates on its own.
  const finishRes = await fetch("/api/step-up/passkey/finish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challengeId, response: assertion })
  });
  if (!finishRes.ok) {
    const detail = await finishRes.json().catch(() => ({}));
    throw new Error(`finish failed: ${detail.error ?? finishRes.status}`);
  }
}
