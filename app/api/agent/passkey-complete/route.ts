import { NextResponse } from "next/server";
import { z } from "zod";
import { publish } from "@/lib/events/bus";
import { getChallenge } from "@/src/stepup/voiceVerification";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/agent/passkey-complete
//   body: { challengeId, verified }
//
// The browser calls this after the WebAuthn flow finishes (using Gastón's
// existing /api/auth/login/begin + /api/auth/login/finish). We map the
// final result to a kernel decision event so the voice circle + log panel
// react.

const bodySchema = z.object({
  challengeId: z.string(),
  verified: z.boolean(),
  reason: z.string().optional()
});

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

  const challenge = getChallenge(payload.challengeId);
  if (!challenge) {
    return NextResponse.json(
      { ok: false, error: "challenge_not_found" },
      { status: 404 }
    );
  }

  if (challenge.status === "expired") {
    publish({
      type: "decision",
      ts: Date.now(),
      requestId: challenge.requestId,
      outcome: "deny",
      riskScore: 1,
      explanation: "Voice challenge expired before passkey was provided."
    });
    return NextResponse.json({ ok: false, error: "challenge_expired" }, { status: 410 });
  }

  if (challenge.status !== "approved") {
    // Either still pending (passkey before voice approved) or already denied.
    return NextResponse.json(
      { ok: false, error: `challenge_status_${challenge.status}` },
      { status: 409 }
    );
  }

  if (!payload.verified) {
    publish({
      type: "decision",
      ts: Date.now(),
      requestId: challenge.requestId,
      outcome: "deny",
      riskScore: 0.9,
      explanation: payload.reason ?? "Passkey verification failed."
    });
    return NextResponse.json({ ok: true, status: "deny" });
  }

  publish({
    type: "decision",
    ts: Date.now(),
    requestId: challenge.requestId,
    outcome: "allow",
    riskScore: 0.2,
    explanation:
      "Voice + passkey step-up satisfied. Proceeding with the bound action."
  });

  return NextResponse.json({ ok: true, status: "allow" });
}
