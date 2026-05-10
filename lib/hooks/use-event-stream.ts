"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { KernelStreamEvent } from "@/lib/events/types";

const MAX_EVENTS = 200;

// Module-level singleton shared by ALL useEventStream() consumers on the
// page. Without this, every hook call opens its own EventSource — 4 hooks
// (VoiceSession + WalletPendingAction + useBlobState + ActivityPanel) ate
// 4 of Chrome's 6 connection slots per origin, leaving no headroom for
// fetch() calls. The first POST to /api/dev/scenarios would then sit in
// the pool queue indefinitely. Single shared EventSource fixes the pool
// pressure and keeps memory usage flat regardless of how many components
// subscribe.
//
// The store also survives Next.js HMR via globalThis — without it, every
// hot-reload would leak the previous EventSource even though React
// cleaned up the hook (HMR doesn't always re-run useEffect cleanup
// before opening the new connection).

interface SharedStreamStore {
  events: KernelStreamEvent[];
  connected: boolean;
  source: EventSource | null;
  listeners: Set<() => void>;
  refCount: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __consentinelEventStream: SharedStreamStore | undefined;
}

function getStore(): SharedStreamStore {
  if (!globalThis.__consentinelEventStream) {
    globalThis.__consentinelEventStream = {
      events: [],
      connected: false,
      source: null,
      listeners: new Set(),
      refCount: 0
    };
  }
  return globalThis.__consentinelEventStream;
}

function notify(store: SharedStreamStore) {
  for (const listener of store.listeners) listener();
}

function ensureConnected(store: SharedStreamStore, url: string) {
  if (store.source) return;
  const source = new EventSource(url);
  store.source = source;
  source.onopen = () => {
    store.connected = true;
    notify(store);
  };
  source.onerror = () => {
    store.connected = false;
    notify(store);
  };
  source.onmessage = (msg) => {
    try {
      const parsed = JSON.parse(msg.data) as KernelStreamEvent;
      if (parsed.type === "ping") return;
      const next = [...store.events, parsed];
      store.events =
        next.length > MAX_EVENTS ? next.slice(-MAX_EVENTS) : next;
      notify(store);
    } catch {
      /* ignore malformed payloads */
    }
  };
}

function disconnect(store: SharedStreamStore) {
  if (store.source) {
    store.source.close();
    store.source = null;
  }
  store.connected = false;
}

export function useEventStream(url: string = "/api/stream") {
  const store = getStore();

  // Subscribe / unsubscribe — opens the EventSource when the first
  // component mounts, closes it when the last one unmounts.
  useEffect(() => {
    store.refCount += 1;
    ensureConnected(store, url);
    return () => {
      store.refCount -= 1;
      if (store.refCount <= 0) {
        store.refCount = 0;
        disconnect(store);
      }
    };
  }, [store, url]);

  // useSyncExternalStore would be cleaner but the simpler manual
  // subscription gives us inline state + avoids a getServerSnapshot
  // requirement for SSR.
  const [, force] = useState(0);
  useEffect(() => {
    const listener = () => force((n) => n + 1);
    store.listeners.add(listener);
    return () => {
      store.listeners.delete(listener);
    };
  }, [store]);

  return { events: store.events, connected: store.connected };
}

// Suppress "unused" warning for the import we kept for the future
// switch to useSyncExternalStore.
void useSyncExternalStore;
