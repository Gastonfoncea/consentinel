"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Zap, X } from "lucide-react";
import { useEventStream } from "@/lib/hooks/use-event-stream";
import { translateAll } from "@/lib/events/translate";

// 30s mirrors the spec — a real OS push usually banners for ~5s, but the
// demo runs at conversational pace and we want the user to have time to
// notice without forcing them to look at the screen the whole time.
const AUTO_DISMISS_MS = 30_000;

interface PushToastProps {
  // Fires when the user taps the toast. PLA-38 will wire this to the
  // verification modal; until then the parent can no-op or log.
  onOpen?: (requestId: string) => void;
}

export function PushToast({ onOpen }: PushToastProps) {
  const { events } = useEventStream();
  const requests = useMemo(() => translateAll(events), [events]);

  // translateAll returns newest-first, so the first match is the latest
  // pending step-up. Anything else still pending stays implicit until the
  // newest one resolves or is dismissed — keeps the chrome to one toast.
  const pending = requests.find((r) => r.status === "needs_biometric") ?? null;

  // RequestIds the user already acted on (clicked or X'd) or that timed
  // out. Stored in a ref to avoid retriggering on every events tick.
  const dismissedRef = useRef<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);

  // Promote a fresh pending into the active toast unless dismissed.
  // Demote the active one once the kernel resolves it (verified/canceled).
  useEffect(() => {
    if (!pending) {
      if (activeId) setActiveId(null);
      return;
    }
    if (pending.requestId === activeId) return;
    if (dismissedRef.current.has(pending.requestId)) return;
    setActiveId(pending.requestId);
  }, [pending, activeId]);

  useEffect(() => {
    if (!activeId) return;
    const t = setTimeout(() => {
      dismissedRef.current.add(activeId);
      setActiveId(null);
    }, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [activeId]);

  const showing =
    activeId && pending && pending.requestId === activeId ? pending : null;

  const handleOpen = () => {
    if (!showing) return;
    dismissedRef.current.add(showing.requestId);
    onOpen?.(showing.requestId);
    setActiveId(null);
  };

  const handleDismiss = (e: MouseEvent | KeyboardEvent) => {
    e.stopPropagation();
    if (!showing) return;
    dismissedRef.current.add(showing.requestId);
    setActiveId(null);
  };

  const handleKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleOpen();
    }
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-end px-4 sm:left-auto sm:px-0 sm:right-4">
      <AnimatePresence>
        {showing && (
          <motion.div
            key={showing.requestId}
            role="button"
            tabIndex={0}
            onClick={handleOpen}
            onKeyDown={handleKey}
            initial={{ opacity: 0, y: -14, x: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="group pointer-events-auto relative w-full max-w-sm cursor-pointer overflow-hidden rounded-2xl border border-stepup/40 bg-surface/85 p-4 text-left shadow-[0_20px_60px_-15px_rgba(0,0,0,0.6),0_0_24px_rgba(59,130,246,0.25)] backdrop-blur-xl backdrop-saturate-150 transition hover:border-stepup/60 hover:bg-surface/95 focus:outline-none focus-visible:ring-2 focus-visible:ring-stepup/60"
            aria-label={`Verificación pendiente: ${showing.headline}`}
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-stepup/15 text-stepup">
                <Zap className="h-4 w-4" strokeWidth={2.4} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-stepup/80">
                    consentinel
                  </p>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted/70">
                    ahora
                  </span>
                </div>
                <p className="mt-1 truncate text-sm font-medium text-text">
                  {showing.headline}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted">
                  {showing.actionPrompt
                    ? `Tocá para ${showing.actionPrompt.toLowerCase()}`
                    : "Tocá para verificar"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleDismiss}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleDismiss(e);
                }
              }}
              className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-muted/60 opacity-0 transition hover:bg-bg/50 hover:text-text focus:opacity-100 focus:outline-none group-hover:opacity-100"
              aria-label="Descartar notificación"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2.4} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
