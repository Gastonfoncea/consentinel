"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Bell, X } from "lucide-react";
import { useState } from "react";
import type { DesktopNotificationPermission } from "@/lib/hooks/use-desktop-notification";

interface NotificationPermissionBannerProps {
  permission: DesktopNotificationPermission;
  onRequest: () => void | Promise<unknown>;
}

export function NotificationPermissionBanner({
  permission,
  onRequest,
}: NotificationPermissionBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  // Only nudge when the browser is in the "ask" state. Granted, denied
  // and unsupported all hide the banner — the user has already decided
  // (or can't decide) and badgering them is annoying.
  const visible = permission === "default" && !dismissed;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="notif-banner"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="overflow-hidden border-b border-stepup/30 bg-stepup/[0.07]"
        >
          <div className="flex items-center gap-3 px-6 py-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-stepup/15 text-stepup">
              <Bell className="h-3.5 w-3.5" strokeWidth={2.4} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-snug text-text">
                Activá las notificaciones para que el kernel te avise cuando tu
                asistente necesita tu confirmación.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                void onRequest();
              }}
              className="shrink-0 rounded-full bg-stepup px-3.5 py-1.5 text-xs font-medium text-bg transition hover:bg-stepup/90"
            >
              Activar
            </button>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              aria-label="Descartar"
              className="shrink-0 rounded-full p-1 text-muted/60 transition hover:bg-bg/40 hover:text-text"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2.4} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
