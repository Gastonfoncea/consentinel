"use client";

import { useEffect, useRef, useState } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import { useEventStream } from "@/lib/hooks/use-event-stream";
import type { StepUpChallengeView } from "@/lib/step-up/challenge-view";

// VoiceSession — narrates the step-up via one-shot TTS audio (the same
// /api/step-up/voice/tts/:challengeId endpoint Kapso uses for the WhatsApp
// audio, but with `?audience=dashboard` for shorter wording). When the
// audio ends, automatically triggers the WebAuthn passkey ceremony.
//
// Why one-shot instead of conversational AI:
//   - The previous implementation used @elevenlabs/react ConversationProvider
//     which kept the mic open while Melisa spoke. Background noise would
//     trip VAD, cut the speech, and (worst case) be picked up as a verbal
//     "yes" that auto-approved the transfer. Genuine safety bug.
//   - One-shot TTS plays the full sentence end-to-end, no listening, no
//     interruption. The fingerprint IS the consent — biometric attestation
//     replaces the verbal "yes". Any noise during playback is ignored.
//
// Two trigger paths:
//   1. `bootstrapChallenge` prop — set by HomeShell when the dashboard
//      hydrated from a Kapso WhatsApp deeplink. Plays as soon as the
//      component mounts.
//   2. SSE `step_up.challenge_created` — from in-page demo scenarios
//      (DevScenarioLauncher). Same playback, same auto-passkey afterward.
//
// Both paths dedup via startedChallengeRef so HMR / SSE reconnect doesn't
// re-trigger Melisa for a challenge already in flight.

interface VoiceSessionProps {
  bootstrapChallenge?: StepUpChallengeView;
  // Notified when Melisa starts/stops speaking. The dashboard blob wires
  // this to a "speaking" pulse driver so the surface ripples in time with
  // the audio — visual cue that the voice is coming THROUGH the blob.
  onSpeakingChange?: (isSpeaking: boolean) => void;
}

export function VoiceSession({
  bootstrapChallenge,
  onSpeakingChange
}: VoiceSessionProps = {}) {
  const { events } = useEventStream();
  const startedChallengeRef = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Stable ref to the latest callback so the playback effect can read it
  // without re-running every render.
  const onSpeakingChangeRef = useRef(onSpeakingChange);
  useEffect(() => {
    onSpeakingChangeRef.current = onSpeakingChange;
  }, [onSpeakingChange]);

  // Visual badge state — surfaces "Melisa hablando" while audio plays so
  // the blob isn't the only signal during the ~1-2s gap between trigger
  // and first audible word.
  const [phase, setPhase] = useState<"idle" | "loading" | "playing" | "passkey">(
    "idle"
  );

  // Bootstrap path: dashboard hydrated from deeplink.
  useEffect(() => {
    if (!bootstrapChallenge) return;
    if (bootstrapChallenge.isTerminal) return;
    if (startedChallengeRef.current === bootstrapChallenge.challengeId) return;
    startedChallengeRef.current = bootstrapChallenge.challengeId;
    void runNarration(
      bootstrapChallenge.challengeId,
      "dashboard",
      setPhase,
      audioRef,
      onSpeakingChangeRef
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootstrapChallenge?.challengeId]);

  // SSE path: in-page demo scenarios (dev launcher). Walks the rolling
  // window for the latest challenge_created we haven't started yet.
  useEffect(() => {
    let latestChallengeId: string | null = null;
    let terminalForLatest = false;

    for (const e of events) {
      if (e.type === "step_up.challenge_created") {
        latestChallengeId = e.challengeId;
        terminalForLatest = false;
      } else if (
        (e.type === "step_up.verified" || e.type === "step_up.canceled") &&
        latestChallengeId === e.challengeId
      ) {
        terminalForLatest = true;
      }
    }

    if (
      latestChallengeId &&
      !terminalForLatest &&
      startedChallengeRef.current !== latestChallengeId
    ) {
      startedChallengeRef.current = latestChallengeId;
      void runNarration(
        latestChallengeId,
        "dashboard",
        setPhase,
        audioRef,
        onSpeakingChangeRef
      );
    }
  }, [events]);

  // Cleanup on unmount — kill any in-flight audio so HMR / route changes
  // don't leave Melisa speaking into the void.
  useEffect(() => {
    return () => {
      const a = audioRef.current;
      if (a) {
        a.pause();
        a.src = "";
      }
    };
  }, []);

  if (phase === "idle") return null;

  const label =
    phase === "loading"
      ? "preparando voz"
      : phase === "playing"
      ? "Melisa hablando"
      : "esperando huella";

  return (
    <div className="pointer-events-none fixed left-1/2 top-4 z-50 -translate-x-1/2">
      <div className="flex items-center gap-2 rounded-full border border-stepup/40 bg-bg/85 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-stepup shadow-lg backdrop-blur">
        <span
          className={
            "h-1.5 w-1.5 rounded-full " +
            (phase === "playing"
              ? "animate-pulse bg-stepup"
              : phase === "loading"
              ? "animate-ping bg-stepup"
              : "bg-stepup/70")
          }
        />
        {label}
      </div>
    </div>
  );
}

async function runNarration(
  challengeId: string,
  audience: "dashboard" | "whatsapp",
  setPhase: (p: "idle" | "loading" | "playing" | "passkey") => void,
  audioRef: React.MutableRefObject<HTMLAudioElement | null>,
  onSpeakingChangeRef: React.MutableRefObject<((isSpeaking: boolean) => void) | undefined>
): Promise<void> {
  setPhase("loading");

  // Fetch the MP3. The endpoint is public and returns audio/mpeg directly,
  // so we point an <audio> element at the URL and let the browser stream.
  // Wrapping in <audio>.play() lets us await onended cleanly.
  const audioUrl = `/api/step-up/voice/tts/${encodeURIComponent(
    challengeId
  )}?audience=${audience}`;

  // Stop any previous instance before starting the new one (e.g. SSE
  // arrives mid-bootstrap playback).
  if (audioRef.current) {
    audioRef.current.pause();
    audioRef.current.src = "";
  }

  const audio = new Audio(audioUrl);
  audio.preload = "auto";
  audioRef.current = audio;

  const playbackDone = new Promise<void>((resolve, reject) => {
    audio.addEventListener("ended", () => resolve(), { once: true });
    audio.addEventListener(
      "error",
      () => reject(new Error("audio playback failed")),
      { once: true }
    );
  });

  try {
    setPhase("playing");
    onSpeakingChangeRef.current?.(true);
    await audio.play();
    await playbackDone;
  } catch (err) {
    // Browser autoplay policy can reject .play() if there was no user
    // gesture in the chain. The challenge persists in Redis; the user
    // can still tap "Aceptar" in the StepUpVerificationCard manually.
    console.warn("[voice-session] audio playback rejected", err);
    onSpeakingChangeRef.current?.(false);
    setPhase("idle");
    return;
  }

  onSpeakingChangeRef.current?.(false);

  // Audio finished cleanly → run the passkey ceremony directly. The OS
  // dialog (Touch ID / Face ID / Windows Hello) shows; on success the
  // server completes the step-up and resumes the wallet operation.
  setPhase("passkey");
  try {
    await runPasskeyCeremony(challengeId);
  } catch (err) {
    console.warn("[voice-session] passkey ceremony failed", err);
  } finally {
    setPhase("idle");
  }
}

async function runPasskeyCeremony(challengeId: string): Promise<void> {
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
  const assertion = await startAuthentication(options);
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
