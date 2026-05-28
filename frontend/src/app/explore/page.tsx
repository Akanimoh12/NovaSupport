"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { API_BASE_URL } from "@/lib/config";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { EmptyState } from "@/components/empty-state";

type Profile = {
  id: string;
  username: string;
  displayName: string;
  bio: string;
  avatarUrl?: string | null;
  acceptedAssets: { code: string; issuer?: string | null }[];
};

type SortOption = "newest" | "most_supported" | "most_transactions";
type AssetFilter = "all" | "XLM" | "USDC";

export default function ExplorePage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortOption>("newest");
  const [asset, setAsset] = useState<AssetFilter>("all");
  const [assetIssuer, setAssetIssuer] = useState<string>("");
  const [availableIssuers, setAvailableIssuers] = useState<
    Array<{ code: string; issuer: string }>
  >([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const limit = 20;

  const sentinelRef = useInfiniteScroll({
    onLoadMore: handleLoadMore,
    hasMore,
    isLoading: loading,
    threshold: 0.8,
  });

  useEffect(() => {
    setOffset(0);
    setProfiles([]);
    setHasMore(true);
    fetchProfiles(0, true);
  }, [sort, asset, assetIssuer]);

  useEffect(() => {
    const issuers = new Set<string>();
    profiles.forEach((p) => {
      p.acceptedAssets.forEach((a) => {
        if (a.issuer) {
          issuers.add(`${a.code}:${a.issuer}`);
        }
      });
    });
    const unique = Array.from(issuers)
      .map((str) => {
        const [code, issuer] = str.split(":");
        return { code, issuer };
      })
      .sort((a, b) => a.code.localeCompare(b.code) || a.issuer.localeCompare(b.issuer));
    setAvailableIssuers(unique);
  }, [profiles]);

  async function fetchProfiles(currentOffset: number, reset = false) {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: currentOffset.toString(),
        sort,
      });

      if (asset !== "all") {
        params.append("asset", asset);
      }

      if (assetIssuer) {
        params.append("assetIssuer", assetIssuer);
      }

      const response = await fetch(`${API_BASE_URL}/profiles?${params}`);

      if (!response.ok) {
        throw new Error("Failed to fetch profiles");
      }

      const data = await response.json();

      if (reset) {
        setProfiles(data.profiles);
      } else {
        setProfiles((prev) => [...prev, ...data.profiles]);
      }

      setHasMore(data.profiles.length === limit);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load profiles");
    } finally {
      setLoading(false);
    }
  }

  function handleLoadMore() {
    const newOffset = offset + limit;
    setOffset(newOffset);
    fetchProfiles(newOffset);
  }

  const filteredIssuers = availableIssuers.filter((i) =>
    asset === "all" || i.code === asset
  );

  return (
    <div className="min-h-screen px-6 py-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-4xl font-bold text-white mb-2">Explore Creators</h1>
        <p className="text-sky/80 mb-8">
          Discover and support amazing creators on Stellar
        </p>

        {/* Filters */}
        <div className="mb-8 flex flex-wrap gap-4">
          <div>
            <label className="text-xs uppercase tracking-[0.2em] text-sky/70 block mb-2">
              Sort by
            </label>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortOption)}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white focus:border-mint/50 focus:outline-none"
            >
              <option value="newest">Newest</option>
              <option value="most_supported">Most Supported</option>
              <option value="most_transactions">Most Transactions</option>
            </select>
          </div>

          <div>
            <label className="text-xs uppercase tracking-[0.2em] text-sky/70 block mb-2">
              Asset
            </label>
            <select
              value={asset}
              onChange={(e) => {
                setAsset(e.target.value as AssetFilter);
                setAssetIssuer("");
              }}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white focus:border-mint/50 focus:outline-none"
            >
              <option value="all">All</option>
              <option value="XLM">XLM</option>
              <option value="USDC">USDC</option>
            </select>
          </div>

          {filteredIssuers.length > 0 && (
            <div>
              <label className="text-xs uppercase tracking-[0.2em] text-sky/70 block mb-2">
                Issuer
              </label>
              <select
                value={assetIssuer}
                onChange={(e) => setAssetIssuer(e.target.value)}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white focus:border-mint/50 focus:outline-none"
              >
                <option value="">All Issuers</option>
                {filteredIssuers.map((issuer) => (
                  <option key={issuer.issuer} value={issuer.issuer}>
                    {issuer.code} — {issuer.issuer.slice(0, 4)}…{issuer.issuer.slice(-4)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Loading skeleton */}
        {loading && profiles.length === 0 && (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="rounded-[2rem] border border-white/10 bg-white/5 p-6 animate-pulse"
              >
                <div className="h-20 w-20 rounded-full bg-white/10 mb-4" />
                <div className="h-6 bg-white/10 rounded mb-2 w-3/4" />
                <div className="h-4 bg-white/10 rounded w-full" />
              </div>
            ))}
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-6 py-4 text-red-200">
            {error}
          </div>
        )}

        {/* Profiles grid */}
        {!loading || profiles.length > 0 ? (
          <>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {profiles.map((profile) => (
                <Link
                  key={profile.id}
                  href={`/profile/${profile.username}`}
                  className="rounded-[2rem] border border-white/10 bg-white/5 p-6 transition hover:border-mint/30 hover:bg-white/10"
                >
                  {profile.avatarUrl ? (
                    <img
                      src={profile.avatarUrl}
                      alt={profile.displayName}
                      className="h-20 w-20 rounded-full object-cover mb-4"
                    />
                  ) : (
                    <div className="h-20 w-20 rounded-full bg-gradient-to-br from-mint to-gold mb-4 flex items-center justify-center text-2xl font-bold text-ink">
                      {profile.displayName[0].toUpperCase()}
                    </div>
                  )}
                  <h3 className="text-xl font-semibold text-white mb-1">
                    {profile.displayName}
                  </h3>
                  <p className="text-sm text-sky/70 mb-3">
                    @{profile.username}
                  </p>
                  <p className="text-sm text-sky/85 line-clamp-2">
                    {profile.bio}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {profile.acceptedAssets.slice(0, 3).map((a, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-mint/20 text-mint"
                        title={a.issuer ? `Issuer: ${a.issuer}` : a.code}
                      >
                        {a.code}
                        {a.issuer && (
                          <span className="text-mint/50 font-normal">
                            {a.issuer.slice(0, 4)}…{a.issuer.slice(-4)}
                          </span>
                        )}
                      </span>
                    ))}
                    {profile.acceptedAssets.length > 3 && (
                      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-white/10 text-sky/60">
                        +{profile.acceptedAssets.length - 3}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>

            {/* Infinite scroll sentinel */}
            {hasMore && profiles.length > 0 && (
              <div ref={sentinelRef} className="mt-8 text-center py-4">
                {loading && (
                  <div className="flex items-center justify-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-mint animate-pulse" />
                    <div className="h-2 w-2 rounded-full bg-mint animate-pulse delay-75" />
                    <div className="h-2 w-2 rounded-full bg-mint animate-pulse delay-150" />
                  </div>
                )}
              </div>
            )}

            {/* Fallback Load More button */}
            {hasMore && profiles.length > 0 && !loading && (
              <div className="mt-4 text-center">
                <button
                  onClick={handleLoadMore}
                  className="rounded-full bg-mint/20 border border-mint/30 px-6 py-2 text-sm font-medium text-mint transition hover:bg-mint/30"
                >
                  Load More
                </button>
              </div>
            )}

            {!hasMore && profiles.length > 0 && (
              <p className="mt-8 text-center text-sm text-sky/70">
                You&apos;ve reached the end
              </p>
            )}

            {profiles.length === 0 && !loading && !error && (
              <EmptyState
                variant="explore"
                title="No creators found"
                description="Try adjusting your search filters or check back later."
              />
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
