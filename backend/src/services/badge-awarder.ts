import { prisma } from "../db.js";
import { logger } from "../logger.js";

function getBadgeNameByCriterion(criterion: string): string {
  const map: Record<string, string> = {
    first_support: "First Supporter",
    ten_supporters: "10 Supporters",
    total_100_xlm: "100 XLM Club",
    milestone_reached: "Milestone Maker",
  };
  return map[criterion] ?? "";
}

export async function checkAndAwardBadges(profileId: string): Promise<void> {
  try {
    const badges = await prisma.badge.findMany();
    if (badges.length === 0) return;

    const existingAwards = await prisma.profileBadge.findMany({
      where: { profileId },
      select: { badgeId: true },
    });
    const awardedBadgeIds = new Set(existingAwards.map((a) => a.badgeId));

    const [txCount, uniqueSupporters, totalsByAsset, milestonesReached] = await Promise.all([
      prisma.supportTransaction.count({
        where: { profileId, status: { not: "failed" } },
      }),
      prisma.supportTransaction.findMany({
        where: { profileId, supporterAddress: { not: null }, status: { not: "failed" } },
        distinct: ["supporterAddress"],
        select: { supporterAddress: true },
      }),
      prisma.supportTransaction.groupBy({
        by: ["assetCode"],
        where: { profileId, status: { not: "failed" } },
        _sum: { amount: true },
      }),
      prisma.milestone.count({
        where: { profileId, status: "reached" },
      }),
    ]);

    const xlmTotal = totalsByAsset
      .filter((g) => g.assetCode === "XLM")
      .reduce((sum, g) => sum + Number(g._sum.amount ?? 0), 0);

    for (const badge of badges) {
      if (awardedBadgeIds.has(badge.id)) continue;

      let shouldAward = false;

      switch (badge.criteria) {
        case "first_support":
          shouldAward = txCount >= 1;
          break;
        case "ten_supporters":
          shouldAward = uniqueSupporters.length >= 10;
          break;
        case "total_100_xlm":
          shouldAward = xlmTotal >= 100;
          break;
        case "milestone_reached":
          shouldAward = milestonesReached >= 1;
          break;
      }

      if (shouldAward) {
        await prisma.profileBadge.create({
          data: { profileId, badgeId: badge.id },
        });
        logger.info(
          { profileId, badgeName: badge.name },
          "Badge auto-awarded",
        );
      }
    }
  } catch (err) {
    logger.error(
      { err, profileId },
      "Error in checkAndAwardBadges",
    );
  }
}
