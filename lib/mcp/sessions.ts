import { randomUUID } from "node:crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createPlatanusMcpServer } from "@/src/mcp/createServer";

const SESSION_TTL_MS = 1000 * 60 * 30;

type McpSession = {
  createdAt: number;
  lastSeenAt: number;
  server: McpServer;
  transport: WebStandardStreamableHTTPServerTransport;
};

declare global {
  // eslint-disable-next-line no-var
  var __platanusMcpSessions: Map<string, McpSession> | undefined;
}

function getSessionStore() {
  globalThis.__platanusMcpSessions ??= new Map<string, McpSession>();
  return globalThis.__platanusMcpSessions;
}

export async function getOrCreateMcpSession(sessionId: string | null): Promise<McpSession> {
  pruneExpiredMcpSessions();

  if (sessionId) {
    const existing = getSessionStore().get(sessionId);
    if (!existing) {
      throw new Error("session_not_found");
    }
    existing.lastSeenAt = Date.now();
    return existing;
  }

  return createMcpSession();
}

function pruneExpiredMcpSessions() {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [sessionId, session] of getSessionStore()) {
    if (session.lastSeenAt >= cutoff) continue;
    getSessionStore().delete(sessionId);
    void session.server.close().catch(() => undefined);
  }
}

async function createMcpSession(): Promise<McpSession> {
  const server = createPlatanusMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: randomUUID,
    enableJsonResponse: true,
    onsessioninitialized: (sessionId) => {
      getSessionStore().set(sessionId, {
        createdAt: Date.now(),
        lastSeenAt: Date.now(),
        server,
        transport
      });
    },
    onsessionclosed: (sessionId) => {
      getSessionStore().delete(sessionId);
    }
  });

  await server.connect(transport);

  return {
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
    server,
    transport
  };
}

export function touchMcpSession(sessionId: string | null) {
  if (!sessionId) return;
  const session = getSessionStore().get(sessionId);
  if (session) {
    session.lastSeenAt = Date.now();
  }
}

export function hasMcpSession(sessionId: string | null) {
  if (!sessionId) return false;
  return getSessionStore().has(sessionId);
}

export async function resetMcpSessions() {
  for (const [, session] of getSessionStore()) {
    await session.server.close().catch(() => undefined);
  }
  getSessionStore().clear();
}
