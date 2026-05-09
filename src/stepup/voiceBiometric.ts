import { createHash, randomUUID } from "node:crypto";
import type { AgentActionRequest, PermissionDecision, StepUpChallenge, UserTrustProfile } from "../domain/types.js";

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
    const phrase = this.shortPhrase(request, decision.actionHash);

    return {
      challengeId,
      requestId: request.requestId,
      userId: request.userId,
      channel: decision.requiredStepUp,
      boundActionHash: decision.actionHash,
      expiresAt,
      prompt: [
        `Call the user's verified eSIM route and ask for biometric confirmation.`,
        `Read: "${phrase}".`,
        `Only mark verified if the voice/passkey provider signs this exact action hash: ${decision.actionHash}.`
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
