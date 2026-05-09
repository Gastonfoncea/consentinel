"use client";

import { useEffect, useRef, useState } from "react";
import type { BlobState } from "@/components/presence-blob";
import { useEventStream } from "@/lib/hooks/use-event-stream";

const ALLOW_DENY_HOLD_MS = 2200;

interface BlobSignal {
  state: BlobState;
  /**
   * Monotonic counter that bumps when the blob should flash a transient
   * pulse — fires on each `permission.trace_event` (kernel "thinking out
   * loud") and on `step_up.verified` (user confirmed). The canvas reads
   * the change, not the absolute value.
   */
  pulseSeed: number;
}

/**
 * Derives the blob's visual state from the kernel event stream.
 *
 * Maps the kernel's 9 RuntimePermissionEvent types down to the 5 visual
 * blob states — having 9 visual states would lose the user.
 *
 *   permission.request_started        → "thinking"
 *   permission.trace_event            → "thinking"  (+ ripple pulse)
 *   permission.decision_made:
 *     allow / allow_with_audit        → "allow"     (held 2.2s, then idle)
 *     deny                            → "deny"      (held 2.2s, then idle)
 *     step_up                         → "verifying"
 *   step_up.challenge_created         → "verifying"
 *   step_up.verified                  → "thinking"  (kernel resumes processing)
 *   wallet.transfer_prepared          → "thinking"  (still in flight)
 *   wallet.transfer_mock_executed     → "allow"     (success, 2.2s hold)
 *   runtime.error                     → "deny"      (something failed)
 *   silence / ping                    → "idle"
 */
export function useBlobState(): BlobSignal {
  const { events } = useEventStream();
  const [state, setState] = useState<BlobState>("idle");
  const [pulseSeed, setPulseSeed] = useState(0);
  const lastEventIndexRef = useRef(-1);

  useEffect(() => {
    const latest = events[events.length - 1];
    const latestIndex = events.length - 1;
    if (!latest || latest.type === "ping") return;

    // Only fire pulse for newly-arrived events (avoid replays from re-renders).
    const isNewEvent = latestIndex !== lastEventIndexRef.current;
    lastEventIndexRef.current = latestIndex;

    let next: BlobState = "idle";
    switch (latest.type) {
      case "permission.request_started":
      case "permission.trace_event":
      case "step_up.verified":
      case "wallet.transfer_prepared":
        next = "thinking";
        break;
      case "permission.decision_made":
        if (latest.outcome === "step_up") next = "verifying";
        else if (latest.outcome === "deny") next = "deny";
        else next = "allow"; // allow | allow_with_audit
        break;
      case "step_up.challenge_created":
        next = "verifying";
        break;
      case "wallet.transfer_mock_executed":
        next = "allow";
        break;
      case "runtime.error":
        next = "deny";
        break;
    }

    setState(next);

    // Ripple on each "thinking out loud" beat or successful verification.
    if (
      isNewEvent &&
      (latest.type === "permission.trace_event" || latest.type === "step_up.verified")
    ) {
      setPulseSeed((s) => s + 1);
    }

    if (next === "allow" || next === "deny") {
      const t = setTimeout(() => setState("idle"), ALLOW_DENY_HOLD_MS);
      return () => clearTimeout(t);
    }
  }, [events]);

  return { state, pulseSeed };
}
