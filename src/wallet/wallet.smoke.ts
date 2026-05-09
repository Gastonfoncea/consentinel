import "dotenv/config";
import {
  walletAddress,
  usdcAddress,
  getUsdcBalance,
  basescanAddrUrl
} from "./wallet.js";

console.log(`Wallet:        ${walletAddress}`);
console.log(`USDC contract: ${usdcAddress}`);
console.log(`Balance:       ${await getUsdcBalance()} USDC`);
console.log(`Explorer:      ${basescanAddrUrl(walletAddress)}`);
