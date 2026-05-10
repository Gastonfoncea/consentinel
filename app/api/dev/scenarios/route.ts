import { NextResponse } from "next/server";
import { demoRequests } from "@/src/demoFixtures";
import { getSharedKernelRuntime } from "@/src/runtime/runtime";
import { getSession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const kernelRuntime = getSharedKernelRuntime();

const SCENARIOS: Record<string, number> = {
  aligned: 0,
  recipient_swap: 1,
  amount_spike: 2,
  claimed_new_wallet: 3,
};

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as { scenario?: string };
  const idx = body.scenario ? SCENARIOS[body.scenario] : undefined;
  if (idx === undefined) {
    return NextResponse.json(
      { error: "unknown scenario", available: Object.keys(SCENARIOS) },
      { status: 400 }
    );
  }

  const fixture = demoRequests[idx]!;

  // Inject the current session's username into request metadata so the
  // kernel binds any resulting step-up to the *real* logged-in user
  // instead of falling back to "alba" (extracted from the seed userId
  // "user_alba"). Without this, when the user verifies the passkey, the
  // session username won't match the challenge owner and the runtime
  // throws "Step-up X is reserved for another user."
  //
  // userId itself stays as "user_alba" so the kernel keeps using the
  // seeded behavior graph history — otherwise every demo run would look
  // like a brand-new user with zero context, breaking the "kernel
  // learns" narrative. Only verification ownership shifts to the
  // session.
  const session = await getSession();
  const sessionUsername = session.username;
  const requestForKernel = sessionUsername
    ? {
        ...fixture,
        metadata: {
          ...(fixture.metadata ?? {}),
          username: sessionUsername,
        },
      }
    : fixture;

  const result = await kernelRuntime.mockExecuteWalletTransfer(requestForKernel);
  return NextResponse.json({ scenario: body.scenario, result });
}
