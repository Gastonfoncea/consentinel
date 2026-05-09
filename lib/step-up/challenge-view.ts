import type { PendingStepUp } from "@/src/runtime/types";

export interface StepUpChallengeView {
  challengeId: string;
  requestId: string;
  handoffCode: string;
  status: PendingStepUp["status"];
  channel: PendingStepUp["channel"];
  expiresAt: string;
  actionPhrase: string;
  spokenOperationSummary: string;
  spokenRiskHint?: string;
  userDisplayName?: string;
  whatsappVerificationUrl: string;
  deliveryChannel: PendingStepUp["deliveryChannel"];
  canVerifyWithPasskey: boolean;
  waitingForPhoneConfirmation: boolean;
  isTerminal: boolean;
}

export function toStepUpChallengeView(stepUp: PendingStepUp): StepUpChallengeView {
  const canVerifyWithPasskey =
    stepUp.channel === "passkey" || stepUp.status === "phone_confirmed";

  return {
    challengeId: stepUp.challengeId,
    requestId: stepUp.requestId,
    handoffCode: stepUp.handoffCode,
    status: stepUp.status,
    channel: stepUp.channel,
    expiresAt: stepUp.expiresAt,
    actionPhrase: stepUp.actionPhrase,
    spokenOperationSummary: stepUp.spokenOperationSummary,
    spokenRiskHint: stepUp.spokenRiskHint,
    userDisplayName: stepUp.userDisplayName,
    whatsappVerificationUrl: stepUp.whatsappVerificationUrl,
    deliveryChannel: stepUp.deliveryChannel,
    canVerifyWithPasskey,
    waitingForPhoneConfirmation: stepUp.status === "pending" && stepUp.channel === "voice_biometric_callback",
    isTerminal:
      stepUp.status === "completed" ||
      stepUp.status === "rejected" ||
      stepUp.status === "expired"
  };
}
