import { NextResponse } from "next/server";
import { requireStepUpServiceAuth } from "@/lib/step-up/service-auth";
import { getSharedKernelRuntime } from "@/src/runtime/runtime";

export const runtime = "nodejs";

const kernelRuntime = getSharedKernelRuntime();

export async function POST(req: Request) {
  const auth = requireStepUpServiceAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await req.json().catch(() => ({}))) as {
    challengeId?: string;
    provider?: "elevenlabs" | "manual";
  };

  if (!body.challengeId) {
    return NextResponse.json({ error: "challengeId required" }, { status: 400 });
  }

  try {
    const result = await kernelRuntime.confirmPhoneStepUp(
      body.challengeId,
      body.provider ?? "elevenlabs"
    );
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}
