import assert from "node:assert/strict";
import test from "node:test";
import { describeWalletAvailability, prepareUsdcTransfer, WalletConfigError } from "./wallet.js";

const originalPrivateKey = process.env.WALLET_PRIVATE_KEY;
const originalUsdcContract = process.env.USDC_CONTRACT;

function setWalletEnv() {
  process.env.WALLET_PRIVATE_KEY = "0x1111111111111111111111111111111111111111111111111111111111111111";
  process.env.USDC_CONTRACT = "0x2222222222222222222222222222222222222222";
}

function restoreWalletEnv() {
  if (originalPrivateKey === undefined) {
    delete process.env.WALLET_PRIVATE_KEY;
  } else {
    process.env.WALLET_PRIVATE_KEY = originalPrivateKey;
  }

  if (originalUsdcContract === undefined) {
    delete process.env.USDC_CONTRACT;
  } else {
    process.env.USDC_CONTRACT = originalUsdcContract;
  }
}

test("prepareUsdcTransfer returns deterministic ERC-20 calldata", () => {
  setWalletEnv();

  const prepared = prepareUsdcTransfer("0x9f2c4a6b8d0e1f2233445566778899aabbccddee", "20");

  assert.equal(prepared.chainId, 84532);
  assert.equal(prepared.transaction.to, "0x2222222222222222222222222222222222222222");
  assert.equal(prepared.amountBaseUnits, "20000000");
  assert.equal(prepared.transaction.value, "0x0");
  assert.match(prepared.transaction.data, /^0xa9059cbb[a-f0-9]+$/);

  restoreWalletEnv();
});

test("wallet availability exposes missing env vars without crashing", () => {
  delete process.env.WALLET_PRIVATE_KEY;
  delete process.env.USDC_CONTRACT;

  const availability = describeWalletAvailability();

  assert.equal(availability.available, false);
  assert.ok(availability.reason);
  assert.deepEqual(availability.missing, ["WALLET_PRIVATE_KEY", "USDC_CONTRACT"]);
  assert.throws(
    () => prepareUsdcTransfer("0x9f2c4a6b8d0e1f2233445566778899aabbccddee", "20"),
    WalletConfigError
  );

  restoreWalletEnv();
});
