import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FileQuestion, FileCheck2, ClipboardCheck, GitPullRequestArrow, ChevronRight, Inbox } from "lucide-react";

interface Row { key: string; label: string; icon: React.ComponentType<{ className?: string }>; href: string; endpoint: string; iconBg: string; iconColor: string; countTone: string; }

const ROWS: Row[] = [
  { key: "rfis", label: "RFIs assigned to me", icon: FileQuestion, href: "/execution/rfis?assignedTo=me", endpoint: "/api/rfis/mine/count", iconBg: "bg-amber-500/15", iconColor: "text-amber-500", countTone: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  { key: "submittals", label: "Submittals to review", icon: FileCheck2, href: "/execution/submittals?assignedTo=me", endpoint: "/api/submittals/mine/count", iconBg: "bg-blue-500/15", iconColor: "text-blue-500", countTone: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  { key: "punch", label: "Punch items overdue", icon: ClipboardCheck, href: "/punch-list?filter=overdue", endpoint: "/api/punch/mine/count", iconBg: "bg-red-500/15", iconColor: "text-red-500", countTone: "bg-red-500/15 text-red-400 border-red-500/30" },
  { key: "approvals", label: "Approvals waiting on me", icon: GitPullRequestArrow, href: "/approvals?for=me", endpoint: "/api/approvals/mine/count", iconBg: "bg-purple-500/15", iconColor: "text-purple-500", countTone: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
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
    <button onClick={() => setLocation(row.href)} className="group w-full flex items-center gap-3 px-4 py-3.5 border-b last:border-b-0 text-left transition-all hover:bg-muted/30" data-testid={`row-my-open-${row.key}`}>
      <div className={`h-9 w-9 rounded-lg flex items-center justify-center ring-1 ring-inset ring-white/5 ${row.iconBg} ${row.iconColor} shrink-0`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0"><p className="font-medium text-sm truncate">{row.label}</p></div>
      {isLoading ? (<Skeleton className="h-6 w-10" />) : (<Badge variant="outline" className={`font-mono tabular-nums text-xs font-semibold h-6 px-2 ${count > 0 ? row.countTone : "bg-muted/30 text-muted-foreground border-border"}`} data-testid={`badge-count-${row.key}`}>{count}</Badge>)}
      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
    </button>
  );
}

export function MyOpenItems() {
  return (
    <Card className="overflow-hidden border-border/60 shadow-sm" data-testid="card-my-open-items">
      <CardContent className="p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-muted/40 to-transparent">
          <div className="flex items-center gap-2"><Inbox className="h-4 w-4 text-muted-foreground" /><h2 className="text-sm font-semibold tracking-tight">My open items</h2></div>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Today</span>
        </div>
        {ROWS.map((row) => <RowItem key={row.key} row={row} />)}
      </CardContent>
    </Card>
  );
}

export default MyOpenItems;
