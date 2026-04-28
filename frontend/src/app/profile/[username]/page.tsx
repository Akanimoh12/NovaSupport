import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { ProfileCard } from "@/components/profile-card";
import { SupportPanel } from "@/components/support-panel";
import { ProfileTabs } from "@/components/profile-tabs";
import { QRCodeButton } from "@/components/qr-code-button";
import { EmptyState } from "@/components/empty-state";
import { API_BASE_URL } from "@/lib/config";

type PageProps = {
  params: {
    username: string;
  };
};

type Profile = {
  id: string;
  username: string;
  displayName: string;
  bio: string;
  walletAddress: string;
  avatarUrl?: string | null;
  acceptedAssets: Array<{ code: string; issuer?: string | null }>;
  emailVerified?: boolean;
};

type SupportTx = {
  txHash: string;
  amount: string;
  assetCode: string;
  message?: string | null;
  createdAt: string;
  senderAddress: string;
};

type Milestone = {
  id: string;
  title: string;
  description?: string | null;
  targetAmount: string;
  currentAmount: string;
  assetCode: string;
  status: string;
  createdAt: string;
    }
type LeaderboardEntry = {
  rank: number;
  supporterAddress: string;
  totalAmount: string;
  assetCode: string;
};

async function getProfile(username: string): Promise<Profile> {
  // Use a cache-busting or lower revalidation for profile page
  const res = await fetch(`${API_BASE_URL}/profiles/${username}`, {
    next: { revalidate: 10 },
  });

  if (res.status === 404) {
    notFound();
  }

  if (!res.ok) {
    throw new Error("Failed to fetch profile");
  }

  return res.json();
}

export async function generateMetadata({
  params,
}: {
  params: { username: string };
}): Promise<Metadata> {
  const res = await fetch(`${API_BASE_URL}/profiles/${params.username}`, {
    next: { revalidate: 60 },
  });

  if (!res.ok) {
    return {
      title: "Profile not found — NovaSupport",
    };
  }

  const profile: Profile = await res.json();

  return {
    title: `${profile.displayName} on NovaSupport`,
    description: profile.bio ?? `Support ${profile.displayName} on NovaSupport`,
    openGraph: {
      title: `${profile.displayName} on NovaSupport`,
      description:
        profile.bio ?? `Support ${profile.displayName} on NovaSupport`,
      images: profile.avatarUrl ? [profile.avatarUrl] : [],
      url: `https://novasupport.xyz/profile/${params.username}`,
      type: "profile",
    },
    twitter: {
      card: "summary",
      title: `${profile.displayName} on NovaSupport`,
      description:
        profile.bio ?? `Support ${profile.displayName} on NovaSupport`,
      images: profile.avatarUrl ? [profile.avatarUrl] : [],
    },
  };
}

async function getTransactions(
  username: string,
  limit = 10,
): Promise<SupportTx[]> {
  const res = await fetch(
    `${API_BASE_URL}/profiles/${username}/transactions?limit=${limit}`,
    { next: { revalidate: 60 } },
  );

  if (!res.ok) return [];

  const body = await res.json();
  return body.transactions ?? [];
}

function truncateAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

async function getLeaderboard(username: string): Promise<LeaderboardEntry[]> {
  const res = await fetch(`${API_BASE_URL}/profiles/${username}/leaderboard`, {
    next: { revalidate: 60 },
  });

  if (!res.ok) return [];

  const body = (await res.json()) as {
    leaderboard?: Array<Record<string, unknown>>;
  };

  const source = body.leaderboard ?? [];
  return source
    .slice(0, 5)
    .map((entry, index) => {
      const address = String(
        entry.supporterAddress ??
          entry.supporter_address ??
          entry.address ??
          "",
      );
      const amount = String(
        entry.totalAmount ?? entry.total_amount ?? entry.amount ?? "0",
      );
      const assetCode = String(
        entry.assetCode ?? entry.asset_code ?? entry.asset ?? "XLM",
      );
      const rankFromApi = Number(entry.rank);

      return {
        rank:
          Number.isFinite(rankFromApi) && rankFromApi > 0
            ? rankFromApi
            : index + 1,
        supporterAddress: address,
        totalAmount: amount,
        assetCode,
      };
    })
    .filter((entry) => entry.supporterAddress.length > 0);
}

type ProfileStats = {
  totalTransactions: number;
  uniqueSupporters: number;
  assetTotals: Array<{ assetCode: string; total: string }>;
};

async function getStats(username: string): Promise<ProfileStats | null> {
  const res = await fetch(`${API_BASE_URL}/profiles/${username}/stats`, {
    next: { revalidate: 60 }
  });
  if (!res.ok) return null;
  return res.json();
}

async function getMilestones(username: string): Promise<Milestone[]> {
  const res = await fetch(`${API_BASE_URL}/profiles/${username}/milestones`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) return [];
  const body = await res.json();
  return body.milestones ?? body ?? [];
}

export default async function ProfilePage({ params }: PageProps) {
  const [profile, transactions, leaderboard, stats, milestones] = await Promise.all([
    getProfile(params.username),
    getTransactions(params.username, 10),
    getLeaderboard(params.username),
    getStats(params.username),
    getMilestones(params.username),
  ]);

  const activeMilestones = milestones.filter((m) => m.status === "active");

  return (
    <AppShell>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8 items-start animate-fade-in">
        <div className="space-y-12">
          <div className="space-y-3">
            <ProfileCard
              username={profile.username}
              displayName={profile.displayName}
              bio={profile.bio}
              walletAddress={profile.walletAddress}
              acceptedAssets={profile.acceptedAssets}
              avatarUrl={profile.avatarUrl || undefined}
              isVerified={profile.emailVerified}
              stats={stats || undefined}
            />
            <div className="px-2">
              <QRCodeButton username={profile.username} />
            </div>
          </div>

          {activeMilestones.length > 0 && (
            <div className="px-2 space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-widest text-steel">
                Funding Goals
              </h3>
              <div className="space-y-4">
                {activeMilestones.map((milestone) => {
                  const progress = Math.min(
                    (parseFloat(milestone.currentAmount) / parseFloat(milestone.targetAmount)) * 100,
                    100
                  );
                  const isReached = milestone.status === "reached" || progress >= 100;

                  return (
                    <div
                      key={milestone.id}
                      className="rounded-2xl border border-white/10 bg-white/5 p-4"
                    >
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-semibold text-white truncate">
                            {milestone.title}
                          </h4>
                          {milestone.description && (
                            <p className="text-xs text-steel mt-1 line-clamp-2">
                              {milestone.description}
                            </p>
                          )}
                        </div>
                        {isReached && (
                          <span className="text-xs font-bold text-mint whitespace-nowrap">
                            Reached ✓
                          </span>
                        )}
                      </div>
                      <div className="space-y-2">
                        <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden">
                          <div
                            className="bg-mint h-full transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-steel">
                            {parseFloat(milestone.currentAmount).toFixed(2)} / {parseFloat(milestone.targetAmount).toFixed(2)} {milestone.assetCode}
                          </span>
                          <span className="text-steel">
                            {Math.round(progress)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          
          <div className="px-2">
            <ProfileTabs username={profile.username} />
          </div>
        </div>

        <aside className="sticky top-24">
          <SupportPanel
            walletAddress={profile.walletAddress}
            acceptedAssets={profile.acceptedAssets}
            profileId={profile.id}
            recipientDisplayName={profile.displayName}
          />

          {leaderboard.length > 0 ? (
            <div className="mt-6 rounded-3xl border border-white/5 bg-white/[0.02] p-6">
              <h4 className="text-[10px] uppercase tracking-[0.25em] text-steel font-bold mb-4">
                Top Supporters
              </h4>
              <div className="space-y-3">
                {leaderboard.map((entry) => (
                  <div
                    key={`${entry.rank}-${entry.supporterAddress}`}
                    className="flex items-center justify-between gap-4"
                  >
                    <span className="text-xs text-sky/70">#{entry.rank}</span>
                    <a
                      href={`https://stellar.expert/explorer/testnet/account/${entry.supporterAddress}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs text-white hover:text-mint transition-colors"
                    >
                      {truncateAddress(entry.supporterAddress)}
                    </a>
                    <span className="text-xs font-semibold text-mint">
                      {entry.totalAmount} {entry.assetCode}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-6">
              <EmptyState
                variant="supporters"
                title="Be the first to support!"
                description="This profile hasn't received support yet."
              />
            </div>
          )}

          <div className="mt-6 rounded-3xl border border-white/5 bg-white/[0.02] p-6">
            <h4 className="text-[10px] uppercase tracking-[0.25em] text-steel font-bold mb-4">
              Campaign Stats
            </h4>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-sky/60">Total Raised</span>
                <span className="text-sm font-bold text-white">
                  {stats?.assetTotals?.[0]?.total || "0"} {stats?.assetTotals?.[0]?.assetCode || "XLM"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-sky/60">Supporters</span>
                <span className="text-sm font-bold text-white">{stats?.uniqueSupporters || 0}</span>
              </div>
              <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden mt-2">
                <div className="bg-mint h-full w-[25%]" />
              </div>
              <p className="text-[10px] text-steel text-center italic">
                Stats updated recently
              </p>
            </div>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
