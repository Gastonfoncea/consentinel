import { NextResponse } from "next/server";
import { z } from "zod";
import { publish } from "@/lib/events/bus";
import { getKernel } from "@/lib/kernel/instance";
import {
  getChallenge,
  resolveChallenge,
  type VoiceChallenge
} from "@/src/stepup/voiceVerification";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Custom server tools `approve_action` and `deny_action` configured in the
// ElevenLabs agent dashboard POST here when the user gives a verbal yes/no
// during the voice biometric step-up.
//
// On approve → publish step_up{passkey} so the UI shows the passkey prompt.
// On deny → publish decision{deny} so the UI lights red.

const bodySchema = z.object({
  challenge_id: z.string(),
  decision: z.enum(["approve", "deny"]),
  reason: z
    .enum(["user_denied", "duress", "silence", "out_of_scope"])
    .optional()
});

export async function POST(req: Request) {
  let payload: z.infer<typeof bodySchema>;
  try {
    const json = await req.json();
    payload = bodySchema.parse(json);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_body",
        detail: err instanceof Error ? err.message : String(err)
      },
      { status: 400 }
    );
  }

  const result = resolveChallenge({
    challengeId: payload.challenge_id,
    outcome: payload.decision,
    reason: payload.reason
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.reason },
      { status: result.reason === "not_found" ? 404 : 410 }
    );
  }

  const challenge = result.challenge;

  if (payload.decision === "approve") {
    // Voice phase passed → record the voice approval into the kernel's
    // behavior graph so future similar requests benefit from the
    // familiarity uptick. The final `outcome` is provisional ("step_up")
    // because we still need passkey to lock in `allow`.
    if (challenge.request) {
      try {
        getKernel().record({
          eventId: `voice_${challenge.challengeId}`,
          occurredAt: new Date().toISOString(),
          request: challenge.request,
          outcome: "step_up",
          verifiedWith: "voice_biometric_callback"
        });
      } catch (err) {
        console.warn(
          "[decision] kernel.record after voice approve failed",
          err
        );
      }
    }

    // Voice phase passed → ask for passkey to complete step-up.
    publish({
      type: "step_up",
      ts: Date.now(),
      requestId: challenge.requestId,
      channel: "passkey",
      prompt: "Confirmá con tu passkey en la pantalla."
    });
    return NextResponse.json({
      ok: true,
      next: "awaiting_passkey",
      challengeId: challenge.challengeId
    });
  }

  // Deny path — voice rejected (or duress / silence / out_of_scope).
  const explanation =
    payload.reason === "duress"
      ? "Coacción detectada en la voz. Acción cancelada."
      : payload.reason === "silence"
      ? "Sin respuesta del usuario. Acción cancelada."
      : payload.reason === "out_of_scope"
      ? "El usuario no respondió a la verificación. Acción cancelada."
      : "Usuario rechazó la acción por voz.";

  publish({
    type: "decision",
    ts: Date.now(),
    requestId: challenge.requestId,
    outcome: "deny",
    riskScore: 1,
    explanation
  });

  return NextResponse.json({
    ok: true,
    next: "denied",
    challengeId: challenge.challengeId,
    reason: payload.reason ?? "user_denied"
  });
}

// GET for debugging — show the current state of a challenge.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const challengeId = url.searchParams.get("challengeId");
  if (!challengeId) {
    return NextResponse.json(
      { ok: false, error: "missing_challengeId" },
      { status: 400 }
    );
  }
  const challenge = getChallenge(challengeId);
  if (!challenge) {
    return NextResponse.json(
      { ok: false, error: "not_found" },
      { status: 404 }
    );
  }
  return NextResponse.json({ ok: true, challenge: redact(challenge) });
}

function redact(challenge: VoiceChallenge) {
  return {
    challengeId: challenge.challengeId,
    requestId: challenge.requestId,
    status: challenge.status,
    expiresAt: challenge.expiresAt,
    resolvedAt: challenge.resolvedAt,
    reason: challenge.reason
  };
}
