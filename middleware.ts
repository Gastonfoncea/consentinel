import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/auth/session";

const PUBLIC_PATHS = ["/login"];
// /api/elevenlabs/* is public so ElevenLabs server tools (approve_action /
// deny_action) can POST without a session. The challenge_id binding is
// unguessable and one-shot, which gives us reasonable replay protection.
// /api/stream is public so the SSE consumer doesn't need a session for the
// public-facing demo (the events themselves don't carry secrets).
const PUBLIC_API_PREFIXES = [
  "/api/auth",
  "/api/elevenlabs",
  "/api/stream",
  // /api/voice/transcript is hit from the browser SDK callbacks; the
  // session is set, but treating it as public simplifies replay from
  // service workers later.
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
