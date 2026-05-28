import {
  ProfileCardSkeleton,
  MilestoneSkeleton,
  SidebarSkeleton,
  Skeleton,
  SupportPanelSkeleton,
  LeaderboardSkeleton,
  StatsSkeleton,
} from "@/components/skeleton";

export function ProfileSkeleton() {
  return (
    <div className="space-y-12 animate-fade-in">
      <div className="space-y-3">
        <ProfileCardSkeleton />
        <Skeleton className="h-10 w-full rounded-2xl" />
      </div>

      <div className="px-2 space-y-4">
        <Skeleton className="h-3 w-32" />
        <div className="space-y-4">
          <MilestoneSkeleton />
        </div>
      </div>

      <div className="px-2">
        <Skeleton className="h-10 w-full rounded-xl" />
      </div>
    </div>
  );
}

export function ProfilePageSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8 items-start">
      <ProfileSkeleton />
      <aside className="space-y-6 animate-fade-in">
        <SupportPanelSkeleton />
        <LeaderboardSkeleton />
        <StatsSkeleton />
      </aside>
    </div>
  );
}

export { SidebarSkeleton };
