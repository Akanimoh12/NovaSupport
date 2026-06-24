import crypto from "crypto";
import { prisma } from "../db.js";
import { logger } from "../logger.js";
import { Metrics } from "../metrics.js";

export async function processDueRecurringSupports(prismaClient = prisma) {
  const now = new Date();
  
  const dueSupports = await prismaClient.recurringSupport.findMany({
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
    // #608: supporterId is NULL when the supporter's account was deleted (SET NULL FK).
    // Mark the subscription cancelled so it stops appearing as due and so
    // the profile owner can see the cancellation in their dashboard.
    if (!support.supporter) {
      await prismaClient.recurringSupport.update({
        where: { id: support.id },
        data: { status: "cancelled", cancelledAt: new Date() },
      });
      logger.info({ dripId: support.id, profileId: support.profileId }, "Recurring support cancelled: supporter account deleted");
      continue;
    }

    try {
      const supporter = support.supporter;
      // Calculate nextRunAt based on frequency
      const nextRunAt = new Date(now);
      if (support.frequency === "weekly") {
        nextRunAt.setDate(nextRunAt.getDate() + 7);
      } else {
        // Default to monthly (30 days)
        nextRunAt.setDate(nextRunAt.getDate() + 30);
      }

      await prismaClient.$transaction(async (tx: any) => {
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
            supporterAddress: supporter.email,
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
      Metrics.dripsProcessed();

    } catch (error) {
      logger.error({
        err: error,
        dripId: support.id,
      }, "Failed to process recurring support");
      Metrics.dripErrors();
    }
  }
}

export type SchedulerHandle = {
  stop(): Promise<void>;
};

let dripInterval: ReturnType<typeof setInterval> | null = null;
let dripInFlight: Promise<void> | null = null;
let dripStopped = true;

function runDripSchedulerTick(): void {
  dripInFlight = processDueRecurringSupports()
    .catch((err) => {
      logger.error({ err }, "Error in processDueRecurringSupports run");
    })
    .finally(() => {
      dripInFlight = null;
    });
}

export function startDripScheduler(): SchedulerHandle {
  if (process.env.DRIP_SCHEDULER_ENABLED === "true") {
    logger.info("Drip scheduler enabled. Starting...");
    dripStopped = false;
    
    // Initial run
    runDripSchedulerTick();
    
    // Then every 60 seconds
    dripInterval = setInterval(() => {
      if (!dripInFlight) {
        runDripSchedulerTick();
      }
    }, 60000);
  } else {
    logger.info("Drip scheduler disabled.");
  }

  return {
    async stop() {
      if (dripStopped) return;
      dripStopped = true;
      if (dripInterval) {
        clearInterval(dripInterval);
        dripInterval = null;
      }
      if (dripInFlight) {
        await dripInFlight;
      }
      logger.info("Drip scheduler stopped.");
    },
  };
}
