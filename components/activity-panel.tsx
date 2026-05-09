"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useEventStream } from "@/lib/hooks/use-event-stream";
import {
  formatRelativeTime,
  formatTechLine,
  translateAll,
  type ActivityStatus,
  type TranslatedRequest,
} from "@/lib/events/translate";
import { cn } from "@/lib/utils";

export function ActivityPanel() {
  const { events, connected } = useEventStream();
  const requests = useMemo(() => translateAll(events), [events]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div>
          <h2 className="text-sm font-medium text-text">Actividad</h2>
          <p className="text-xs text-muted">Lo que tu asistente intenta hacer</p>
        </div>
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
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {requests.length === 0 ? (
          <p className="text-sm leading-relaxed text-muted">
            Tu asistente está tranquilo. Cuando intente hacer algo, lo vas a ver acá.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            <AnimatePresence initial={false}>
              {requests.map((r) => (
                <motion.li
                  key={r.requestId}
                  layout
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.28, ease: "easeOut" }}
                >
                  <RequestCard request={r} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </div>
  );
}

function RequestCard({ request }: { request: TranslatedRequest }) {
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Tick the relative-time label while the request is in flight so
  // "hace 2s" updates to "hace 5s" without needing a new event.
  useEffect(() => {
    if (request.status !== "thinking") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [request.status]);

  return (
    <article
      className={cn(
        "rounded-2xl border bg-surface/50 p-4 backdrop-blur-sm transition-colors",
        statusBorderClass(request.status)
      )}
    >
      <header className="mb-2 flex items-start justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
          {formatRelativeTime(request.startedAt, now)}
        </p>
        <StatusBadge status={request.status} label={request.statusLabel} />
      </header>

      <h3 className="text-[15px] font-medium leading-snug text-text">
        {request.headline}
      </h3>
      {request.subline && (
        <p className="mt-0.5 text-xs italic text-muted">{request.subline}</p>
      )}

      {request.reasoning.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5">
          <AnimatePresence initial={false}>
            {request.reasoning.map((line, i) => (
              <motion.p
                key={`reason-${i}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="text-sm leading-relaxed text-text/85"
              >
                {line}
              </motion.p>
            ))}
          </AnimatePresence>
        </div>
      )}

      {request.actionPrompt && (
        <div className="mt-4">
          <button
            type="button"
            className="rounded-full border border-stepup/40 bg-stepup/10 px-4 py-2 text-xs font-medium text-stepup transition hover:bg-stepup/20"
          >
            {request.actionPrompt}
          </button>
        </div>
      )}

      <footer className="mt-3 border-t border-border/50 pt-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="font-mono text-[10px] uppercase tracking-wider text-muted/70 transition hover:text-muted"
          aria-expanded={expanded}
        >
          {expanded ? "ocultar detalles ▴" : "ver detalles ▾"}
        </button>
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="overflow-hidden"
            >
              <pre className="mt-2 whitespace-pre-wrap break-words rounded-lg border border-border/60 bg-bg/40 p-3 font-mono text-[10px] leading-relaxed text-muted">
                {request.technicalLines.map(formatTechLine).join("\n")}
              </pre>
            </motion.div>
          )}
        </AnimatePresence>
      </footer>
    </article>
  );
}

function StatusBadge({
  status,
  label,
}: {
  status: ActivityStatus;
  label: string;
}) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider",
        statusBadgeClass(status)
      )}
    >
      {statusIcon(status)} {label}
    </span>
  );
}

function statusIcon(status: ActivityStatus): string {
  switch (status) {
    case "approved":
      return "✓";
    case "blocked":
      return "✕";
    case "needs_voice":
    case "needs_passkey":
      return "⚡";
    default:
      return "●";
  }
}

function statusBorderClass(status: ActivityStatus): string {
  switch (status) {
    case "approved":
      return "border-allow/30";
    case "blocked":
      return "border-deny/40";
    case "needs_voice":
    case "needs_passkey":
      return "border-stepup/40";
    default:
      return "border-border";
  }
}

function statusBadgeClass(status: ActivityStatus): string {
  switch (status) {
    case "approved":
      return "border-allow/40 bg-allow/10 text-allow";
    case "blocked":
      return "border-deny/40 bg-deny/10 text-deny";
    case "needs_voice":
    case "needs_passkey":
      return "border-stepup/40 bg-stepup/10 text-stepup";
    default:
      return "border-border bg-surface text-muted";
  }
}
