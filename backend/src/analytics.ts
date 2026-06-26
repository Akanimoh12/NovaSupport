import { Prisma } from "@prisma/client";
import { prisma } from "./db.js";

const analyticsCache = new Map<
  string,
  { data: any; timestamp: number }
>();
const CACHE_TTL = 3600000; // 1 hour

interface DailyContribution {
  date: string;
  amount: string;
  count: number;
  uniqueContributors: number;
  avgContribution: string;
}

function isCacheValid(timestamp: number): boolean {
  return Date.now() - timestamp < CACHE_TTL;
}

export function fillGaps(
  results: any[],
  period: string,
  fromDate: Date,
  toDate: Date
) {
  const map = new Map<string, any>();
  for (const row of results) {
    const d = new Date(row.date);
    let key = "";
    if (period === "monthly") {
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    } else if (period === "weekly") {
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d.setDate(diff));
      key = monday.toISOString().split("T")[0];
    } else {
      key = d.toISOString().split("T")[0];
    }
    map.set(key, {
      amount: row.total?.toString() ?? "0",
      count: Number(row.txCount ?? 0),
      uniqueContributors: Number(row.uniqueContributors ?? 0),
      avgContribution: row.avgContribution?.toString() ?? "0",
    });
  }

  const data = [];
  const current = new Date(fromDate);
  if (period === "monthly") current.setDate(1);
  if (period === "weekly") {
    const day = current.getDay();
    const diff = current.getDate() - day + (day === 0 ? -6 : 1);
    current.setDate(diff);
  }

  const end = new Date(toDate);
  // Normalize dates to midnight for comparison
  current.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  while (current <= end) {
    const keyStr = current.toISOString().split("T")[0];
    const existing = map.get(keyStr);
    data.push({
      date: keyStr,
      amount: existing?.amount ?? "0",
      count: existing?.count ?? 0,
      uniqueContributors: existing?.uniqueContributors ?? 0,
      avgContribution: existing?.avgContribution ?? "0",
    });

    if (period === "monthly") {
      current.setMonth(current.getMonth() + 1);
    } else if (period === "weekly") {
      current.setDate(current.getDate() + 7);
    } else {
      current.setDate(current.getDate() + 1);
    }
  }

  return { period, data };
}

export async function getAnalytics(
  profileId: string,
  startDate?: Date,
  endDate?: Date,
  format?: "json" | "csv"
) {
  const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const end = endDate || new Date();

  const cacheKey = `${profileId}:${start.toISOString()}:${end.toISOString()}:${format}`;
  const cached = analyticsCache.get(cacheKey);

  if (cached && isCacheValid(cached.timestamp)) {
    return cached.data;
  }

  const transactions = await prisma.supportTransaction.findMany({
    where: {
      profileId,
      createdAt: { gte: start, lte: end },
    },
    orderBy: { createdAt: "asc" },
  });

  // Group by date
  const groupedByDate = new Map<string, any[]>();
  transactions.forEach((tx) => {
    const date = tx.createdAt.toISOString().split("T")[0];
    if (!groupedByDate.has(date)) {
      groupedByDate.set(date, []);
    }
    groupedByDate.get(date)!.push(tx);
  });

  // Calculate metrics
  const dailyData: DailyContribution[] = Array.from(
    groupedByDate.entries()
  ).map(([date, txs]) => {
    const amount = txs
      .reduce((sum, tx) => sum + Number(tx.amount), 0)
      .toString();
    const uniqueContributors = new Set(
      txs.map((tx) => tx.supporterAddress)
    ).size;
    const avgContribution = (
      Number(amount) / txs.length
    ).toString();

    return {
      date,
      amount,
      count: txs.length,
      uniqueContributors,
      avgContribution,
    };
  });

  // Fill gaps
  const filledData: DailyContribution[] = [];
  let currentDate = new Date(start);

  const dataMap = new Map(dailyData.map((d) => [d.date, d]));

  while (currentDate <= end) {
    const dateStr = currentDate.toISOString().split("T")[0];
    const existing = dataMap.get(dateStr);

    filledData.push(
      existing || {
        date: dateStr,
        amount: "0",
        count: 0,
        uniqueContributors: 0,
        avgContribution: "0",
      }
    );

    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Calculate summary
  const totalAmount = filledData
    .reduce((sum, d) => sum + Number(d.amount), 0)
    .toString();
  const totalContributors = new Set(
    transactions.map((tx) => tx.supporterAddress)
  ).size;
  const avgDailyContribution = (
    filledData.length > 0
      ? filledData.reduce((sum, d) => sum + Number(d.amount), 0) /
        filledData.length
      : 0
  ).toString();

  const result = {
    profileId,
    summary: {
      totalRaised: totalAmount,
      totalContributors,
      avgDailyContribution,
      transactionCount: transactions.length,
      dateRange: { start: start.toISOString(), end: end.toISOString() },
    },
    dailyContributions: filledData,
    assetBreakdown: Object.values(
      transactions.reduce(
        (acc, tx) => {
          if (!acc[tx.assetCode]) {
            acc[tx.assetCode] = {
              asset: tx.assetCode,
              amount: 0,
              count: 0,
            };
          }
          acc[tx.assetCode].amount += Number(tx.amount);
          acc[tx.assetCode].count += 1;
          return acc;
        },
        {} as Record<string, any>
      )
    ),
  };

  analyticsCache.set(cacheKey, { data: result, timestamp: Date.now() });

  if (format === "csv") {
    return convertToCSV(result);
  }

  return result;
}

function convertToCSV(analytics: any): string {
  const headers = [
    "Date",
    "Amount",
    "Transaction Count",
    "Unique Contributors",
    "Avg Contribution",
  ];
  const rows = analytics.dailyContributions.map(
    (d: DailyContribution) => [
      d.date,
      d.amount,
      d.count,
      d.uniqueContributors,
      d.avgContribution,
    ]
  );

  const csv =
    [headers, ...rows]
      .map((row) => row.map((cell: unknown) => `"${cell}"`).join(","))
      .join("\n") + "\n";

  return csv;
}

export function clearAnalyticsCache(profileId?: string): void {
  if (profileId) {
    Array.from(analyticsCache.keys())
      .filter((key) => key.startsWith(profileId))
      .forEach((key) => analyticsCache.delete(key));
  } else {
    analyticsCache.clear();
  }
}
