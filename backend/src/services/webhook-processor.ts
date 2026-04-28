import { createHmac } from "node:crypto";
import { prisma } from "../db.js";
import { logger } from "../logger.js";
import { Prisma } from "@prisma/client";

const BACKOFF_SCHEDULE = [1, 10, 100]; // in seconds

export async function processPendingWebhookDeliveries() {
  const now = new Date();

  const pendingDeliveries = await prisma.webhookDelivery.findMany({
    where: {
      status: "pending",
      nextRetryAt: { lte: now },
      attemptCount: { lt: BACKOFF_SCHEDULE.length + 1 },
    },
    include: {
      webhook: true,
    },
    take: 50,
  });

  for (const delivery of pendingDeliveries) {
    try {
      const payloadString = JSON.stringify(delivery.payload);
      const signature = createHmac("sha256", delivery.webhook.secret)
        .update(payloadString)
        .digest("hex");

      const response = await fetch(delivery.webhook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-NovaSupport-Signature": signature,
        },
        body: payloadString,
        signal: AbortSignal.timeout(10_000),
      });

      if (response.ok) {
        await prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            status: "success",
            attemptCount: delivery.attemptCount + 1,
            nextRetryAt: null,
            lastError: null,
          },
        });
        logger.info({ deliveryId: delivery.id, status: response.status }, "Webhook delivered successfully");
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error: any) {
      const nextAttempt = delivery.attemptCount + 1;
      const isFinalAttempt = nextAttempt >= BACKOFF_SCHEDULE.length + 1;
      
      let nextRetryAt = null;
      if (!isFinalAttempt) {
        const delaySec = BACKOFF_SCHEDULE[delivery.attemptCount];
        nextRetryAt = new Date(Date.now() + delaySec * 1000);
      }

      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: isFinalAttempt ? "failed" : "pending",
          attemptCount: nextAttempt,
          nextRetryAt,
          lastError: error.message || String(error),
        },
      });

      logger.warn(
        { deliveryId: delivery.id, attempt: nextAttempt, nextRetryAt, err: error },
        isFinalAttempt ? "Webhook delivery failed permanently" : "Webhook delivery failed, scheduled retry"
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
