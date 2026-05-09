import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRANSFER_EVENT = {
  type: "event",
  name: "Transfer",
  inputs: [
    { name: "from", type: "address", indexed: true },
    { name: "to", type: "address", indexed: true },
    { name: "value", type: "uint256", indexed: false },
  ],
} as const;

const RECENT_BLOCK_WINDOW = 2_000n;
const TX_LIMIT = 8;

export async function GET() {
  try {
    const wallet = await import("@/src/wallet/wallet");
    const availability = wallet.describeWalletAvailability();
    if (!availability.available) {
      return NextResponse.json({
        configured: false,
        reason: availability.reason,
        missing: availability.missing,
      });
    }

    const publicClient = wallet.getPublicClient();
    const walletAddress = wallet.getWalletAddress();
    const usdcAddress = wallet.getUsdcAddress();
    const { basescanAddrUrl, basescanTxUrl } = wallet;

    const [balance, currentBlock] = await Promise.all([
      wallet.getUsdcBalance(),
      publicClient.getBlockNumber(),
    ]);

    const fromBlock = currentBlock > RECENT_BLOCK_WINDOW
      ? currentBlock - RECENT_BLOCK_WINDOW
      : 0n;

    const [sent, received] = await Promise.all([
      publicClient.getLogs({
        address: usdcAddress,
        event: TRANSFER_EVENT,
        args: { from: walletAddress },
        fromBlock,
        toBlock: currentBlock,
      }),
      publicClient.getLogs({
        address: usdcAddress,
        event: TRANSFER_EVENT,
        args: { to: walletAddress },
        fromBlock,
        toBlock: currentBlock,
      }),
    ]);

    const merged = [...sent, ...received]
      .sort((a, b) => {
        const ab = a.blockNumber ?? 0n;
        const bb = b.blockNumber ?? 0n;
        if (ab === bb) return Number((b.logIndex ?? 0) - (a.logIndex ?? 0));
        return Number(bb - ab);
      })
      .slice(0, TX_LIMIT)
      .map((log) => {
        const isSend = log.args.from?.toLowerCase() === walletAddress.toLowerCase();
        const value = log.args.value ?? 0n;
        const formatted = (Number(value) / 1_000_000).toFixed(2);
        return {
          hash: log.transactionHash,
          direction: isSend ? "out" : "in",
          counterparty: isSend ? log.args.to : log.args.from,
          amount: formatted,
          blockNumber: Number(log.blockNumber ?? 0n),
          basescanUrl: log.transactionHash ? basescanTxUrl(log.transactionHash) : null,
        };
      });

    return NextResponse.json({
      configured: true,
      address: walletAddress,
      addressUrl: basescanAddrUrl(walletAddress),
      balance,
      currency: "USDC",
      blockNumber: Number(currentBlock),
      txs: merged,
    });
  } catch (err) {
    return NextResponse.json(
      {
        configured: false,
        reason: (err as Error).message,
      },
      { status: 200 }
    );
  }
}
