import { timingSafeEqual } from "node:crypto";

const MCP_SERVER_TOKEN_ENV = "MCP_SERVER_TOKEN";
const FALLBACK_TOKEN_ENV = "STEP_UP_SERVICE_TOKEN";

export function requireMcpServerAuth(req: Request): { ok: true } | { ok: false; status: number; error: string } {
  const configured = readMcpServerToken();
  if (!configured) {
    return {
      ok: false,
      status: 500,
      error: `${MCP_SERVER_TOKEN_ENV} or ${FALLBACK_TOKEN_ENV} must be configured`
    };
  }

  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    return {
      ok: false,
      status: 401,
      error: "missing bearer token"
    };
  }

  const provided = header.slice("Bearer ".length).trim();
  const expectedBuffer = Buffer.from(configured, "utf8");
  const providedBuffer = Buffer.from(provided, "utf8");

  if (
    expectedBuffer.length !== providedBuffer.length ||
    !timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    return {
      ok: false,
      status: 403,
      error: "invalid bearer token"
    };
  }

  return { ok: true };
}

export function readMcpServerToken(): string | undefined {
  return process.env[MCP_SERVER_TOKEN_ENV] || process.env[FALLBACK_TOKEN_ENV];
}
