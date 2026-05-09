export type KernelOutcome = "allow" | "allow_with_audit" | "step_up" | "deny";

export type KernelStreamEvent =
  | {
      type: "permission.request_started";
      ts: number;
      requestId: string;
      agentId: string;
      action: string;
      service: string;
      intent: string;
    }
  | {
      type: "permission.trace_event";
      ts: number;
      requestId: string;
      eventType:
        | "request.received"
        | "graph.evaluated"
        | "memory.similarity_retrieved"
        | "intent_drift.evaluated"
        | "x402.normalized"
        | "risk.scored"
        | "decision.made"
        | "step_up.required";
      summary: string;
      payload?: Record<string, unknown>;
    }
  | {
      type: "permission.decision_made";
      ts: number;
      requestId: string;
      outcome: KernelOutcome;
      riskScore: number;
      explanation: string;
    }
  | {
      type: "step_up.challenge_created";
      ts: number;
      requestId: string;
      challengeId: string;
      channel: "voice_biometric_callback" | "passkey";
      prompt: string;
      expiresAt: string;
    }
  | {
      type: "step_up.phone_confirmed";
      ts: number;
      requestId: string;
      challengeId: string;
      channel: "voice_biometric_callback" | "passkey";
      provider: "elevenlabs" | "manual";
    }
  | {
      type: "step_up.rejected";
      ts: number;
      requestId: string;
      challengeId: string;
      channel: "voice_biometric_callback" | "passkey";
      reason: "user_denied" | "duress";
    }
  | {
      type: "step_up.verified";
      ts: number;
      requestId: string;
      challengeId: string;
      channel: "voice_biometric_callback" | "passkey";
      verifiedByUsername?: string;
    }
  | {
      type: "wallet.transfer_prepared";
      ts: number;
      requestId: string;
      actionHash: string;
      to: string;
      amount: string;
      asset: string;
      mode: "direct" | "resumed";
    }
  | {
      type: "wallet.transfer_mock_executed";
      ts: number;
      requestId: string;
      actionHash: string;
      to: string;
      amount: number;
      asset: string;
      txHash: string;
      mode: "direct" | "resumed";
    }
  | {
      type: "runtime.error";
      ts: number;
      requestId?: string;
      message: string;
    }
  | {
      type: "ping";
      ts: number;
    };
