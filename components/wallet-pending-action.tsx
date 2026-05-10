"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useEventStream } from "@/lib/hooks/use-event-stream";
import type { KernelStreamEvent } from "@/lib/events/types";
import { cn } from "@/lib/utils";

// PLA-43 — Pending Action card.
//
// The narrative piece of the wallet area. Subscribes to the kernel SSE
// stream, focuses on the *latest* request, and walks its events to derive
// a coarse status: pending → step_up → allow/deny. The component is
// what transforms the wallet from "balance + tx history" into "wallet
// reacting to my agent in real time" during the demo.
//
// Lifecycle of a single request, color-coded:
//   permission.request_started                  → 🟡 pending  ("evaluando")
//   permission.decision_made(step_up) /
//     step_up.challenge_created                 → 🟣 step_up  ("necesita verificación")
//   permission.decision_made(allow / executed) /
//     step_up.verified /
//     wallet.transfer_mock_executed             → 🟢 allow    ("autorizado")
//   permission.decision_made(deny) /
//     step_up.canceled                          → 🔴 deny     ("bloqueado")
//
// Terminal states (allow / deny) auto-fade to idle after TERMINAL_DECAY_MS
// so the card returns to a quiet placeholder between scenarios.

interface WalletPendingActionProps {
  // Called when the user clicks the card while it's in step_up state.
  // Wired by the parent (HomeShell) to whatever opens the verification
  // modal. Until PLA-38 lands the modal, it just logs.
  onStepUpClick?: (requestId: string) => void;
}

type ActionStatus = "pending" | "step_up" | "allow" | "deny";

interface ActiveAction {
  status: ActionStatus;
  requestId: string;
  // One-line human summary, e.g. "Enviar 20 USDC a Juan".
  summary: string;
  // For deny states, why the kernel/user blocked it.
  reason?: string;
  // Real Base Sepolia tx hash once the kernel actually broadcasts.
  // Surfaces as a "ver tx ↗" link to BaseScan in the allow state, so
  // judges can click out of the demo and verify the on-chain trace.
  txHash?: string;
}

type DisplayedAction = { status: "idle" } | ActiveAction;

const TERMINAL_DECAY_MS = 6000;
const BASESCAN_TX_URL = "https://sepolia.basescan.org/tx/";

export function WalletPendingAction({ onStepUpClick }: WalletPendingActionProps) {
  const { events } = useEventStream();
  const derived = useMemo(() => deriveAction(events), [events]);

  // Hold/decay logic — once a terminal state shows up, keep it for
  // TERMINAL_DECAY_MS before fading back to idle. Without this the card
  // would snap to idle the moment the kernel emits unrelated follow-up
  // events (e.g. a fresh ping).
  const [displayed, setDisplayed] = useState<DisplayedAction>({
    status: "idle"
  });
  const decayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (decayTimerRef.current) {
      clearTimeout(decayTimerRef.current);
      decayTimerRef.current = null;
    }

    setDisplayed(derived);

    if (derived.status === "allow" || derived.status === "deny") {
      decayTimerRef.current = setTimeout(() => {
        setDisplayed({ status: "idle" });
      }, TERMINAL_DECAY_MS);
    }

    return () => {
      if (decayTimerRef.current) {
        clearTimeout(decayTimerRef.current);
      }
    };
  }, [derived]);

  const isStepUp = displayed.status === "step_up";

  return (
    <div className="relative flex h-full flex-col rounded-2xl border border-border bg-surface p-5">
      <div className="mb-2 flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
          pending action
        </p>
        {displayed.status !== "idle" && (
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted/70">
            {labelForStatus(displayed.status)}
          </span>
        )}
      </div>

      <AnimatePresence mode="wait">
        {displayed.status === "idle" ? (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="flex flex-1 items-center justify-center"
          >
            <p className="font-mono text-xs text-muted/60">
              waiting for agent…
            </p>
          </motion.div>
        ) : (
          <motion.div
            key={displayed.status + displayed.requestId}
            role={isStepUp ? "button" : undefined}
            tabIndex={isStepUp ? 0 : -1}
            onClick={() => {
              if (isStepUp && onStepUpClick) {
                onStepUpClick(displayed.requestId);
              }
            }}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className={cn(
              "flex flex-1 flex-col items-start gap-2 rounded-xl border p-4 text-left transition",
              displayed.status === "pending" &&
                "border-warn/40 bg-warn/5",
              displayed.status === "step_up" &&
                "cursor-pointer border-stepup/50 bg-stepup/10 shadow-glow-stepup hover:bg-stepup/15",
              displayed.status === "allow" &&
                "border-allow/40 bg-allow/5",
              displayed.status === "deny" &&
                "border-deny/40 bg-deny/5"
            )}
          >
            <StatusBadge status={displayed.status} />
            <p
              className={cn(
                "font-mono text-sm leading-snug text-text",
                displayed.status === "pending" && "text-warn",
                displayed.status === "step_up" && "text-stepup",
                displayed.status === "allow" && "text-allow",
                displayed.status === "deny" && "text-deny"
              )}
            >
              {displayed.summary}
            </p>
            {displayed.reason && (
              <p className="font-mono text-[11px] leading-relaxed text-muted">
                {displayed.reason}
              </p>
            )}
            {isStepUp && (
              <span className="mt-auto pt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-stepup/80">
                tap to verify ↗
              </span>
            )}
            {/* Real on-chain proof CTA. Only renders when the kernel
                actually broadcasted to Base Sepolia (mock fallback
                doesn't include a hash). Styled as a full-width pill
                button so judges can't miss it during the demo —
                external link to BaseScan with the truncated hash
                visible right on the button. */}
            {displayed.status === "allow" && displayed.txHash && (
              <a
                href={BASESCAN_TX_URL + displayed.txHash}
                target="_blank"
                rel="noreferrer noopener"
                onClick={(e) => e.stopPropagation()}
                className="mt-auto flex w-full items-center justify-between gap-2 rounded-md border border-allow/40 bg-allow/10 px-3 py-2 font-mono text-[11px] text-allow shadow-glow-allow/40 transition hover:bg-allow/15"
              >
                <span className="flex items-center gap-1.5">
                  <span className="text-[9px] uppercase tracking-[0.18em] text-allow/70">
                    on-chain
                  </span>
                  <span className="truncate">
                    {displayed.txHash.slice(0, 10)}…{displayed.txHash.slice(-6)}
                  </span>
                </span>
                <span className="shrink-0 text-[10px] uppercase tracking-[0.18em]">
                  basescan ↗
                </span>
              </a>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatusBadge({ status }: { status: ActionStatus }) {
  const dotClass = (() => {
    switch (status) {
      case "pending":
        return "bg-warn shadow-glow-warn animate-pulse";
      case "step_up":
        return "bg-stepup shadow-glow-stepup animate-pulse";
      case "allow":
        return "bg-allow shadow-glow-allow";
      case "deny":
        return "bg-deny shadow-glow-deny";
    }
  })();
  const labelClass = (() => {
    switch (status) {
      case "pending":
        return "text-warn";
      case "step_up":
        return "text-stepup";
      case "allow":
        return "text-allow";
      case "deny":
        return "text-deny";
    }
  })();
  return (
    <div className="flex items-center gap-2">
      <span className={cn("h-2 w-2 rounded-full", dotClass)} />
      <span
        className={cn(
          "font-mono text-[10px] uppercase tracking-[0.22em]",
          labelClass
        )}
      >
        {labelForStatus(status)}
      </span>
    </div>
  );
}

function labelForStatus(status: ActionStatus): string {
  switch (status) {
    case "pending":
      return "evaluando";
    case "step_up":
      return "necesita verificación";
    case "allow":
      return "autorizado";
    case "deny":
      return "bloqueado";
  }
}

// === State derivation ===
//
// Walks the rolling event window and locates the most recent
// permission.request_started — that's our focus request. Then collects
// every event tied to that requestId and reduces them to a single
// status + summary. Priority order matters: an `executed` event always
// wins over `step_up`, etc.

function deriveAction(events: KernelStreamEvent[]): DisplayedAction {
  let activeRequestId: string | null = null;
  let activeIntent = "";

  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === "permission.request_started") {
      activeRequestId = e.requestId;
      activeIntent = e.intent;
      break;
    }
  }

  if (!activeRequestId) return { status: "idle" };

  let outcome: "allow" | "allow_with_audit" | "step_up" | "deny" | null = null;
  let stepUpStarted = false;
  let stepUpResolved: "verified" | "canceled" | null = null;
  let executed = false;
  let denyReason: string | null = null;
  let preparedAmount: string | null = null;
  let preparedAsset: string | null = null;
  let preparedTo: string | null = null;
  let txHash: string | null = null;

  for (const e of events) {
    if (!hasMatchingRequestId(e, activeRequestId)) continue;

    switch (e.type) {
      case "permission.decision_made":
        outcome = e.outcome;
        if (outcome === "deny") denyReason = e.explanation;
        break;
      case "step_up.challenge_created":
        stepUpStarted = true;
        break;
      case "step_up.verified":
        stepUpResolved = "verified";
        break;
      case "step_up.canceled":
        stepUpResolved = "canceled";
        break;
      case "wallet.transfer_mock_executed":
        executed = true;
        preparedAmount = String(e.amount);
        preparedAsset = e.asset;
        preparedTo = e.to;
        // Real on-chain hash from Base Sepolia. Used to render a
        // BaseScan link in the allow card so the demo proves it's
        // not a mockup.
        txHash = e.txHash;
        break;
      case "wallet.transfer_prepared":
        preparedAmount = e.amount;
        preparedAsset = e.asset;
        preparedTo = e.to;
        break;
    }
  }

  const summary = buildSummary({
    intent: activeIntent,
    amount: preparedAmount,
    asset: preparedAsset,
    to: preparedTo
  });

  // Priority: executed > resolved > deny > step_up > allow > pending.
  if (executed) {
    return {
      status: "allow",
      requestId: activeRequestId,
      summary,
      txHash: txHash ?? undefined
    };
  }
  if (stepUpResolved === "canceled") {
    return {
      status: "deny",
      requestId: activeRequestId,
      summary,
      reason: "Cancelado por el usuario"
    };
  }
  if (stepUpResolved === "verified") {
    return {
      status: "allow",
      requestId: activeRequestId,
      summary,
      txHash: txHash ?? undefined
    };
  }
  if (outcome === "deny") {
    return {
      status: "deny",
      requestId: activeRequestId,
      summary,
      reason: denyReason ?? "Bloqueado por política"
    };
  }
  if (outcome === "step_up" || stepUpStarted) {
    return { status: "step_up", requestId: activeRequestId, summary };
  }
  if (outcome === "allow" || outcome === "allow_with_audit") {
    return { status: "allow", requestId: activeRequestId, summary };
  }
  return { status: "pending", requestId: activeRequestId, summary };
}

function hasMatchingRequestId(
  e: KernelStreamEvent,
  requestId: string
): boolean {
  return "requestId" in e && e.requestId === requestId;
}

function buildSummary({
  intent,
  amount,
  asset,
  to
}: {
  intent: string;
  amount: string | null;
  asset: string | null;
  to: string | null;
}): string {
  // Prefer structured data — once the kernel produces wallet.transfer_*
  // events, we know exactly what's being moved.
  if (amount && asset) {
    const recipient = extractRecipientName(intent) ?? shortAddr(to);
    return `Enviar ${amount} ${asset} a ${recipient}`;
  }

  // Fallback: parse the user's natural-language intent.
  const parsed = parseIntent(intent);
  if (parsed) {
    return `Enviar ${parsed.amount} ${parsed.asset} a ${parsed.recipient}`;
  }

  return intent || "Acción pendiente";
}

function parseIntent(
  intent: string
): { amount: string; asset: string; recipient: string } | null {
  // Matches "Send 20 USDC to Juan", "Transfer 50 USDC to 0x...",
  // "Mandá 10 USDC a María", etc. Recipient stops at the first
  // non-letter char so we don't slurp the whole sentence.
  const m = intent.match(
    /(?:send|transfer|enviar|mandar|mandá|mand[áa])\s+(\d+(?:[.,]\d+)?)\s*(USDC|ETH|usdc|eth)\s+(?:to|a|para)\s+([A-Za-z]+)/i
  );
  if (!m) return null;
  return {
    amount: m[1].replace(",", "."),
    asset: m[2].toUpperCase(),
    recipient: m[3]
  };
}

function extractRecipientName(intent: string): string | null {
  const m = intent.match(/(?:to|a|para)\s+([A-Za-z]+)/i);
  if (!m) return null;
  // Skip hex-ish chunks so we don't say "to 0xabcd…".
  if (m[1].toLowerCase().startsWith("0x")) return null;
  return m[1];
}

function shortAddr(addr: string | null): string {
  if (!addr) return "destino desconocido";
  if (addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
