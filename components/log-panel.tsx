"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useEventStream } from "@/lib/hooks/use-event-stream";
import { TypedLine } from "@/components/typed-line";
import type { KernelStreamEvent } from "@/lib/events/types";
import { cn } from "@/lib/utils";

export function LogPanel() {
  const { events, connected } = useEventStream();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [pausedAt, setPausedAt] = useState<number | null>(null);

  useEffect(() => {
    if (paused) return;
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [events.length, paused]);

  const newWhilePaused =
    paused && pausedAt !== null ? Math.max(0, events.length - pausedAt) : 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div>
          <h2 className="text-sm font-medium text-text">Kernel events</h2>
          <p className="text-xs text-muted">
            live runtime stream · hover to pause · decisions / step-up / wallet ops
          </p>
        </div>
        <div className="flex items-center gap-3">
          <AnimatePresence>
            {paused && (
              <motion.span
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="flex items-center gap-2 rounded-full border border-border bg-surface px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-muted"
              >
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted" />
                paused
                {newWhilePaused > 0 && (
                  <span className="text-allow">+{newWhilePaused} new</span>
                )}
              </motion.span>
            )}
          </AnimatePresence>
          <span
            className={cn(
              "flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider",
              connected ? "text-allow" : "text-deny"
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                connected ? "bg-allow shadow-glow-allow" : "bg-deny"
              )}
            />
            {connected ? "live" : "off"}
          </span>
        </div>
      </div>
      <div
        ref={scrollRef}
        onMouseEnter={() => {
          setPaused(true);
          setPausedAt(events.length);
        }}
        onMouseLeave={() => {
          setPaused(false);
          setPausedAt(null);
        }}
        className="flex-1 overflow-y-auto px-5 py-4"
      >
        {events.length === 0 ? (
          <p className="font-mono text-xs text-muted">waiting for kernel events…</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {events.map((event, i) => {
              const prev = events[i - 1];
              const isNewRequest =
                i > 0 &&
                "requestId" in event &&
                prev !== undefined &&
                "requestId" in prev &&
                prev.requestId !== event.requestId;

              return (
                <Fragment key={`${event.ts}-${i}`}>
                  {isNewRequest && (
                    <li
                      aria-hidden
                      className="my-1 border-t border-border/40 pt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-muted/40"
                    >
                      ─── new request ───
                    </li>
                  )}
                  <motion.li
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                    layout
                  >
                    <EventLine event={event} />
                  </motion.li>
                </Fragment>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function EventLine({ event }: { event: KernelStreamEvent }) {
  if (event.type === "ping") return null;

  const ts = formatTs(event.ts);

  switch (event.type) {
    case "permission.request_started":
      return (
        <div className="font-mono text-xs text-text">
          <span className="text-muted">[{ts}]</span>{" "}
          <span className="text-stepup">REQUEST</span>{" "}
          <span className="text-muted">{event.agentId}</span>{" "}
          <TypedLine text={`${event.action} ${event.service} — ${event.intent}`} />
        </div>
      );
    case "permission.trace_event":
      return (
        <div className="font-mono text-xs text-text">
          <span className="text-muted">[{ts}]</span>{" "}
          <span className="text-muted">{event.eventType}:</span>{" "}
          <TypedLine text={event.summary} />
        </div>
      );
    case "permission.decision_made":
      return (
        <div className={cn("font-mono text-xs", outcomeColor(event.outcome))}>
          <span className="text-muted">[{ts}]</span>{" "}
          <span className={cn("font-bold", outcomeGlow(event.outcome))}>
            {event.outcome.toUpperCase()}
          </span>{" "}
          <span className="text-muted">risk={event.riskScore.toFixed(2)}</span>{" "}
          <TypedLine text={event.explanation} />
        </div>
      );
    case "step_up.challenge_created":
      return (
        <div className="font-mono text-xs text-stepup">
          <span className="text-muted">[{ts}]</span>{" "}
          <span className="font-bold drop-shadow-[0_0_8px_rgba(59,130,246,0.6)]">
            STEP-UP
          </span>{" "}
          <span className="text-muted">{event.channel}</span>{" "}
          <TypedLine text={event.prompt} />
        </div>
      );
    case "step_up.verified":
      return (
        <div className="font-mono text-xs text-allow">
          <span className="text-muted">[{ts}]</span>{" "}
          <span className="font-bold drop-shadow-[0_0_8px_rgba(0,255,136,0.6)]">
            VERIFIED
          </span>{" "}
          <TypedLine
            text={`challenge ${event.challengeId} confirmed via ${event.channel}${event.verifiedByUsername ? ` by ${event.verifiedByUsername}` : ""}.`}
          />
        </div>
      );
    case "wallet.transfer_prepared":
      return (
        <div className="font-mono text-xs text-text">
          <span className="text-muted">[{ts}]</span>{" "}
          <span className="text-allow">PREPARED</span>{" "}
          <TypedLine text={`${event.amount} ${event.asset} → ${event.to} (${event.mode})`} />
        </div>
      );
    case "wallet.transfer_mock_executed":
      return (
        <div className="font-mono text-xs text-allow">
          <span className="text-muted">[{ts}]</span>{" "}
          <span className="font-bold drop-shadow-[0_0_8px_rgba(0,255,136,0.6)]">
            MOCK EXECUTED
          </span>{" "}
          <TypedLine text={`${event.amount} ${event.asset} → ${event.to} (${event.mode})`} />
        </div>
      );
    case "runtime.error":
      return (
        <div className="font-mono text-xs text-deny">
          <span className="text-muted">[{ts}]</span>{" "}
          <TypedLine text={event.message} />
        </div>
      );
    default:
      return null;
  }
}

function outcomeColor(outcome: string) {
  switch (outcome) {
    case "allow":
    case "allow_with_audit":
      return "text-allow";
    case "deny":
      return "text-deny";
    case "step_up":
      return "text-stepup";
    default:
      return "text-text";
  }
}

function outcomeGlow(outcome: string) {
  switch (outcome) {
    case "allow":
    case "allow_with_audit":
      return "drop-shadow-[0_0_8px_rgba(0,255,136,0.6)]";
    case "deny":
      return "drop-shadow-[0_0_8px_rgba(255,59,48,0.6)]";
    case "step_up":
      return "drop-shadow-[0_0_8px_rgba(59,130,246,0.6)]";
    default:
      return "";
  }
}

function formatTs(ts: number): string {
  const d = new Date(ts);
  return d.toTimeString().slice(0, 8);
}
