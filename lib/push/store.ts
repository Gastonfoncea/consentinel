import "server-only";
import type { PushSubscription as WebPushSubscription } from "web-push";

// Pinned to globalThis so HMR + per-route module isolation in dev don't
// scatter independent stores. Same pattern as the auth user/credential
// store (lib/auth/store.ts). Survives HMR; does NOT survive a serverless
// cold start. For Vercel production we'd swap this for KV — for the
// hackathon, in-memory is fine.

declare global {
  // eslint-disable-next-line no-var
  var __consentinelPushSubs: Map<string, WebPushSubscription> | undefined;
}

const store: Map<string, WebPushSubscription> =
  globalThis.__consentinelPushSubs ?? new Map<string, WebPushSubscription>();

if (!globalThis.__consentinelPushSubs) {
  globalThis.__consentinelPushSubs = store;
}

export function addSubscription(sub: WebPushSubscription): void {
  store.set(sub.endpoint, sub);
}

export function removeSubscription(endpoint: string): void {
  store.delete(endpoint);
}

export function getAllSubscriptions(): WebPushSubscription[] {
  return Array.from(store.values());
}

export function subscriptionCount(): number {
  return store.size;
}
