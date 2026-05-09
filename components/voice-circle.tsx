"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { useEventStream } from "@/lib/hooks/use-event-stream";
import {
  useVoiceState,
  type VoiceState,
  type VoiceStateValue
} from "@/lib/voice/use-voice-state";

// VoiceCircle — single source of truth for the kernel's UI state.
// Subscribes to the SSE stream, derives a 5-state machine
// (idle/thinking/verifying/allow/deny), animates the circle, and
// orchestrates ElevenLabs SDK session lifecycle when the kernel asks for
// voice biometric step-up.

interface PendingChallenge {
  challengeId: string;
  requestId: string;
  phrase: string;
  actionSummary: string;
  actionHash: string;
}

interface VoiceCircleProps {
  /**
   * Latest challenge handed back by /api/agent/action when status is
   * step_up_required. The trigger component sets it; the circle owns
   * launching the SDK session.
   */
  challenge: PendingChallenge | null;
  /** Called when voice or passkey resolves and we've handed back to idle. */
  onResolved?: () => void;
}

export function VoiceCircle(props: VoiceCircleProps) {
  return (
    <ConversationProvider>
      <VoiceCircleInner {...props} />
    </ConversationProvider>
  );
}

function VoiceCircleInner({ challenge, onResolved }: VoiceCircleProps) {
  const { events, connected } = useEventStream();
  const voice = useVoiceState(events);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-3 rounded-2xl border border-border bg-surface px-5 py-6">
      <CircleVisual state={voice.state} />
      <div className="text-center">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
          {labelForState(voice.state)}
        </p>
        <p className="mt-1 max-w-xs text-sm text-text">
          {sublabelForState(voice)}
        </p>
      </div>
      <div className="flex items-center gap-2 text-[10px] text-muted">
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            connected ? "bg-allow" : "bg-deny"
          }`}
        />
        <span className="font-mono uppercase tracking-wider">
          {connected ? "stream live" : "stream offline"}
        </span>
      </div>
      <VoiceSessionDriver
        voiceState={voice}
        challenge={challenge}
        onResolved={onResolved}
      />
    </div>
  );
}

// Inner component that owns the @elevenlabs/react conversation. Renders
// nothing visual — it just reacts to voiceState transitions and starts /
// ends the SDK session.
function VoiceSessionDriver({
  voiceState,
  challenge,
  onResolved
}: {
  voiceState: VoiceStateValue;
  challenge: PendingChallenge | null;
  onResolved?: () => void;
}) {
  const { startSession, endSession, status, mode } = useConversation({
    onError: (err) => {
      console.warn("[voice] elevenlabs error", err);
    },
    onMessage: (msg) => {
      // Relay every conversation turn to our SSE bus so the LogPanel +
      // ChatPanel render the live conversation alongside kernel events.
      const requestId = challenge?.requestId;
      if (!requestId || !msg.message) return;
      const role = msg.source === "user" ? "user" : "agent";
      // fire-and-forget; if it fails we just lose this transcript line.
      fetch("/api/voice/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, role, text: msg.message })
      }).catch(() => {
        /* ignore */
      });
    }
  });

  const startedRef = useRef<string | null>(null);

  // Drive the SDK session lifecycle off the voice channel.
  useEffect(() => {
    const wantsVoice =
      voiceState.state === "verifying" &&
      voiceState.verifyingChannel === "voice_biometric_callback";

    if (wantsVoice && challenge && startedRef.current !== challenge.challengeId) {
      startedRef.current = challenge.challengeId;
      startVoiceSession(startSession, challenge).catch((err) => {
        console.error("[voice] failed to start session", err);
      });
    }

    if (!wantsVoice && startedRef.current) {
      // The kernel moved past the voice phase (passkey, allow, or deny) —
      // close the session if it's still open.
      endSession();
      startedRef.current = null;
      if (
        voiceState.state === "allow" ||
        voiceState.state === "deny" ||
        voiceState.state === "idle"
      ) {
        onResolved?.();
      }
    }
  }, [
    voiceState.state,
    voiceState.verifyingChannel,
    challenge,
    startSession,
    endSession,
    onResolved
  ]);

  // Visual hint on connection status — useful while debugging.
  useEffect(() => {
    if (status === "error") {
      console.warn("[voice] sdk status: error");
    }
  }, [status]);

  // Surface SDK status + mode underneath the circle so the user sees
  // "Listening" / "Speaking" / "Connecting" while the verifying state
  // covers everything in the bigger UI.
  if (
    !(
      voiceState.state === "verifying" &&
      voiceState.verifyingChannel === "voice_biometric_callback"
    )
  ) {
    return null;
  }

  return (
    <div className="mt-1 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-muted">
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          status === "connected"
            ? "bg-allow"
            : status === "connecting"
            ? "bg-stepup animate-pulse"
            : status === "error"
            ? "bg-deny"
            : "bg-muted"
        }`}
      />
      <span>
        {status === "connected"
          ? mode === "speaking"
            ? "agent speaking"
            : "listening"
          : status}
      </span>
    </div>
  );
}

async function startVoiceSession(
  startSession: ReturnType<typeof useConversation>["startSession"],
  challenge: PendingChallenge
): Promise<void> {
  // 1. Ask the user for mic permission proactively so the SDK doesn't fail
  //    silently on platforms that require an explicit gesture.
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    console.warn("[voice] mic permission denied", err);
    throw err;
  }

  // 2. Fetch a signed URL from our backend so we don't expose the API key.
  const res = await fetch("/api/elevenlabs/signed-url", { cache: "no-store" });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`signed-url failed: ${res.status} ${detail}`);
  }
  const data = (await res.json()) as { signedUrl?: string; ok?: boolean };
  if (!data.signedUrl) throw new Error("no signed url in response");

  // 3. Start the websocket session with our dynamic variables. The agent's
  //    system prompt references {{phrase}}, {{challenge_id}}, etc. — these
  //    are how we bind the voice flow to our pending challenge.
  startSession({
    signedUrl: data.signedUrl,
    connectionType: "websocket",
    dynamicVariables: {
      challenge_id: challenge.challengeId,
      phrase: challenge.phrase,
      action_summary: challenge.actionSummary,
      action_hash: challenge.actionHash
    }
  });
}

// ---- Pure presentation -----------------------------------------------------

function CircleVisual({ state }: { state: VoiceState }) {
  const palette = paletteForState(state);

  return (
    <div className="relative flex h-32 w-32 items-center justify-center">
      <AnimatePresence mode="wait">
        <motion.div
          key={state}
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.92, opacity: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="absolute inset-0 rounded-full"
          style={{
            background: palette.background,
            boxShadow: palette.glow,
            filter: state === "deny" ? "saturate(120%)" : undefined
          }}
        />
      </AnimatePresence>
      <motion.div
        animate={animationForState(state)}
        transition={{
          duration: state === "thinking" ? 1.4 : state === "verifying" ? 1.1 : 2.6,
          repeat: state === "idle" || state === "thinking" || state === "verifying" ? Infinity : 0,
          ease: "easeInOut"
        }}
        className="relative h-20 w-20 rounded-full border border-white/20"
        style={{
          background: palette.core,
          boxShadow: palette.coreGlow
        }}
      />
    </div>
  );
}

function paletteForState(state: VoiceState) {
  switch (state) {
    case "idle":
      return {
        background:
          "radial-gradient(circle at 50% 50%, rgba(103,183,216,0.55), rgba(103,183,216,0.05) 70%)",
        core: "linear-gradient(180deg, #7BC6E6 0%, #4F94B5 100%)",
        glow: "0 0 60px rgba(103,183,216,0.25)",
        coreGlow: "inset 0 0 16px rgba(255,255,255,0.15)"
      };
    case "thinking":
      return {
        background:
          "radial-gradient(circle at 50% 50%, rgba(147,51,234,0.6), rgba(59,130,246,0.05) 70%)",
        core: "linear-gradient(180deg, #6366F1 0%, #9333EA 100%)",
        glow: "0 0 80px rgba(99,102,241,0.45)",
        coreGlow: "inset 0 0 22px rgba(255,255,255,0.2)"
      };
    case "verifying":
      return {
        background:
          "radial-gradient(circle at 50% 50%, rgba(251,191,36,0.55), rgba(139,92,246,0.05) 70%)",
        core: "linear-gradient(180deg, #FBBF24 0%, #8B5CF6 100%)",
        glow: "0 0 70px rgba(251,191,36,0.45)",
        coreGlow: "inset 0 0 22px rgba(255,255,255,0.25)"
      };
    case "allow":
      return {
        background:
          "radial-gradient(circle at 50% 50%, rgba(0,255,136,0.65), rgba(125,211,252,0.05) 70%)",
        core: "linear-gradient(180deg, #00FF88 0%, #7DD3FC 100%)",
        glow: "0 0 90px rgba(0,255,136,0.55)",
        coreGlow: "inset 0 0 26px rgba(255,255,255,0.35)"
      };
    case "deny":
      return {
        background:
          "radial-gradient(circle at 50% 50%, rgba(255,59,48,0.7), rgba(31,31,31,0.1) 70%)",
        core: "linear-gradient(180deg, #FF3B30 0%, #1F1F1F 100%)",
        glow: "0 0 90px rgba(255,59,48,0.6)",
        coreGlow: "inset 0 0 26px rgba(0,0,0,0.45)"
      };
  }
}

function animationForState(state: VoiceState) {
  switch (state) {
    case "idle":
      return { scale: [1, 1.04, 1], opacity: [0.85, 1, 0.85] };
    case "thinking":
      return { rotate: [0, 360], scale: [1, 1.03, 1] };
    case "verifying":
      return { scale: [1, 1.08, 1], opacity: [0.8, 1, 0.8] };
    case "allow":
      return { scale: [1, 1.06, 1], opacity: [0.95, 1, 0.95] };
    case "deny":
      return { scale: 1, opacity: 1 };
  }
}

function labelForState(state: VoiceState): string {
  switch (state) {
    case "idle":
      return "Idle";
    case "thinking":
      return "Thinking";
    case "verifying":
      return "Verifying";
    case "allow":
      return "Allow";
    case "deny":
      return "Deny";
  }
}

function sublabelForState(value: VoiceStateValue): string {
  switch (value.state) {
    case "idle":
      return "Awaiting agent action.";
    case "thinking":
      return "Routing through behavior graph + intent drift…";
    case "verifying":
      return value.verifyingChannel === "passkey"
        ? "Confirm with your passkey to continue."
        : "Voice biometric in progress — speak to confirm.";
    case "allow":
      return value.lastExplanation ?? "Action authorized.";
    case "deny":
      return value.lastExplanation ?? "Action blocked.";
  }
}
