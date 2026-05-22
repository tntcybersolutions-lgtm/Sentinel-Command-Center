import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FileQuestion, FileCheck2, ClipboardCheck, GitPullRequestArrow, ChevronRight, Inbox } from "lucide-react";

interface Row { key: string; label: string; sub: string; icon: React.ComponentType<{ className?: string }>; href: string; endpoint: string; iconBg: string; iconColor: string; numColor: string; }

const ROWS: Row[] = [
  { key: "rfis", label: "RFIs", sub: "assigned to me", icon: FileQuestion, href: "/execution/rfis?assignedTo=me", endpoint: "/api/rfis/mine/count", iconBg: "bg-amber-500/15", iconColor: "text-amber-500", numColor: "text-amber-400" },
  { key: "submittals", label: "Submittals", sub: "to review", icon: FileCheck2, href: "/execution/submittals?assignedTo=me", endpoint: "/api/submittals/mine/count", iconBg: "bg-blue-500/15", iconColor: "text-blue-500", numColor: "text-blue-400" },
  { key: "punch", label: "Punch items", sub: "overdue", icon: ClipboardCheck, href: "/punch-list?filter=overdue", endpoint: "/api/punch/mine/count", iconBg: "bg-red-500/15", iconColor: "text-red-500", numColor: "text-red-400" },
  { key: "approvals", label: "Approvals", sub: "waiting on me", icon: GitPullRequestArrow, href: "/approvals?for=me", endpoint: "/api/approvals/mine/count", iconBg: "bg-purple-500/15", iconColor: "text-purple-500", numColor: "text-purple-400" },
];

function useCount(endpoint: string) {
  return useQuery<{ count: number }>({
    queryKey: [endpoint],
    queryFn: async () => { try { const r = await fetch(endpoint); if (!r.ok) return { count: 0 }; const j = await r.json(); return { count: typeof j === "number" ? j : j.count ?? j.total ?? 0 }; } catch { return { count: 0 }; } },
    staleTime: 30_000,
  });
}

function RowItem({ row }: { row: Row }) {
  const [, setLocation] = useLocation();
  const { data, isLoading } = useCount(row.endpoint);
  const count = data?.count ?? 0;
  const Icon = row.icon;
  return (
    <button onClick={() => setLocation(row.href)} className="group w-full flex items-center gap-4 px-4 py-3 border-b last:border-b-0 text-left transition-all hover:bg-white/[0.03]" data-testid={`row-my-open-${row.key}`}>
      <div className={`h-10 w-10 rounded-lg flex items-center justify-center ring-1 ring-inset ring-white/5 ${row.iconBg} ${row.iconColor} shrink-0`}>
        <Icon className="h-4.5 w-4.5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm leading-tight">{row.label}</p>
        <p className="text-xs text-muted-foreground leading-tight mt-0.5">{row.sub}</p>
      </div>
      {isLoading ? (<Skeleton className="h-8 w-12" />) : (<div className={`text-2xl font-bold tabular-nums leading-none ${count > 0 ? row.numColor : "text-muted-foreground/40"}`} data-testid={`badge-count-${row.key}`}>{count}</div>)}
      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
    </button>
  );
}

export function MyOpenItems() {
  return (
    <Card className="overflow-hidden bg-card/80 border-white/10 shadow-lg shadow-black/20" data-testid="card-my-open-items">
      <CardContent className="p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-gradient-to-r from-white/[0.04] to-transparent">
          <div className="flex items-center gap-2"><Inbox className="h-4 w-4 text-muted-foreground" /><h2 className="text-sm font-semibold tracking-tight">My open items</h2></div>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Today</span>
        </div>
        {ROWS.map((row) => <RowItem key={row.key} row={row} />)}
      </CardContent>
    </Card>
  );
}

export default MyOpenItems;
