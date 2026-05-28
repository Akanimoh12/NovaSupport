import crypto from "crypto";
import { prisma } from "../db.js";
import { logger } from "../logger.js";

export async function processDueRecurringSupports() {
  const now = new Date();
  
  const dueSupports = await prisma.recurringSupport.findMany({
    where: {
      status: "active",
      nextRunAt: { lte: now },
    },
    include: {
      profile: true,
      supporter: true,
    },
  });

  for (const support of dueSupports) {
    try {
      // Calculate nextRunAt based on frequency
      const nextRunAt = new Date(now);
      if (support.frequency === "weekly") {
        nextRunAt.setDate(nextRunAt.getDate() + 7);
      } else {
        // Default to monthly (30 days)
        nextRunAt.setDate(nextRunAt.getDate() + 30);
      }

      await prisma.$transaction(async (tx: any) => {
        // Create the pending SupportTransaction
        const txHash = `pending_${crypto.randomUUID()}`;
        
        await tx.supportTransaction.create({
          data: {
            txHash,
            amount: support.amount,
            assetCode: support.assetCode,
            status: "pending",
            message: `Recurring support (${support.frequency})`,
            stellarNetwork: "TESTNET",
            recipientAddress: support.profile.walletAddress,
            profileId: support.profileId,
            supporterId: support.supporterId,
            supporterAddress: support.supporter.email,
          },
        });

        // Update the RecurringSupport
        await tx.recurringSupport.update({
          where: { id: support.id },
          data: { nextRunAt },
        });
      });

      logger.info({
        dripId: support.id,
        profileId: support.profileId,
        amount: support.amount.toString(),
      }, "Processed due recurring support");

    } catch (error) {
      logger.error({
        err: error,
        dripId: support.id,
      }, "Failed to process recurring support");
    }
  }
}

export function startDripScheduler() {
  if (process.env.DRIP_SCHEDULER_ENABLED === "true") {
    logger.info("Drip scheduler enabled. Starting...");
    
    // Initial run
    processDueRecurringSupports().catch((err) => {
      logger.error({ err }, "Error in initial processDueRecurringSupports run");
    });
    
    // Then every 60 seconds
    setInterval(() => {
      processDueRecurringSupports().catch((err) => {
        logger.error({ err }, "Error in processDueRecurringSupports interval");
      });
    }, 60000);
  } else {
    logger.info("Drip scheduler disabled.");
  }
}
