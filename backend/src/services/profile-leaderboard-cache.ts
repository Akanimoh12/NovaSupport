export type LeaderboardSort = "total_amount" | "transaction_count";

export type LeaderboardEntry = {
  rank: number;
  supporterAddress: string;
  assetCode: string;
  totalAmount: string;
  transactionCount: number;
};

export type LeaderboardResponse = {
  leaderboard: LeaderboardEntry[];
  total: number;
  limit: number;
  offset: number;
  sort: LeaderboardSort;
};

type CachedLeaderboard = {
  expiresAt: number;
  value: LeaderboardResponse;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const leaderboardCache = new Map<string, CachedLeaderboard>();

function cacheKey(profileId: string, limit: number, offset: number, sort: LeaderboardSort) {
  return `${profileId}:${limit}:${offset}:${sort}`;
}

export function getCachedLeaderboard(
  profileId: string,
  limit: number,
  offset: number,
  sort: LeaderboardSort,
): LeaderboardResponse | null {
  const key = cacheKey(profileId, limit, offset, sort);
  const cached = leaderboardCache.get(key);

  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    leaderboardCache.delete(key);
    return null;
  }

  return cached.value;
}

export function setCachedLeaderboard(
  profileId: string,
  limit: number,
  offset: number,
  sort: LeaderboardSort,
  value: LeaderboardResponse,
): void {
  leaderboardCache.set(cacheKey(profileId, limit, offset, sort), {
    expiresAt: Date.now() + CACHE_TTL_MS,
    value,
  });
}

export function invalidateProfileLeaderboardCache(profileId: string): void {
  const prefix = `${profileId}:`;

  for (const key of leaderboardCache.keys()) {
    if (key.startsWith(prefix)) {
      leaderboardCache.delete(key);
    }
  }
}
