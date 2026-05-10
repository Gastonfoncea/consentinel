import "server-only";
import { getSharedKernelRuntime } from "@/src/runtime/runtime";
import { getAllSubscriptions, removeSubscription } from "./store";
import { ensureWebPushConfigured, webpush } from "./web-push-config";

// Idempotent registration via globalThis flag. Dev-time HMR can re-import
// this module repeatedly; without the flag we'd attach N listeners and
// every step-up would fan out to N pushes.
declare global {
  // eslint-disable-next-line no-var
  var __consentinelPushDispatcherRegistered: boolean | undefined;
}

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  requestId?: string;
  tag?: string;
}

export interface SendPushReport {
  attempted: number;
  succeeded: number;
  pruned: number;
  failures: Array<{
    endpoint: string;
    statusCode?: number;
    body?: string;
    message: string;
  }>;
}

export async function sendPushToAll(payload: PushPayload): Promise<SendPushReport> {
  const config = ensureWebPushConfigured();
  if (!config) {
    return { attempted: 0, succeeded: 0, pruned: 0, failures: [] };
  }

  const subscriptions = getAllSubscriptions();
  let succeeded = 0;
  let pruned = 0;
  const failures: SendPushReport["failures"] = [];
  const json = JSON.stringify(payload);

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(sub, json);
        succeeded += 1;
      } catch (err: unknown) {
        const errObj =
          typeof err === "object" && err !== null
            ? (err as Record<string, unknown>)
            : null;
        const statusCode =
          errObj && "statusCode" in errObj ? Number(errObj.statusCode) : undefined;
        const body =
          errObj && typeof errObj.body === "string"
            ? (errObj.body as string)
            : undefined;
        const message =
          err instanceof Error ? err.message : String(err);

        if (statusCode === 404 || statusCode === 410) {
          removeSubscription(sub.endpoint);
          pruned += 1;
        }
        failures.push({
          endpoint: sub.endpoint.slice(0, 80),
          statusCode,
          body,
          message,
        });
        // eslint-disable-next-line no-console
        console.warn("[push] sendNotification failed", {
          statusCode,
          message,
          body,
        });
      }
    })
  );

  return { attempted: subscriptions.length, succeeded, pruned, failures };
}

export function ensurePushDispatcherRegistered(): void {
  if (globalThis.__consentinelPushDispatcherRegistered) return;
  globalThis.__consentinelPushDispatcherRegistered = true;

  const runtime = getSharedKernelRuntime();
  runtime.subscribe((event) => {
    if (event.type !== "step_up.challenge_created") return;
    void sendPushToAll({
      title: "Consentinel · Verificación pendiente",
      body: event.prompt || "Tu asistente necesita tu confirmación.",
      requestId: event.requestId,
      url: "/dashboard",
      tag: event.requestId,
    });
  });
}
