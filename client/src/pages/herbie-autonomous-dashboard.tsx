import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Zap,
  Activity,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  AlertCircle,
  Calendar,
  TrendingUp,
  Bot,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface HerbieActivityLog {
  id: string;
  timestamp: string;
  action: string;
  entityType: string;
  entityId: string;
  details: Record<string, unknown>;
  outcome: "success" | "pending" | "error";
}

interface UpcomingDeadline {
  title: string;
  dueDate: string;
  daysRemaining: number;
}

interface DailyBriefing {
  date?: string;
  pendingApprovals?: number;
  activeBidCount?: number;
  upcomingDeadlines?: UpcomingDeadline[];
  exceptions?: string[];
  summary?: string;
  highlights?: string[];
  [key: string]: unknown;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function OutcomeIcon({ o }: { o: "success" | "pending" | "error" }) {
  if (o === "success") return <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />;
  if (o === "error") return <XCircle className="h-4 w-4 text-red-500 shrink-0" />;
  return <Loader2 className="h-4 w-4 text-yellow-500 shrink-0 animate-spin" />;
}

function outcomeBadge(o: "success" | "pending" | "error") {
  if (o === "success") return <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">success</Badge>;
  if (o === "error") return <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">error</Badge>;
  return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200 text-xs">pending</Badge>;
}

function fmtTs(d: string) {
  try {
    return new Date(d).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return d;
  }
}

// ─── Daily Briefing Panel ─────────────────────────────────────────────────────

function DailyBriefingPanel() {
  const { data: briefing, isLoading, error, refetch } = useQuery<DailyBriefing>({
    queryKey: ["/api/herbie/autonomous/daily-briefing"],
    queryFn: () =>
      apiRequest("GET", "/api/herbie/autonomous/daily-briefing").then((r) =>
        r.json()
      ),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-4 w-4 text-primary" /> Daily Briefing
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Generating briefing…
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !briefing) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-4 w-4 text-primary" /> Daily Briefing
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <AlertCircle className="h-4 w-4 text-red-400" /> Failed to load briefing.
            <Button variant="ghost" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const highlights = briefing.highlights ?? [];
  const deadlines = briefing.upcomingDeadlines ?? [];
  const exceptions = briefing.exceptions ?? [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" /> Daily Briefing
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={() => refetch()}
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary */}
        {briefing.summary && (
          <p className="text-sm text-muted-foreground leading-relaxed">
            {briefing.summary}
          </p>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-3">
          {briefing.pendingApprovals != null && (
            <div className="flex items-center gap-2 text-sm">
              <AlertCircle className="h-4 w-4 text-yellow-500" />
              <span>
                <strong>{briefing.pendingApprovals}</strong> pending approvals
              </span>
            </div>
          )}
          {briefing.activeBidCount != null && (
            <div className="flex items-center gap-2 text-sm">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              <span>
                <strong>{briefing.activeBidCount}</strong> active bids
              </span>
            </div>
          )}
        </div>

        {/* Highlights */}
        {highlights.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
              Highlights
            </p>
            <ul className="space-y-1">
              {highlights.map((h, i) => (
                <li key={i} className="text-sm flex items-start gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
                  {h}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Upcoming Deadlines */}
        {deadlines.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
              Upcoming Deadlines
            </p>
            <div className="space-y-1.5">
              {deadlines.slice(0, 5).map((d, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="truncate max-w-[200px]">{d.title}</span>
                  </span>
                  <Badge
                    variant={d.daysRemaining <= 3 ? "destructive" : "secondary"}
                    className="text-xs"
                  >
                    {d.daysRemaining}d
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Exceptions */}
        {exceptions.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
              Exceptions
            </p>
            <ul className="space-y-1">
              {exceptions.map((e, i) => (
                <li key={i} className="text-sm flex items-start gap-2">
                  <AlertCircle className="h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0" />
                  {e}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function HerbieAutonomousDashboard() {
  const qc = useQueryClient();

  const {
    data: activityLog = [],
    isLoading: logLoading,
    refetch: refetchLog,
  } = useQuery<HerbieActivityLog[]>({
    queryKey: ["/api/herbie/autonomous/activity-log"],
    queryFn: () =>
      apiRequest("GET", "/api/herbie/autonomous/activity-log?limit=100").then(
        (r) => r.json()
      ),
    refetchInterval: 30_000,
  });

  const runCycle = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/herbie/autonomous/run-cycle").then((r) =>
        r.json()
      ),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["/api/herbie/autonomous/activity-log"],
      });
      qc.invalidateQueries({
        queryKey: ["/api/herbie/autonomous/daily-briefing"],
      });
    },
  });

  const successCount = activityLog.filter((e) => e.outcome === "success").length;
  const errorCount = activityLog.filter((e) => e.outcome === "error").length;
  const pendingCount = activityLog.filter((e) => e.outcome === "pending").length;

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Zap className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Herbie Autonomous
            </h1>
            <p className="text-sm text-muted-foreground">
              Activity log and daily briefing from Herbie's autonomous cycle
            </p>
          </div>
        </div>
        <Button
          onClick={() => runCycle.mutate()}
          disabled={runCycle.isPending}
          className="gap-2"
        >
          {runCycle.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Zap className="h-4 w-4" />
          )}
          {runCycle.isPending ? "Running…" : "Run Cycle Now"}
        </Button>
      </div>

      {/* Run result */}
      {runCycle.isSuccess && (
        <div className="rounded-md bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 p-3 text-sm text-green-700 dark:text-green-400 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Autonomous cycle completed. Activity log refreshed.
        </div>
      )}
      {runCycle.isError && (
        <div className="rounded-md bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 p-3 text-sm text-red-700 dark:text-red-400 flex items-center gap-2">
          <XCircle className="h-4 w-4 shrink-0" />
          Cycle failed: {(runCycle.error as Error)?.message ?? "Unknown error"}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Activity Log */}
        <div className="lg:col-span-2 space-y-4">
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="border-green-200 dark:border-green-900 border-2">
              <CardContent className="pt-3 pb-3 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <div>
                  <p className="text-xl font-bold">{successCount}</p>
                  <p className="text-xs text-muted-foreground">Successful</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-red-200 dark:border-red-900 border-2">
              <CardContent className="pt-3 pb-3 flex items-center gap-2">
                <XCircle className="h-5 w-5 text-red-500" />
                <div>
                  <p className="text-xl font-bold">{errorCount}</p>
                  <p className="text-xs text-muted-foreground">Errors</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-yellow-200 dark:border-yellow-900 border-2">
              <CardContent className="pt-3 pb-3 flex items-center gap-2">
                <Loader2 className="h-5 w-5 text-yellow-500" />
                <div>
                  <p className="text-xl font-bold">{pendingCount}</p>
                  <p className="text-xs text-muted-foreground">Pending</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Activity Feed */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" /> Activity Log
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => refetchLog()}
                >
                  <RefreshCw className="h-3 w-3" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {logLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground py-4">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading activity…
                </div>
              ) : activityLog.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Activity className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No activity yet. Run a cycle to get started.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                  {activityLog.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-start gap-3 py-2 border-b last:border-0"
                    >
                      <OutcomeIcon o={entry.outcome} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{entry.action}</span>
                          <Badge
                            variant="outline"
                            className="text-xs font-mono"
                          >
                            {entry.entityType}
                          </Badge>
                          {outcomeBadge(entry.outcome)}
                        </div>
                        {entry.entityId && entry.entityId !== "system" && (
                          <p className="text-xs text-muted-foreground font-mono mt-0.5">
                            {entry.entityId.slice(0, 36)}
                          </p>
                        )}
                        {Object.keys(entry.details ?? {}).length > 0 && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {JSON.stringify(entry.details).slice(0, 120)}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                        <Clock className="h-3 w-3" />
                        {fmtTs(entry.timestamp)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground text-right mt-2">
                {activityLog.length} entries
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Right: Daily Briefing */}
        <div className="space-y-4">
          <DailyBriefingPanel />
        </div>
      </div>
    </div>
  );
}
