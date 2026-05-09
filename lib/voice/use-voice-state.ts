"use client";

import { useEffect, useMemo, useState } from "react";
import type { KernelStreamEvent } from "@/lib/events/types";

// Visual state of the voice circle. Maps from KernelStreamEvent stream
// per the spec Tomás defined:
//
//   idle       cyan apagado (#67B7D8)        default — silencio del kernel
//   thinking   azul→violeta                  request entró, kernel razonando
//   verifying  violeta→ámbar                 step-up pedido, esperando user
//   allow      verde calmo                   decisión positiva (back to idle 2.2s)
//   deny       rojo+negro                    decisión negativa (back to idle 2.2s)

export type VoiceState =
  | "idle"
  | "thinking"
  | "verifying"
  | "allow"
  | "deny";

export type VerifyingChannel = "voice_biometric_callback" | "passkey" | null;

const RESET_DELAY_MS = 2200;

export interface VoiceStateValue {
  state: VoiceState;
  /** Which step-up channel is currently active when state === "verifying". */
  verifyingChannel: VerifyingChannel;
  /** Last requestId tracked. Useful to bind ElevenLabs sessions. */
  activeRequestId: string | null;
  /** Last decision explanation (for tooltip / log surfacing). */
  lastExplanation: string | null;
}

export function useVoiceState(events: KernelStreamEvent[]): VoiceStateValue {
  // Re-derive on every event snapshot. Cheap because events array is small.
  const derived = useMemo(() => deriveState(events), [events]);
  const [value, setValue] = useState<VoiceStateValue>(derived);

  // When the derivation lands in a terminal state (allow/deny), schedule a
  // soft return to idle so the circle pulses through the success/failure
  // moment then settles.
  useEffect(() => {
    setValue(derived);
    if (derived.state !== "allow" && derived.state !== "deny") return;
    const t = setTimeout(() => {
      setValue((prev) =>
        prev.state === derived.state &&
        prev.activeRequestId === derived.activeRequestId
          ? {
              state: "idle",
              verifyingChannel: null,
              activeRequestId: prev.activeRequestId,
              lastExplanation: prev.lastExplanation
            }
          : prev
      );
    }, RESET_DELAY_MS);
    return () => clearTimeout(t);
  }, [derived]);

  return value;
}

function deriveState(events: KernelStreamEvent[]): VoiceStateValue {
  // Walk the events forward and let the latest signal win. Keeps the logic
  // dead simple at the cost of an O(n) scan per render — fine for the 200
  // event rolling window the SSE hook keeps.
  let state: VoiceState = "idle";
  let verifyingChannel: VerifyingChannel = null;
  let activeRequestId: string | null = null;
  let lastExplanation: string | null = null;

  for (const event of events) {
    switch (event.type) {
      case "request":
      case "thinking":
      case "evidence": {
        if (state === "idle" || state === "allow" || state === "deny") {
          state = "thinking";
          verifyingChannel = null;
        }
        if ("requestId" in event) activeRequestId = event.requestId;
        break;
      }
      case "decision": {
        activeRequestId = event.requestId;
        lastExplanation = event.explanation;
        if (event.outcome === "allow" || event.outcome === "allow_with_audit") {
          state = "allow";
          verifyingChannel = null;
        } else if (event.outcome === "deny") {
          state = "deny";
          verifyingChannel = null;
        } else {
          // step_up — keep verifying until we get the next decision/step_up
          state = "verifying";
        }
        break;
      }
      case "step_up": {
        activeRequestId = event.requestId;
        state = "verifying";
        verifyingChannel = event.channel;
        break;
      }
      case "ping":
      default:
        break;
    }
  }

  return { state, verifyingChannel, activeRequestId, lastExplanation };
}
