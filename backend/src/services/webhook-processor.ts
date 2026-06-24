import { prisma } from "../db.js";
import { logger } from "../logger.js";
import { deliverWebhook, shouldRetry, getNextRetryDelay } from "./webhook.js";
import { Metrics } from "../metrics.js";

const MAX_DELIVERY_ATTEMPTS = 3;

export async function processPendingWebhookDeliveries() {
  const now = new Date();

  const pendingDeliveries = await prisma.webhookDelivery.findMany({
    where: {
      status: "pending",
      nextRetryAt: { lte: now },
      attemptCount: { lt: MAX_DELIVERY_ATTEMPTS },
    },
    include: {
      webhook: true,
    },
    take: 50,
  });

  for (const delivery of pendingDeliveries) {
    // Atomically claim the row before delivery to prevent duplicate sends when
    // processPendingWebhookDeliveries is invoked concurrently (e.g., the HTTP
    // handler and the interval timer fire at the same time for the same row).
    // updateMany returns { count: 0 } instead of throwing when the row was
    // already claimed, so we can safely skip it.
    const claimed = await prisma.webhookDelivery.updateMany({
      where: { id: delivery.id, status: "pending" },
      data: { status: "processing" },
    });
    if (claimed.count === 0) continue;

    const payload = delivery.payload as Record<string, unknown>;
    const result = await deliverWebhook(delivery.webhook.url, delivery.webhook.secret, payload);

    if (result.status === "success") {
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "success",
          attemptCount: delivery.attemptCount + 1,
          lastError: null,
        },
      });
      logger.info(
        { deliveryId: delivery.id, webhookId: delivery.webhookId, statusCode: result.statusCode },
        "Webhook delivered successfully",
      );
      Metrics.webhooksDelivered();
    } else {
      const nextAttempt = delivery.attemptCount + 1;
      const willRetry = result.willRetry && shouldRetry(nextAttempt);

      // When permanently failed, nextRetryAt must be explicitly set to null so
      // Prisma writes NULL to the column. Leaving it undefined causes Prisma to
      // omit the field entirely, leaving any previous value in place and causing
      // the processor's `nextRetryAt <= now` query to re-pick the delivery on
      // the next poll cycle (#601).
      let nextRetryAt: Date | null = null;
      if (willRetry) {
        const delayMs = getNextRetryDelay(delivery.attemptCount);
        if (delayMs !== null) {
          nextRetryAt = new Date(Date.now() + delayMs);
        }
      }

      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: willRetry ? "pending" : "failed",
          attemptCount: nextAttempt,
          nextRetryAt,
          lastError: result.error,
        },
      });

      logger.warn(
        {
          deliveryId: delivery.id,
          webhookId: delivery.webhookId,
          attempt: nextAttempt,
          nextRetryAt,
          error: result.error,
        },
        willRetry ? "Webhook delivery failed, scheduled retry" : "Webhook delivery failed permanently"
      );
      if (willRetry) {
        Metrics.webhookRetries();
      }
      Metrics.webhookDeliveryErrors();
    }
  }
}

export type WebhookProcessorHandle = {
  stop(): Promise<void>;
};

let processorInterval: ReturnType<typeof setInterval> | null = null;
let processorInFlight: Promise<void> | null = null;
let processorStopped = true;

function runWebhookProcessorTick(): void {
  processorInFlight = processPendingWebhookDeliveries()
    .catch((err) => {
      logger.error({ err }, "Error in webhook processor run");
    })
    .finally(() => {
      processorInFlight = null;
    });
}

export function startWebhookProcessor(): WebhookProcessorHandle {
  const interval = Number(process.env.WEBHOOK_PROCESSOR_INTERVAL_MS ?? 10000);

  logger.info({ interval }, "Starting webhook processor...");
  processorStopped = false;

  processorInterval = setInterval(() => {
    if (!processorInFlight) {
      runWebhookProcessorTick();
    }
  }, interval);

  return {
    async stop() {
      if (processorStopped) return;
      processorStopped = true;
      if (processorInterval) {
        clearInterval(processorInterval);
        processorInterval = null;
      }
      if (processorInFlight) {
        await processorInFlight;
      }
      logger.info("Webhook processor stopped.");
    },
  };
}
