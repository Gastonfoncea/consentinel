import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { Address } from "viem";
import { PermissionKernel } from "../kernel.js";
import { demoProfile, seedEvents } from "../demoFixtures.js";
import type {
  AgentActionRequest,
  CounterpartyRouteTrust,
  PermissionContext,
  TrackRecordEvent
} from "../domain/types.js";
import {
  assessAgentAction,
  createStepUpChallengeResponse,
  explainPermissionMemory,
  mockExecuteWalletTransfer,
  recordTrackEvent
} from "./handlers.js";
import { counterpartyRouteTrustSchema, eventSchema, requestSchema } from "./schemas.js";

// Wallet module is loaded lazily so the server still boots when .env is empty
// (Alejandro/Gastón can run the kernel without the wallet stack ready).
async function loadWallet() {
  return await import("../wallet/wallet.js");
}

const ethAddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address");
const usdcAmountSchema = z
  .string()
  .regex(/^\d+(\.\d{1,6})?$/, "Amount must be a decimal string with up to 6 decimals");
const sourceSchema = z.enum(["direct_user", "email", "chat", "tool_output", "system", "unknown"]);
const sourceTrustSchema = z.enum(["trusted", "mixed", "untrusted"]);

const kernel = new PermissionKernel(demoProfile);
for (const event of seedEvents) {
  kernel.record(event);
}

const server = new McpServer({
  name: "platanus-agent-permission-kernel",
  version: "0.1.0"
});

server.registerTool(
  "platanus_record_track_event",
  {
    title: "Record Track Event",
    description: "Persist a prior permission event into the behavior graph and vector memory.",
    inputSchema: {
      event: eventSchema
    }
  },
  async ({ event }: { event: TrackRecordEvent }) => {
    return jsonResponse(recordTrackEvent(kernel, event));
  }
);

server.registerTool(
  "platanus_assess_agent_action",
  {
    title: "Assess Agent Action",
    description: "Return allow, allow_with_audit, step_up, or deny for a normalized agent action.",
    inputSchema: {
      request: requestSchema
    }
  },
  async ({ request }: { request: AgentActionRequest }) => {
    return jsonResponse(await assessAgentAction(kernel, request));
  }
);

server.registerTool(
  "platanus_explain_permission_memory",
  {
    title: "Explain Permission Memory",
    description: "Expose graph evidence and vector precedents behind a future permission decision.",
    inputSchema: {
      request: requestSchema
    }
  },
  async ({ request }: { request: AgentActionRequest }) => {
    return jsonResponse(explainPermissionMemory(kernel, request));
  }
);

server.registerTool(
  "platanus_create_step_up_challenge",
  {
    title: "Create Step-Up Challenge",
    description: "Create a voice biometric/passkey challenge bound to the exact action hash.",
    inputSchema: {
      request: requestSchema
    }
  },
  async ({ request }: { request: AgentActionRequest }) => {
    return jsonResponse(await createStepUpChallengeResponse(kernel, request));
  }
);

// ────────────────────────────────────────────────────────────────────────────
// Wallet tools (CON-10): direct execution, NO kernel gating yet.
// CON-12 wraps these with kernel.assess so unsafe transfers get blocked /
// step-upped instead of executed straight.
// ────────────────────────────────────────────────────────────────────────────

server.registerTool(
  "wallet_balance",
  {
    title: "Wallet Balance (USDC, Base Sepolia)",
    description: "Returns the current USDC balance of the demo wallet after kernel evaluation of the read action.",
    inputSchema: {
      requestId: z.string().optional(),
      agentId: z.string().optional(),
      intent: z.string().optional(),
      source: sourceSchema.optional(),
      sourceTrust: sourceTrustSchema.optional(),
      originalUserRequest: z.string().optional()
    }
  },
  async ({
    requestId,
    agentId,
    intent,
    source,
    sourceTrust,
    originalUserRequest
  }: {
    requestId?: string;
    agentId?: string;
    intent?: string;
    source?: PermissionContext["source"];
    sourceTrust?: PermissionContext["sourceTrust"];
    originalUserRequest?: string;
  }) => {
    const request = buildWalletReadRequest({
      requestId,
      agentId,
      intent,
      source,
      sourceTrust,
      originalUserRequest
    });
    const evaluation = await kernel.decide(request);
    if (evaluation.decision.outcome === "deny") {
      return jsonResponse({
        ok: false,
        status: "blocked",
        decision: evaluation.decision,
        events: evaluation.events
      });
    }

    if (evaluation.decision.outcome === "step_up") {
      return jsonResponse({
        ok: false,
        status: "step_up_required",
        decision: evaluation.decision,
        events: evaluation.events,
        challenge: kernel.createStepUpChallenge(request, evaluation.decision)
      });
    }

    const w = await loadWallet();
    const balance = await w.getUsdcBalance();
    return jsonResponse({
      ok: true,
      status: "allowed",
      decision: evaluation.decision,
      events: evaluation.events,
      address: w.walletAddress,
      balance,
      asset: "USDC",
      explorer: w.basescanAddrUrl(w.walletAddress)
    });
  }
);

server.registerTool(
  "wallet_transfer",
  {
    title: "Wallet Transfer (USDC, Mocked + Kernel Gated)",
    description:
      "Assess a wallet transfer through the kernel, then mock-execute it only when policy allows. Claimed or unknown new wallets can trigger step-up instead of execution.",
    inputSchema: {
      to: ethAddressSchema,
      amount: usdcAmountSchema,
      requestId: z.string().optional(),
      agentId: z.string().optional(),
      intent: z.string().optional(),
      counterpartyIdentity: z.string().optional(),
      counterpartyRouteTrust: counterpartyRouteTrustSchema.optional(),
      source: sourceSchema.optional(),
      sourceTrust: sourceTrustSchema.optional(),
      originalUserRequest: z.string().optional(),
      expectedCounterparty: z.string().optional(),
      expectedCounterpartyIdentity: z.string().optional(),
      expectedCounterpartyRouteTrust: counterpartyRouteTrustSchema.optional()
    }
  },
  async ({
    to,
    amount,
    requestId,
    agentId,
    intent,
    counterpartyIdentity,
    counterpartyRouteTrust,
    source,
    sourceTrust,
    originalUserRequest,
    expectedCounterparty,
    expectedCounterpartyIdentity,
    expectedCounterpartyRouteTrust
  }: {
    to: string;
    amount: string;
    requestId?: string;
    agentId?: string;
    intent?: string;
    counterpartyIdentity?: string;
    counterpartyRouteTrust?: CounterpartyRouteTrust;
    source?: PermissionContext["source"];
    sourceTrust?: PermissionContext["sourceTrust"];
    originalUserRequest?: string;
    expectedCounterparty?: string;
    expectedCounterpartyIdentity?: string;
    expectedCounterpartyRouteTrust?: CounterpartyRouteTrust;
  }) => {
    const request = buildWalletTransferRequest({
      to: to as Address,
      amount,
      requestId,
      agentId,
      intent,
      counterpartyIdentity,
      counterpartyRouteTrust,
      source,
      sourceTrust,
      originalUserRequest,
      expectedCounterparty,
      expectedCounterpartyIdentity,
      expectedCounterpartyRouteTrust
    });

    return jsonResponse(await mockExecuteWalletTransfer(kernel, request));
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);

function jsonResponse<T extends Record<string, unknown>>(data: T) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2)
      }
    ],
    structuredContent: data
  };
}

function buildWalletReadRequest(input: {
  requestId?: string;
  agentId?: string;
  intent?: string;
  source?: PermissionContext["source"];
  sourceTrust?: PermissionContext["sourceTrust"];
  originalUserRequest?: string;
}): AgentActionRequest {
  return {
    requestId: input.requestId ?? "req_wallet_balance",
    userId: demoProfile.userId,
    agentId: input.agentId ?? "finance_agent",
    service: "wallet",
    action: "read",
    resource: "usdc_balance",
    intent: input.intent ?? "Read the current USDC balance of the demo wallet.",
    dataSensitivity: "financial",
    reversibility: "reversible",
    context: {
      source: input.source ?? "direct_user",
      sourceTrust: input.sourceTrust ?? "trusted",
      originalUserRequest: input.originalUserRequest
    }
  };
}

function buildWalletTransferRequest(input: {
  to: Address;
  amount: string;
  requestId?: string;
  agentId?: string;
  intent?: string;
  counterpartyIdentity?: string;
  counterpartyRouteTrust?: CounterpartyRouteTrust;
  source?: PermissionContext["source"];
  sourceTrust?: PermissionContext["sourceTrust"];
  originalUserRequest?: string;
  expectedCounterparty?: string;
  expectedCounterpartyIdentity?: string;
  expectedCounterpartyRouteTrust?: CounterpartyRouteTrust;
}): AgentActionRequest {
  return {
    requestId: input.requestId ?? `req_wallet_transfer_${Date.now()}`,
    userId: demoProfile.userId,
    agentId: input.agentId ?? "finance_agent",
    service: "wallet",
    action: "pay",
    resource: "usdc_transfer",
    intent: input.intent ?? `Send ${input.amount} USDC to ${input.to}.`,
    counterparty: input.to,
    counterpartyIdentity: input.counterpartyIdentity,
    counterpartyRouteTrust: input.counterpartyRouteTrust ?? "unknown",
    amount: {
      value: Number(input.amount),
      currency: "USDC"
    },
    dataSensitivity: "financial",
    reversibility: "compensatable",
    context: {
      source: input.source ?? "direct_user",
      sourceTrust: input.sourceTrust ?? "trusted",
      originalUserRequest: input.originalUserRequest,
      expectedCounterparty: input.expectedCounterparty,
      expectedCounterpartyIdentity: input.expectedCounterpartyIdentity,
      expectedCounterpartyRouteTrust: input.expectedCounterpartyRouteTrust
    }
  };
}
