import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { Address } from "viem";
import type {
  AgentActionRequest,
  CounterpartyRouteTrust,
  PermissionContext,
  TrackRecordEvent
} from "../domain/types";
import {
  assessAgentAction,
  createStepUpChallengeResponse,
  explainPermissionMemory,
  prepareWalletTransfer,
  mockExecuteWalletTransfer,
  recordTrackEvent
} from "./handlers";
import { counterpartyRouteTrustSchema, eventSchema, requestSchema } from "./schemas";
import { getSharedKernelRuntime } from "../runtime/runtime";
import { buildWalletReadRequest, buildWalletTransferRequest } from "../runtime/requests";

const ethAddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address");
const usdcAmountSchema = z
  .string()
  .regex(/^\d+(\.\d{1,6})?$/, "Amount must be a decimal string with up to 6 decimals");
const sourceSchema = z.enum(["direct_user", "email", "chat", "tool_output", "system", "unknown"]);
const sourceTrustSchema = z.enum(["trusted", "mixed", "untrusted"]);

const runtime = getSharedKernelRuntime();

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
    return jsonResponse(await recordTrackEvent(runtime, event));
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
    return jsonResponse(await assessAgentAction(runtime, request));
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
    return jsonResponse(await explainPermissionMemory(runtime, request));
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
    return jsonResponse(await createStepUpChallengeResponse(runtime, request));
  }
);

const walletTransferInputSchema = {
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
};

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
    return jsonResponse(await runtime.getWalletBalance(request));
  }
);

server.registerTool(
  "wallet_prepare_transfer",
  {
    title: "Wallet Transfer Preparation (USDC, Kernel Gated)",
    description:
      "Assess a wallet transfer through the kernel, then prepare the real ERC-20 transfer payload only when policy allows.",
    inputSchema: walletTransferInputSchema
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

    return jsonResponse(await prepareWalletTransfer(runtime, request));
  }
);

server.registerTool(
  "wallet_transfer",
  {
    title: "Wallet Transfer (USDC, Prepared + Mock Executed)",
    description:
      "Assess a wallet transfer through the kernel, prepare the real ERC-20 transfer payload, and mock only the final execution step.",
    inputSchema: walletTransferInputSchema
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

    return jsonResponse(await mockExecuteWalletTransfer(runtime, request));
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
