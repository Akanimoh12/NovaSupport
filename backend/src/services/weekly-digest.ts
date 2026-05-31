import { prisma } from "../db.js";
import { sendEmail } from "../mailer.js";
import { logger } from "../logger.js";

export async function sendWeeklyDigests() {
  const profiles = await prisma.profile.findMany({
    where: {
      email: { not: null },
      emailVerified: true,
      notificationPreferences: { weeklyDigest: true },
    },
    include: {
      notificationPreferences: true,
    },
  });

  logger.info({ profilesToProcess: profiles.length }, "Weekly digest run started");

  let profilesEmailed = 0;
  let errors = 0;

  for (const profile of profiles) {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const [transactions, uniqueSupporters, milestonesReached, assetGroups] = await Promise.all([
        prisma.supportTransaction.findMany({
          where: {
            profileId: profile.id,
            status: { not: "failed" },
            createdAt: { gte: sevenDaysAgo },
          },
          orderBy: { createdAt: "desc" },
        }),
        prisma.supportTransaction.findMany({
          where: {
            profileId: profile.id,
            supporterAddress: { not: null },
            createdAt: { gte: sevenDaysAgo },
          },
          distinct: ["supporterAddress"],
          select: { supporterAddress: true },
        }),
        prisma.milestone.findMany({
          where: {
            profileId: profile.id,
            status: "reached",
            updatedAt: { gte: sevenDaysAgo },
          },
        }),
        prisma.supportTransaction.groupBy({
          by: ["assetCode"],
          where: {
            profileId: profile.id,
            status: { not: "failed" },
            createdAt: { gte: sevenDaysAgo },
          },
          _sum: { amount: true },
          _count: true,
        }),
      ]);

      const totalReceived = transactions.reduce(
        (sum, tx) => sum + Number(tx.amount),
        0,
      );
      const txCount = transactions.length;
      const supporterCount = uniqueSupporters.length;
      const milestonesCount = milestonesReached.length;

      if (txCount === 0) continue;

      const assetBreakdown = assetGroups
        .map((g) => `${g._sum.amount?.toFixed(7) ?? "0"} ${g.assetCode}`)
        .join(", ");

      const milestonesSection =
        milestonesCount > 0
          ? `<p><strong>Milestones reached:</strong> ${milestonesCount}</p>`
          : "";

      const html = `
        <h2>Your Weekly NovaSupport Recap</h2>
        <p>Here's what happened with your profile <strong>${profile.displayName}</strong> this week:</p>
        <ul>
          <li><strong>Total received:</strong> ${totalReceived.toFixed(7)} (${assetBreakdown})</li>
          <li><strong>Transactions:</strong> ${txCount}</li>
          <li><strong>New supporters:</strong> ${supporterCount}</li>
        </ul>
        ${milestonesSection}
        <br/>
        <p><a href="https://novasupport.xyz/${profile.username}">View your profile</a></p>
        <br/>
        <p>Thanks,<br/>The NovaSupport Team</p>
      `;

      await sendEmail({
        to: profile.email!,
        subject: "Your NovaSupport weekly recap",
        html,
      });

      profilesEmailed++;
    } catch (err) {
      logger.error(
        { err, profileId: profile.id },
        "Failed to send weekly digest for profile",
      );
      errors++;
    }
  }

  logger.info(
    { profilesEmailed, errors },
    "Weekly digest run completed",
  );
}

let digestInterval: ReturnType<typeof setInterval> | null = null;

export function startWeeklyDigestScheduler() {
  if (process.env.WEEKLY_DIGEST_ENABLED === "true") {
    logger.info("Weekly digest scheduler enabled. Starting...");

    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

    sendWeeklyDigests().catch((err) => {
      logger.error({ err }, "Error in initial sendWeeklyDigests run");
    });

    digestInterval = setInterval(() => {
      sendWeeklyDigests().catch((err) => {
        logger.error({ err }, "Error in sendWeeklyDigests interval");
      });
    }, SEVEN_DAYS_MS);
  } else {
    logger.info("Weekly digest scheduler disabled. Set WEEKLY_DIGEST_ENABLED=true to enable.");
  }
}

export function stopWeeklyDigestScheduler() {
  if (digestInterval) {
    clearInterval(digestInterval);
    digestInterval = null;
  }
}
