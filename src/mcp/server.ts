import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { PermissionKernel } from "../kernel.js";
import { demoProfile, seedEvents } from "../demoFixtures.js";
import type { AgentActionRequest, TrackRecordEvent } from "../domain/types.js";
import { buildX402Permission } from "../payments/x402.js";

const moneySchema = z.object({
  value: z.number().nonnegative(),
  currency: z.string().min(3).max(8)
});

const x402Schema = z.object({
  endpoint: z.string().url(),
  maxAmount: moneySchema,
  network: z.string().optional(),
  scheme: z.string().optional(),
  facilitator: z.string().optional()
});

const contextSchema = z.object({
  source: z.enum(["direct_user", "email", "chat", "tool_output", "system", "unknown"]),
  sourceTrust: z.enum(["trusted", "mixed", "untrusted"]),
  originalUserRequest: z.string().optional(),
  expectedCounterparty: z.string().optional(),
  expectedAmount: moneySchema.optional()
});

const requestSchema = z.object({
  requestId: z.string(),
  userId: z.string(),
  agentId: z.string(),
  service: z.string(),
  action: z.enum(["read", "write", "send", "pay", "share", "delete", "trade", "configure"]),
  resource: z.string(),
  intent: z.string(),
  counterparty: z.string().optional(),
  amount: moneySchema.optional(),
  dataSensitivity: z.enum(["public", "internal", "personal", "financial", "secret"]),
  reversibility: z.enum(["reversible", "compensatable", "irreversible"]),
  x402: x402Schema.optional(),
  context: contextSchema.optional(),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional()
});

const eventSchema = z.object({
  eventId: z.string(),
  occurredAt: z.string(),
  request: requestSchema,
  outcome: z.enum(["allow", "allow_with_audit", "step_up", "deny"]),
  verifiedWith: z.enum(["voice_biometric_callback", "passkey", "none"]).optional()
});

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
    kernel.record(event);
    return jsonResponse({ ok: true, eventId: event.eventId });
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
    const decision = kernel.assess(request);
    return jsonResponse({
      decision,
      x402: buildX402Permission(request)
    });
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
    return jsonResponse(kernel.explainMemory(request));
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
    const decision = kernel.assess(request);
    if (decision.outcome !== "step_up") {
      return jsonResponse({
        ok: false,
        reason: `Decision was ${decision.outcome}; no step-up challenge is required.`,
        decision
      });
    }

    return jsonResponse({
      ok: true,
      decision,
      challenge: kernel.createStepUpChallenge(request, decision)
    });
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
