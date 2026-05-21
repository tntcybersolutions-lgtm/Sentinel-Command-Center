import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FileQuestion, FileCheck2, ClipboardCheck, GitPullRequestArrow, ChevronRight, Inbox } from "lucide-react";

interface Row { key: string; label: string; icon: React.ComponentType<{ className?: string }>; href: string; endpoint: string; tone: string; }

const ROWS: Row[] = [
  { key: "rfis", label: "RFIs assigned to me", icon: FileQuestion, href: "/execution/rfis?assignedTo=me", endpoint: "/api/rfis/mine/count", tone: "text-amber-500 bg-amber-500/10 ring-amber-500/20" },
  { key: "submittals", label: "Submittals to review", icon: FileCheck2, href: "/execution/submittals?assignedTo=me", endpoint: "/api/submittals/mine/count", tone: "text-blue-500 bg-blue-500/10 ring-blue-500/20" },
  { key: "punch", label: "Punch items overdue", icon: ClipboardCheck, href: "/punch-list?filter=overdue", endpoint: "/api/punch/mine/count", tone: "text-red-500 bg-red-500/10 ring-red-500/20" },
  { key: "approvals", label: "Approvals waiting on me", icon: GitPullRequestArrow, href: "/approvals?for=me", endpoint: "/api/approvals/mine/count", tone: "text-purple-500 bg-purple-500/10 ring-purple-500/20" },
];

function useCount(endpoint: string) {
  return useQuery<{ count: number }>({
    queryKey: [endpoint],
    queryFn: async () => {
      try {
        const r = await fetch(endpoint);
        if (!r.ok) return { count: 0 };
        const j = await r.json();
        return { count: typeof j === "number" ? j : (j.count ?? j.total ?? 0) };
      } catch { return { count: 0 }; }
    },
    staleTime: 30_000,
  });
}

function RowItem({ row }: { row: Row }) {
  const [, setLocation] = useLocation();
  const { data, isLoading } = useCount(row.endpoint);
  const count = data?.count ?? 0;
  const Icon = row.icon;
  return (
    <button
      onClick={() => setLocation(row.href)}
      className="w-full flex items-center gap-3 px-4 py-3 hover-elevate active-elevate-2 border-b last:border-b-0 text-left transition-colors"
      data-testid={`row-my-open-${row.key}`}
    >
      <div className={`h-9 w-9 rounded-lg flex items-center justify-center ring-1 ${row.tone}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{row.label}</p>
      </div>
      {isLoading ? (
        <Skeleton className="h-6 w-10" />
      ) : count > 0 ? (
        <Badge variant="secondary" className="font-mono tabular-nums" data-testid={`badge-count-${row.key}`}>{count}</Badge>
      ) : (
        <span className="text-xs text-muted-foreground">0</span>
      )}
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}

export function MyOpenItems() {
  return (
    <Card className="overflow-hidden" data-testid="card-my-open-items">
      <CardContent className="p-0">
        <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/30">
          <Inbox className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold tracking-tight">My open items</h2>
        </div>
        {ROWS.map((row) => <RowItem key={row.key} row={row} />)}
      </CardContent>
    </Card>
  );
}

export default MyOpenItems;
