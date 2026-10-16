"use client";

import { useState, useCallback } from "react";
import FocusTrap from "focus-trap-react";
import { Flag, X } from "lucide-react";
import { API_BASE_URL } from "@/lib/config";

type ReportReason = "spam" | "impersonation" | "inappropriate" | "scam";

const REASON_LABELS: Record<ReportReason, string> = {
  spam: "Spam",
  impersonation: "Impersonation",
  inappropriate: "Inappropriate content",
  scam: "Scam / fraud",
};

type ReportProfileModalProps = {
  username: string;
  displayName: string;
};

export function ReportProfileModal({
  username,
  displayName,
}: ReportProfileModalProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | "">("");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openModal = useCallback(() => {
    setOpen(true);
    setSubmitted(false);
    setError(null);
    setReason("");
    setDetails("");
  }, []);

  const closeModal = useCallback(() => {
    setOpen(false);
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!reason) return;

      setSubmitting(true);
      setError(null);

      try {
        const res = await fetch(
          `${API_BASE_URL}/v1/profiles/${username}/report`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reason, details: details.trim() || undefined }),
          },
        );

        if (res.status === 429) {
          setError(
            "You have already reported this profile. Please wait an hour before submitting another report.",
          );
          return;
        }

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(
            (body as { error?: string }).error ??
              "Failed to submit report. Please try again.",
          );
          return;
        }

        setSubmitted(true);
      } catch {
        setError("Connection error. Please check your network and try again.");
      } finally {
        setSubmitting(false);
      }
    },
    [username, reason, details],
  );

  return (
    <>
      {/* Trigger — a small "Report" link in the profile action row */}
      <button
        type="button"
        onClick={openModal}
        aria-label={`Report ${displayName}'s profile`}
        className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-sky/60 transition hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30"
      >
        <Flag size={13} aria-hidden="true" />
        Report
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-ink/80 backdrop-blur-sm"
            onClick={closeModal}
            aria-hidden="true"
          />

          <FocusTrap
            focusTrapOptions={{
              escapeDeactivates: false, // handled below via onKeyDown
              allowOutsideClick: true,
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="report-modal-title"
              onKeyDown={(e) => {
                if (e.key === "Escape") closeModal();
              }}
              className="relative w-full max-w-md rounded-[2rem] border border-white/10 bg-[#0A0A0B] p-6 shadow-2xl"
            >
              {/* Header */}
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <h2
                    id="report-modal-title"
                    className="text-base font-bold text-white"
                  >
                    Report @{username}
                  </h2>
                  <p className="mt-1 text-xs text-sky/60">
                    Help us keep NovaSupport safe. Reports are reviewed by our
                    moderation team.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeModal}
                  aria-label="Close report dialog"
                  className="rounded-lg p-1.5 text-steel transition hover:text-white"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>

              {submitted ? (
                /* Success state */
                <div className="flex flex-col items-center gap-3 py-6 text-center">
                  <span className="text-4xl">✅</span>
                  <p className="text-sm font-semibold text-white">
                    Report submitted
                  </p>
                  <p className="text-xs text-sky/60">
                    Thank you. Our team will review this profile.
                  </p>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="mt-3 rounded-full bg-white px-6 py-2 text-xs font-bold text-ink transition hover:bg-mint"
                  >
                    Close
                  </button>
                </div>
              ) : (
                /* Form */
                <form onSubmit={handleSubmit} className="space-y-4">
                  <fieldset>
                    <legend className="text-xs font-semibold uppercase tracking-wider text-steel">
                      Reason <span aria-hidden="true">*</span>
                    </legend>
                    <div className="mt-2 space-y-2">
                      {(Object.keys(REASON_LABELS) as ReportReason[]).map(
                        (key) => (
                          <label
                            key={key}
                            className="flex cursor-pointer items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 transition hover:bg-white/10 has-[:checked]:border-mint/50 has-[:checked]:bg-mint/5"
                          >
                            <input
                              type="radio"
                              name="report-reason"
                              value={key}
                              checked={reason === key}
                              onChange={() => setReason(key)}
                              className="accent-mint"
                            />
                            <span className="text-sm text-white">
                              {REASON_LABELS[key]}
                            </span>
                          </label>
                        ),
                      )}
                    </div>
                  </fieldset>

                  <div>
                    <label
                      htmlFor="report-details"
                      className="text-xs font-semibold uppercase tracking-wider text-steel"
                    >
                      Additional details{" "}
                      <span className="normal-case text-steel/60">
                        (optional, max 500 chars)
                      </span>
                    </label>
                    <textarea
                      id="report-details"
                      value={details}
                      onChange={(e) => setDetails(e.target.value)}
                      maxLength={500}
                      rows={3}
                      placeholder="Describe the issue in more detail…"
                      className="mt-2 w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-steel/50 focus:border-mint/50 focus:outline-none"
                    />
                    <p className="mt-1 text-right text-[10px] text-steel">
                      {details.length}/500
                    </p>
                  </div>

                  {error && (
                    <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
                      {error}
                    </p>
                  )}

                  <div className="flex gap-3 pt-1">
                    <button
                      type="button"
                      onClick={closeModal}
                      className="flex-1 rounded-lg bg-white/5 px-4 py-2.5 text-xs font-semibold text-steel transition hover:bg-white/10"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!reason || submitting}
                      className="flex-1 rounded-lg bg-red-500/80 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {submitting ? "Submitting…" : "Submit report"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </FocusTrap>
        </div>
      )}
    </>
  );
}
