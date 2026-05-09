"use client";

import { useEffect, useRef, useState } from "react";
import type { BlobState } from "@/components/presence-blob";
import { useEventStream } from "@/lib/hooks/use-event-stream";

const ALLOW_DENY_HOLD_MS = 2200;

interface BlobSignal {
  state: BlobState;
  /**
   * Monotonic counter that bumps when the blob should flash a transient
   * pulse (e.g. an `evidence` event arrived while still in `thinking`).
   * The canvas reads the change, not the absolute value.
   */
  pulseSeed: number;
}

/**
 * Derives the blob's visual state from the kernel event stream.
 *
 * - request / thinking / evidence  → "thinking"  (kernel is reasoning)
 * - decision allow                  → "allow"    (held for ~2.2s, then idle)
 * - decision deny                   → "deny"     (held for ~2.2s, then idle)
 * - decision step_up / step_up evt  → "verifying"
 * - silence                         → "idle"
 *
 * Also bumps `pulseSeed` on `evidence` events so the canvas can play a
 * one-shot ripple without a state change.
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
      case "request":
      case "thinking":
      case "evidence":
        next = "thinking";
        break;
      case "decision":
        if (latest.outcome === "step_up") next = "verifying";
        else if (latest.outcome === "deny") next = "deny";
        else next = "allow";
        break;
      case "step_up":
        next = "verifying";
        break;
    }

    setState(next);

    if (isNewEvent && latest.type === "evidence") {
      setPulseSeed((s) => s + 1);
    }

    if (next === "allow" || next === "deny") {
      const t = setTimeout(() => setState("idle"), ALLOW_DENY_HOLD_MS);
      return () => clearTimeout(t);
    }
  }, [events]);

  return { state, pulseSeed };
}
