import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
  type Address,
  type Hex
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const RPC = process.env.RPC_URL ?? "https://sepolia.base.org";
const PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY as Hex | undefined;
const USDC = process.env.USDC_CONTRACT as Address | undefined;

if (!PRIVATE_KEY) {
  throw new Error("WALLET_PRIVATE_KEY missing in .env");
}
if (!USDC) {
  throw new Error("USDC_CONTRACT missing in .env (deploy MockUSDC first)");
}

const account = privateKeyToAccount(PRIVATE_KEY);

export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(RPC)
});

export const walletClient = createWalletClient({
  account,
  chain: baseSepolia,
  transport: http(RPC)
});

export const walletAddress: Address = account.address;
export const usdcAddress: Address = USDC;

const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }]
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ type: "bool" }]
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }]
  }
] as const;

/**
 * Get USDC balance (formatted as decimal string with 6-decimal precision).
 */
export async function getUsdcBalance(addr: Address = walletAddress): Promise<string> {
  const raw = await publicClient.readContract({
    address: usdcAddress,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [addr]
  });
  return formatUnits(raw, 6);
}

/**
 * Transfer USDC from the demo wallet. `amountUsdc` is a decimal string (e.g. "0.50").
 * Returns the transaction hash.
 */
export async function transferUsdc(to: Address, amountUsdc: string): Promise<Hex> {
  const amountRaw = parseUnits(amountUsdc, 6);
  const hash = await walletClient.writeContract({
    address: usdcAddress,
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [to, amountRaw]
  });
  return hash;
}

export function basescanTxUrl(hash: Hex): string {
  return `https://sepolia.basescan.org/tx/${hash}`;
}

export function basescanAddrUrl(addr: Address): string {
  return `https://sepolia.basescan.org/address/${addr}`;
}
