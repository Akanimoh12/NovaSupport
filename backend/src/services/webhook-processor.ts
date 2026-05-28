import { prisma } from "../db.js";
import { logger } from "../logger.js";
import { deliverWebhook, shouldRetry, getNextRetryDelay } from "./webhook.js";

export async function processPendingWebhookDeliveries() {
  const now = new Date();

  const pendingDeliveries = await prisma.webhookDelivery.findMany({
    where: {
      status: "pending",
      nextRetryAt: { lte: now },
      attemptCount: { lt: 4 },
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
      logger.info({ deliveryId: delivery.id, statusCode: result.statusCode }, "Webhook delivered successfully");
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
        { deliveryId: delivery.id, attempt: nextAttempt, nextRetryAt, error: result.error },
        willRetry ? "Webhook delivery failed, scheduled retry" : "Webhook delivery failed permanently"
      );
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
