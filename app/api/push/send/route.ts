import { NextResponse } from "next/server";
import { sendPushToAll } from "@/lib/push/dispatcher";
import { readWebPushConfig } from "@/lib/push/web-push-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SendBody {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
}

// Manual trigger for development / smoke testing. Production pushes flow
// from the runtime event bus via lib/push/dispatcher; this endpoint is
// here so anyone can verify the SW + subscription wiring without running
// a full kernel scenario.
export async function POST(req: Request) {
  if (!readWebPushConfig()) {
    return NextResponse.json(
      { error: "VAPID keys not configured on the server" },
      { status: 503 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as SendBody;
  const result = await sendPushToAll({
    title: body.title || "Consentinel · Test push",
    body: body.body || "Manual trigger from /api/push/send",
    url: body.url || "/",
    tag: body.tag,
  });

  return NextResponse.json({ ok: true, ...result });
}
