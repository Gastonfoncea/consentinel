import { createHash, randomUUID } from "node:crypto";
import type { AgentActionRequest, PermissionDecision, StepUpChallenge, UserTrustProfile } from "../domain/types";
import {
  buildHandoffCode,
  buildSpokenOperationSummary,
  buildSpokenRiskHint,
  buildWhatsAppVerificationUrl,
  composeActionPhrase,
  deriveUserDisplayName,
  deriveVerificationUsername
} from "./presentation";

export class VoiceBiometricStepUp {
  createChallenge(
    request: AgentActionRequest,
    profile: UserTrustProfile,
    decision: PermissionDecision,
    now = new Date()
  ): StepUpChallenge {
    if (!decision.requiredStepUp) {
      throw new Error("Cannot create step-up challenge for a decision that does not require step-up.");
    }

    const challengeId = `voice_${randomUUID()}`;
    const expiresAt = new Date(now.getTime() + 4 * 60 * 1000).toISOString();
    const verificationUsername = deriveVerificationUsername(request);
    const userDisplayName = deriveUserDisplayName(request, verificationUsername);
    const spokenOperationSummary = buildSpokenOperationSummary(request);
    const spokenRiskHint = buildSpokenRiskHint(request);
    const actionPhrase = composeActionPhrase(spokenOperationSummary, spokenRiskHint);
    const handoffCode = buildHandoffCode();
    const whatsappVerificationUrl = buildWhatsAppVerificationUrl(handoffCode);
    const phrase = this.shortPhrase(request, decision.actionHash);

    return {
      challengeId,
      requestId: request.requestId,
      userId: request.userId,
      channel: decision.requiredStepUp,
      boundActionHash: decision.actionHash,
      expiresAt,
      actionPhrase,
      spokenOperationSummary,
      spokenRiskHint,
      userDisplayName,
      verificationUsername,
      handoffCode,
      whatsappVerificationUrl,
      deliveryChannel: "whatsapp",
      prompt: [
        `Call the user and validate this operation in plain language: "${actionPhrase}".`,
        `Tell them we already sent a WhatsApp with the verification link: ${whatsappVerificationUrl}.`,
        `If they verbally confirm, direct them to finish passkey verification on the web.`,
        `Read this fallback verification phrase if needed: "${phrase}".`,
        `Never complete the challenge from the call alone; the app must verify the exact action hash ${decision.actionHash}.`
      ].join(" "),
      deliveryTarget: profile.phoneE164
    };
  }

  private shortPhrase(request: AgentActionRequest, hash: string): string {
    const amount = request.amount
      ? `${request.amount.value} ${request.amount.currency.toUpperCase()}`
      : "no payment amount";
    const digest = createHash("sha256")
      .update(`${hash}:${request.userId}`)
      .digest("hex")
      .slice(0, 6)
      .toUpperCase();

    return `Confirm ${request.action} on ${request.service} for ${request.counterparty ?? request.resource}, ${amount}. Code ${digest}.`;
  }
}
