import Link from "next/link";
import { AppShell } from "@/components/app-shell";

export default function ProfileNotFound() {
  return (
    <AppShell>
      <div className="mx-auto max-w-xl rounded-[2rem] border border-white/10 bg-white/[0.04] p-8 text-center">
        <p className="text-sm uppercase tracking-[0.3em] text-gold">
          Profile not found
        </p>
        <h1 className="mt-4 text-3xl font-semibold text-white">
          That creator page does not exist.
        </h1>
        <p className="mt-3 text-sm text-sky/75">
          Check the username or return to explore active profiles.
        </p>
        <Link
          href="/explore"
          className="mt-6 inline-flex rounded-full bg-mint px-5 py-3 text-sm font-semibold text-ink transition hover:bg-white"
        >
          Back to explore
        </Link>
      </div>
    </AppShell>
  );
}
