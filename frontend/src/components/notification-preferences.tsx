"use client";

import { useEffect, useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

type Prefs = {
  notifyOnSupport: boolean;
  notifyOnMilestone: boolean;
  weeklyDigest: boolean;
};

type Props = {
  username: string;
};

export function NotificationPreferences({ username }: Props) {
  const [prefs, setPrefs] = useState<Prefs>({
    notifyOnSupport: true,
    notifyOnMilestone: true,
    weeklyDigest: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("authToken");
    if (!token) {
      setLoading(false);
      return;
    }

    fetch(`${API_BASE_URL}/profiles/${username}/notification-preferences`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setPrefs(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [username]);

  const handleToggle = (key: keyof Prefs) => {
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const token = localStorage.getItem("authToken");
      const res = await fetch(
        `${API_BASE_URL}/profiles/${username}/notification-preferences`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(prefs),
        },
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save preferences");
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  const toggleClass = (on: boolean) =>
    `relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
      on ? "bg-[#00e5b0]" : "bg-white/10"
    }`;

  const knobClass = (on: boolean) =>
    `pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition duration-200 ${
      on ? "translate-x-4" : "translate-x-0"
    }`;

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-white/60">
        Notification Preferences
      </h2>

      <div className="space-y-3">
        <PreferenceRow
          label="New support received"
          description="Get an email when someone sends you support."
          checked={prefs.notifyOnSupport}
          onToggle={() => handleToggle("notifyOnSupport")}
          toggleClass={toggleClass}
          knobClass={knobClass}
        />
        <PreferenceRow
          label="Milestone reached"
          description="Get an email when a funding goal is completed."
          checked={prefs.notifyOnMilestone}
          onToggle={() => handleToggle("notifyOnMilestone")}
          toggleClass={toggleClass}
          knobClass={knobClass}
        />
        <PreferenceRow
          label="Weekly digest"
          description="Receive a weekly summary of your support activity."
          checked={prefs.weeklyDigest}
          onToggle={() => handleToggle("weeklyDigest")}
          toggleClass={toggleClass}
          knobClass={knobClass}
        />
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <button
        onClick={handleSave}
        disabled={saving}
        className="min-h-[44px] w-full rounded-xl bg-[#00e5b0] px-4 py-2 text-sm font-semibold text-black hover:bg-[#00c99a] transition-colors disabled:opacity-50"
      >
        {saving ? "Saving…" : saved ? "Saved!" : "Save preferences"}
      </button>
    </section>
  );
}

function PreferenceRow({
  label,
  description,
  checked,
  onToggle,
  toggleClass,
  knobClass,
}: {
  label: string;
  description: string;
  checked: boolean;
  onToggle: () => void;
  toggleClass: (on: boolean) => string;
  knobClass: (on: boolean) => string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-white">{label}</p>
        <p className="text-xs text-white/40 mt-0.5">{description}</p>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={onToggle}
        className={toggleClass(checked)}
      >
        <span className={knobClass(checked)} />
      </button>
    </div>
  );
}
