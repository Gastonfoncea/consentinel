import { NextResponse } from "next/server";
import { demoRequests } from "@/src/demoFixtures";
import { getSharedKernelRuntime } from "@/src/runtime/runtime";

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
  const result = await kernelRuntime.mockExecuteWalletTransfer(fixture);
  return NextResponse.json({ scenario: body.scenario, result });
}
