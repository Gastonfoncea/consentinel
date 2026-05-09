import type { KernelStreamEvent } from "./types";
import { subscribe } from "./bus";

// AsyncGenerator that consumes from the event bus and yields events to the
// SSE route. Replaces the hardcoded simulator. When no events are flowing,
// yields a periodic ping so the UI keeps the connection alive.

const PING_INTERVAL_MS = 15_000;

export async function* kernelEventStream(
  signal?: AbortSignal
): AsyncGenerator<KernelStreamEvent> {
  const queue: KernelStreamEvent[] = [];
  let resolveWaiter: (() => void) | null = null;

  const push = (event: KernelStreamEvent) => {
    queue.push(event);
    if (resolveWaiter) {
      resolveWaiter();
      resolveWaiter = null;
    }
  };

  const unsubscribe = subscribe(push);

  const onAbort = () => {
    if (resolveWaiter) {
      resolveWaiter();
      resolveWaiter = null;
    }
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    while (!signal?.aborted) {
      // Drain the queue.
      while (queue.length > 0) {
        const next = queue.shift()!;
        yield next;
        if (signal?.aborted) return;
      }

      // Wait for the next event OR a ping interval, whichever comes first.
      const tick = await new Promise<"event" | "ping">((resolve) => {
        resolveWaiter = () => resolve("event");
        const t = setTimeout(() => {
          resolveWaiter = null;
          resolve("ping");
        }, PING_INTERVAL_MS);
        signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(t);
            resolve("event");
          },
          { once: true }
        );
      });

      if (signal?.aborted) return;
      if (tick === "ping" && queue.length === 0) {
        yield { type: "ping", ts: Date.now() };
      }
    }
  } finally {
    unsubscribe();
    signal?.removeEventListener("abort", onAbort);
  }
}
