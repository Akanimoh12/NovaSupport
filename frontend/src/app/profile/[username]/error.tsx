"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";

export default function ProfileError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error for debugging
    console.error("Profile page error:", {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });

    // Send to error tracking service if available
    if (typeof window !== "undefined" && (window as any).Sentry) {
      (window as any).Sentry.captureException(error, {
        tags: { page: "profile" },
        extra: { digest: error.digest },
      });
    }
  }, [error]);

  // Detect error types
  const isNotFound =
    /PROFILE_NOT_FOUND|NEXT_NOT_FOUND|404/i.test(error.message);
  const isServerError =
    /500|INTERNAL_SERVER_ERROR|ECONNREFUSED|ETIMEDOUT/i.test(error.message);
  const isNetworkError = /NETWORK_ERROR|Failed to fetch/i.test(error.message);

  const getErrorTitle = () => {
    if (isNotFound) return "That creator page does not exist.";
    if (isNetworkError) return "Connection problem";
    if (isServerError) return "Server temporarily unavailable";
    return "We couldn't load this profile.";
  };

  const getErrorMessage = () => {
    if (isNotFound)
      return "Check the username or return to explore active profiles.";
    if (isNetworkError)
      return "Please check your internet connection and try again.";
    if (isServerError)
      return "Our servers are experiencing issues. Please try again in a few moments.";
    return "The request failed on the server. Retry the page or go back to explore.";
  };

  const getErrorType = () => {
    if (isNotFound) return "404";
    if (isServerError) return "500";
    if (isNetworkError) return "Network";
    return "Error";
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-xl rounded-[2rem] border border-white/10 bg-white/[0.04] p-8 text-center">
        <p
          className={`text-sm uppercase tracking-[0.3em] ${
            isNotFound ? "text-gold" : "text-red-400"
          }`}
        >
          {getErrorType()}
        </p>
        <h1 className="mt-4 text-3xl font-semibold text-white">
          {getErrorTitle()}
        </h1>
        <p className="mt-3 text-sm text-sky/75">{getErrorMessage()}</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          {!isNotFound && (
            <button
              onClick={() => {
                console.log("Retrying profile load...");
                reset();
              }}
              className="rounded-full bg-mint px-5 py-3 text-sm font-semibold text-ink transition hover:bg-white"
            >
              {isNetworkError ? "Retry connection" : "Try again"}
            </button>
          )}
          <Link
            href="/explore"
            className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Back to explore
          </Link>
        </div>
        {error.digest && !isNotFound && (
          <p className="mt-4 text-[10px] uppercase tracking-[0.2em] text-steel/50">
            Error ID: {error.digest}
          </p>
        )}
        {process.env.NODE_ENV === "development" && (
          <details className="mt-6 text-left">
            <summary className="cursor-pointer text-xs text-steel/50 hover:text-steel">
              Debug info (dev only)
            </summary>
            <pre className="mt-2 overflow-auto rounded bg-black/20 p-3 text-[10px] text-steel/75">
              {error.stack}
            </pre>
          </details>
        )}
      </div>
    </AppShell>
  );
}
