import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getSharedKernelRuntime } from "@/src/runtime/runtime";

export const runtime = "nodejs";

const kernelRuntime = getSharedKernelRuntime();

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    challengeId?: string;
  };

  if (!body.challengeId) {
    return NextResponse.json({ error: "challengeId required" }, { status: 400 });
  }

  const session = await getSession();
  if (!session.username) {
    return NextResponse.json({ error: "login required" }, { status: 401 });
  }

  try {
    const result = await kernelRuntime.cancelPendingStepUp(
      body.challengeId,
      session.username
    );
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}
