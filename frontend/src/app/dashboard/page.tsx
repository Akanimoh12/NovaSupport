"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { 
  TrendingUp, Users, Wallet, Activity, 
  ArrowUpRight, ArrowDownRight, Plus, Edit2, Trash2, X, Link2, Eye, EyeOff, Copy, Check, ChevronDown, ChevronRight
import { NotificationPreferences } from "@/components/notification-preferences";
import {
  TrendingUp, Users, Wallet, Activity,
  ArrowUpRight, ArrowDownRight, Plus, Edit2, Trash2, X
} from "lucide-react";
import { motion } from "framer-motion";
import { formatRateLimitedMessage, parseRateLimitInfo } from "@/lib/rate-limit";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

interface Stats {
  totalEarned: number;
  totalTransactions: number;
  uniqueSupporters: number;
  assetBreakdown: Record<string, number>;
}

interface Milestone {
  id: string;
  title: string;
  description?: string | null;
  targetAmount: string;
  currentAmount: string;
  assetCode: string;
  status: string;
  createdAt: string;
}

interface MilestoneFormData {
  title: string;
  description: string;
  targetAmount: string;
  assetCode: string;
}

interface Webhook {
  id: string;
  url: string;
  secret: string;
  active: boolean;
  createdAt: string;
}

interface WebhookDelivery {
  id: string;
  event: string;
  status: string;
  statusCode: number | null;
  createdAt: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showMilestoneForm, setShowMilestoneForm] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null);
  const [formData, setFormData] = useState<MilestoneFormData>({
    title: "",
    description: "",
    targetAmount: "",
    assetCode: "XLM",
  });
  const [submitting, setSubmitting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [showWebhookForm, setShowWebhookForm] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSubmitting, setWebhookSubmitting] = useState(false);
  const [newWebhookSecret, setNewWebhookSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [webhookDeleteConfirm, setWebhookDeleteConfirm] = useState<string | null>(null);
  const [expandedDeliveries, setExpandedDeliveries] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<Record<string, WebhookDelivery[]>>({});
  const [deliveriesLoading, setDeliveriesLoading] = useState<string | null>(null);

  useEffect(() => {
    async function loadDashboard() {
      try {
        // Get username from localStorage or session
        const storedUsername = localStorage.getItem("username");
        if (!storedUsername) {
          router.push("/");
          return;
        }

        setUsername(storedUsername);

        const [statsRes, milestonesRes, webhooksRes] = await Promise.all([
          fetch(`${API_BASE_URL}/profiles/${storedUsername}/stats`),
          fetch(`${API_BASE_URL}/profiles/${storedUsername}/milestones`),
          fetch(`${API_BASE_URL}/profiles/${storedUsername}/webhooks`),
        ]);

        if (statsRes.ok) {
          const statsData = await statsRes.json();
          setStats(statsData);
        }

        if (milestonesRes.ok) {
          const milestonesData = await milestonesRes.json();
          setMilestones(milestonesData.milestones || []);
        }

        if (webhooksRes.ok) {
          const webhooksData = await webhooksRes.json();
          setWebhooks(webhooksData.webhooks || []);
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, [router]);

  const handleAddMilestone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !formData.title || !formData.targetAmount) return;

    setSubmitting(true);
    try {
      const method = editingMilestone ? "PATCH" : "POST";
      const url = editingMilestone
        ? `${API_BASE_URL}/profiles/${username}/milestones/${editingMilestone.id}`
        : `${API_BASE_URL}/profiles/${username}/milestones`;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formData.title,
          description: formData.description || null,
          targetAmount: formData.targetAmount,
          assetCode: formData.assetCode,
        }),
      });

      if (!res.ok) {
        if (res.status === 429) {
          alert(formatRateLimitedMessage(parseRateLimitInfo(res.headers)));
          return;
        }
        throw new Error("Failed to save milestone");
      }

      const newMilestone = await res.json();

      if (editingMilestone) {
        setMilestones(milestones.map((m) => (m.id === newMilestone.id ? newMilestone : m)));
      } else {
        setMilestones([newMilestone, ...milestones]);
      }

      setFormData({ title: "", description: "", targetAmount: "", assetCode: "XLM" });
      setShowMilestoneForm(false);
      setEditingMilestone(null);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditMilestone = (milestone: Milestone) => {
    setEditingMilestone(milestone);
    setFormData({
      title: milestone.title,
      description: milestone.description || "",
      targetAmount: milestone.targetAmount,
      assetCode: milestone.assetCode,
    });
    setShowMilestoneForm(true);
  };

  const handleDeleteMilestone = async (milestoneId: string) => {
    if (!username) return;

    try {
      const res = await fetch(
        `${API_BASE_URL}/profiles/${username}/milestones/${milestoneId}`,
        { method: "DELETE" }
      );

      if (!res.ok) {
        if (res.status === 429) {
          alert(formatRateLimitedMessage(parseRateLimitInfo(res.headers)));
          return;
        }
        throw new Error("Failed to delete milestone");
      }

      setMilestones(milestones.filter((m) => m.id !== milestoneId));
      setDeleteConfirm(null);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const cancelForm = () => {
    setShowMilestoneForm(false);
    setEditingMilestone(null);
    setFormData({ title: "", description: "", targetAmount: "", assetCode: "XLM" });
  };

  const handleAddWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !webhookUrl) return;

    setWebhookSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/profiles/${username}/webhooks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: webhookUrl }),
      });

      if (!res.ok) throw new Error("Failed to add webhook");

      const newWebhook = await res.json();
      setWebhooks([newWebhook, ...webhooks]);
      setNewWebhookSecret(newWebhook.secret);
      setWebhookUrl("");
      setShowWebhookForm(false);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setWebhookSubmitting(false);
    }
  };

  const handleDeleteWebhook = async (webhookId: string) => {
    if (!username) return;

    try {
      const res = await fetch(
        `${API_BASE_URL}/profiles/${username}/webhooks/${webhookId}`,
        { method: "DELETE" }
      );

      if (!res.ok) throw new Error("Failed to delete webhook");

      setWebhooks(webhooks.filter((w) => w.id !== webhookId));
      setWebhookDeleteConfirm(null);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleToggleDeliveries = async (webhookId: string) => {
    if (expandedDeliveries === webhookId) {
      setExpandedDeliveries(null);
      return;
    }

    setExpandedDeliveries(webhookId);
    if (!deliveries[webhookId]) {
      setDeliveriesLoading(webhookId);
      try {
        const res = await fetch(
          `${API_BASE_URL}/profiles/${username}/webhooks/${webhookId}/deliveries`
        );
        if (res.ok) {
          const data = await res.json();
          setDeliveries((prev) => ({ ...prev, [webhookId]: data.deliveries || [] }));
        }
      } catch {
        // silently fail
      } finally {
        setDeliveriesLoading(null);
      }
    }
  };

  const handleCopySecret = async (secret: string) => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const textarea = document.createElement("textarea");
      textarea.value = secret;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <AppShell>
        <div className="flex h-[60vh] items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-mint border-t-transparent" />
        </div>
      </AppShell>
    );
  }

  if (!username) {
    return (
      <AppShell>
        <div className="flex h-[60vh] items-center justify-center">
          <p className="text-steel">Redirecting...</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Creator <span className="text-mint">Dashboard</span>
          </h1>
          <p className="text-steel">
            Manage your profile and funding goals
          </p>
        </header>

        {/* Summary Cards */}
        {stats && (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard 
              title="Total Earned" 
              value={`${stats.totalEarned.toLocaleString(undefined, { maximumFractionDigits: 2 })} XLM`}
              icon={<Wallet className="text-mint" />}
              trend="+12.5%"
              positive={true}
            />
            <StatCard 
              title="Total Supporters" 
              value={stats.uniqueSupporters.toString()}
              icon={<Users className="text-sky" />}
              trend="+8"
              positive={true}
            />
            <StatCard 
              title="Total Transactions" 
              value={stats.totalTransactions.toString()}
              icon={<Activity className="text-gold" />}
              trend="Stable"
              positive={true}
            />
          </div>
        )}

        {/* Goals Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-steel">
              Funding Goals
            </h2>
            {!showMilestoneForm && (
              <button
                onClick={() => setShowMilestoneForm(true)}
                className="flex min-h-[44px] items-center gap-2 rounded-lg bg-mint/10 px-4 py-3 text-xs font-semibold text-mint hover:bg-mint/20 transition-colors"
              >
                <Plus size={14} />
                Add Goal
              </button>
            )}
          </div>

          {/* Add/Edit Form */}
          {showMilestoneForm && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6"
            >
              <form onSubmit={handleAddMilestone} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-steel uppercase tracking-wider">
                    Title *
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="e.g., Album Production"
                    className="mt-2 min-h-[44px] w-full rounded-lg bg-white/5 border border-white/10 px-3 py-3 text-sm text-white placeholder:text-steel/50 focus:outline-none focus:border-mint/50"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-steel uppercase tracking-wider">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Optional description"
                    className="mt-2 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-steel/50 focus:outline-none focus:border-mint/50 resize-none"
                    rows={2}
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold text-steel uppercase tracking-wider">
                      Target Amount *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.targetAmount}
                      onChange={(e) => setFormData({ ...formData, targetAmount: e.target.value })}
                      placeholder="1000"
                      className="mt-2 min-h-[44px] w-full rounded-lg bg-white/5 border border-white/10 px-3 py-3 text-sm text-white placeholder:text-steel/50 focus:outline-none focus:border-mint/50"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-steel uppercase tracking-wider">
                      Asset
                    </label>
                    <select
                      value={formData.assetCode}
                      onChange={(e) => setFormData({ ...formData, assetCode: e.target.value })}
                      className="mt-2 min-h-[44px] w-full rounded-lg bg-white/5 border border-white/10 px-3 py-3 text-sm text-white focus:outline-none focus:border-mint/50"
                    >
                      <option value="XLM">XLM</option>
                      <option value="USDC">USDC</option>
                      <option value="AQUA">AQUA</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex min-h-[44px] flex-1 items-center justify-center rounded-lg bg-mint px-4 py-3 text-xs font-semibold text-black hover:bg-mint/90 transition-colors disabled:opacity-50"
                  >
                    {submitting ? "Saving..." : editingMilestone ? "Update Goal" : "Create Goal"}
                  </button>
                  <button
                    type="button"
                    onClick={cancelForm}
                    className="min-h-[44px] rounded-lg bg-white/5 px-4 py-3 text-xs font-semibold text-steel hover:bg-white/10 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          )}

          {/* Milestones List */}
          {milestones.length === 0 && !showMilestoneForm ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
              <p className="text-sm text-steel">No funding goals yet. Create one to get started!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {milestones.map((milestone) => {
                const progress = Math.min(
                  (parseFloat(milestone.currentAmount) / parseFloat(milestone.targetAmount)) * 100,
                  100
                );

                return (
                  <motion.div
                    key={milestone.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl border border-white/10 bg-white/5 p-4 hover:bg-white/[0.08] transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-semibold text-white truncate">
                          {milestone.title}
                        </h4>
                        {milestone.description && (
                          <p className="text-xs text-steel mt-1 line-clamp-1">
                            {milestone.description}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEditMilestone(milestone)}
                          className="min-h-[44px] min-w-[44px] rounded-lg bg-white/5 p-2 text-steel hover:bg-white/10 transition-colors"
                          title="Edit"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(milestone.id)}
                          className="min-h-[44px] min-w-[44px] rounded-lg bg-white/5 p-2 text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {deleteConfirm === milestone.id && (
                      <div className="mb-3 rounded-lg bg-red-500/10 border border-red-500/20 p-3 flex items-center justify-between">
                        <p className="text-xs text-red-400">Delete this goal?</p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleDeleteMilestone(milestone.id)}
                            className="text-xs font-semibold text-red-400 hover:text-red-300"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="text-xs font-semibold text-steel hover:text-white"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

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
                  </motion.div>
                );
              })}
            </div>
          )}
        </section>

        {/* Webhooks Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-steel">
              Webhooks
            </h2>
            {!showWebhookForm && (
              <button
                onClick={() => setShowWebhookForm(true)}
                className="flex items-center gap-2 rounded-lg bg-mint/10 px-3 py-2 text-xs font-semibold text-mint hover:bg-mint/20 transition-colors"
              >
                <Plus size={14} />
                Add Webhook
              </button>
            )}
          </div>

          {newWebhookSecret && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-gold/30 bg-gold/5 p-4"
            >
              <p className="text-xs font-bold text-gold uppercase tracking-wider">
                Save this secret &mdash; it won&apos;t be shown again
              </p>
              <div className="mt-3 flex items-center gap-2">
                <code className="flex-1 rounded-lg bg-ink/60 px-3 py-2 text-xs text-mint break-all font-mono">
                  {newWebhookSecret}
                </code>
                <button
                  onClick={() => handleCopySecret(newWebhookSecret)}
                  className="rounded-lg bg-white/5 p-2 text-steel hover:bg-white/10 transition-colors"
                  title="Copy secret"
                >
                  {copied ? <Check size={14} className="text-mint" /> : <Copy size={14} />}
                </button>
              </div>
              <button
                onClick={() => setNewWebhookSecret(null)}
                className="mt-2 text-xs text-steel hover:text-white transition-colors"
              >
                Dismiss
              </button>
            </motion.div>
          )}

          {showWebhookForm && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-white/10 bg-white/5 p-6"
            >
              <form onSubmit={handleAddWebhook} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-steel uppercase tracking-wider">
                    Webhook URL *
                  </label>
                  <input
                    type="url"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    placeholder="https://example.com/webhook"
                    pattern="https://.*"
                    className="mt-2 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-steel/50 focus:outline-none focus:border-mint/50"
                    required
                  />
                  <p className="mt-1 text-[10px] text-steel">Must be an HTTPS URL</p>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={webhookSubmitting}
                    className="flex-1 rounded-lg bg-mint px-4 py-2 text-xs font-semibold text-black hover:bg-mint/90 transition-colors disabled:opacity-50"
                  >
                    {webhookSubmitting ? "Adding..." : "Add Webhook"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowWebhookForm(false);
                      setWebhookUrl("");
                    }}
                    className="rounded-lg bg-white/5 px-4 py-2 text-xs font-semibold text-steel hover:bg-white/10 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          )}

          {webhooks.length === 0 && !showWebhookForm ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
              <p className="text-sm text-steel">No webhooks configured. Add one to receive event notifications.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {webhooks.map((webhook) => {
                const displayUrl = webhook.url.length > 50
                  ? webhook.url.slice(0, 50) + "..."
                  : webhook.url;

                return (
                  <motion.div
                    key={webhook.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl border border-white/10 bg-white/5 p-4 hover:bg-white/[0.08] transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Link2 size={14} className="text-steel shrink-0" />
                          <h4 className="text-sm font-semibold text-white truncate" title={webhook.url}>
                            {displayUrl}
                          </h4>
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <span className={`inline-block w-1.5 h-1.5 rounded-full ${webhook.active ? "bg-mint" : "bg-steel"}`} />
                          <span className="text-[10px] text-steel">
                            {webhook.active ? "Active" : "Inactive"}
                          </span>
                          <span className="text-[10px] text-steel">
                            Created {new Date(webhook.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleToggleDeliveries(webhook.id)}
                          className="rounded-lg bg-white/5 p-2 text-steel hover:bg-white/10 transition-colors"
                          title="View deliveries"
                        >
                          {expandedDeliveries === webhook.id ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                        <button
                          onClick={() => setWebhookDeleteConfirm(webhook.id)}
                          className="rounded-lg bg-white/5 p-2 text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {webhookDeleteConfirm === webhook.id && (
                      <div className="mb-3 rounded-lg bg-red-500/10 border border-red-500/20 p-3 flex items-center justify-between">
                        <p className="text-xs text-red-400">Delete this webhook?</p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleDeleteWebhook(webhook.id)}
                            className="text-xs font-semibold text-red-400 hover:text-red-300"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setWebhookDeleteConfirm(null)}
                            className="text-xs font-semibold text-steel hover:text-white"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    <button
                      onClick={() => handleToggleDeliveries(webhook.id)}
                      className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-steel hover:text-white transition-colors"
                    >
                      {expandedDeliveries === webhook.id ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      View deliveries
                    </button>

                    {expandedDeliveries === webhook.id && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="mt-3 space-y-2"
                      >
                        {deliveriesLoading === webhook.id ? (
                          <p className="text-xs text-steel">Loading deliveries...</p>
                        ) : deliveries[webhook.id]?.length > 0 ? (
                          deliveries[webhook.id].map((delivery) => (
                            <div
                              key={delivery.id}
                              className="flex items-center justify-between rounded-lg bg-white/[0.03] border border-white/5 px-3 py-2"
                            >
                              <div className="flex items-center gap-3">
                                <span className={`inline-block w-1.5 h-1.5 rounded-full ${delivery.status === "success" ? "bg-mint" : "bg-red-400"}`} />
                                <span className="text-xs text-white capitalize">{delivery.event}</span>
                                <span className={`text-[10px] font-semibold uppercase ${delivery.status === "success" ? "text-mint" : "text-red-400"}`}>
                                  {delivery.status}
                                </span>
                                {delivery.statusCode && (
                                  <span className="text-[10px] text-steel">{delivery.statusCode}</span>
                                )}
                              </div>
                              <span className="text-[10px] text-steel">
                                {new Date(delivery.createdAt).toLocaleString()}
                              </span>
                            </div>
                          ))
                        ) : (
                          <p className="text-xs text-steel">No deliveries yet.</p>
                        )}
                      </motion.div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function StatCard({ title, value, icon, trend, positive }: { 
  title: string; 
  value: string; 
  icon: React.ReactNode; 
  trend: string;
  positive: boolean;
}) {
  return (
    <motion.div 
      whileHover={{ scale: 1.02 }}
      className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-black/20"
    >
      <div className="flex items-center justify-between">
        <div className="rounded-2xl bg-white/5 p-3">
          {icon}
        </div>
        <div className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-tight ${
          positive ? "text-mint" : trend === "Stable" ? "text-steel" : "text-red-400"
        }`}>
          {positive ? <ArrowUpRight size={14} /> : trend === "Stable" ? null : <ArrowDownRight size={14} />}
          {trend}
        </div>
      </div>
      <div className="mt-5">
        <p className="text-[10px] uppercase tracking-[0.2em] text-steel">
          {title}
        </p>
        <h4 className="mt-1 text-2xl font-bold text-white tabular-nums">
          {value}
        </h4>
      </div>
    </motion.div>
  );
}
