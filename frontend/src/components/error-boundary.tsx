"use client";

import React from "react";
import { AppShell } from "./app-shell";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error("Error boundary caught error:", error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <AppShell>
          <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4">
            <div className="rounded-full bg-red-500/10 p-6">
              <svg
                className="h-16 w-16 text-red-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <div className="max-w-md text-center space-y-2">
              <h2 className="text-2xl font-bold text-white">Something went wrong</h2>
              <p className="text-steel">
                An unexpected error occurred. Please try again or contact support if the problem persists.
              </p>
              {this.state.error && (
                <details className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4 text-left">
                  <summary className="cursor-pointer text-sm font-semibold text-white">
                    Error details
                  </summary>
                  <pre className="mt-2 overflow-auto text-xs text-red-400">
                    {this.state.error.message}
                  </pre>
                </details>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={this.handleReset}
                className="rounded-xl bg-mint px-6 py-3 text-sm font-bold text-ink hover:bg-mint/90 transition-colors"
              >
                Try again
              </button>
              <button
                onClick={() => window.location.href = "/"}
                className="rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10 transition-colors"
              >
                Go home
              </button>
            </div>
          </div>
        </AppShell>
      );
    }

    return this.props.children;
  }
}
