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

      let nextRetryAt: Date | undefined;
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

export function startWebhookProcessor() {
  const interval = Number(process.env.WEBHOOK_PROCESSOR_INTERVAL_MS ?? 10000);

  logger.info({ interval }, "Starting webhook processor...");

  setInterval(() => {
    processPendingWebhookDeliveries().catch((err) => {
      logger.error({ err }, "Error in webhook processor interval");
    });
  }, interval);
}
