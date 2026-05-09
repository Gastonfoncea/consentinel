"use client";

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useEventStream } from "@/lib/hooks/use-event-stream";
import { cn } from "@/lib/utils";
import type { KernelStreamEvent } from "@/lib/events/types";

// PendingActionCard — sits at the top of the WalletPanel and reacts in real
// time to whatever action the agent is currently asking the kernel to
// authorize. Reads directly from the SSE event stream (same source as the
// VoiceCircle), so the wallet narrative and the voice narrative stay in
// sync without prop drilling.

type PendingState =
  | { kind: "idle" }
  | { kind: "pending"; intent: string; requestId: string }
  | {
      kind: "step_up";
      intent: string;
      requestId: string;
      channel: "voice_biometric_callback" | "passkey";
    }
  | { kind: "allow"; intent: string; requestId: string; explanation: string }
  | { kind: "deny"; intent: string; requestId: string; explanation: string };

export function WalletPendingAction() {
  const { events } = useEventStream();
  const state = useMemo(() => derivePendingState(events), [events]);

  if (state.kind === "idle") return null;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={`${state.kind}-${state.requestId}`}
        initial={{ opacity: 0, y: -8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.98 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className={cn(
          "rounded-xl border px-3 py-2.5",
          paletteForKind(state.kind).container
        )}
      >
        <div className="flex items-start gap-2.5">
          <span
            className={cn(
              "mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold",
              paletteForKind(state.kind).badge
            )}
          >
            {iconForKind(state.kind)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] uppercase tracking-wider opacity-70">
              {labelForKind(state.kind)}
            </p>
            <p className="mt-0.5 text-sm font-medium leading-tight">
              {state.intent}
            </p>
            {(state.kind === "allow" || state.kind === "deny") && (
              <p className="mt-1 text-[11px] leading-snug opacity-80">
                {state.explanation}
              </p>
            )}
            {state.kind === "step_up" && (
              <p className="mt-1 text-[11px] leading-snug opacity-80">
                {state.channel === "passkey"
                  ? "Confirm with your passkey on screen."
                  : "Voice biometric — speak to authorize."}
              </p>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ---- State derivation ------------------------------------------------------

function derivePendingState(events: KernelStreamEvent[]): PendingState {
  let intent = "";
  let requestId: string | null = null;
  let kind: PendingState["kind"] = "idle";
  let channel: "voice_biometric_callback" | "passkey" = "voice_biometric_callback";
  let explanation = "";

  for (const event of events) {
    switch (event.type) {
      case "request": {
        requestId = event.requestId;
        intent = event.intent;
        kind = "pending";
        channel = "voice_biometric_callback";
        explanation = "";
        break;
      }
      case "thinking":
      case "evidence": {
        if (kind === "idle") {
          requestId = event.requestId;
          kind = "pending";
        }
        break;
      }
      case "decision": {
        requestId = event.requestId;
        explanation = event.explanation;
        if (event.outcome === "allow" || event.outcome === "allow_with_audit") {
          kind = "allow";
        } else if (event.outcome === "deny") {
          kind = "deny";
        } else {
          kind = "step_up";
        }
        break;
      }
      case "step_up": {
        requestId = event.requestId;
        kind = "step_up";
        channel = event.channel;
        break;
      }
      default:
        break;
    }
  }

  if (kind === "idle" || !requestId) return { kind: "idle" };
  if (kind === "pending") return { kind: "pending", intent, requestId };
  if (kind === "step_up")
    return { kind: "step_up", intent, requestId, channel };
  if (kind === "allow")
    return { kind: "allow", intent, requestId, explanation };
  return { kind: "deny", intent, requestId, explanation };
}

// ---- Presentation helpers --------------------------------------------------

function labelForKind(kind: PendingState["kind"]): string {
  switch (kind) {
    case "pending":
      return "Pending action · kernel evaluating";
    case "step_up":
      return "Awaiting your verification";
    case "allow":
      return "Authorized";
    case "deny":
      return "Blocked by kernel";
    case "idle":
      return "";
  }
}

function iconForKind(kind: PendingState["kind"]): string {
  switch (kind) {
    case "pending":
      return "…";
    case "step_up":
      return "!";
    case "allow":
      return "✓";
    case "deny":
      return "✕";
    case "idle":
      return "";
  }
}

function paletteForKind(kind: PendingState["kind"]) {
  switch (kind) {
    case "pending":
      return {
        container:
          "border-yellow-400/30 bg-yellow-400/5 text-yellow-100/90",
        badge:
          "border-yellow-400/50 bg-yellow-400/10 text-yellow-200"
      };
    case "step_up":
      return {
        container:
          "border-purple-400/30 bg-purple-400/5 text-purple-100/90",
        badge:
          "border-purple-400/50 bg-purple-400/10 text-purple-200"
      };
    case "allow":
      return {
        container:
          "border-allow/30 bg-allow/5 text-allow/95",
        badge: "border-allow/50 bg-allow/10 text-allow"
      };
    case "deny":
      return {
        container:
          "border-deny/30 bg-deny/5 text-deny/95",
        badge: "border-deny/50 bg-deny/10 text-deny"
      };
    case "idle":
      return { container: "", badge: "" };
  }
}
