"use client";

import { useEffect, useState, useCallback, KeyboardEvent } from "react";
import { useToast } from "@/lib/use-toast";
import { signTransaction } from "@stellar/freighter-api";
import {
  Asset as StellarAsset,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import {
  buildSupportIntent,
  buildPathPaymentIntent,
  getNetworkLabel,
  horizonServer,
  stellarConfig,
  withStellarRetry,
  classifyStellarError,
} from "@/lib/stellar";
import { WalletConnect } from "./wallet-connect";
import { TransactionResultModal } from "./transaction-result-modal";
import { API_BASE_URL } from "@/lib/config";
import { formatRateLimitedMessage, parseRateLimitInfo } from "@/lib/rate-limit";

type Asset = {
  code: string;
  issuer?: string | null;
};

type SupportPanelProps = {
  walletAddress: string;
  acceptedAssets?: Asset[];
  profileId?: string;
  recipientDisplayName?: string;
};

export function SupportPanel({
  walletAddress,
  acceptedAssets,
  profileId,
  recipientDisplayName = "Creator",
}: SupportPanelProps) {
  const paymentAssetSelectId = "support-payment-asset";
  const amountInputId = "support-amount";
  const amountErrorId = "support-amount-error";
  const balanceErrorId = "support-balance-error";
  const messageInputId = "support-message";
  const recurringToggleId = "support-recurring-toggle";
  const frequencyGroupId = "support-frequency";

  const [visitorAddress, setVisitorAddress] = useState<string | null>(null);
  const [visitorBalances, setVisitorBalances] = useState<any[]>([]);
  const [paymentAsset, setPaymentAsset] = useState<{
    code: string;
    issuer?: string;
  } | null>(null);
  const [amount, setAmount] = useState("");
  const [isSigning, setIsSigning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [signedXdr, setSignedXdr] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submittedHash, setSubmittedHash] = useState<string | null>(null);
  const [showResultModal, setShowResultModal] = useState(false);
  const [submissionNote, setSubmissionNote] = useState<string | null>(null);
  const [lastTxDetails, setLastTxDetails] = useState<{
    amount: string;
    assetCode: string;
  } | null>(null);
  const [estimatedReceived, setEstimatedReceived] = useState<string | null>(
    null,
  );
  const [isFindingPath, setIsFindingPath] = useState(false);
  const [noPathFound, setNoPathFound] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);
  const [frequency, setFrequency] = useState<"weekly" | "monthly">("monthly");
  const [recurringError, setRecurringError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [isAccountFunded, setIsAccountFunded] = useState(true);
  const [isBalanceLoading, setIsBalanceLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [retryStatus, setRetryStatus] = useState<string | null>(null);
  const { showToast } = useToast();

  const networkLabel = getNetworkLabel();

  const recipientAsset = acceptedAssets?.[0] || { code: "XLM" };
  const amountNum = parseFloat(amount);
  
  const selectedBalance = visitorBalances.find(b => 
    paymentAsset?.code === "XLM" 
      ? b.asset_type === "native" 
      : b.asset_code === paymentAsset?.code && b.asset_issuer === paymentAsset?.issuer
  );
  const availableBalance = selectedBalance ? parseFloat(selectedBalance.balance) : 0;
  
  const isValidAmount = amountNum > 0;
  const isOverBalance = amountNum > availableBalance;
  const showError = amount !== "" && !isValidAmount;
  const isProcessing = isSigning || isSubmitting || isFindingPath;

  const handleCopy = useCallback(async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(walletAddress);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = walletAddress;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const successful = document.execCommand("copy");
        document.body.removeChild(textArea);
        if (!successful) throw new Error("Fallback copy failed");
      }
      showToast("Recipient address copied!", "success");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Copy failed", err);
      showToast("Failed to copy address", "error");
    }
  }, [walletAddress, showToast]);

  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "c") {
      e.preventDefault();
      handleCopy();
    }
  };

  useEffect(() => {
    if (visitorAddress) {
      setIsBalanceLoading(true);
      setIsAccountFunded(true);
      setRetryStatus(null);
      withStellarRetry(
        () => horizonServer.loadAccount(visitorAddress),
        {
          onRetry: (info) => {
            setRetryStatus(
              `Stellar network issue — retrying (attempt ${info.attempt + 1} of 4)…`
            );
          },
        },
      )
        .then((acc) => {
          const balances = acc.balances.filter(
            (b: any) => parseFloat(b.balance) > 0 || b.asset_type === "native",
          );
          setVisitorBalances(balances);
          const xlm = balances.find((b: any) => b.asset_type === "native");
          if (xlm) {
            setPaymentAsset({ code: "XLM" });
          } else if (balances.length > 0) {
            const firstBalance = balances[0] as any;
            if (firstBalance.asset_type !== "native") {
              setPaymentAsset({
                code: firstBalance.asset_code,
                issuer: firstBalance.asset_issuer,
              });
            }
          }
          setRetryStatus(null);
        })
        .catch((err: any) => {
          if (err?.response?.status === 404) {
            setIsAccountFunded(false);
          }
          const classified = classifyStellarError(err);
          if (classified.retryable) {
            setRetryStatus(null);
            setErrorMessage(
              "Could not connect to the Stellar network. Please check your connection and try again."
            );
          }
          console.error("Failed to load visitor account", err);
        })
        .finally(() => {
          setIsBalanceLoading(false);
        });
    } else {
      setVisitorBalances([]);
      setPaymentAsset(null);
    }
  }, [visitorAddress]);

  useEffect(() => {
    const findPath = async () => {
      if (!visitorAddress || !paymentAsset || !isValidAmount) {
        setEstimatedReceived(null);
        setNoPathFound(false);
        return;
      }

      const isSameAsset =
        paymentAsset.code === recipientAsset.code &&
        (paymentAsset.code === "XLM" ||
          paymentAsset.issuer === recipientAsset.issuer);

      if (isSameAsset) {
        setEstimatedReceived(amount);
        setNoPathFound(false);
        return;
      }

      setIsFindingPath(true);
      setNoPathFound(false);
      setErrorMessage(null);
      try {
        const sourceAsset =
          paymentAsset.code === "XLM"
            ? StellarAsset.native()
            : new StellarAsset(paymentAsset.code, paymentAsset.issuer!);
        const destAsset =
          recipientAsset.code === "XLM"
            ? StellarAsset.native()
            : new StellarAsset(recipientAsset.code, recipientAsset.issuer!);

        const paths = await withStellarRetry(
          () => horizonServer.strictSendPaths(sourceAsset, amount, [destAsset]).call(),
          {
            onRetry: (info) => {
              setErrorMessage(
                `Finding exchange path — retrying (attempt ${info.attempt + 1} of 4)…`
              );
            },
          },
        );
        if (paths.records.length > 0) {
          setEstimatedReceived(paths.records[0].destination_amount);
        } else {
          setNoPathFound(true);
          setEstimatedReceived(null);
        }
        setErrorMessage(null);
      } catch (err) {
        const classified = classifyStellarError(err);
        setErrorMessage(classified.userMessage);
        setNoPathFound(true);
        console.error("Pathfinding error", err);
      } finally {
        setIsFindingPath(false);
      }
    };

    const timer = setTimeout(findPath, 500);
    return () => clearTimeout(timer);
  }, [visitorAddress, paymentAsset, amount, recipientAsset, isValidAmount]);

  function truncateHash(hash: string) {
    return `${hash.slice(0, 8)}...${hash.slice(-8)}`;
  }

  function mapHorizonError(error: unknown): string {
    const resultCodes =
      error &&
      typeof error === "object" &&
      "response" in error &&
      error.response &&
      typeof error.response === "object" &&
      "data" in error.response &&
      error.response.data &&
      typeof error.response.data === "object" &&
      "extras" in error.response.data &&
      error.response.data.extras &&
      typeof error.response.data.extras === "object" &&
      "result_codes" in error.response.data.extras
        ? (error.response.data.extras.result_codes as {
            transaction?: string;
            operations?: string[];
          })
        : null;

    const operationCode = resultCodes?.operations?.[0];
    const transactionCode = resultCodes?.transaction;

    if (operationCode === "op_underfunded") {
      return "Insufficient balance";
    }
    if (transactionCode === "tx_too_late") return "Transaction expired";
    if (transactionCode === "tx_bad_seq")
      return "Transaction sequence is out of date. Please try again.";
    if (transactionCode === "tx_insufficient_balance")
      return "Insufficient balance";
    if (transactionCode === "tx_bad_auth" || operationCode === "op_bad_auth")
      return "Authorization failed. Please reconnect Freighter and try again.";

    if (error instanceof Error && error.message) return error.message;
    return "Unable to submit transaction to Stellar. Please try again.";
  }

  function mapFreighterError(error: unknown): string {
    const msg =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "";

    const lower = msg.toLowerCase();

    if (
      lower.includes("user declined") ||
      lower.includes("user rejected") ||
      lower.includes("rejected") ||
      lower.includes("declined")
    ) {
      return "You declined the transaction in Freighter.";
    }

    if (
      lower.includes("not installed") ||
      lower.includes("no freighter") ||
      lower.includes("freighter is not")
    ) {
      return "Freighter is not installed. Please install the Freighter browser extension and try again.";
    }

    if (lower.includes("not allowed") || lower.includes("permission")) {
      return "Freighter access was not granted. Please allow the site in Freighter and try again.";
    }

    return msg || "Freighter did not return a signed transaction.";
  }

  async function handleSendSupport() {
    if (!visitorAddress || !isValidAmount || isProcessing || noPathFound) {
      return;
    }

    // Full on-chain flow for issue #179:
    // 1. Build transaction XDR with buildSupportIntent()
    // 2. Sign with Freighter's signTransaction()
    // 3. Broadcast to Horizon with submitTransaction()
    // 4. Record in backend via POST /support-transactions
    // 5. Show success modal with transaction hash

    setErrorMessage(null);
    setSubmittedHash(null);
    setSignedXdr(null);
    setRecurringError(null);
    setSubmissionNote(null);
    setIsSigning(true);

    let resolvedSignedXdr: string;

    try {
      const isSameAsset =
        paymentAsset?.code === recipientAsset.code &&
        (paymentAsset?.code === "XLM" ||
          paymentAsset?.issuer === recipientAsset.issuer);

      let unsignedXdr: string;

      if (isSameAsset) {
        unsignedXdr = await buildSupportIntent({
          sourceAccount: visitorAddress,
          destination: walletAddress,
          amount,
          memo: message || undefined,
          assetCode: recipientAsset?.issuer ? recipientAsset.code : undefined,
          assetIssuer: recipientAsset?.issuer ?? undefined,
        });
      } else {
        const sourceAsset =
          paymentAsset?.code === "XLM"
            ? StellarAsset.native()
            : new StellarAsset(paymentAsset!.code, paymentAsset!.issuer!);
        const destAsset =
          recipientAsset.code === "XLM"
            ? StellarAsset.native()
            : new StellarAsset(recipientAsset.code, recipientAsset.issuer!);

        unsignedXdr = await buildPathPaymentIntent({
          sourceAccount: visitorAddress,
          sourceAsset,
          sourceAmount: amount,
          destAsset,
          destAddress: walletAddress,
          memo: message || undefined,
        });
      }

      // Open Freighter signing prompt — user sees "Waiting for Freighter signature…"
      const signedResult = await signTransaction(unsignedXdr, {
        address: visitorAddress,
        networkPassphrase: stellarConfig.networkPassphrase,
      });

      if (signedResult.error || !signedResult.signedTxXdr) {
        throw new Error(
          signedResult.error ||
            "Freighter did not return a signed transaction.",
        );
      }

      // Transaction signed successfully
      console.log("Transaction signed by Freighter");

      // Store the signed XDR in state for the broadcast step
      resolvedSignedXdr = signedResult.signedTxXdr;
      setSignedXdr(resolvedSignedXdr);
    } catch (signingError) {
      setErrorMessage(mapFreighterError(signingError));
      setIsSigning(false);
      return;
    }

    setIsSigning(false);
    setIsSubmitting(true);

    let response: any;
    try {
      setRetryStatus(null);
      const transactionToSubmit = TransactionBuilder.fromXDR(
        resolvedSignedXdr,
        stellarConfig.networkPassphrase,
      );

      response = await withStellarRetry(
        () => horizonServer.submitTransaction(transactionToSubmit),
        {
          onRetry: (info) => {
            setRetryStatus(
              `Submitting to Stellar network — retrying (attempt ${info.attempt + 1} of 4)…`
            );
          },
        },
      );

      setRetryStatus(null);
      console.log("Transaction submitted to Horizon:", response.hash);
      let displayHash = response.hash;

      // Record confirmed on-chain transaction in the backend
      if (profileId) {
        const recordInBackend = async (retries = 3, backoffMs = 1000) => {
          for (let attempt = 1; attempt <= retries; attempt++) {
            try {
              const token = localStorage.getItem("authToken");
              const backendRes = await fetch(`${API_BASE_URL}/support-transactions`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                  txHash: response.hash,
                  amount,
                  assetCode: paymentAsset?.code || "XLM",
                  recipientAddress: walletAddress,
                  profileId,
                  message: message || undefined,
                  memo: message || undefined,
                }),
              });

              if (backendRes.status === 503 && attempt < retries) {
                const delay = backoffMs * Math.pow(2, attempt - 1);
                console.warn(`Backend 503, retrying in ${delay}ms (attempt ${attempt}/${retries})`);
                await new Promise(r => setTimeout(r, delay));
                continue;
              }

              if (!backendRes.ok) {
                const data = await backendRes.json().catch(() => ({}));
                if (backendRes.status === 429) {
                  showToast(
                    formatRateLimitedMessage(parseRateLimitInfo(backendRes.headers)),
                    "error",
                  );
                } else if (backendRes.status === 409) {
                  const duplicateHash =
                    typeof data.existingTxHash === "string"
                      ? data.existingTxHash
                      : response.hash;
                  displayHash = duplicateHash;
                  setSubmissionNote("This transaction was already recorded");
                  showToast("This transaction was already recorded", "success");
                } else {
                  console.error("Failed to record transaction in backend", data);
                }
              } else {
                console.log("Transaction recorded in backend database");
              }
              break; // Success or non-retryable error
            } catch (backendErr) {
              if (attempt < retries) {
                const delay = backoffMs * Math.pow(2, attempt - 1);
                console.warn(`Backend connection error, retrying in ${delay}ms (attempt ${attempt}/${retries})`, backendErr);
                await new Promise(r => setTimeout(r, delay));
              } else {
                console.error("Backend record error after retries", backendErr);
              }
            }
          }
        };

        await recordInBackend();
      }

      setSubmittedHash(displayHash);
      setLastTxDetails({
        amount: amount,
        assetCode: paymentAsset?.code || "XLM",
      });
      setShowResultModal(true);

      // If recurring is enabled, set up the drip
      if (isRecurring && profileId) {
        try {
          const token = localStorage.getItem("authToken");
          const recurringResponse = await fetch(
            `${API_BASE_URL}/recurring-support`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              body: JSON.stringify({
                supporterAddress: visitorAddress,
                recipientAddress: walletAddress,
                profileId,
                amount,
                assetCode: recipientAsset?.code || "XLM",
                assetIssuer: recipientAsset?.issuer,
                frequency,
                message: message || undefined,
              }),
            },
          );

          if (!recurringResponse.ok) {
            if (recurringResponse.status === 429) {
              showToast(
                formatRateLimitedMessage(
                  parseRateLimitInfo(recurringResponse.headers),
                ),
                "error",
              );
              throw new Error("Rate limited");
            }
            throw new Error("Failed to set up recurring support");
          }
        } catch (recurringErr) {
          setRecurringError(
            "On-chain payment succeeded, but drip setup failed. Please try setting up recurring support again.",
          );
        }
      }

      setAmount("");
      setRetryStatus(null);
    } catch (error) {
      const classified = classifyStellarError(error);
      if (classified.kind === "network" || classified.kind === "server_error" || classified.kind === "rate_limited") {
        setRetryStatus(null);
        setErrorMessage(
          "Unable to reach the Stellar network after multiple attempts. Your transaction is still in your wallet — please try again later."
        );
      } else {
        setErrorMessage(mapHorizonError(error));
      }
    } finally {
      setIsSigning(false);
      setIsSubmitting(false);
    }
  }

  if (!visitorAddress) {
    return (
      <section className="rounded-[2rem] border border-gold/25 bg-gold/10 p-7 text-center">
        <div className="mb-4">
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
            {networkLabel}
          </span>
        </div>
        <p className="mb-4 text-sm text-sky/85">
          Connect your Freighter wallet to support this creator.
        </p>
        <WalletConnect onConnect={setVisitorAddress} />
      </section>
    );
  }

  return (
    <section className="rounded-[2rem] border border-gold/25 bg-gold/10 p-7">
      <div className="mb-4">
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
          {networkLabel}
        </span>
      </div>

      <div className="mb-6">
        <p className="text-xs uppercase tracking-[0.25em] text-gold mb-2">
          Recipient Address
        </p>
        <div className="flex items-center p-3 rounded-xl bg-white/5 border border-white/10 group">
          <code 
            onKeyDown={handleKeyDown}
            tabIndex={0}
            aria-label={`Recipient Stellar wallet address: ${walletAddress}. Press Ctrl+C to copy.`}
            className="text-xs text-indigo-400 font-mono break-all flex-1 focus:outline-none focus:ring-1 focus:ring-mint/50 rounded p-1"
          >
            {walletAddress}
          </code>
          <button 
            onClick={handleCopy}
            aria-label="Copy recipient address to clipboard"
            title="Copy to clipboard"
            className="ml-2 p-1.5 text-gray-400 hover:text-white transition-colors focus:outline-none focus:ring-1 focus:ring-mint/50 rounded"
          >
            {copied ? (
              <span className="text-mint flex items-center gap-1 text-[10px] font-bold">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Copied
              </span>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 12-2h2a2 2 0 12 2m0 0h2a2 2 0 12 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
              </svg>
            )}
          </button>
        </div>
      </div>

      <p className="text-xs uppercase tracking-[0.25em] text-gold">
        Support intent
      </p>
      <h2 className="mt-3 text-2xl font-semibold text-white">
        Select assets & support
      </h2>

      <div className="mt-6 space-y-4">
        {/* Payment Asset Selector */}
        <div>
          <label
            htmlFor={paymentAssetSelectId}
            className="text-xs uppercase tracking-[0.2em] text-sky/70 block mb-2"
          >
            Pay with
          </label>
          <select
            id={paymentAssetSelectId}
            aria-label="Payment asset"
            value={
              paymentAsset
                ? paymentAsset.code === "XLM"
                  ? "native"
                  : `${paymentAsset.code}:${paymentAsset.issuer}`
                : ""
            }
            onChange={(e) => {
              const val = e.target.value;
              if (val === "native") setPaymentAsset({ code: "XLM" });
              else {
                const [code, issuer] = val.split(":");
                setPaymentAsset({ code, issuer });
              }
            }}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-mint/50 focus:outline-none appearance-none"
          >
            {visitorBalances.map((b: any) => (
              <option
                key={
                  b.asset_type === "native"
                    ? "native"
                    : `${b.asset_code}:${b.asset_issuer}`
                }
                value={
                  b.asset_type === "native"
                    ? "native"
                    : `${b.asset_code}:${b.asset_issuer}`
                }
                className="bg-ink text-white"
              >
                {b.asset_type === "native" ? "XLM" : b.asset_code} (
                {parseFloat(b.balance).toFixed(2)})
              </option>
            ))}
          </select>
        </div>

        {/* Amount Input */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label
              htmlFor={amountInputId}
              className="text-xs uppercase tracking-[0.2em] text-sky/70"
            >
              Amount
            </label>
            {visitorAddress && (
              <div
                className="text-[10px] font-medium text-sky/50"
                aria-live="polite"
                aria-atomic="true"
              >
                {isBalanceLoading ? (
                  <span className="animate-pulse">Fetching balance...</span>
                ) : !isAccountFunded ? (
                  <a 
                    href="https://laboratory.stellar.org/#friendbot" 
                    target="_blank" 
                    className="text-yellow-500 hover:underline"
                  >
                    Account not funded (Testnet)
                  </a>
                ) : (
                  <span>Available: {availableBalance.toFixed(2)} {paymentAsset?.code || "XLM"}</span>
                )}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <input
              id={amountInputId}
              type="number"
              min="0.0000001"
              step="0.0000001"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-label="Support amount"
              aria-describedby={`${amountErrorId} ${balanceErrorId}`}
              aria-invalid={Boolean(showError || (isOverBalance && isValidAmount))}
              className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-sky/50 focus:border-mint/50 focus:outline-none"
            />
            <div className="flex items-center rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-sky/80 min-w-[80px] justify-center">
              <span className="font-semibold text-white">
                {paymentAsset?.code || "XLM"}
              </span>
            </div>
          </div>
          {showError && (
            <p id={amountErrorId} className="mt-2 text-xs text-red-400">
              Please enter a positive amount
            </p>
          )}
          {isOverBalance && isValidAmount && (
            <p id={balanceErrorId} className="mt-2 text-xs text-red-400">
              Insufficient balance (Limit: {availableBalance.toFixed(7)})
            </p>
          )}
        </div>

        {estimatedReceived && (
          <div className="p-3 rounded-xl bg-white/5 border border-white/5">
            <p className="text-xs text-mint text-center">
              Creator receives ~{parseFloat(estimatedReceived).toFixed(4)}{" "}
              {recipientAsset.code}
            </p>
          </div>
        )}

        {noPathFound && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
            <p className="text-xs text-red-400 text-center">
              No DEX path found from {paymentAsset?.code} to{" "}
              {recipientAsset.code}
            </p>
          </div>
        )}
      </div>

      {/* Message Input */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-2">
          <label
            htmlFor={messageInputId}
            className="text-xs uppercase tracking-[0.2em] text-sky/70"
          >
            Leave a message (optional)
          </label>
          <span className={`text-[10px] font-medium ${message.length >= 28 ? 'text-red-400' : 'text-sky/40'}`}>
            {message.length} / 28
          </span>
        </div>
        <textarea
          id={messageInputId}
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, 28))}
          placeholder="e.g. Keep up the great work!"
          rows={2}
          aria-label="Optional message to the creator"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-sky/30 focus:border-mint/50 focus:outline-none resize-none"
        />
      </div>

      {/* Recurring Support Toggle */}
      <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            id={recurringToggleId}
            type="checkbox"
            checked={isRecurring}
            onChange={(e) => setIsRecurring(e.target.checked)}
            aria-label="Make support recurring"
            className="h-4 w-4 rounded border-white/20 bg-white/10 text-mint focus:ring-mint focus:ring-offset-0"
          />
          <span className="text-sm text-white font-medium">
            Make it recurring
          </span>
        </label>

        {isRecurring && (
          <div className="mt-4">
            <label
              id={frequencyGroupId}
              className="text-xs uppercase tracking-[0.2em] text-sky/70 block mb-2"
            >
              Frequency
            </label>
            <div className="flex gap-2" role="group" aria-labelledby={frequencyGroupId}>
              <button
                type="button"
                onClick={() => setFrequency("weekly")}
                aria-label="Set recurring frequency to weekly"
                className={`flex-1 rounded-xl px-4 py-2 text-sm font-medium transition ${
                  frequency === "weekly"
                    ? "bg-mint text-ink"
                    : "border border-white/10 bg-white/5 text-white hover:bg-white/10"
                }`}
              >
                Weekly
              </button>
              <button
                type="button"
                onClick={() => setFrequency("monthly")}
                aria-label="Set recurring frequency to monthly"
                className={`flex-1 rounded-xl px-4 py-2 text-sm font-medium transition ${
                  frequency === "monthly"
                    ? "bg-mint text-ink"
                    : "border border-white/10 bg-white/5 text-white hover:bg-white/10"
                }`}
              >
                Monthly
              </button>
            </div>
          </div>
        )}
      </div>

      {retryStatus && (
        <div className="mt-4 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200 flex items-center gap-2">
          <svg className="animate-spin h-3.5 w-3.5 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          {retryStatus}
        </div>
      )}

      {errorMessage && (
        <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {errorMessage}
        </div>
      )}

      {recurringError && (
        <div className="mt-4 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
          {recurringError}
        </div>
      )}


      <button
        type="button"
        onClick={handleSendSupport}
        disabled={!isValidAmount || isProcessing || noPathFound || isOverBalance || !isAccountFunded}
        aria-label={
          isSubmitting
            ? "Submitting to Stellar network"
            : isSigning
              ? "Waiting for Freighter signature"
              : isFindingPath
                ? "Finding best exchange path"
                : `Send support to ${recipientDisplayName}`
        }
        aria-busy={isProcessing}
        className="mt-6 w-full rounded-full bg-mint px-5 py-3 text-sm font-semibold text-ink transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-mint flex items-center justify-center gap-2"
      >
        {isProcessing && (
          <svg
            className="animate-spin h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        <span>
          {isSubmitting
            ? "Submitting to Stellar network…"
            : isSigning
              ? "Waiting for Freighter signature…"
              : isFindingPath
                ? "Finding best exchange path…"
                : "Send Support"}
        </span>
      </button>

      {/* Transaction Result Modal */}
      <TransactionResultModal
        isOpen={showResultModal}
        onClose={() => {
          setShowResultModal(false);
          setAmount("");
          setMessage("");
          setSubmittedHash(null);
          setErrorMessage(null);
          setRecurringError(null);
          setSubmissionNote(null);
        }}
        txHash={submittedHash}
        amount={lastTxDetails?.amount || ""}
        assetCode={lastTxDetails?.assetCode || "XLM"}
        recipientDisplayName={recipientDisplayName}
        note={submissionNote}
      />
    </section>
  );
}
