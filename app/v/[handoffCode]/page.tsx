import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { StepUpVerificationCard } from "@/components/step-up-verification-card";
import { getSession } from "@/lib/auth/session";
import { toStepUpChallengeView } from "@/lib/step-up/challenge-view";
import { viewerOwnsStepUp } from "@/lib/step-up/viewer-auth";
import { getSharedKernelRuntime } from "@/src/runtime/runtime";

const kernelRuntime = getSharedKernelRuntime();

export default async function StepUpVerificationPage({
  params
}: {
  params: { handoffCode: string };
}) {
  const stepUp = await kernelRuntime.getPendingStepUpByHandoffCode(params.handoffCode);
  if (!stepUp) {
    notFound();
  }

  const session = await getSession();
  const redirectTo = `/v/${stepUp.handoffCode}`;

  if (!session.username) {
    redirect(`/login?redirectTo=${encodeURIComponent(redirectTo)}&username=${encodeURIComponent(stepUp.verificationUsername)}`);
  }

  if (!viewerOwnsStepUp(stepUp, session.username)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg px-4">
        <div className="w-full max-w-lg rounded-3xl border border-border bg-surface p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
            step-up verification
          </p>
          <h1 className="mt-4 text-2xl font-medium text-text">
            Esta validación pertenece a otra cuenta
          </h1>
          <p className="mt-3 text-sm text-muted">
            El challenge {stepUp.handoffCode} está reservado para <span className="font-mono text-text">{stepUp.verificationUsername}</span>.
          </p>
          <Link
            href={`/login?redirectTo=${encodeURIComponent(redirectTo)}&username=${encodeURIComponent(stepUp.verificationUsername)}`}
            className="mt-6 inline-flex rounded-md border border-stepup bg-stepup/10 px-4 py-2 font-mono text-sm text-stepup transition hover:bg-stepup/20"
          >
            Entrar con la cuenta correcta
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4 py-10">
      <StepUpVerificationCard initialChallenge={toStepUpChallengeView(stepUp)} />
    </main>
  );
}
