"use client";

import { useEffect, useRef, useState } from "react";
import type { KernelStreamEvent } from "@/lib/events/types";

const MAX_EVENTS = 200;

export function useEventStream(url: string = "/api/stream") {
  const [events, setEvents] = useState<KernelStreamEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const source = new EventSource(url);
    sourceRef.current = source;

    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);

    source.onmessage = (msg) => {
      try {
        const parsed = JSON.parse(msg.data) as KernelStreamEvent;
        if (parsed.type === "ping") return;
        setEvents((prev) => {
          const next = [...prev, parsed];
          return next.length > MAX_EVENTS ? next.slice(-MAX_EVENTS) : next;
        });
      } catch {
        /* ignore malformed payloads */
      }
    };

    return () => {
      source.close();
      sourceRef.current = null;
      setConnected(false);
    };
  }, [url]);

  return { events, connected };
}
