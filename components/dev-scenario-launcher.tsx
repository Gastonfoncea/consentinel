"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

// Each scenario maps 1:1 to an entry in src/demoFixtures.ts demoRequests[].
// Re-firing the same scenario without a page refresh appends events to the
// same card — refresh the page between fires for a clean slate.
const SCENARIOS: { key: string; label: string; outcome: "allow" | "deny" | "step_up" }[] = [
  { key: "aligned", label: "Aligned transfer", outcome: "allow" },
  { key: "recipient_swap", label: "Recipient swap", outcome: "deny" },
  { key: "amount_spike", label: "Amount spike", outcome: "deny" },
  { key: "claimed_new_wallet", label: "Claimed new wallet", outcome: "step_up" },
];

const outcomeBadgeClass: Record<typeof SCENARIOS[number]["outcome"], string> = {
  allow: "border-allow/40 text-allow",
  deny: "border-deny/40 text-deny",
  step_up: "border-stepup/40 text-stepup",
};

export function DevScenarioLauncher() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function fire(scenario: string) {
    setPending(scenario);
    setError(null);
    try {
      const res = await fetch("/api/dev/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `failed: ${res.status}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="fixed bottom-4 left-4 z-50 font-mono text-[11px]">
      {open ? (
        <div className="flex w-64 flex-col gap-1.5 rounded-lg border border-border bg-bg/95 p-2.5 shadow-xl backdrop-blur">
          <div className="flex items-center justify-between pb-1">
            <span className="text-[10px] uppercase tracking-[0.2em] text-muted">
              dev · scenarios
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-muted/70 transition hover:text-text"
              aria-label="Close dev launcher"
            >
              ✕
            </button>
          </div>
          <ul className="flex flex-col gap-1">
            {SCENARIOS.map((s) => {
              const isPending = pending === s.key;
              return (
                <li key={s.key}>
                  <button
                    type="button"
                    onClick={() => fire(s.key)}
                    disabled={pending !== null}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-md border border-border bg-surface/40 px-2.5 py-1.5 text-left transition hover:border-text/30 hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
                    )}
                  >
                    <span className="truncate text-text">
                      {isPending ? "firing…" : s.label}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded border px-1.5 py-px text-[9px] uppercase tracking-wider",
                        outcomeBadgeClass[s.outcome]
                      )}
                    >
                      {s.outcome}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {error && (
            <p className="mt-1 break-words text-deny">✗ {error}</p>
          )}
          <p className="mt-1 text-[10px] leading-relaxed text-muted/70">
            Refresh entre disparos para limpiar el feed.
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-full border border-border bg-bg/80 px-3 py-1.5 text-muted/80 backdrop-blur transition hover:border-text/30 hover:text-text"
        >
          dev ▸
        </button>
      )}
    </div>
  );
}
