import type {
  AgentActionRequest,
  ConsentinelEvent,
  PermissionDecision,
  StepUpChallenge,
  TrackRecordEvent
} from "../domain/types";
import type { PreparedWalletTransfer } from "../wallet/wallet";

export type PendingOperation =
  | {
      kind: "wallet_read_balance";
      request: AgentActionRequest;
    }
  | {
      kind: "wallet_prepare_transfer";
      request: AgentActionRequest;
    }
  | {
      kind: "wallet_mock_execute_transfer";
      request: AgentActionRequest;
    }
  | {
      kind: "standalone_assessment";
      request: AgentActionRequest;
    };

export type PendingStepUpStatus = "pending" | "verified" | "completed" | "expired";

export interface PendingStepUp extends StepUpChallenge {
  createdAt: string;
  request: AgentActionRequest;
  decision: PermissionDecision;
  operation: PendingOperation;
  status: PendingStepUpStatus;
  authChallenge?: string;
  challengeOwnerUsername?: string;
  verifiedAt?: string;
  verifiedByUsername?: string;
  completedAt?: string;
}

export type DurableRuntimeEvent =
  | {
      id: string;
      kind: "track_recorded";
      recordedAt: string;
      source: "seed" | "runtime" | "manual";
      trackEvent: TrackRecordEvent;
    }
  | {
      id: string;
      kind: "decision_recorded";
      recordedAt: string;
      requestId: string;
      actionHash: string;
      decision: Pick<PermissionDecision, "outcome" | "riskScore" | "explanation" | "requiredStepUp">;
    }
  | {
      id: string;
      kind: "wallet_transfer_prepared";
      recordedAt: string;
      requestId: string;
      actionHash: string;
      mode: "direct" | "resumed";
      preparation: Pick<PreparedWalletTransfer, "asset" | "amount" | "amountBaseUnits" | "from" | "to" | "transaction">;
    }
  | {
      id: string;
      kind: "wallet_transfer_mock_executed";
      recordedAt: string;
      requestId: string;
      actionHash: string;
      mode: "direct" | "resumed";
      execution: {
        eventId: string;
        hash: string;
        from: string;
        to: string;
        amount: number;
        asset: string;
      };
    }
  | {
      id: string;
      kind: "step_up_verified";
      recordedAt: string;
      challengeId: string;
      requestId: string;
      actionHash: string;
      verifiedByUsername?: string;
      trackEvent: TrackRecordEvent;
    };

export type RuntimePermissionEvent =
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
      eventType: ConsentinelEvent["type"];
      summary: string;
      payload?: Record<string, unknown>;
    }
  | {
      type: "permission.decision_made";
      ts: number;
      requestId: string;
      outcome: PermissionDecision["outcome"];
      riskScore: number;
      explanation: string;
    }
  | {
      type: "step_up.challenge_created";
      ts: number;
      requestId: string;
      challengeId: string;
      channel: StepUpChallenge["channel"];
      prompt: string;
      expiresAt: string;
    }
  | {
      type: "step_up.verified";
      ts: number;
      requestId: string;
      challengeId: string;
      channel: StepUpChallenge["channel"];
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
