"use client";

import { useState, useEffect, useMemo } from "react";
import {
  History, Award, LayoutDashboard,
  ExternalLink, Search, Calendar, X
} from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { EmptyState } from "./empty-state";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

type Transaction = {
  id: string;
  txHash: string;
  amount: string;
  assetCode: string;
  message?: string;
  supporterAddress?: string;
  createdAt: string;
  status: string;
//   message?: string;
  memo?: string | null;
};

type Badge = {
  id: string;
  name: string;
  description: string;
  icon: string;
  criteria: string;
  awardedAt: string;
};

// ── Date range presets ────────────────────────────────────────────────────────
type DatePreset = "all" | "7d" | "30d" | "custom";

function getPresetRange(preset: DatePreset): { from: Date | null; to: Date | null } {
  const now = new Date();
  if (preset === "7d") {
    const from = new Date(now);
    from.setDate(from.getDate() - 7);
    return { from, to: now };
  }
  if (preset === "30d") {
    const from = new Date(now);
    from.setDate(from.getDate() - 30);
    return { from, to: now };
  }
  return { from: null, to: null };
}

// ── Highlight matching text ───────────────────────────────────────────────────
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-mint/30 text-white rounded px-0.5">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export function ProfileTabs({ username }: { username: string }) {
  const [activeTab, setActiveTab] = useState<"history" | "badges">("history");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [loading, setLoading] = useState(false);
  const [badgesLoading, setBadgesLoading] = useState(false);

  // ── Search state (#472) ────────────────────────────────────────────────────
  const [search, setSearch] = useState("");

  // ── Date filter state (#461) ───────────────────────────────────────────────
  const [preset, setPreset] = useState<DatePreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const statusStyles: Record<string, string> = {
    SUCCESS: "bg-green-100 text-green-800",
    PENDING: "bg-yellow-100 text-yellow-800",
    FAILED:  "bg-red-100 text-red-800",
  };

  useEffect(() => {
    if (activeTab === "history") {
      setLoading(true);
      fetch(`${API_BASE_URL}/profiles/${username}/transactions`)
        .then(res => res.json())
        .then(data => {
          setTransactions(data.transactions || []);
        })
        .catch(err => console.error(err))
        .finally(() => setLoading(false));
    }
    if (activeTab === "badges") {
      setBadgesLoading(true);
      fetch(`${API_BASE_URL}/profiles/${username}/badges`)
        .then(res => res.json())
        .then(data => setBadges(data.badges || []))
        .catch(err => console.error(err))
        .finally(() => setBadgesLoading(false));
    }
  }, [username, activeTab]);

  // ── Filtered transactions ──────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let result = transactions;

    // Date range filter
    const { from, to } = preset === "custom"
      ? {
          from: customFrom ? new Date(customFrom) : null,
          to:   customTo   ? new Date(customTo)   : null,
        }
      : getPresetRange(preset);

    if (from) result = result.filter(tx => new Date(tx.createdAt) >= from);
    if (to)   result = result.filter(tx => new Date(tx.createdAt) <= to);

    // Search filter (#472) — supporter address, message, amount
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(tx => {
        const addr    = (tx.supporterAddress ?? "").toLowerCase();
        const msg     = (tx.message ?? "").toLowerCase();
        const amount  = tx.amount.toLowerCase();
        const asset   = tx.assetCode.toLowerCase();
        return addr.includes(q) || msg.includes(q) || amount.includes(q) || asset.includes(q);
      });
    }

    return result;
  }, [transactions, search, preset, customFrom, customTo]);

  const clearFilters = () => {
    setSearch("");
    setPreset("all");
    setCustomFrom("");
    setCustomTo("");
  };

  const hasFilters = search || preset !== "all" || customFrom || customTo;

  return (
    <div className="space-y-6">
      {/* ── Tab header ───────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/5 pb-1">
        <div className="flex gap-8">
          <TabButton
            active={activeTab === "history"}
            onClick={() => setActiveTab("history")}
            icon={<History size={16} />}
            label="Support History"
          />
          <TabButton
            active={activeTab === "badges"}
            onClick={() => setActiveTab("badges")}
            icon={<Award size={16} />}
            label="Badges"
          />
        </div>

        <Link
          href={`/dashboard/${username}`}
          className="w-full sm:w-auto flex items-center justify-center sm:justify-start gap-2 rounded-xl bg-mint/10 px-4 py-2 text-xs font-bold text-mint transition hover:bg-mint/20"
        >
          <LayoutDashboard size={14} />
          View Dashboard
        </Link>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === "history" ? (
          <motion.div
            key="history"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="min-h-[300px] space-y-4"
          >
            {/* ── Search & filter toolbar ────────────────────────────────── */}
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Search input (#472) */}
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-steel" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search address, message, amount…"
                  className="w-full rounded-xl border border-white/10 bg-white/5 pl-9 pr-4 py-2 text-sm text-white placeholder:text-steel focus:border-mint/40 focus:outline-none focus:ring-1 focus:ring-mint/30 transition"
                />
              </div>

              {/* Date range preset buttons (#461) */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <Calendar size={14} className="text-steel hidden sm:block" />
                {(["all", "7d", "30d", "custom"] as DatePreset[]).map(p => (
                  <button
                    key={p}
                    onClick={() => setPreset(p)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      preset === p
                        ? "bg-mint text-midnight"
                        : "bg-white/5 text-steel hover:text-white hover:bg-white/10"
                    }`}
                  >
                    {p === "all" ? "All time" : p === "7d" ? "Last 7d" : p === "30d" ? "Last 30d" : "Custom"}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom date range inputs */}
            {preset === "custom" && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="flex flex-col sm:flex-row gap-3"
              >
                <div className="flex-1">
                  <label className="block text-[10px] uppercase tracking-widest text-steel mb-1">From</label>
                  <input
                    type="date"
                    value={customFrom}
                    onChange={e => setCustomFrom(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white focus:border-mint/40 focus:outline-none focus:ring-1 focus:ring-mint/30 transition"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-[10px] uppercase tracking-widest text-steel mb-1">To</label>
                  <input
                    type="date"
                    value={customTo}
                    onChange={e => setCustomTo(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white focus:border-mint/40 focus:outline-none focus:ring-1 focus:ring-mint/30 transition"
                  />
                </div>
              </motion.div>
            )}

            {/* Active filter indicator */}
            {hasFilters && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-steel">
                  {filtered.length} result{filtered.length !== 1 ? "s" : ""} found
                </span>
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-1 text-xs text-mint hover:text-mint/80 transition"
                >
                  <X size={12} /> Clear filters
                </button>
              </div>
            )}

            {/* Transaction table */}
            {loading ? (
              <div className="flex h-40 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-mint border-t-transparent" />
              </div>
            ) : filtered.length > 0 ? (
              <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/5">
                <table className="w-full text-left text-sm text-sky/70">
                  <thead className="bg-white/5 text-[10px] uppercase tracking-widest text-steel font-bold">
                    <tr>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Amount</th>
                      <th className="px-6 py-4">Supporter</th>
                      <th className="px-6 py-4">Message</th>
                      <th className="px-6 py-4">Memo</th>
                      <th className="px-6 py-4">Transaction</th>
                      <th className="px-6 py-4 text-right">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filtered.map(tx => (
                      <tr key={tx.id} className="group hover:bg-white/[0.02] transition-colors">
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusStyles[tx.status] ?? "bg-gray-100 text-gray-800"}`}>
                            {tx.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-white font-medium">
                            <Highlight text={`${tx.amount} ${tx.assetCode}`} query={search} />
                          </span>
                        </td>
                        <td className="px-6 py-4 font-mono text-xs">
                          {tx.supporterAddress ? (
                            <Highlight
                              text={`${tx.supporterAddress.slice(0, 4)}…${tx.supporterAddress.slice(-4)}`}
                              query={search}
                            />
                          ) : (
                            <span className="text-steel italic">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 max-w-[180px] truncate text-xs">
                          {tx.message ? (
                            <Highlight text={tx.message} query={search} />
                          ) : (
                            <span className="text-steel italic">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 max-w-[12rem]">
                          {tx.memo ? (
                            <span className="block truncate text-sky/80" title={tx.memo}>
                              {tx.memo}
                            </span>
                          ) : (
                            <span className="text-sky/30">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <a
                            href={`https://stellar.expert/explorer/testnet/tx/${tx.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 font-mono text-xs hover:text-mint transition-colors"
                          >
                            {tx.txHash.slice(0, 8)}…{tx.txHash.slice(-8)}
                            <ExternalLink size={12} />
                          </a>
                        </td>
                        <td className="px-6 py-4 text-right tabular-nums text-xs">
                          {new Date(tx.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                {transactions.length > 0 ? (
                  <>
                    <p className="text-gray-500 font-medium">No matching transactions</p>
                    <p className="text-sm text-gray-400 mt-1">Try adjusting your search or date filters.</p>
                  </>
                ) : (
                  <>
                    <p className="text-gray-500 font-medium">No support yet</p>
                    <p className="text-sm text-gray-400 mt-1">Be the first to support {username}!</p>
                  </>
                )}
              </div>
              <EmptyState
                variant="transactions"
                title="No transactions yet"
                description="Be the first to support this creator!"
              />
            )}
          </motion.div>
        ) : (
          /* ── Badges tab (#460) ─────────────────────────────────────────── */
          <motion.div
            key="badges"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="min-h-[300px]"
          >
            {badgesLoading ? (
              <div className="flex h-40 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-mint border-t-transparent" />
              </div>
            ) : badges.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {badges.map(badge => (
                  <div
                    key={badge.id}
                    className="flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-center hover:border-mint/30 hover:bg-white/[0.06] transition"
                    title={badge.criteria}
                  >
                    <span className="text-3xl">{badge.icon}</span>
                    <p className="text-xs font-bold text-white leading-tight">{badge.name}</p>
                    <p className="text-[10px] text-steel">{badge.description}</p>
                    <p className="text-[10px] text-steel/60 mt-1">
                      Awarded {new Date(badge.awardedAt).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center text-gray-400">
                <Award size={40} className="text-steel/30 mb-4" />
                <p className="text-lg font-medium">No badges yet</p>
                <p className="text-sm mt-1">Achievement badges will appear here once earned.</p>
              </div>
            )}
            <EmptyState
              variant="default"
              title="Badges coming soon"
              description="Achievement badges will appear here once earned. Start supporting creators to be eligible!"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 border-b-2 py-4 text-sm font-semibold transition-all ${
        active
          ? "border-mint text-mint"
          : "border-transparent text-steel hover:text-white"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
