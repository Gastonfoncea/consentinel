"use client";

import { useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useEventStream } from "@/lib/hooks/use-event-stream";
import { cn } from "@/lib/utils";
import type { KernelStreamEvent } from "@/lib/events/types";

// ChatPanel — renders the live transcript of the most recent voice
// verification conversation, fed by `voice_message` events on the SSE bus
// (which the browser-side ElevenLabs SDK emits via /api/voice/transcript).

interface ChatLine {
  ts: number;
  requestId: string;
  role: "user" | "agent";
  text: string;
}

export function ChatPanel() {
  const { events } = useEventStream();
  const scrollRef = useRef<HTMLDivElement>(null);

  const lines = useMemo(() => collectLatestConversation(events), [events]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [lines.length]);

  const activeRequestId = lines[0]?.requestId ?? null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div>
          <h2 className="text-sm font-medium text-text">Agent chat</h2>
          <p className="text-xs text-muted">
            live voice transcript · user ⇄ agent
          </p>
        </div>
        {activeRequestId && (
          <span className="rounded-full border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted">
            {shortId(activeRequestId)}
          </span>
        )}
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4">
        {lines.length === 0 ? (
          <p className="font-mono text-xs text-muted">
            no active voice verification — trigger a scenario above to start.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {lines.map((line, i) => (
                <motion.li
                  key={`${line.ts}-${i}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className={cn(
                    "flex",
                    line.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  <Bubble line={line} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </div>
  );
}

function Bubble({ line }: { line: ChatLine }) {
  const isUser = line.role === "user";
  return (
    <div
      className={cn(
        "max-w-[85%] rounded-2xl border px-3 py-2",
        isUser
          ? "border-allow/30 bg-allow/5 text-text"
          : "border-stepup/30 bg-stepup/5 text-text"
      )}
    >
      <p
        className={cn(
          "mb-0.5 font-mono text-[9px] uppercase tracking-[0.2em]",
          isUser ? "text-allow/80" : "text-stepup/80"
        )}
      >
        {isUser ? "you" : "agent"}
      </p>
      <p className="text-sm leading-snug">{line.text}</p>
    </div>
  );
}

function collectLatestConversation(events: KernelStreamEvent[]): ChatLine[] {
  // Walk forward, keep only voice_message events for the most recent
  // requestId (so the chat doesn't accumulate every past conversation).
  let activeRequestId: string | null = null;
  const buffer: ChatLine[] = [];
  for (const e of events) {
    if (e.type === "request") {
      activeRequestId = e.requestId;
      buffer.length = 0;
      continue;
    }
    if (e.type === "voice_message") {
      if (!activeRequestId) activeRequestId = e.requestId;
      if (e.requestId !== activeRequestId) {
        // new conversation started — reset
        activeRequestId = e.requestId;
        buffer.length = 0;
      }
      buffer.push({
        ts: e.ts,
        requestId: e.requestId,
        role: e.role,
        text: e.text
      });
    }
  }
  return buffer;
}

function shortId(id: string): string {
  if (id.length <= 14) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}
