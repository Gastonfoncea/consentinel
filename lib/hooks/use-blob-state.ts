"use client";

import { useEffect, useState } from "react";
import type { BlobState } from "@/components/presence-blob";
import { useEventStream } from "@/lib/hooks/use-event-stream";

const ALLOW_DENY_HOLD_MS = 2200;

/**
 * Derives the blob's visual state from the kernel event stream.
 *
 * - request / thinking / evidence  → "thinking"  (kernel is reasoning)
 * - decision allow                  → "allow"    (held for ~2.2s, then idle)
 * - decision deny                   → "deny"     (held for ~2.2s, then idle)
 * - decision step_up / step_up evt  → "verifying"
 * - silence                         → "idle"
 */
export function useBlobState(): BlobState {
  const { events } = useEventStream();
  const [state, setState] = useState<BlobState>("idle");

  useEffect(() => {
    const latest = events[events.length - 1];
    if (!latest || latest.type === "ping") return;

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

    if (next === "allow" || next === "deny") {
      const t = setTimeout(() => setState("idle"), ALLOW_DENY_HOLD_MS);
      return () => clearTimeout(t);
    }
  }, [events]);

  return state;
}
