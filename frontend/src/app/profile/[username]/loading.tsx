import { AppShell } from "@/components/app-shell";
import { ProfilePageSkeleton } from "@/components/profile-skeleton";

export default function Loading() {
  return (
    <AppShell>
      <ProfilePageSkeleton />
    </AppShell>
  );
}
