import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/auth/session";

const PUBLIC_PATHS = ["/", "/login", "/manifest.json", "/sw.js"];
// Public API prefixes — none of these require an iron-session cookie.
// - /api/auth: login + register flows themselves.
// - /api/mcp: remote MCP endpoint, called by external agent runtimes.
// - /api/step-up/voice: Gastón's voice handoff page callbacks.
// - /api/elevenlabs/*: ElevenLabs server tools (approve_action /
//   deny_action) POST here from their backend. The challenge_id binding
//   is unguessable and one-shot — reasonable replay protection.
// - /api/stream: SSE consumer for the public-facing demo. Events don't
//   carry secrets.
// - /api/voice: browser SDK transcript callbacks. Session is set but we
//   treat it as public so service workers / replay don't break.
const PUBLIC_API_PREFIXES = [
  "/api/auth",
  "/api/mcp",
  "/api/step-up/voice",
  "/api/elevenlabs",
  "/api/stream",
  "/api/voice"
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();
  if (PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  const session = await getIronSession<SessionData>(
    request,
    response,
    sessionOptions
  );

  if (!session.userId) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.svg$).*)",
  ],
};
