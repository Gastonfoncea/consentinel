"use client";

import { useEffect, useRef } from "react";
import {
  ConversationProvider,
  useConversation
} from "@elevenlabs/react";
import { useEventStream } from "@/lib/hooks/use-event-stream";
import type { KernelStreamEvent } from "@/lib/events/types";

// VoiceSession — invisible glue between the kernel runtime's SSE feed and
// the @elevenlabs/react browser SDK. When the kernel emits a
// step_up.challenge_created with the voice channel, we fetch a signed
// websocket URL from /api/elevenlabs/signed-url, start a session with the
// challenge data as dynamic variables, and let the agent speak through the
// laptop speakers. We listen for transcripts and forward them to
// /api/voice/transcript so the activity feed can render the dialog.
//
// This component renders nothing — it just owns the SDK lifecycle.

export function VoiceSession() {
  return (
    <ConversationProvider>
      <VoiceSessionDriver />
    </ConversationProvider>
  );
}

function VoiceSessionDriver() {
  const { events } = useEventStream();
  const startedChallengeRef = useRef<string | null>(null);

  // Pre-warmed signed URL — fetched on mount so we save ~365ms when a
  // step-up fires. Refreshed every ~10 minutes (signed URLs are valid
  // for 15min by default) so it doesn't go stale on long-lived sessions.
  const prewarmedSignedUrlRef = useRef<{
    url: string;
    fetchedAt: number;
  } | null>(null);
  const SIGNED_URL_TTL_MS = 10 * 60 * 1000;

  // Pre-warm: signed URL + mic permission on mount, before any step-up
  // fires. Killing ~500ms of perceived latency between blob → verifying
  // and Melisa speaking.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/elevenlabs/signed-url", {
          cache: "no-store"
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { signedUrl?: string };
        if (data.signedUrl && !cancelled) {
          prewarmedSignedUrlRef.current = {
            url: data.signedUrl,
            fetchedAt: Date.now()
          };
          console.log("[voice-session] signed url pre-warmed");
        }
      } catch {
        /* best-effort, fall back to fetch-on-demand */
      }
    })();

    // Pre-request mic permission. If already granted, this resolves
    // instantly without showing a prompt. If never granted, the prompt
    // appears now (when the user is ready) instead of mid-flow.
    if (
      typeof navigator !== "undefined" &&
      navigator.mediaDevices?.getUserMedia
    ) {
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          // Release the stream immediately — we just wanted the
          // permission grant cached. The SDK will request its own
          // stream when the session actually starts.
          stream.getTracks().forEach((t) => t.stop());
          console.log("[voice-session] mic permission pre-warmed");
        })
        .catch(() => {
          /* user denied or blocked; we'll surface the error when the
             real session tries to start */
        });
    }

    return () => {
      cancelled = true;
    };
  }, []);

  const conversation = useConversation({
    onError: (err) => {
      console.warn("[voice-session] sdk error", err);
    },
    onMessage: (msg) => {
      const requestId = currentRequestIdRef.current;
      if (!requestId || !msg?.message) return;
      const role = msg.source === "user" ? "user" : "agent";
      fetch("/api/voice/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, role, text: msg.message })
      }).catch(() => {
        /* ignore */
      });
    }
  });
  const { startSession, endSession, status, isSpeaking } = conversation;

  // Track the active requestId so onMessage can attach transcripts to the
  // right conversation without a closure stale read.
  const currentRequestIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Walk the rolling event window forward and react to the latest
    // step_up.challenge_created we haven't started yet, or any terminal
    // state that should close the session.
    let latestChallenge: {
      challengeId: string;
      requestId: string;
      prompt: string;
      intent: string;
    } | null = null;
    let terminal:
      | { challengeId: string; kind: "verified" | "canceled" }
      | null = null;

    // First pass: collect the original user intent for each requestId so
    // we can hand it to ElevenLabs as a clean dynamic variable. The kernel's
    // challenge prompt is technical voice-provider talk; intent is the
    // user's plain-language ask ("Send 20 USDC to Juan…") which is what
    // Melisa should actually paraphrase to the human.
    const intentByRequestId = new Map<string, string>();
    for (const e of events) {
      if (e.type === "permission.request_started") {
        intentByRequestId.set(e.requestId, e.intent);
      }
    }

    for (const e of events) {
      if (e.type === "step_up.challenge_created") {
        // Voice is a narrator that runs in parallel to *any* step-up channel.
        // The kernel emits channel: "passkey" today (see demoFixtures
        // preferredStepUp), but Melisa should still speak — passkey is the
        // authoritative auth, voice just confirms intent out loud.
        latestChallenge = {
          challengeId: e.challengeId,
          requestId: e.requestId,
          prompt: e.prompt,
          intent: intentByRequestId.get(e.requestId) ?? ""
        };
        terminal = null;
      } else if (e.type === "step_up.verified") {
        if (latestChallenge?.challengeId === e.challengeId) {
          terminal = { challengeId: e.challengeId, kind: "verified" };
        }
      } else if (e.type === "step_up.canceled") {
        if (latestChallenge?.challengeId === e.challengeId) {
          terminal = { challengeId: e.challengeId, kind: "canceled" };
        }
      }
    }

    if (
      latestChallenge &&
      !terminal &&
      startedChallengeRef.current !== latestChallenge.challengeId
    ) {
      startedChallengeRef.current = latestChallenge.challengeId;
      currentRequestIdRef.current = latestChallenge.requestId;
      // Use the pre-warmed signed URL if it's still fresh — saves a
      // ~365ms round-trip vs. fetching on demand.
      const prewarmed = prewarmedSignedUrlRef.current;
      const cachedUrl =
        prewarmed && Date.now() - prewarmed.fetchedAt < SIGNED_URL_TTL_MS
          ? prewarmed.url
          : null;
      startVoiceSession(startSession, latestChallenge, cachedUrl).catch(
        (err) => {
          console.error("[voice-session] failed to start", err);
        }
      );
    }

    if (
      terminal &&
      startedChallengeRef.current === terminal.challengeId
    ) {
      endSession();
      startedChallengeRef.current = null;
      currentRequestIdRef.current = null;
    }
  }, [events, startSession, endSession]);

  // Visual badge so the user has explicit feedback during the
  // ~1-2s gap between step_up.challenge_created and Melisa's first
  // audible word. Without this the blob is the only signal, and
  // "verifying" can look static while the WebSocket is handshaking.
  const isActive =
    status === "connecting" || status === "connected" || isSpeaking;
  const label = (() => {
    if (status === "connecting") return "conectando voz";
    if (isSpeaking) return "Melisa hablando";
    if (status === "connected") return "escuchando";
    return null;
  })();
  if (!isActive || !label) return null;
  return (
    <div className="pointer-events-none fixed left-1/2 top-4 z-50 -translate-x-1/2">
      <div className="flex items-center gap-2 rounded-full border border-stepup/40 bg-bg/85 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-stepup shadow-lg backdrop-blur">
        <span
          className={
            "h-1.5 w-1.5 rounded-full " +
            (isSpeaking
              ? "animate-pulse bg-stepup"
              : status === "connecting"
              ? "animate-ping bg-stepup"
              : "bg-stepup/70")
          }
        />
        {label}
      </div>
    </div>
  );
}

async function startVoiceSession(
  startSession: ReturnType<typeof useConversation>["startSession"],
  challenge: {
    challengeId: string;
    requestId: string;
    prompt: string;
    intent: string;
  },
  cachedSignedUrl: string | null
): Promise<void> {
  console.time("[voice-session] start latency");
  // 1. Mic permission. If pre-warmed on mount, this resolves instantly
  //    without re-prompting; otherwise it asks the user.
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Release this probe — the SDK opens its own stream on startSession.
    stream.getTracks().forEach((t) => t.stop());
  } catch (err) {
    console.warn("[voice-session] mic permission denied", err);
    throw err;
  }

  // 2. Signed URL — use the pre-warmed one if available, otherwise
  //    fetch fresh.
  let signedUrl = cachedSignedUrl;
  if (!signedUrl) {
    console.log("[voice-session] no cached signed url, fetching");
    const res = await fetch("/api/elevenlabs/signed-url", {
      cache: "no-store"
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`signed-url failed: ${res.status} ${detail}`);
    }
    const data = (await res.json()) as { signedUrl?: string };
    if (!data.signedUrl) throw new Error("no signed url in response");
    signedUrl = data.signedUrl;
  } else {
    console.log("[voice-session] using pre-warmed signed url");
  }

  // 3. Start the websocket. The agent's system prompt is allowed to read
  //    {{intent}} (plain-language, e.g. "Send 20 USDC to Juan…") but is
  //    explicitly forbidden from reading {{phrase}} / {{action_hash}} —
  //    those are kept only for audit / fallback context.
  startSession({
    signedUrl,
    connectionType: "websocket",
    dynamicVariables: {
      challenge_id: challenge.challengeId,
      action_hash: challenge.challengeId,
      // Plain-language ask. Falls back to the kernel prompt if intent
      // wasn't captured (shouldn't happen in the demo but be defensive).
      intent: challenge.intent || challenge.prompt,
      // Kept for backwards compat with the existing system prompt; the
      // prompt is being updated to ignore these in favor of {{intent}}.
      phrase: challenge.intent || challenge.prompt,
      action_summary: challenge.intent || challenge.prompt
    }
  });
  console.timeEnd("[voice-session] start latency");
}

// Avoid unused-var warnings for the type import (kept so future refactors
// can switch to a typed pick if event shape grows).
export type { KernelStreamEvent };
