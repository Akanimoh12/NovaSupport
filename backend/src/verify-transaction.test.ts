import assert from "node:assert/strict";
import { Horizon } from "@stellar/stellar-sdk";

const horizonUrl = "https://horizon-testnet.stellar.org";
const server = new Horizon.Server(horizonUrl);

async function verifyTransaction(
  txHash: string,
  retries = 3,
  backoffMs = 1000
): Promise<boolean | "error"> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const tx = await server.transactions().transaction(txHash).call();
      return tx.successful === true;
    } catch (e: unknown) {
      if (
        e &&
        typeof e === "object" &&
        "response" in e &&
        e.response &&
        typeof e.response === "object" &&
        "status" in e.response &&
        e.response.status === 404
      ) {
        return false;
      }

      if (attempt < retries) {
        const delay = backoffMs * Math.pow(2, attempt - 1);
        console.warn(`Attempt ${attempt} failed, retrying in ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        console.error("Horizon error after retries:", e);
        return "error";
      }
    }
  }
  return "error";
}

async function runTests() {
  console.log("Running Transaction Verification tests...\n");

  const validHash = "687258079685320c270c5e933454378f8c6eb534e79ec3795c73c33324f9db21";
  console.log("Test 1: Valid transaction verification");
  try {
    const result = await verifyTransaction(validHash);
    assert.strictEqual(result, true, "Known valid transaction should return true");
    console.log("✅ Valid transaction check passed\n");
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error("❌ Valid transaction check failed:", err.message, "\n");
  }

  const invalidHash = "0000000000000000000000000000000000000000000000000000000000000000";
  console.log("Test 2: Invalid transaction hash");
  try {
    const result = await verifyTransaction(invalidHash);
    assert.strictEqual(result, false, "Invalid hash should return false");
    console.log("✅ Invalid transaction check passed (404)\n");
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error("❌ Invalid transaction check failed:", err.message, "\n");
  }

  console.log("Test 3: Verify transaction details");
  try {
    const tx = await server.transactions().transaction(validHash).call();
    assert.strictEqual(tx.successful, true, "Transaction should be successful");
    assert.ok(tx.hash, "Transaction should have a hash");
    assert.ok(tx.ledger, "Transaction should have a ledger");
    console.log("✅ Transaction details verification passed\n");
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error("❌ Transaction details check failed:", err.message, "\n");
  }

  console.log("Test 4: Exponential backoff on network errors");
  const startTime = Date.now();
  try {
    const result = await verifyTransaction(validHash, 2, 100);
    const elapsed = Date.now() - startTime;
    assert.strictEqual(result, true, "Should succeed on first attempt");
    assert.ok(elapsed < 500, "Should not retry on success");
    console.log("✅ Backoff test passed (no retry needed)\n");
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error("❌ Backoff test failed:", err.message, "\n");
  }

  console.log("All tests completed!");
}

runTests().catch(console.error);
