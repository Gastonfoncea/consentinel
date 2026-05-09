"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type PushSubscriptionState =
  | "unsupported"
  | "idle"
  | "registering"
  | "subscribed"
  | "error";

interface UsePushSubscriptionResult {
  state: PushSubscriptionState;
  error: string | null;
  subscribe: () => Promise<void>;
}

const PUBLIC_VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

// Web Push expects the application server key as a Uint8Array. The
// VAPID public key arrives as a URL-safe base64 string, so we expand
// the alphabet, pad, and decode byte-by-byte. Standard recipe — same
// shape every web-push tutorial uses.
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const padded = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) {
    view[i] = raw.charCodeAt(i);
  }
  return view;
}

function isSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function usePushSubscription(): UsePushSubscriptionResult {
  const [state, setState] = useState<PushSubscriptionState>("unsupported");
  const [error, setError] = useState<string | null>(null);
  // Tracks whether a subscribe() call is currently in flight so
  // back-to-back invocations (e.g., banner re-render after permission
  // change) don't kick off concurrent registrations.
  const inFlightRef = useRef(false);

  useEffect(() => {
    setState(isSupported() ? "idle" : "unsupported");
  }, []);

  const subscribe = useCallback(async () => {
    if (!isSupported()) {
      setState("unsupported");
      return;
    }
    if (!PUBLIC_VAPID_KEY) {
      setState("error");
      setError("NEXT_PUBLIC_VAPID_PUBLIC_KEY is not configured");
      return;
    }
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setState("registering");
    setError(null);

    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      // Some browsers race the activation step — wait for it before
      // touching pushManager so we don't subscribe against a SW that
      // hasn't actually attached yet.
      await navigator.serviceWorker.ready;

      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY),
        }));

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `subscribe failed: ${res.status}`);
      }
      setState("subscribed");
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  return { state, error, subscribe };
}
