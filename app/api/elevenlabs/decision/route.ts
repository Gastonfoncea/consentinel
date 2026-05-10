import { NextResponse } from "next/server";
import { z } from "zod";
import { getSharedKernelRuntime } from "@/src/runtime/runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/elevenlabs/decision
//
// ElevenLabs server tools (`approve_action` / `deny_action`) configured in
// the agent dashboard POST here when the user gives a verbal yes/no during
// the voice biometric step-up.
//
// On deny: cancel the pending step-up so the runtime emits step_up.canceled
// and the UI lights red.
// On approve: we don't auto-complete the step-up because the demo uses a
// two-factor flow (voice + passkey) — voice signals intent, passkey
// confirms identity. We emit a voice.message event so the activity feed
// shows the verbal "sí" alongside the upcoming passkey prompt. The actual
// completion happens via /api/step-up/passkey/finish.

const bodySchema = z.object({
  challenge_id: z.string(),
  decision: z.enum(["approve", "deny"]),
  reason: z
    .enum(["user_denied", "duress", "silence", "out_of_scope"])
    .optional()
});

const kernelRuntime = getSharedKernelRuntime();

export async function POST(req: Request) {
  let payload: z.infer<typeof bodySchema>;
  try {
    payload = bodySchema.parse(await req.json());
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

  const pending = await kernelRuntime.getPendingStepUp(payload.challenge_id);
  if (!pending) {
    return NextResponse.json(
      { ok: false, error: "challenge_not_found" },
      { status: 404 }
    );
  }
  if (pending.status !== "pending") {
    return NextResponse.json(
      { ok: false, error: `challenge_status_${pending.status}` },
      { status: 410 }
    );
  }

  if (payload.decision === "deny") {
    const username = pending.challengeOwnerUsername ?? "voice_agent";
    try {
      await kernelRuntime.cancelPendingStepUp(payload.challenge_id, username);
    } catch (err) {
      return NextResponse.json(
        {
          ok: false,
          error: "cancel_failed",
          detail: err instanceof Error ? err.message : String(err)
        },
        { status: 400 }
      );
    }
    return NextResponse.json({
      ok: true,
      next: "denied",
      challengeId: payload.challenge_id,
      reason: payload.reason ?? "user_denied"
    });
  }

  // Approve path — surface the verbal "sí" as a voice.message so the
  // activity feed shows the intent. The actual step-up completion happens
  // via the passkey flow (/api/step-up/passkey/finish).
  kernelRuntime.emit({
    type: "voice.message",
    ts: Date.now(),
    requestId: pending.requestId,
    role: "user",
    text: "(voice approve received — awaiting passkey)"
  });

  return NextResponse.json({
    ok: true,
    next: "awaiting_passkey",
    challengeId: payload.challenge_id
  });
}

// GET — debug peek at a challenge's current status.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const challengeId = url.searchParams.get("challengeId");
  if (!challengeId) {
    return NextResponse.json(
      { ok: false, error: "missing_challengeId" },
      { status: 400 }
    );
  }
  const pending = await kernelRuntime.getPendingStepUp(challengeId);
  if (!pending) {
    return NextResponse.json(
      { ok: false, error: "not_found" },
      { status: 404 }
    );
  }
  return NextResponse.json({
    ok: true,
    challenge: {
      challengeId: pending.challengeId,
      requestId: pending.requestId,
      status: pending.status,
      channel: pending.channel,
      expiresAt: pending.expiresAt
    }
  });
}
