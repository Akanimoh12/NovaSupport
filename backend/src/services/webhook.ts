import { createHmac, timingSafeEqual } from "node:crypto";
import { logger } from "../logger.js";

const BACKOFF_SCHEDULE_SECONDS = [1, 10, 100];
const DELIVERY_TIMEOUT_MS = 10_000;

export type WebhookPayload = Record<string, unknown>;

export type DeliveryResult =
  | { status: "success"; statusCode: number }
  | { status: "failed"; error: string; willRetry: boolean; nextRetryDelayMs?: number };

export function generateSignature(secret: string, payload: WebhookPayload): string {
  const payloadString = JSON.stringify(payload);
  return createHmac("sha256", secret).update(payloadString).digest("hex");
}

export function verifySignature(
  secret: string,
  payload: WebhookPayload,
  signature: string,
): boolean {
  try {
    const expected = generateSignature(secret, payload);
    if (expected.length !== signature.length) return false;
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export async function deliverWebhook(
  url: string,
  secret: string,
  payload: WebhookPayload,
  signal?: AbortSignal,
): Promise<DeliveryResult> {
  const signature = generateSignature(secret, payload);
  const payloadString = JSON.stringify(payload);

  const controller = new AbortController();
  const mergedSignal = signal
    ? combineSignals(signal, controller.signal, DELIVERY_TIMEOUT_MS)
    : AbortSignal.timeout(DELIVERY_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-NovaSupport-Signature": signature,
        "X-NovaSupport-Event": (payload.event as string) ?? "unknown",
      },
      body: payloadString,
      signal: mergedSignal,
    });

    if (response.ok) {
      return { status: "success", statusCode: response.status };
    }
    return {
      status: "failed",
      error: `HTTP ${response.status}`,
      willRetry: response.status >= 500 || response.status === 429,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const isTimeout = message.includes("timeout") || message.includes("aborted");
    const isNetwork =
      message.includes("ENOTFOUND") ||
      message.includes("ECONNREFUSED") ||
      message.includes("ECONNRESET") ||
      message.includes("network") ||
      message.includes("fetch failed");

    return {
      status: "failed",
      error: message,
      willRetry: isTimeout || isNetwork,
    };
  }
}

export function getNextRetryDelay(attemptCount: number): number | null {
  if (attemptCount >= BACKOFF_SCHEDULE_SECONDS.length) return null;
  return BACKOFF_SCHEDULE_SECONDS[attemptCount] * 1000;
}

export function shouldRetry(attemptCount: number): boolean {
  return attemptCount < BACKOFF_SCHEDULE_SECONDS.length;
}

function combineSignals(
  ...signals: (AbortSignal | undefined)[]
): AbortSignal {
  const controller = new AbortController();

  for (const sig of signals) {
    if (!sig) continue;
    if (sig.aborted) {
      controller.abort(sig.reason);
      return controller.signal;
    }
    sig.addEventListener("abort", () => controller.abort(sig.reason), { once: true });
  }

  return controller.signal;
}

export { BACKOFF_SCHEDULE_SECONDS as BACKOFF_SCHEDULE };
