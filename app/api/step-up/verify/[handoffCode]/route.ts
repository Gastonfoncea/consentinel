import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { toStepUpChallengeView } from "@/lib/step-up/challenge-view";
import { viewerOwnsStepUp } from "@/lib/step-up/viewer-auth";
import { getSharedKernelRuntime } from "@/src/runtime/runtime";

export const runtime = "nodejs";

const kernelRuntime = getSharedKernelRuntime();

export async function GET(_req: Request, context: { params: { handoffCode: string } }) {
  const stepUp = await kernelRuntime.getPendingStepUpByHandoffCode(context.params.handoffCode);
  if (!stepUp) {
    return NextResponse.json({ error: "unknown challenge" }, { status: 404 });
  }

  const session = await getSession();
  if (!session.username) {
    return NextResponse.json({ error: "login required" }, { status: 401 });
  }

  if (!viewerOwnsStepUp(stepUp, session.username)) {
    return NextResponse.json(
      {
        error: "this challenge belongs to another user",
        expectedUsername: stepUp.verificationUsername
      },
      { status: 403 }
    );
  }

  return NextResponse.json({
    challenge: toStepUpChallengeView(stepUp)
  });
}
