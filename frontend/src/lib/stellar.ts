import {
  Asset,
  BASE_FEE,
  Horizon,
  Memo,
  Networks,
  Operation,
  StrKey,
  TransactionBuilder
} from "@stellar/stellar-sdk";

import { HORIZON_URL, STELLAR_NETWORK, NETWORK_PASSPHRASE } from "./config";
import { CONTRACT_ID } from "./config";
import { contractClient } from "./contract-client";

// Re-export wallet utilities so callers can import from a single stellar module.
export { getAvailableWallets, getWalletAdapter } from "./wallet-adapters";
export type { WalletAdapter, WalletId } from "./wallet-adapters";

export const stellarConfig = {
  horizonUrl: HORIZON_URL,
  stellarNetwork: STELLAR_NETWORK,
  networkPassphrase: NETWORK_PASSPHRASE
};


export const horizonServer = new Horizon.Server(stellarConfig.horizonUrl);

export function isValidStellarAddress(address: string): boolean {
  return StrKey.isValidEd25519PublicKey(address);
}

export type ValidationResult = {
  isValid: boolean;
  error?: string;
};

export function validateStellarAddress(rawAddress: string): ValidationResult {
  const address = rawAddress.trim();

  if (!address) {
    return { isValid: false, error: "Wallet address is required" };
  }

  if (address.length < 56) {
    if (address.startsWith("G")) {
      return {
        isValid: false,
        error: `Address is too short — expected 56 characters, got ${address.length}. Stellar addresses always have exactly 56 characters.`,
      };
    }
    return {
      isValid: false,
      error: `Address looks too short (${address.length} chars). A valid Stellar address is exactly 56 characters and starts with "G".`,
    };
  }

  if (address.length > 56) {
    return {
      isValid: false,
      error: `Address is too long — expected 56 characters, got ${address.length}. Check for extra spaces or characters.`,
    };
  }

  if (!address.startsWith("G")) {
    if (/^[A-Z]/.test(address)) {
      return { isValid: false, error: `Stellar public keys must start with 'G', not '${address[0]}'. Check you have the right address type.` };
    }
    return { isValid: false, error: "Stellar public keys must start with the letter 'G' (e.g., GABCDEF...)." };
  }

  // Base32 check (A-Z, 2-7)
  if (!/^[A-Z2-7]+$/.test(address)) {
    const invalidChars = [...new Set(address.split("").filter((c) => !/^[A-Z2-7]$/.test(c)))];
    return {
      isValid: false,
      error: `Contains invalid character${invalidChars.length > 1 ? "s" : ""}: "${invalidChars.join('", "')}". Stellar addresses only use letters A-Z and digits 2-7.`,
    };
  }

  if (!StrKey.isValidEd25519PublicKey(address)) {
    return { isValid: false, error: "Invalid checksum — one or more characters may be wrong. Double-check each character carefully." };
  }

  return { isValid: true };
}

// ─── #274: Stellar network failure handling ─────────────────────────────────
//
// Horizon calls fail in three flavours: transient network errors (timeouts,
// dropped connections), upstream 5xx responses, and 4xx responses we should
// surface immediately. The first two are retryable with exponential backoff;
// the third is a programmer / data error and bubbling it up unchanged is the
// right call.

export type StellarFailureKind =
  | "network"
  | "rate_limited"
  | "server_error"
  | "client_error"
  | "not_found"
  | "unknown";

export interface ClassifiedStellarError {
  kind: StellarFailureKind;
  retryable: boolean;
  /** User-facing copy. Safe to render verbatim. */
  userMessage: string;
  /** Optional HTTP status the upstream returned, when available. */
  status?: number;
}

export function classifyStellarError(error: unknown): ClassifiedStellarError {
  const status = extractStatus(error);
  if (status === 404) {
    return {
      kind: "not_found",
      retryable: false,
      userMessage:
        "The account or transaction was not found on the Stellar network.",
      status,
    };
  }
  if (status === 429) {
    return {
      kind: "rate_limited",
      retryable: true,
      userMessage:
        "The Stellar network is rate-limiting requests. Retrying shortly.",
      status,
    };
  }
  if (typeof status === "number" && status >= 500 && status < 600) {
    return {
      kind: "server_error",
      retryable: true,
      userMessage:
        "Stellar servers are having trouble responding. Retrying shortly.",
      status,
    };
  }
  if (typeof status === "number" && status >= 400 && status < 500) {
    return {
      kind: "client_error",
      retryable: false,
      userMessage:
        "The request was rejected by Stellar. Check your inputs and try again.",
      status,
    };
  }

  const message = errorMessage(error).toLowerCase();
  if (
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("etimedout") ||
    message.includes("econnrefused") ||
    message.includes("fetch failed") ||
    message.includes("aborted")
  ) {
    return {
      kind: "network",
      retryable: true,
      userMessage:
        "Couldn't reach the Stellar network. Retrying — please keep this page open.",
    };
  }

  return {
    kind: "unknown",
    retryable: false,
    userMessage:
      "Something went wrong contacting the Stellar network. Please try again.",
  };
}

function extractStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const e = error as { status?: number; response?: { status?: number } };
  if (typeof e.status === "number") return e.status;
  if (typeof e.response?.status === "number") return e.response.status;
  return undefined;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "";
}

export interface RetryOptions {
  /** Maximum total attempts (initial + retries). Defaults to 4. */
  maxAttempts?: number;
  /** First backoff delay in ms; doubled on each retry. Defaults to 250. */
  baseDelayMs?: number;
  /** Cap each individual sleep to this. Defaults to 4000. */
  maxDelayMs?: number;
  /**
   * Optional callback fired before each retry attempt. The host UI uses this
   * to surface "retrying… (attempt 2 of 4)" copy without leaking the raw
   * error to the user. Index is 1-based.
   */
  onRetry?: (info: {
    attempt: number;
    nextDelayMs: number;
    error: ClassifiedStellarError;
  }) => void;
}

/**
 * Run `fn` with retry + exponential backoff for transient Stellar failures.
 *
 * Non-retryable errors (4xx other than 429, programmer errors) propagate
 * immediately so the caller can surface a precise message. Retryable errors
 * (network, 429, 5xx) sleep with `baseDelayMs * 2^(attempt-1)` plus 0–25%
 * jitter, capped at `maxDelayMs`.
 */
export async function withStellarRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts = 4,
    baseDelayMs = 250,
    maxDelayMs = 4_000,
    onRetry,
  } = options;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const classified = classifyStellarError(err);
      if (!classified.retryable || attempt === maxAttempts) {
        throw err;
      }
      const exp = baseDelayMs * 2 ** (attempt - 1);
      const jittered = exp + Math.floor(Math.random() * exp * 0.25);
      const sleepMs = Math.min(jittered, maxDelayMs);
      onRetry?.({ attempt, nextDelayMs: sleepMs, error: classified });
      await sleep(sleepMs);
    }
  }
  // Unreachable — the for loop either returns or throws.
  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getNetworkLabel(): string {
  return stellarConfig.stellarNetwork === "PUBLIC" ? "Mainnet" : "Testnet";
}

export function getDefaultNetworkPassphrase(): string {
  return stellarConfig.stellarNetwork === "PUBLIC"
    ? Networks.PUBLIC
    : Networks.TESTNET;
}

type SupportIntentInput = {
  sourceAccount: string;
  destination: string;
  amount: string;
  memo?: string;
  assetCode?: string;
  assetIssuer?: string;
  sequence?: string;
};

export async function buildSupportIntent({
  sourceAccount,
  destination,
  amount,
  memo,
  assetCode,
  assetIssuer,
  sequence
}: SupportIntentInput) {
  // Prefer Soroban contract invocation when a contract ID is configured.
  if (CONTRACT_ID) {
    try {
      const contractXdr = await contractClient.buildSupportTransaction({
        sourceAccount,
        destination,
        amount,
        memo,
        assetCode,
        assetIssuer,
        sequence,
      });

      if (contractXdr) return contractXdr;
    } catch (err) {
      // If contract client/build fails, fall back to a native payment transaction.
      // Keep the error local and continue with the payment flow.
      // eslint-disable-next-line no-console
      console.warn("contract build failed, falling back to payment intent:", err);
    }
  }
  const account = sequence
    ? {
        accountId: () => sourceAccount,
        sequenceNumber: () => sequence,
        incrementSequenceNumber: () => undefined
      }
    : await withStellarRetry(() => horizonServer.loadAccount(sourceAccount));

  const asset =
    assetCode && assetIssuer
      ? new Asset(assetCode, assetIssuer)
      : Asset.native();

  const transaction = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: stellarConfig.networkPassphrase
  })
    .addOperation(
      Operation.payment({
        destination,
        asset,
        amount
      })
    )
    .setTimeout(30);

  if (memo) {
    transaction.addMemo(Memo.text(memo));
  }

  return transaction.build().toXDR();
}

export type PathPaymentIntentInput = {
  sourceAccount: string;
  sourceAsset: Asset;
  sourceAmount: string;
  destAsset: Asset;
  destAddress: string;
  slippageTolerance?: number; // default 0.02
  memo?: string;
};

export async function buildPathPaymentIntent({
  sourceAccount,
  sourceAsset,
  sourceAmount,
  destAsset,
  destAddress,
  slippageTolerance = 0.02,
  memo
}: PathPaymentIntentInput) {
  const paths = await withStellarRetry(() =>
    horizonServer.strictSendPaths(sourceAsset, sourceAmount, [destAsset]).call(),
  );

  if (paths.records.length === 0) {
    throw new Error(`No DEX path found from ${sourceAsset.getCode()} to ${destAsset.getCode()}`);
  }

  const bestPath = paths.records[0];
  const estimatedDestAmount = bestPath.destination_amount;
  const destMin = (parseFloat(estimatedDestAmount) * (1 - slippageTolerance)).toFixed(7);

  const account = await withStellarRetry(() =>
    horizonServer.loadAccount(sourceAccount),
  );

  const transaction = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: stellarConfig.networkPassphrase
  })
    .addOperation(
      Operation.pathPaymentStrictSend({
        sendAsset: sourceAsset,
        sendAmount: sourceAmount,
        destination: destAddress,
        destAsset: destAsset,
        destMin: destMin,
        path: bestPath.path.map((p: any) => 
          p.asset_type === 'native' ? Asset.native() : new Asset(p.asset_code, p.asset_issuer)
        )
      })
    )
    .setTimeout(30);

  if (memo) {
    transaction.addMemo(Memo.text(memo));
  }

  return transaction.build().toXDR();
}
