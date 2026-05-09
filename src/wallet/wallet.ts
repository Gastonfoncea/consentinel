import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  formatUnits,
  http,
  parseUnits,
  type Address,
  type Hex
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const DEFAULT_RPC_URL = "https://sepolia.base.org";

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

export class WalletConfigError extends Error {
  readonly code = "wallet_config_unavailable";

  constructor(message: string) {
    super(message);
    this.name = "WalletConfigError";
  }
}

export interface WalletAvailability {
  available: boolean;
  reason?: string;
  missing: string[];
}

export interface PreparedWalletTransfer {
  kind: "erc20_transfer";
  chainId: typeof baseSepolia.id;
  chain: "baseSepolia";
  asset: "USDC";
  decimals: 6;
  tokenAddress: Address;
  from: Address;
  to: Address;
  amount: string;
  amountBaseUnits: string;
  transaction: {
    to: Address;
    data: Hex;
    value: "0x0";
  };
  explorer: {
    from: string;
    to: string;
    token: string;
  };
}

interface WalletRuntimeConfig {
  rpcUrl: string;
  privateKey: Hex;
  usdcAddress: Address;
}

function readWalletRuntimeConfig(): WalletRuntimeConfig {
  const privateKey = process.env.WALLET_PRIVATE_KEY as Hex | undefined;
  const usdcAddress = process.env.USDC_CONTRACT as Address | undefined;
  const missing: string[] = [];

  if (!privateKey) missing.push("WALLET_PRIVATE_KEY");
  if (!usdcAddress) missing.push("USDC_CONTRACT");

  if (missing.length) {
    throw new WalletConfigError(`Wallet execution config unavailable: missing ${missing.join(", ")}.`);
  }

  const resolvedPrivateKey = privateKey as Hex;
  const resolvedUsdcAddress = usdcAddress as Address;

  return {
    rpcUrl: process.env.RPC_URL ?? DEFAULT_RPC_URL,
    privateKey: resolvedPrivateKey,
    usdcAddress: resolvedUsdcAddress
  };
}

function walletAccount() {
  return privateKeyToAccount(readWalletRuntimeConfig().privateKey);
}

export function getPublicClient() {
  return createPublicClient({
    chain: baseSepolia,
    transport: http(readWalletRuntimeConfig().rpcUrl)
  });
}

function walletClient() {
  return createWalletClient({
    account: walletAccount(),
    chain: baseSepolia,
    transport: http(readWalletRuntimeConfig().rpcUrl)
  });
}

export function describeWalletAvailability(): WalletAvailability {
  const missing: string[] = [];

  if (!process.env.WALLET_PRIVATE_KEY) missing.push("WALLET_PRIVATE_KEY");
  if (!process.env.USDC_CONTRACT) missing.push("USDC_CONTRACT");

  if (missing.length) {
    return {
      available: false,
      reason: `Wallet execution config unavailable: missing ${missing.join(", ")}.`,
      missing
    };
  }

  return {
    available: true,
    missing: []
  };
}

export function getWalletAddress(): Address {
  return walletAccount().address;
}

export function getUsdcAddress(): Address {
  return readWalletRuntimeConfig().usdcAddress;
}

export async function getUsdcBalance(addr: Address = getWalletAddress()): Promise<string> {
  const raw = await getPublicClient().readContract({
    address: getUsdcAddress(),
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [addr]
  });
  return formatUnits(raw, 6);
}

export function prepareUsdcTransfer(to: Address, amountUsdc: string): PreparedWalletTransfer {
  const amountRaw = parseUnits(amountUsdc, 6);
  const tokenAddress = getUsdcAddress();
  const from = getWalletAddress();

  return {
    kind: "erc20_transfer",
    chainId: baseSepolia.id,
    chain: "baseSepolia",
    asset: "USDC",
    decimals: 6,
    tokenAddress,
    from,
    to,
    amount: amountUsdc,
    amountBaseUnits: amountRaw.toString(),
    transaction: {
      to: tokenAddress,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [to, amountRaw]
      }),
      value: "0x0"
    },
    explorer: {
      from: basescanAddrUrl(from),
      to: basescanAddrUrl(to),
      token: basescanAddrUrl(tokenAddress)
    }
  };
}

export async function transferUsdc(to: Address, amountUsdc: string): Promise<Hex> {
  const amountRaw = parseUnits(amountUsdc, 6);
  const hash = await walletClient().writeContract({
    address: getUsdcAddress(),
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
