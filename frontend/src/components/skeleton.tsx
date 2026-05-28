import { cn } from "@/lib/utils";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-white/10", className)}
      {...props}
    />
  );
}

export function ProfileCardSkeleton() {
  return (
    <article className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 sm:p-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-4">
          <Skeleton className="w-16 h-16 rounded-full" />
          <div className="space-y-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-48 sm:w-64" />
            <div className="space-y-2 mt-4">
              <Skeleton className="h-4 w-full sm:w-[400px]" />
              <Skeleton className="h-4 w-3/4 sm:w-[300px]" />
            </div>
            
            <div className="mt-6 flex flex-wrap gap-8 items-center border-t border-white/5 pt-6">
              <div className="space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-4 w-32" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-4 w-32" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-4 w-32" />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Skeleton className="h-8 w-24 rounded-full" />
              <Skeleton className="h-8 w-32 rounded-full" />
            </div>
          </div>
        </div>
        <div className="w-full sm:w-48 h-24 rounded-3xl border border-white/5 bg-white/[0.02]" />
      </div>
      
      <div className="mt-8">
        <Skeleton className="h-4 w-32 mb-3" />
        <div className="flex flex-wrap gap-3">
          <Skeleton className="h-9 w-20 rounded-full" />
          <Skeleton className="h-9 w-20 rounded-full" />
          <Skeleton className="h-9 w-20 rounded-full" />
        </div>
      </div>
    </article>
  );
}

export function MilestoneSkeleton() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
      <div className="flex justify-between">
        <div className="space-y-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3 w-64" />
        </div>
        <Skeleton className="h-4 w-16" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-2 w-full rounded-full" />
        <div className="flex justify-between">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-8" />
        </div>
      </div>
    </div>
  );
}

export function SupportPanelSkeleton() {
  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6 h-[400px]">
      <Skeleton className="h-6 w-3/4 mb-6" />
      <div className="space-y-4">
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <div className="pt-4">
          <Skeleton className="h-12 w-full rounded-full" />
        </div>
      </div>
    </div>
  );
}

export function LeaderboardSkeleton() {
  return (
    <div className="rounded-3xl border border-white/5 bg-white/[0.02] p-6">
      <Skeleton className="h-[10px] w-24 mb-4" />
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center justify-between">
            <Skeleton className="h-3 w-4" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function StatsSkeleton() {
  return (
    <div className="rounded-3xl border border-white/5 bg-white/[0.02] p-6">
      <Skeleton className="h-[10px] w-24 mb-4" />
      <div className="space-y-4">
        <div className="flex justify-between">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="flex justify-between">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-12" />
        </div>
        <Skeleton className="h-1.5 w-full rounded-full" />
        <Skeleton className="h-3 w-32 mx-auto" />
      </div>
    </div>
  );
}

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

export function SidebarSkeleton() {
  return (
    <aside className="space-y-6 animate-fade-in">
      <SupportPanelSkeleton />
      <LeaderboardSkeleton />
      <StatsSkeleton />
    </aside>
  );
}
