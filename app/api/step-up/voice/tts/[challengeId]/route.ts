import { NextResponse } from "next/server";
import { getSharedKernelRuntime } from "@/src/runtime/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ELEVENLABS_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech";
const DEFAULT_VOICE_ID = "EXAVITQu4vr4xnSDxMaL"; // Sarah — premade, accessible on free tier
const DEFAULT_MODEL_ID = "eleven_multilingual_v2";

const kernelRuntime = getSharedKernelRuntime();

// Public on purpose: the challengeId is an unguessable UUID and the audio
// merely re-states the action phrase that Kapso already has via
// /api/step-up/voice/:challengeId. Public access lets Kapso "Send Audio"
// fetch the URL without needing custom headers.
//
// `?audience` selects the wording. Default ("whatsapp") is the first-touch
// message Kapso plays on WhatsApp. "dashboard" is the second-touch line
// played on the web after the user clicks the deeplink — shorter, no
// re-introduction, walks straight into "use your passkey now".
export async function GET(req: Request, context: { params: { challengeId: string } }) {
  const challengeId = context.params.challengeId;
  const pending = await kernelRuntime.getPendingStepUp(challengeId);
  if (!pending) {
    return NextResponse.json({ error: "unknown challenge" }, { status: 404 });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ELEVENLABS_API_KEY not configured" }, { status: 500 });
  }
  const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
  const modelId = process.env.ELEVENLABS_MODEL_ID || DEFAULT_MODEL_ID;

  const url = new URL(req.url);
  const audience = url.searchParams.get("audience") === "dashboard" ? "dashboard" : "whatsapp";
  const userName = pending.userDisplayName ?? pending.verificationUsername ?? "che";

  // Avoid security/verifier framing — it reads alarmist and primes the
  // listener for a scam call. Stay neutral: brand + intent + action.
  const text =
    audience === "dashboard"
      ? `Hola ${userName}. Tu agente quiere ${pending.actionPhrase}. Si lo autorizás, usá tu huella ahora.`
      : `Hola ${userName}. Tu agente quiere ${pending.actionPhrase}. Te mandamos un link para autorizarlo con tu huella. Si no fuiste vos, ignoralo.`;

  const elevenRes = await fetch(`${ELEVENLABS_TTS_URL}/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg"
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: { stability: 0.5, similarity_boost: 0.75 }
    })
  });

  if (!elevenRes.ok) {
    const errorText = await elevenRes.text();
    return NextResponse.json(
      { error: "elevenlabs_tts_failed", status: elevenRes.status, detail: errorText },
      { status: 502 }
    );
  }

  const audio = await elevenRes.arrayBuffer();
  return new Response(audio, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(audio.byteLength),
      "Cache-Control": "private, max-age=300"
    }
  });
}
