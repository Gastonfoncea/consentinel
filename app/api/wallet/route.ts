import { NextResponse } from "next/server";
import type { Address } from "viem";
import type { CounterpartyRouteTrust, PermissionContext } from "@/src/domain/types";
import { buildWalletTransferRequest } from "@/src/runtime/requests";
import { getSharedKernelRuntime } from "@/src/runtime/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const kernelRuntime = getSharedKernelRuntime();

export async function GET() {
  try {
    return NextResponse.json(await kernelRuntime.getWalletOverview());
  } catch (err) {
    return NextResponse.json(
      {
        configured: false,
        reason: (err as Error).message
      },
      { status: 200 }
    );
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    mode?: "prepare" | "execute";
    to?: string;
    amount?: string;
    requestId?: string;
    agentId?: string;
    intent?: string;
    counterpartyIdentity?: string;
    counterpartyRouteTrust?: CounterpartyRouteTrust;
    source?: PermissionContext["source"];
    sourceTrust?: PermissionContext["sourceTrust"];
    originalUserRequest?: string;
    expectedCounterparty?: string;
    expectedCounterpartyIdentity?: string;
    expectedCounterpartyRouteTrust?: CounterpartyRouteTrust;
  };

  if (!body.to || !body.amount) {
    return NextResponse.json({ error: "to and amount required" }, { status: 400 });
  }

  const request = buildWalletTransferRequest({
    to: body.to as Address,
    amount: body.amount,
    requestId: body.requestId,
    agentId: body.agentId,
    intent: body.intent,
    counterpartyIdentity: body.counterpartyIdentity,
    counterpartyRouteTrust: body.counterpartyRouteTrust,
    source: body.source,
    sourceTrust: body.sourceTrust,
    originalUserRequest: body.originalUserRequest,
    expectedCounterparty: body.expectedCounterparty,
    expectedCounterpartyIdentity: body.expectedCounterpartyIdentity,
    expectedCounterpartyRouteTrust: body.expectedCounterpartyRouteTrust
  });

  const result =
    body.mode === "prepare"
      ? await kernelRuntime.prepareWalletTransfer(request)
      : await kernelRuntime.mockExecuteWalletTransfer(request);

  return NextResponse.json(result);
}
