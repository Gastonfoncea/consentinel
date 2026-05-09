import "server-only";
import webpush from "web-push";

// Lazy-init guard: setVapidDetails throws if called multiple times with
// different values, and we want a single configuration call per process.
let configured = false;

function getEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

export interface WebPushConfig {
  subject: string;
  publicKey: string;
  privateKey: string;
}

export function readWebPushConfig(): WebPushConfig | null {
  const subject = getEnv("VAPID_SUBJECT");
  const publicKey = getEnv("VAPID_PUBLIC_KEY");
  const privateKey = getEnv("VAPID_PRIVATE_KEY");
  if (!subject || !publicKey || !privateKey) return null;
  return { subject, publicKey, privateKey };
}

export function ensureWebPushConfigured(): WebPushConfig | null {
  const config = readWebPushConfig();
  if (!config) return null;
  if (!configured) {
    webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
    configured = true;
  }
  return config;
}

export { webpush };
