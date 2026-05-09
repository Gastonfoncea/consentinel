import { NextResponse } from "next/server";
import { requireStepUpServiceAuth } from "@/lib/step-up/service-auth";
import { getSharedKernelRuntime } from "@/src/runtime/runtime";
import type { StepUpRejectionReason } from "@/src/domain/types";

export const runtime = "nodejs";

const kernelRuntime = getSharedKernelRuntime();

function isReason(value: unknown): value is StepUpRejectionReason {
  return value === "user_denied" || value === "duress";
}

export async function POST(req: Request) {
  const auth = requireStepUpServiceAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await req.json().catch(() => ({}))) as {
    challengeId?: string;
    reason?: StepUpRejectionReason;
  };

  if (!body.challengeId || !isReason(body.reason)) {
    return NextResponse.json(
      { error: "challengeId and valid reason required" },
      { status: 400 }
    );
  }

  try {
    const result = await kernelRuntime.rejectStepUp(body.challengeId, body.reason);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}
