import "dotenv/config";
import {
  getWalletAddress,
  getUsdcAddress,
  getUsdcBalance,
  basescanAddrUrl
} from "./wallet.js";

const walletAddress = getWalletAddress();
const usdcAddress = getUsdcAddress();

console.log(`Wallet:        ${walletAddress}`);
console.log(`USDC contract: ${usdcAddress}`);
console.log(`Balance:       ${await getUsdcBalance()} USDC`);
console.log(`Explorer:      ${basescanAddrUrl(walletAddress)}`);
