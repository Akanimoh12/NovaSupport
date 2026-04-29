import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { API_BASE_URL } from "@/lib/config";
import { StrKey } from "@stellar/stellar-sdk";
import { ExternalLink, AlertCircle } from "lucide-react";
import Link from "next/link";

type PageProps = {
  params: {
    address: string;
  };
};

type SupporterData = {
  address: string;
  totalTransactions: number;
  profilesSupported: number;
  totalByAsset: Record<string, number>;
  transactions: Array<{
    id: string;
    amount: string;
    assetCode: string;
    assetIssuer?: string | null;
    txHash: string;
    createdAt: string;
    profile: {
      username: string;
      displayName: string;
    };
  }>;
};

async function getSupporterData(address: string): Promise<SupporterData | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/supporters/${address}`, {
      next: { revalidate: 60 }
    });

    if (res.status === 400) {
      return null;
    }

    if (!res.ok) {
      return null;
    }

    return res.json();
  } catch {
    return null;
  }
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

export default async function SupporterPage({ params }: PageProps) {
  const { address } = params;

  if (!StrKey.isValidEd25519PublicKey(address)) {
    return (
      <AppShell>
        <div className="mx-auto max-w-4xl">
          <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
            <div className="rounded-full bg-red-500/10 p-4 text-red-500">
              <AlertCircle size={48} />
            </div>
            <h2 className="text-2xl font-bold text-white">Invalid Address</h2>
            <p className="text-steel">The wallet address provided is not a valid Stellar public key.</p>
          </div>
        </div>
      </AppShell>
    );
  }

  const data = await getSupporterData(address);

  if (!data || data.totalTransactions === 0) {
    return (
      <AppShell>
        <div className="mx-auto max-w-4xl">
          <div className="flex min-h-[60vh] flex-col items-center justify-center">
            <EmptyState
              title="No Activity Found"
              description="This wallet hasn't supported any creators yet."
            />
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-8">
        <header className="space-y-4">
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Giving <span className="text-mint">Passport</span>
          </h1>
          <div className="flex items-center gap-3">
            <code className="rounded-lg bg-white/5 px-3 py-2 font-mono text-sm text-mint">
              {truncateAddress(address)}
            </code>
            <button
              onClick={() => navigator.clipboard.writeText(address)}
              className="rounded-lg bg-white/5 px-3 py-2 text-xs text-steel hover:bg-white/10 transition-colors"
              title="Copy full address"
            >
              Copy
            </button>
          </div>
        </header>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <p className="text-[10px] uppercase tracking-[0.2em] text-steel mb-2">
              Total Transactions
            </p>
            <h3 className="text-3xl font-bold text-white">
              {data.totalTransactions}
            </h3>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <p className="text-[10px] uppercase tracking-[0.2em] text-steel mb-2">
              Profiles Supported
            </p>
            <h3 className="text-3xl font-bold text-white">
              {data.profilesSupported}
            </h3>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <p className="text-[10px] uppercase tracking-[0.2em] text-steel mb-2">
              Total Assets
            </p>
            <h3 className="text-3xl font-bold text-white">
              {Object.keys(data.totalByAsset).length}
            </h3>
          </div>
        </div>

        {/* Asset Breakdown */}
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-steel">
            Total by Asset
          </h3>
          <div className="space-y-3">
            {Object.entries(data.totalByAsset).map(([asset, amount]) => (
              <div key={asset} className="flex items-center justify-between">
                <span className="text-sm text-sky/60">{asset}</span>
                <span className="text-sm font-bold text-white">
                  {parseFloat(amount.toString()).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Transactions */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-steel">
            Recent Transactions
          </h3>
          <div className="space-y-3">
            {data.transactions.map((tx) => (
              <div
                key={tx.id}
                className="rounded-2xl border border-white/10 bg-white/5 p-4 hover:bg-white/[0.08] transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/profile/${tx.profile.username}`}
                      className="text-sm font-semibold text-mint hover:text-mint/80 transition-colors"
                    >
                      {tx.profile.displayName}
                    </Link>
                    <p className="text-xs text-steel mt-1">@{tx.profile.username}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-white">
                      {parseFloat(tx.amount).toFixed(2)} {tx.assetCode}
                    </p>
                    <p className="text-xs text-steel mt-1">
                      {new Date(tx.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <code className="text-[10px] text-sky/60 font-mono truncate">
                    {tx.txHash}
                  </code>
                  <a
                    href={`https://stellar.expert/explorer/testnet/tx/${tx.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky hover:text-sky/80 transition-colors"
                    title="View on Stellar Expert"
                  >
                    <ExternalLink size={14} />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
