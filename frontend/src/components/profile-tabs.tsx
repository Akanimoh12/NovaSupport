"use client";

import { useState, useEffect } from "react";
import { 
  History, Award, LayoutDashboard, 
  ExternalLink 
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
  createdAt: string;
  status: string;
  message?: string;
  memo?: string | null;
};

export function ProfileTabs({ username }: { username: string }) {
  const [activeTab, setActiveTab] = useState<"history" | "badges">("history");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);

  const statusStyles: Record<string, string> = {
    SUCCESS: 'bg-green-100 text-green-800',
    PENDING: 'bg-yellow-100 text-yellow-800',
    FAILED: 'bg-red-100 text-red-800',
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
  }, [username, activeTab]);

  return (
    <div className="space-y-6">
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
            className="min-h-[300px]"
          >
            {loading ? (
              <div className="flex h-40 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-mint border-t-transparent" />
              </div>
            ) : transactions.length > 0 ? (
              <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/5">
                <table className="w-full text-left text-sm text-sky/70">
                  <thead className="bg-white/5 text-[10px] uppercase tracking-widest text-steel font-bold">
                    <tr>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Amount</th>
                      <th className="px-6 py-4">Memo</th>
                      <th className="px-6 py-4">Transaction</th>
                      <th className="px-6 py-4 text-right">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {transactions.map((tx) => (
                      <tr key={tx.id} className="group hover:bg-white/[0.02] transition-colors">
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusStyles[tx.status] ?? 'bg-gray-100 text-gray-800'}`}>
                            {tx.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-white font-medium">{tx.amount} {tx.assetCode}</span>
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
                            {tx.txHash.slice(0, 8)}...{tx.txHash.slice(-8)}
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
              <EmptyState
                variant="transactions"
                title="No transactions yet"
                description="Be the first to support this creator!"
              />
            )}
          </motion.div>
        ) : (
          <motion.div
            key="badges"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="min-h-[300px]"
          >
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

function TabButton({ active, onClick, icon, label }: any) {
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
