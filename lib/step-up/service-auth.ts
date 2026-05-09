import { timingSafeEqual } from "node:crypto";

const SERVICE_TOKEN_ENV = "STEP_UP_SERVICE_TOKEN";

export function requireStepUpServiceAuth(req: Request): { ok: true } | { ok: false; status: number; error: string } {
  const configured = process.env[SERVICE_TOKEN_ENV];
  if (!configured) {
    return {
      ok: false,
      status: 500,
      error: `${SERVICE_TOKEN_ENV} is not configured`
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
