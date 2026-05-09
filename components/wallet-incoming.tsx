"use client";

import {
  INCOMING_CHARGES,
  type IncomingCharge,
  type IncomingDecision
} from "@/lib/wallet/incoming-charges";
import { cn } from "@/lib/utils";

// Incoming charges feed — the kernel's daily blotter. Shows what merchants
// tried to charge, what the kernel decided, and why. The deny + step_up
// rows are the visual proof of Consentinel's value.

export function WalletIncoming() {
  return (
    <div>
      <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted">
        incoming charges · last 72h
      </p>
      <ul className="flex flex-col gap-1.5">
        {INCOMING_CHARGES.map((c) => (
          <IncomingRow key={c.id} charge={c} />
        ))}
      </ul>
    </div>
  );
}

function IncomingRow({ charge }: { charge: IncomingCharge }) {
  const tone = toneForDecision(charge.decision);
  return (
    <li
      className={cn(
        "rounded-md border px-2 py-1.5 transition",
        tone.container
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-bg text-base">
            {charge.glyph}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-xs text-text">{charge.merchant}</span>
            <span className="font-mono text-[10px] text-muted">
              {formatHours(charge.hoursAgo)}
            </span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span
            className={cn(
              "rounded-full border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider",
              tone.badge
            )}
          >
            {labelForDecision(charge.decision)}
          </span>
          <span className="font-mono text-xs tabular-nums text-text">
            {charge.amountUsdc} USDC
          </span>
        </span>
      </div>
      {charge.rationale && (
        <p className={cn("mt-1 pl-9 text-[11px] leading-snug", tone.rationale)}>
          {charge.rationale}
        </p>
      )}
    </li>
  );
}

function labelForDecision(decision: IncomingDecision): string {
  switch (decision) {
    case "allow_with_audit":
      return "auto";
    case "step_up_pending":
      return "verify";
    case "step_up_resolved_allow":
      return "verified ✓";
    case "step_up_resolved_deny":
      return "blocked";
    case "deny":
      return "blocked";
  }
}

function toneForDecision(decision: IncomingDecision) {
  switch (decision) {
    case "allow_with_audit":
    case "step_up_resolved_allow":
      return {
        container: "border-allow/20 bg-allow/[0.03]",
        badge: "border-allow/40 bg-allow/10 text-allow",
        rationale: "text-allow/80"
      };
    case "step_up_pending":
      return {
        container: "border-purple-400/25 bg-purple-400/[0.04]",
        badge: "border-purple-400/40 bg-purple-400/10 text-purple-200",
        rationale: "text-purple-200/80"
      };
    case "step_up_resolved_deny":
    case "deny":
      return {
        container: "border-deny/25 bg-deny/[0.04]",
        badge: "border-deny/40 bg-deny/10 text-deny",
        rationale: "text-deny/80"
      };
  }
}

function formatHours(h: number): string {
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "1d ago" : `${d}d ago`;
}
