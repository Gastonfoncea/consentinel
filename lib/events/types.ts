export type KernelOutcome = "allow" | "allow_with_audit" | "step_up" | "deny";

export type KernelStreamEvent =
  | {
      type: "request";
      ts: number;
      requestId: string;
      agentId: string;
      action: string;
      service: string;
      intent: string;
    }
  | {
      type: "thinking";
      ts: number;
      requestId: string;
      message: string;
    }
  | {
      type: "evidence";
      ts: number;
      requestId: string;
      label: string;
      detail: string;
    }
  | {
      type: "decision";
      ts: number;
      requestId: string;
      outcome: KernelOutcome;
      riskScore: number;
      explanation: string;
    }
  | {
      type: "step_up";
      ts: number;
      requestId: string;
      channel: "voice_biometric_callback" | "passkey";
      prompt: string;
    }
  | { type: "ping"; ts: number };
