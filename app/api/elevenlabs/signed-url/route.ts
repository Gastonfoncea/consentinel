import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/elevenlabs/signed-url
//
// Returns a short-lived signed URL the browser uses to start an ElevenLabs
// Conversational AI session without exposing our API key. Frontend calls
// this right before opening the websocket via @elevenlabs/react.
//
// Docs:
// https://elevenlabs.io/docs/conversational-ai/authentication/signed-urls

export async function GET() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.ELEVENLABS_AGENT_ID;

  if (!apiKey || !agentId) {
    return NextResponse.json(
      {
        ok: false,
        error: "missing_env",
        missing: [
          !apiKey && "ELEVENLABS_API_KEY",
          !agentId && "ELEVENLABS_AGENT_ID"
        ].filter(Boolean)
      },
      { status: 500 }
    );
  }

  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(
        agentId
      )}`,
      {
        method: "GET",
        headers: {
          "xi-api-key": apiKey
        },
        cache: "no-store"
      }
    );

    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json(
        { ok: false, error: "elevenlabs_failed", status: res.status, detail },
        { status: 502 }
      );
    }

    const data = (await res.json()) as { signed_url?: string };
    if (!data.signed_url) {
      return NextResponse.json(
        { ok: false, error: "no_signed_url_in_response" },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, signedUrl: data.signed_url, agentId });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "fetch_failed",
        detail: err instanceof Error ? err.message : String(err)
      },
      { status: 500 }
    );
  }
}
