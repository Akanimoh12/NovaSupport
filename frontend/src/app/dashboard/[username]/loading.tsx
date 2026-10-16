import { AppShell } from "@/components/app-shell";

export default function DashboardLoading() {
  return (
    <AppShell>
      <div className="animate-pulse space-y-4 p-8 max-w-4xl mx-auto">
        <div className="h-6 w-1/3 rounded bg-steel-200" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded bg-steel-200" />
          ))}
        </div>
        <div className="h-64 rounded bg-steel-200" />
      </div>
    </AppShell>
  );
}