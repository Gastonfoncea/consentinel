"use client";

import { useEffect, useRef, useState } from "react";
import { useEventStream } from "@/lib/hooks/use-event-stream";
import type { StepUpChallengeView } from "@/lib/step-up/challenge-view";

// VoiceSession — narrates the step-up via one-shot TTS audio (the same
// /api/step-up/voice/tts/:challengeId endpoint Kapso uses for the WhatsApp
// audio, but with `?audience=dashboard` for shorter wording).
//
// The voice is purely narration. The actual consent moment is the user
// tapping "Aceptar" in StepUpVerificationCard — that runs the WebAuthn
// passkey ceremony explicitly. If the browser blocks autoplay (deeplink
// navigation gives no user gesture in the destination tab), we don't
// give up — we wait for the first pointerdown/keydown anywhere on the
// page and play then. The card with Aceptar/Rechazar is always visible,
// so the user can still approve without ever hearing Melisa.
//
// Two trigger paths:
//   1. `bootstrapChallenge` prop — set by HomeShell when the dashboard
//      hydrated from a Kapso WhatsApp deeplink. Plays as soon as the
//      component mounts.
//   2. SSE `step_up.challenge_created` — from in-page demo scenarios
//      (DevScenarioLauncher). Same playback.
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
  const [phase, setPhase] = useState<
    "idle" | "loading" | "awaiting-gesture" | "playing"
  >("idle");

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
  // don't leave Melisa speaking into the void. Also clear the dedup ref:
  // React 18 Strict Mode (next.config.js) double-mounts in dev, so on the
  // first "fake" unmount the audio gets torn down here; if we leave the
  // dedup ref pointing at the current challengeId the remount's bootstrap
  // effect early-returns and Melisa never speaks. Clearing it lets the
  // remount retry. Same applies to a real route navigation back to the
  // dashboard with the same ?challenge=.
  useEffect(() => {
    return () => {
      const a = audioRef.current;
      if (a) {
        a.pause();
        a.src = "";
      }
      audioRef.current = null;
      startedChallengeRef.current = null;
    };
  }, []);

  if (phase === "idle") return null;

  const label =
    phase === "loading"
      ? "preparando voz"
      : phase === "awaiting-gesture"
        ? "tocá para escuchar a Melisa"
        : "Melisa hablando";

  return (
    <div className="pointer-events-none fixed left-1/2 top-4 z-50 -translate-x-1/2">
      <div className="flex items-center gap-2 rounded-full border border-stepup/40 bg-bg/85 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-stepup shadow-lg backdrop-blur">
        <span
          className={
            "h-1.5 w-1.5 rounded-full " +
            (phase === "playing"
              ? "animate-pulse bg-stepup"
              : "animate-ping bg-stepup")
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
  setPhase: (
    p: "idle" | "loading" | "awaiting-gesture" | "playing"
  ) => void,
  audioRef: React.MutableRefObject<HTMLAudioElement | null>,
  onSpeakingChangeRef: React.MutableRefObject<((isSpeaking: boolean) => void) | undefined>
): Promise<void> {
  setPhase("loading");

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
    try {
      setPhase("playing");
      onSpeakingChangeRef.current?.(true);
      await audio.play();
    } catch (autoplayErr) {
      // Most common case in prod: deeplink navigation = no user gesture
      // in this tab, so the browser rejects .play() with NotAllowedError.
      // Park the audio and arm one-shot listeners — the very first tap or
      // keypress anywhere will release it.
      console.warn("[voice-session] autoplay blocked, awaiting first gesture", autoplayErr);
      onSpeakingChangeRef.current?.(false);
      setPhase("awaiting-gesture");
      await waitForUserGestureAndPlay(audio);
      onSpeakingChangeRef.current?.(true);
      setPhase("playing");
    }
    await playbackDone;
  } catch (err) {
    console.warn("[voice-session] audio playback skipped", err);
  } finally {
    onSpeakingChangeRef.current?.(false);
    setPhase("idle");
  }
}

// Resolves on the first pointerdown / keydown / touchstart on the window,
// at which point the gesture token lets us call .play() successfully.
// Rejects if the audio element is torn down (HMR / unmount sets src="" →
// "emptied") so the outer try doesn't hang forever.
function waitForUserGestureAndPlay(audio: HTMLAudioElement): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const events = ["pointerdown", "keydown", "touchstart"] as const;
    const cleanup = () => {
      events.forEach((e) => window.removeEventListener(e, onGesture, true));
      audio.removeEventListener("emptied", onAborted);
    };
    const onGesture = () => {
      cleanup();
      audio.play().then(resolve, reject);
    };
    const onAborted = () => {
      cleanup();
      reject(new Error("audio aborted before user gesture"));
    };
    events.forEach((e) =>
      window.addEventListener(e, onGesture, { once: true, capture: true })
    );
    audio.addEventListener("emptied", onAborted, { once: true });
  });
}
