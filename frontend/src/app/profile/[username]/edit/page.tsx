"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getAddress } from "@stellar/freighter-api";
import { AppShell } from "@/components/app-shell";
import { API_BASE_URL } from "@/lib/config";
import { apiFetch } from "@/lib/api-client";
import { useToast } from "@/lib/use-toast";
import { Toast } from "@/components/toast";

type Asset = { code: string; issuer: string };

type ProfileData = {
  walletAddress: string;
  displayName: string;
  bio: string;
  websiteUrl: string | null;
  twitterHandle: string | null;
  githubHandle: string | null;
  email: string | null;
  acceptedAssets: Array<{ code: string; issuer?: string | null }>;
};

type FieldErrors = {
  displayName?: string;
  bio?: string;
  websiteUrl?: string;
  twitterHandle?: string;
  githubHandle?: string;
  email?: string;
};

function validate(form: {
  displayName: string;
  bio: string;
  websiteUrl: string;
  twitterHandle: string;
  githubHandle: string;
  email: string;
}): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.displayName.trim()) errors.displayName = "Display name is required.";
  else if (form.displayName.length > 64) errors.displayName = "Max 64 characters.";
  if (form.bio.length > 280) errors.bio = "Max 280 characters.";
  if (form.websiteUrl && !/^https:\/\/.+/.test(form.websiteUrl))
    errors.websiteUrl = "Must start with https://";
  if (form.twitterHandle && !/^[a-zA-Z0-9_]{1,15}$/.test(form.twitterHandle))
    errors.twitterHandle = "Max 15 chars, alphanumeric and underscores only.";
  if (form.githubHandle && !/^[a-zA-Z0-9-]{1,39}$/.test(form.githubHandle))
    errors.githubHandle = "Max 39 chars, alphanumeric and hyphens only.";
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
    errors.email = "Enter a valid email address.";
  return errors;
}

export default function EditProfilePage() {
  const { username } = useParams<{ username: string }>();
  const router = useRouter();
  const { toast, showToast, dismiss } = useToast();

  const [loading, setLoading] = useState(true);
  const [ownershipChecked, setOwnershipChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [walletPrompt, setWalletPrompt] = useState<"locked" | "not-owner" | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const [form, setForm] = useState({
    displayName: "",
    bio: "",
    websiteUrl: "",
    twitterHandle: "",
    githubHandle: "",
    email: "",
  });

  const [assets, setAssets] = useState<Asset[]>([]);
  const [newAssetCode, setNewAssetCode] = useState("");
  const [newAssetIssuer, setNewAssetIssuer] = useState("");
  const [assetError, setAssetError] = useState<string | null>(null);

  useEffect(() => {
    if (ownershipChecked) return;

    async function init() {
      try {
        const res = await fetch(`${API_BASE_URL}/profiles/${username}`);
        if (!res.ok) {
          router.replace("/");
          return;
        }
        const profile: ProfileData = await res.json();

        const result = await getAddress().catch(() => ({ address: "", error: "Freighter not available" }));
        const connectedAddress = "address" in result ? result.address : "";

        if (!connectedAddress) {
          // Wallet not connected or Freighter is locked — show a prompt instead of silently redirecting
          setWalletPrompt("locked");
          return;
        }

        if (connectedAddress !== profile.walletAddress) {
          setWalletPrompt("not-owner");
          return;
        }

        setOwnershipChecked(true);
        setForm({
          displayName: profile.displayName ?? "",
          bio: profile.bio ?? "",
          websiteUrl: profile.websiteUrl ?? "",
          twitterHandle: profile.twitterHandle ?? "",
          githubHandle: profile.githubHandle ?? "",
          email: profile.email ?? "",
        });
        setAssets(
          profile.acceptedAssets.map((a) => ({
            code: a.code,
            issuer: a.issuer ?? "",
          }))
        );
      } catch {
        setAuthError("Failed to load profile.");
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [username, router, ownershipChecked]);

  function setField(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
      setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
    };
  }

  function addAsset() {
    const code = newAssetCode.trim().toUpperCase();
    if (!code) { setAssetError("Asset code is required."); return; }
    if (!/^[A-Z0-9]{1,12}$/.test(code)) { setAssetError("Invalid asset code."); return; }
    if (assets.some((a) => a.code === code)) { setAssetError("Asset already added."); return; }
    setAssets((prev) => [...prev, { code, issuer: newAssetIssuer.trim() }]);
    setNewAssetCode("");
    setNewAssetIssuer("");
    setAssetError(null);
  }

  function removeAsset(code: string) {
    setAssets((prev) => prev.filter((a) => a.code !== code));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errors = validate(form);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      const profilePayload: Record<string, string | null> = {
        displayName: form.displayName,
        bio: form.bio || "",
        websiteUrl: form.websiteUrl || null,
        twitterHandle: form.twitterHandle || null,
        githubHandle: form.githubHandle || null,
        email: form.email || null,
      };

      const [profileRes, assetsRes] = await Promise.all([
        apiFetch(`${API_BASE_URL}/profiles/${username}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(profilePayload),
        }),
        apiFetch(`${API_BASE_URL}/profiles/${username}/assets`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assets: assets.map((a) => ({
              code: a.code,
              issuer: a.issuer || null,
            })),
          }),
        }),
      ]);

      if (!profileRes.ok) {
        const json = await profileRes.json().catch(() => ({})) as Record<string, unknown>;
        throw new Error(typeof json.error === "string" ? json.error : "Failed to save profile.");
      }
      if (!assetsRes.ok) {
        const json = await assetsRes.json().catch(() => ({})) as Record<string, unknown>;
        throw new Error(typeof json.error === "string" ? json.error : "Failed to save assets.");
      }

      showToast("Profile updated successfully!", "success");
      setTimeout(() => router.push(`/profile/${username}`), 1500);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed to save changes.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !ownershipChecked) {
    return (
      <AppShell>
        <div className="flex h-[60vh] items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-mint border-t-transparent" />
        </div>
      </AppShell>
    );
  }

  if (walletPrompt === "locked") {
    return (
      <AppShell>
        <div className="flex h-[60vh] flex-col items-center justify-center gap-4 text-center px-4">
          <div className="rounded-full bg-yellow-500/10 p-4 text-3xl">🔒</div>
          <h2 className="text-xl font-bold text-white">Connect your wallet to edit this profile</h2>
          <p className="text-sm text-steel max-w-sm">
            Freighter is not connected or is locked. Unlock your Freighter wallet and try again.
          </p>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setWalletPrompt(null);
              // Re-run the init flow by resetting ownershipChecked
              setOwnershipChecked(false);
            }}
            className="min-h-[44px] rounded-xl bg-mint px-6 text-sm font-bold text-ink hover:bg-mint/90 transition-colors"
          >
            Try again
          </button>
          <Link href={`/profile/${username}`} className="text-sm text-steel hover:text-white transition-colors">
            ← Back to profile
          </Link>
        </div>
      </AppShell>
    );
  }

  if (walletPrompt === "not-owner") {
    return (
      <AppShell>
        <div className="flex h-[60vh] flex-col items-center justify-center gap-4 text-center px-4">
          <div className="rounded-full bg-red-500/10 p-4 text-3xl">🚫</div>
          <h2 className="text-xl font-bold text-white">Access denied</h2>
          <p className="text-sm text-steel max-w-sm">
            The connected wallet does not match this profile. Switch to the correct wallet in Freighter and try again.
          </p>
          <Link
            href={`/profile/${username}`}
            className="min-h-[44px] inline-flex items-center rounded-xl bg-white/10 px-6 text-sm font-bold text-white hover:bg-white/20 transition-colors"
          >
            ← Back to profile
          </Link>
        </div>
      </AppShell>
    );
  }

  if (authError) {
    return (
      <AppShell>
        <div className="flex h-[60vh] items-center justify-center">
          <p className="text-red-400">{authError}</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={dismiss} />}
      <div className="mx-auto max-w-2xl space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">Edit Profile</h1>
          <Link
            href={`/profile/${username}`}
            className="text-sm text-steel hover:text-white transition-colors"
          >
            ← Cancel
          </Link>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-8">
          {/* Profile fields */}
          <section className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 space-y-5">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-steel">
              Profile Info
            </h2>

            <Field
              label="Display Name"
              required
              error={fieldErrors.displayName}
            >
              <input
                type="text"
                value={form.displayName}
                onChange={setField("displayName")}
                maxLength={64}
                className={inputCls(!!fieldErrors.displayName)}
                placeholder="Your name"
              />
            </Field>

            <Field label="Bio" error={fieldErrors.bio}>
              <textarea
                value={form.bio}
                onChange={setField("bio")}
                maxLength={280}
                rows={3}
                className={inputCls(!!fieldErrors.bio)}
                placeholder="Tell supporters about yourself (max 280 chars)"
              />
              <p className="mt-1 text-right text-[10px] text-steel">
                {form.bio.length}/280
              </p>
            </Field>

            <Field label="Website URL" error={fieldErrors.websiteUrl}>
              <input
                type="url"
                value={form.websiteUrl}
                onChange={setField("websiteUrl")}
                className={inputCls(!!fieldErrors.websiteUrl)}
                placeholder="https://yoursite.com"
              />
            </Field>

            <Field label="Twitter Handle" error={fieldErrors.twitterHandle}>
              <input
                type="text"
                value={form.twitterHandle}
                onChange={setField("twitterHandle")}
                maxLength={15}
                className={inputCls(!!fieldErrors.twitterHandle)}
                placeholder="username (no @)"
              />
            </Field>

            <Field label="GitHub Handle" error={fieldErrors.githubHandle}>
              <input
                type="text"
                value={form.githubHandle}
                onChange={setField("githubHandle")}
                maxLength={39}
                className={inputCls(!!fieldErrors.githubHandle)}
                placeholder="username"
              />
            </Field>

            <Field label="Email" error={fieldErrors.email}>
              <input
                type="email"
                value={form.email}
                onChange={setField("email")}
                className={inputCls(!!fieldErrors.email)}
                placeholder="you@example.com"
              />
            </Field>
          </section>

          {/* Accepted assets */}
          <section className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-steel">
              Accepted Assets
            </h2>

            <div className="flex flex-wrap gap-2">
              {assets.map((a) => (
                <span
                  key={a.code}
                  className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-white"
                >
                  {a.code}
                  <button
                    type="button"
                    onClick={() => removeAsset(a.code)}
                    aria-label={`Remove ${a.code}`}
                    className="text-steel hover:text-red-400 transition-colors leading-none"
                  >
                    ×
                  </button>
                </span>
              ))}
              {assets.length === 0 && (
                <p className="text-sm text-steel">No assets added yet.</p>
              )}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className="block text-xs text-steel mb-1">Asset Code</label>
                <input
                  type="text"
                  value={newAssetCode}
                  onChange={(e) => { setNewAssetCode(e.target.value.toUpperCase()); setAssetError(null); }}
                  maxLength={12}
                  className={inputCls(false) + " uppercase"}
                  placeholder="XLM"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-steel mb-1">Issuer (optional)</label>
                <input
                  type="text"
                  value={newAssetIssuer}
                  onChange={(e) => setNewAssetIssuer(e.target.value)}
                  className={inputCls(false)}
                  placeholder="G… (leave blank for XLM)"
                />
              </div>
              <button
                type="button"
                onClick={addAsset}
                className="min-h-[44px] rounded-xl border border-mint/30 bg-mint/10 px-4 text-sm font-semibold text-mint hover:bg-mint/20 transition-colors"
              >
                Add
              </button>
            </div>
            {assetError && <p className="text-xs text-red-400">{assetError}</p>}
          </section>

          <div className="flex items-center justify-end gap-4">
            <Link
              href={`/profile/${username}`}
              className="text-sm text-steel hover:text-white transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[44px] rounded-xl bg-mint px-6 text-sm font-bold text-ink hover:bg-mint/90 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}

function inputCls(hasError: boolean) {
  return [
    "w-full rounded-xl border bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-steel/50 outline-none transition-colors",
    hasError
      ? "border-red-500/60 focus:border-red-500"
      : "border-white/10 focus:border-mint/50",
  ].join(" ");
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-steel mb-1.5">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}
