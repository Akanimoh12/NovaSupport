import type { Horizon } from "@stellar/stellar-sdk";
import { logger } from "../logger.js";

export interface ExpectedTxDetails {
  amount: string;
  recipientAddress: string;
  assetCode: string;
  assetIssuer?: string | null;
}

// Module-level cache shared across all calls in the same process
const verificationCache = new Map<string, { result: boolean; timestamp: number }>();
export const VERIFICATION_CACHE_TTL = 60 * 60 * 1000; // 1 hour

export function clearVerificationCache(): void {
  verificationCache.clear();
}

function makeCacheKey(txHash: string, expected?: ExpectedTxDetails): string {
  if (!expected) return txHash;
  return `${txHash}|${expected.recipientAddress}|${expected.amount}|${expected.assetCode}|${expected.assetIssuer ?? ""}`;
}

function isAssetMatch(
  op: { asset_type: string; asset_code?: string; asset_issuer?: string },
  assetCode: string,
  assetIssuer?: string | null
): boolean {
  const wantNative = assetCode === "XLM" || assetCode === "native";
  if (wantNative) return op.asset_type === "native";
  return op.asset_code === assetCode && op.asset_issuer === (assetIssuer ?? undefined);
}

// Scan the transaction's operations for a payment that matches all expected details.
// Supports `payment`, `create_account` (XLM-only), `path_payment_strict_send`,
// and `path_payment_strict_receive` operation types.
async function validatePaymentDetails(
  server: Horizon.Server,
  txHash: string,
  expected: ExpectedTxDetails
): Promise<boolean> {
  const ops = await server.operations().forTransaction(txHash).call();

  for (const op of ops.records) {
    if (op.type === "payment") {
      const p = op as unknown as {
        to: string;
        amount: string;
        asset_type: string;
        asset_code?: string;
        asset_issuer?: string;
      };
      if (
        p.to === expected.recipientAddress &&
        parseFloat(p.amount) === parseFloat(expected.amount) &&
        isAssetMatch(p, expected.assetCode, expected.assetIssuer)
      ) {
        return true;
      }
    }

    if (op.type === "create_account") {
      const c = op as unknown as { account: string; starting_balance: string };
      const wantNative = expected.assetCode === "XLM" || expected.assetCode === "native";
      if (
        wantNative &&
        c.account === expected.recipientAddress &&
        parseFloat(c.starting_balance) === parseFloat(expected.amount)
      ) {
        return true;
      }
    }

    // Path payments: the destination asset and amount received are what matter
    // for the recipient, not the source asset the sender used.
    if (
      op.type === "path_payment_strict_send" ||
      op.type === "path_payment_strict_receive"
    ) {
      const p = op as unknown as {
        to: string;
        // path_payment_strict_send: amount received by destination
        destination_amount?: string;
        // path_payment_strict_receive: the exact amount the destination receives
        amount?: string;
        asset_type: string;
        asset_code?: string;
        asset_issuer?: string;
      };
      // The received amount field differs between the two op types
      const receivedAmount =
        op.type === "path_payment_strict_receive"
          ? p.amount
          : p.destination_amount;

      if (
        p.to === expected.recipientAddress &&
        receivedAmount !== undefined &&
        parseFloat(receivedAmount) === parseFloat(expected.amount) &&
        isAssetMatch(p, expected.assetCode, expected.assetIssuer)
      ) {
        return true;
      }
    }
  }

  return false;
}

function isHorizon404(e: unknown): boolean {
  return (
    e != null &&
    typeof e === "object" &&
    "response" in e &&
    (e as { response: unknown }).response != null &&
    typeof (e as { response: unknown }).response === "object" &&
    "status" in ((e as { response: unknown }).response as object) &&
    ((e as { response: { status: unknown } }).response.status as number) === 404
  );
}

/**
 * Verify a Stellar transaction against Horizon.
 *
 * @param server   - Horizon.Server instance to query (injectable for testing)
 * @param txHash   - Transaction hash to verify
 * @param retries  - Number of attempts before returning "error" (default 3)
 * @param backoffMs - Base delay in ms; doubled on each retry (default 1000)
 * @param expected  - Optional payment details to validate against on-chain operations
 * @returns
 *   true    — transaction exists, is successful, and (if expected given) details match
 *   false   — transaction not found (404) or details mismatch
 *   "error" — Horizon unreachable after all retries
 */
export async function verifyTransaction(
  server: Horizon.Server,
  txHash: string,
  retries = 3,
  backoffMs = 1000,
  expected?: ExpectedTxDetails
): Promise<boolean | "error"> {
  const cacheKey = makeCacheKey(txHash, expected);
  const cached = verificationCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < VERIFICATION_CACHE_TTL) {
    return cached.result;
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const tx = await server.transactions().transaction(txHash).call();

      if (!tx.successful) {
        return false;
      }

      if (expected) {
        const valid = await validatePaymentDetails(server, txHash, expected);
        if (!valid) {
          return false;
        }
      }

      verificationCache.set(cacheKey, { result: true, timestamp: Date.now() });
      return true;
    } catch (e: unknown) {
      if (isHorizon404(e)) {
        return false;
      }

      if (attempt < retries) {
        const delay = backoffMs * Math.pow(2, attempt - 1);
        logger.warn({ txHash, attempt, delay }, "Horizon verification failed, retrying");
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        logger.error({ txHash, err: e }, "Horizon error verifying transaction after all retries");
      }
    }
  }

  return "error";
}
