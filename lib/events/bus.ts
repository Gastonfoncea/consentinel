import type { KernelStreamEvent } from "./types";

// In-memory pub/sub for kernel events. Pinned to globalThis so it survives
// Next.js HMR and per-route module isolation in dev (same trick as
// `lib/auth/store.ts`).

type Listener = (event: KernelStreamEvent) => void;

interface EventBus {
  listeners: Set<Listener>;
}

const KEY = "__consentinel_event_bus__";

declare global {
  // eslint-disable-next-line no-var
  var __consentinel_event_bus__: EventBus | undefined;
}

function getBus(): EventBus {
  if (!globalThis[KEY]) {
    globalThis[KEY] = { listeners: new Set<Listener>() };
  }
  return globalThis[KEY]!;
}

export function publish(event: KernelStreamEvent): void {
  const bus = getBus();
  for (const listener of bus.listeners) {
    try {
      listener(event);
    } catch {
      // Ignore listener errors so one bad subscriber can't break the bus.
    }
  }
}

export function subscribe(listener: Listener): () => void {
  const bus = getBus();
  bus.listeners.add(listener);
  return () => {
    bus.listeners.delete(listener);
  };
}

export function listenerCount(): number {
  return getBus().listeners.size;
}
