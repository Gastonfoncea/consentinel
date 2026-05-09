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

const PENDING_STATUSES: ActivityStatus[] = ["needs_voice", "needs_passkey"];

function isPending(r: TranslatedRequest): boolean {
  return PENDING_STATUSES.includes(r.status);
}

export function ActivityPanel() {
  const { events, connected } = useEventStream();
  const requests = useMemo(() => translateAll(events), [events]);

  const pending = requests.filter(isPending);
  const history = requests.filter((r) => !isPending(r));

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

      <div className="flex-1 overflow-y-auto">
        {requests.length === 0 ? (
          <p className="px-5 py-6 text-sm leading-relaxed text-muted">
            Tu asistente está tranquilo. Cuando intente hacer algo, lo vas a ver acá.
          </p>
        ) : (
          <>
            {pending.length > 0 && (
              <section className="px-5 pt-4">
                <SectionHeader label="Necesito tu confirmación" emphasize />
                <ul className="mt-3 flex flex-col gap-3">
                  <AnimatePresence initial={false}>
                    {pending.map((r) => (
                      <motion.li
                        key={r.requestId}
                        layout
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.28, ease: "easeOut" }}
                      >
                        <PendingCard request={r} />
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              </section>
            )}

            {history.length > 0 && (
              <section
                className={cn(
                  "px-5 pb-4",
                  pending.length > 0 ? "mt-6 pt-4 border-t border-border/60" : "pt-4"
                )}
              >
                <SectionHeader label="Reciente" />
                <ul className="mt-3 flex flex-col gap-2">
                  <AnimatePresence initial={false}>
                    {history.map((r) => (
                      <motion.li
                        key={r.requestId}
                        layout
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.22, ease: "easeOut" }}
                      >
                        <HistoryCard request={r} />
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---------- Section header ----------

function SectionHeader({
  label,
  emphasize = false,
}: {
  label: string;
  emphasize?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      {emphasize && (
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-stepup/60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-stepup" />
        </span>
      )}
      <h3
        className={cn(
          "font-mono text-[10px] uppercase tracking-[0.25em]",
          emphasize ? "text-stepup" : "text-muted/70"
        )}
      >
        {label}
      </h3>
    </div>
  );
}

// ---------- Pending (needs action) — protagonista ----------

function PendingCard({ request }: { request: TranslatedRequest }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <article className="rounded-2xl border-2 border-stepup/50 bg-stepup/[0.06] p-5 shadow-glow-stepup backdrop-blur-sm">
      <h3 className="text-base font-medium leading-snug text-text">
        {request.headline}
      </h3>
      {request.subline && (
        <p className="mt-1 text-sm italic text-muted">{request.subline}</p>
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
                className="text-sm leading-relaxed text-text/90"
              >
                {line}
              </motion.p>
            ))}
          </AnimatePresence>
        </div>
      )}

      {request.actionPrompt && (
        <div className="mt-5 flex items-center gap-4">
          <button
            type="button"
            className="rounded-full bg-stepup px-5 py-2.5 text-sm font-medium text-bg transition hover:bg-stepup/90"
          >
            {request.actionPrompt}
          </button>
          <button
            type="button"
            className="text-xs text-muted transition hover:text-text"
          >
            Rechazar
          </button>
        </div>
      )}

      <TechExpand
        lines={request.technicalLines}
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
      />
    </article>
  );
}

// ---------- History (resolved or in flight) — secundario ----------

function HistoryCard({ request }: { request: TranslatedRequest }) {
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (request.status !== "thinking") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [request.status]);

  return (
    <article
      className={cn(
        "rounded-xl border bg-surface/30 px-3.5 py-2.5 transition-colors",
        historyBorderClass(request.status)
      )}
    >
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <StatusGlyph status={request.status} />
          <p className="truncate text-sm text-text/85">{request.headline}</p>
        </div>
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted/70">
          {formatRelativeTime(request.startedAt, now)}
        </span>
      </header>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-1.5 font-mono text-[10px] uppercase tracking-wider text-muted/60 transition hover:text-muted"
        aria-expanded={expanded}
      >
        {expanded ? "ocultar ▴" : "ver razón ▾"}
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
            {request.reasoning.length > 0 && (
              <div className="mt-2 flex flex-col gap-1">
                {request.reasoning.map((line, i) => (
                  <p
                    key={`reason-${i}`}
                    className="text-sm leading-relaxed text-text/75"
                  >
                    {line}
                  </p>
                ))}
              </div>
            )}
            <pre className="mt-2 whitespace-pre-wrap break-words rounded-lg border border-border/60 bg-bg/40 p-2.5 font-mono text-[10px] leading-relaxed text-muted">
              {request.technicalLines.map(formatTechLine).join("\n")}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </article>
  );
}

// ---------- Shared bits ----------

function TechExpand({
  lines,
  expanded,
  onToggle,
}: {
  lines: TranslatedRequest["technicalLines"];
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="mt-4 border-t border-border/40 pt-2">
      <button
        type="button"
        onClick={onToggle}
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
              {lines.map(formatTechLine).join("\n")}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatusGlyph({ status }: { status: ActivityStatus }) {
  switch (status) {
    case "approved":
      return (
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-allow/15 font-mono text-[10px] text-allow">
          ✓
        </span>
      );
    case "blocked":
      return (
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-deny/15 font-mono text-[10px] text-deny">
          ✕
        </span>
      );
    case "thinking":
      return (
        <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
          <span className="absolute h-2 w-2 animate-ping rounded-full bg-muted/60" />
          <span className="relative h-2 w-2 rounded-full bg-muted" />
        </span>
      );
    case "needs_voice":
    case "needs_passkey":
      return (
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-stepup/15 font-mono text-[10px] text-stepup">
          ⚡
        </span>
      );
  }
}

function historyBorderClass(status: ActivityStatus): string {
  switch (status) {
    case "approved":
      return "border-allow/15";
    case "blocked":
      return "border-deny/20";
    case "thinking":
      return "border-border";
    default:
      return "border-border/40";
  }
}
