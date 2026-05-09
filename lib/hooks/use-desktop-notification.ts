"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEventStream } from "@/lib/hooks/use-event-stream";
import { translateAll } from "@/lib/events/translate";

export type DesktopNotificationPermission =
  | "default"
  | "granted"
  | "denied"
  | "unsupported";

const NOTIFICATION_ICON = "/notification-icon.svg";

interface UseDesktopNotificationOpts {
  // Fired when the user clicks the OS notification. Receives the requestId
  // of the pending step-up so the caller can deep-link into the modal once
  // PLA-38 lands.
  onOpen?: (requestId: string) => void;
}

interface UseDesktopNotificationResult {
  permission: DesktopNotificationPermission;
  requestPermission: () => Promise<DesktopNotificationPermission>;
}

function readPermission(): DesktopNotificationPermission {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission as DesktopNotificationPermission;
}

export function useDesktopNotification(
  opts: UseDesktopNotificationOpts = {}
): UseDesktopNotificationResult {
  const { events } = useEventStream();
  const [permission, setPermission] =
    useState<DesktopNotificationPermission>("unsupported");

  // Mirror the latest onOpen in a ref so the dispatch effect doesn't
  // re-subscribe on every parent re-render.
  const onOpenRef = useRef(opts.onOpen);
  useEffect(() => {
    onOpenRef.current = opts.onOpen;
  }, [opts.onOpen]);

  // Tracks requestIds we've already dispatched a notification for.
  // Notification API has no built-in dedup beyond `tag` (which only
  // collapses banners), so we de-dup on our side keyed by requestId.
  const firedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setPermission(readPermission());
  }, []);

  const requestPermission =
    useCallback(async (): Promise<DesktopNotificationPermission> => {
      if (typeof window === "undefined" || !("Notification" in window)) {
        return "unsupported";
      }
      try {
        const result = await Notification.requestPermission();
        setPermission(result as DesktopNotificationPermission);
        return result as DesktopNotificationPermission;
      } catch {
        return readPermission();
      }
    }, []);

  const pendingId = useMemo(() => {
    const requests = translateAll(events);
    return requests.find((r) => r.status === "needs_biometric")?.requestId;
  }, [events]);

  // Snapshot of the pending request used purely for copy. Reading it
  // through translateAll on every events tick is fine — the memo above
  // gates the dispatch on requestId churn.
  const pendingRequest = useMemo(() => {
    if (!pendingId) return null;
    return (
      translateAll(events).find((r) => r.requestId === pendingId) ?? null
    );
  }, [events, pendingId]);

  useEffect(() => {
    if (permission !== "granted") return;
    if (!pendingRequest) return;
    if (firedRef.current.has(pendingRequest.requestId)) return;

    // Skip when the tab is already in the user's face — the in-app toast
    // is more than enough and the OS banner would just be noise.
    if (
      typeof document !== "undefined" &&
      document.hasFocus() &&
      !document.hidden
    ) {
      firedRef.current.add(pendingRequest.requestId);
      return;
    }

    firedRef.current.add(pendingRequest.requestId);

    try {
      const notif = new Notification("Consentinel · Verificación pendiente", {
        body: pendingRequest.headline,
        icon: NOTIFICATION_ICON,
        tag: pendingRequest.requestId,
        requireInteraction: true,
      });
      notif.onclick = () => {
        if (typeof window !== "undefined") window.focus();
        onOpenRef.current?.(pendingRequest.requestId);
        notif.close();
      };
    } catch {
      // Some browsers throw if no user gesture has happened yet. Fail
      // silently — the in-app toast still surfaces the same request.
    }
  }, [permission, pendingRequest]);

  return { permission, requestPermission };
}
