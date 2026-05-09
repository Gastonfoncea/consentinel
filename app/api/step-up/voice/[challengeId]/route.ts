import { NextResponse } from "next/server";
import { requireStepUpServiceAuth } from "@/lib/step-up/service-auth";
import { getSharedKernelRuntime } from "@/src/runtime/runtime";

export const runtime = "nodejs";

const kernelRuntime = getSharedKernelRuntime();

export async function GET(req: Request, context: { params: { challengeId: string } }) {
  const auth = requireStepUpServiceAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const challengeId = context.params.challengeId;
  const pending = await kernelRuntime.getPendingStepUp(challengeId);
  if (!pending) {
    return NextResponse.json({ error: "unknown challenge" }, { status: 404 });
  }

  return NextResponse.json({
    challengeId: pending.challengeId,
    requestId: pending.requestId,
    status: pending.status,
    channel: pending.channel,
    expiresAt: pending.expiresAt,
    handoffCode: pending.handoffCode,
    deliveryChannel: pending.deliveryChannel,
    deliveryTarget: pending.deliveryTarget,
    userName: pending.userDisplayName ?? pending.userId,
    verificationUsername: pending.verificationUsername,
    actionPhrase: pending.actionPhrase,
    spokenOperationSummary: pending.spokenOperationSummary,
    spokenRiskHint: pending.spokenRiskHint,
    whatsappVerificationUrl: pending.whatsappVerificationUrl,
    prompt: pending.prompt,
    appVerification: {
      ready: pending.channel === "passkey" || pending.status === "phone_confirmed",
      beginPath: "/api/step-up/passkey/begin",
      finishPath: "/api/step-up/passkey/finish",
      verificationUrl: pending.whatsappVerificationUrl
    },
    callScript: {
      opening: `Hola ${pending.userDisplayName ?? pending.verificationUsername}. Soy el verificador de Consentinel. Tu agente quiere ${pending.actionPhrase}. ¿Lo autorizás? Sí o no.`,
      onConfirm: "Perfecto. Te mandamos un WhatsApp con el link para validar con passkey.",
      onReject: "Entendido, cancelado. Chau.",
      onRepeat: `Te repito: tu agente quiere ${pending.actionPhrase}. ¿Sí o no?`
    },
    tools: {
      user_confirmed: {
        method: "POST",
        path: "/api/step-up/voice/confirm",
        body: {
          challengeId: pending.challengeId,
          provider: "elevenlabs"
        }
      },
      user_rejected: {
        method: "POST",
        path: "/api/step-up/voice/reject",
        body: {
          challengeId: pending.challengeId,
          reason: "user_denied"
        }
      }
    }
  });
}
