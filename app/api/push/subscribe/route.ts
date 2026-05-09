import { NextResponse } from "next/server";
import type { PushSubscription as WebPushSubscription } from "web-push";
import { addSubscription, subscriptionCount } from "@/lib/push/store";
import { readWebPushConfig } from "@/lib/push/web-push-config";
import { ensurePushDispatcherRegistered } from "@/lib/push/dispatcher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SubscribeBody {
  subscription?: WebPushSubscription;
}

function isValidSubscription(s: unknown): s is WebPushSubscription {
  if (!s || typeof s !== "object") return false;
  const candidate = s as Record<string, unknown>;
  if (typeof candidate.endpoint !== "string" || candidate.endpoint.length === 0) {
    return false;
  }
  const keys = candidate.keys as Record<string, unknown> | undefined;
  if (!keys || typeof keys !== "object") return false;
  return (
    typeof keys.p256dh === "string" &&
    typeof keys.auth === "string" &&
    keys.p256dh.length > 0 &&
    keys.auth.length > 0
  );
}

export async function POST(req: Request) {
  if (!readWebPushConfig()) {
    return NextResponse.json(
      { error: "VAPID keys not configured on the server" },
      { status: 503 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as SubscribeBody;
  if (!isValidSubscription(body.subscription)) {
    return NextResponse.json(
      { error: "invalid subscription payload" },
      { status: 400 }
    );
  }

  addSubscription(body.subscription);
  ensurePushDispatcherRegistered();

  return NextResponse.json({ ok: true, count: subscriptionCount() });
}
