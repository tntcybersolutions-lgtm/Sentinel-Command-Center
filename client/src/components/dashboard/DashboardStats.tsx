import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Search,
  CheckCircle2,
  FolderKanban,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Target,
  TrendingUp,
  AlertTriangle,
  Award,
  Info,
  Scale,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface DashboardStats {
  opportunities: { active: number; total: number; trending: "up" | "down"; change: number; deltaLabel: string | null };
  approvals: { pending: number; urgent: number };
  bids: { active: number; total: number; submitted: number; winRate: number };
  pipeline: { value: number; weighted: number; change: number; deltaLabel: string | null };
  awardedThisMonth: number;
  atRisk: number;
  _definitions: {
    activeOpportunities: string[];
    activeBids: string[];
    closedOpportunities: string[];
  };
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

function formatStatusList(statuses: string[]): string {
  return statuses.map(s => s.replace(/_/g, " ")).join(", ");
}

function DeltaIndicator({ value, label, deltaLabel }: { value: number; label: string; deltaLabel?: string | null }) {
  if (deltaLabel === "Baseline") {
    return (
      <div className="flex items-center gap-1 text-xs text-muted-foreground" data-testid="delta-baseline">
        <span className="text-muted-foreground/70">Baseline</span>
        <span>{label}</span>
      </div>
    );
  }
  if (deltaLabel === "New") {
    return (
      <div className="flex items-center gap-1 text-xs text-muted-foreground" data-testid="delta-new">
        <ArrowUpRight className="h-3 w-3 text-green-500" />
        <span className="text-green-500">New</span>
        <span>{label}</span>
      </div>
    );
  }
  if (value === 0) return null;
  const isUp = value > 0;
  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      {isUp ? (
        <ArrowUpRight className="h-3 w-3 text-green-500" />
      ) : (
        <ArrowDownRight className="h-3 w-3 text-red-500" />
      )}
      <span className={isUp ? "text-green-500" : "text-red-500"}>
        {isUp ? "+" : ""}{value}%
      </span>
      <span>{label}</span>
    </div>
  );
}

function DefinitionTooltip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button className="flex-shrink-0" data-testid="button-definition-info">
          <Info className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs text-xs">
        <p className="font-medium mb-1">What counts?</p>
        <p>{text}</p>
      </TooltipContent>
    </Tooltip>
  );
}

export function DashboardStatsRow() {
  const [, navigate] = useLocation();

  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
  });

  const s = stats || {
    opportunities: { active: 0, total: 0, trending: "up" as const, change: 0, deltaLabel: null },
    approvals: { pending: 0, urgent: 0 },
    bids: { active: 0, total: 0, submitted: 0, winRate: 0 },
    pipeline: { value: 0, weighted: 0, change: 0, deltaLabel: null },
    awardedThisMonth: 0,
    atRisk: 0,
    _definitions: {
      activeOpportunities: [],
      activeBids: [],
      closedOpportunities: [],
    },
  };

  const defs = s._definitions;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <Card
        className="cursor-pointer hover-elevate"
        onClick={() => navigate("/capture/opportunities?view=active")}
        data-testid="stat-card-opportunities"
      >
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <div className="flex items-center gap-1.5">
            <CardTitle className="text-sm font-medium">Active Opportunities</CardTitle>
            <DefinitionTooltip text={`Counts opportunities in: ${formatStatusList(defs.activeOpportunities)}. Excludes: ${formatStatusList(defs.closedOpportunities)}.`} />
          </div>
          <div className="h-10 w-10 rounded-md bg-blue-500/10 flex items-center justify-center">
            <Search className="h-5 w-5 text-blue-500" />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-8 w-24" />
          ) : (
            <>
              <div className="text-2xl font-bold" data-testid="text-active-opps">{s.opportunities.active}</div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
                <DeltaIndicator value={s.opportunities.change} label="from last week" deltaLabel={s.opportunities.deltaLabel} />
                {s.opportunities.change === 0 && !s.opportunities.deltaLabel && (
                  <span>{s.opportunities.total} total</span>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card
        className="cursor-pointer hover-elevate"
        onClick={() => navigate("/approvals")}
        data-testid="stat-card-approvals"
      >
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Pending Approvals</CardTitle>
          <div className="h-10 w-10 rounded-md bg-amber-500/10 flex items-center justify-center">
            <CheckCircle2 className="h-5 w-5 text-amber-500" />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-8 w-24" />
          ) : (
            <>
              <div className="text-2xl font-bold" data-testid="text-pending-approvals">{s.approvals.pending}</div>
              <div className="flex items-center gap-1 text-xs">
                {s.approvals.urgent > 0 && (
                  <Badge variant="destructive" className="text-xs">
                    {s.approvals.urgent} urgent
                  </Badge>
                )}
                {s.approvals.urgent === 0 && (
                  <span className="text-muted-foreground">All routine</span>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card
        className="cursor-pointer hover-elevate"
        onClick={() => navigate("/capture/pipeline")}
        data-testid="stat-card-bids"
      >
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <div className="flex items-center gap-1.5">
            <CardTitle className="text-sm font-medium">Active Bids</CardTitle>
            <DefinitionTooltip text={`Counts bids in: ${formatStatusList(defs.activeBids)}.`} />
          </div>
          <div className="h-10 w-10 rounded-md bg-purple-500/10 flex items-center justify-center">
            <FolderKanban className="h-5 w-5 text-purple-500" />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-8 w-24" />
          ) : (
            <>
              <div className="text-2xl font-bold" data-testid="text-active-bids">{s.bids.active}</div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
                <Target className="h-3 w-3" />
                <span>{s.bids.submitted} submitted</span>
                {s.bids.winRate > 0 && (
                  <>
                    <span className="mx-1">|</span>
                    <span>{s.bids.winRate}% win rate</span>
                  </>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card
        className="cursor-pointer hover-elevate"
        onClick={() => navigate("/capture/opportunities?view=active")}
        data-testid="stat-card-pipeline"
      >
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <div className="flex items-center gap-1.5">
            <CardTitle className="text-sm font-medium">Active Pipeline</CardTitle>
            <DefinitionTooltip text="Sum of contract values for all winnable opportunities (excludes awarded, lost, dead)." />
          </div>
          <div className="h-10 w-10 rounded-md bg-emerald-500/10 flex items-center justify-center">
            <DollarSign className="h-5 w-5 text-emerald-500" />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-8 w-24" />
          ) : s.pipeline.value > 0 ? (
            <>
              <div className="text-2xl font-bold" data-testid="text-pipeline-value">{formatCurrency(s.pipeline.value)}</div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
                <DeltaIndicator value={s.pipeline.change} label="this quarter" deltaLabel={s.pipeline.deltaLabel} />
                {s.pipeline.change === 0 && !s.pipeline.deltaLabel && s.pipeline.weighted > 0 && (
                  <span>
                    <Scale className="h-3 w-3 inline mr-0.5" />
                    Weighted: {formatCurrency(s.pipeline.weighted)}
                  </span>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="text-2xl font-bold text-muted-foreground/40">{"\u2014"}</div>
              <p className="text-xs text-muted-foreground">Add bid values to track pipeline</p>
            </>
          )}
        </CardContent>
      </Card>

      <Card
        className="cursor-pointer hover-elevate"
        onClick={() => navigate("/capture/opportunities?view=awarded")}
        data-testid="stat-card-awarded"
      >
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <div className="flex items-center gap-1.5">
            <CardTitle className="text-sm font-medium">Awarded This Month</CardTitle>
            <DefinitionTooltip text="Opportunities with status 'awarded' and awarded_date within the current calendar month." />
          </div>
          <div className="h-10 w-10 rounded-md bg-green-500/10 flex items-center justify-center">
            <Award className="h-5 w-5 text-green-500" />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-8 w-24" />
          ) : (
            <>
              <div className="text-2xl font-bold" data-testid="text-awarded-month">{s.awardedThisMonth}</div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <TrendingUp className="h-3 w-3" />
                <span>
                  {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card
        className="cursor-pointer hover-elevate"
        onClick={() => navigate("/capture/opportunities?view=at_risk")}
        data-testid="stat-card-at-risk"
      >
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <div className="flex items-center gap-1.5">
            <CardTitle className="text-sm font-medium">At Risk</CardTitle>
            <DefinitionTooltip text="Winnable opportunities where the due date has already passed. These need immediate attention or status update." />
          </div>
          <div className="h-10 w-10 rounded-md bg-red-500/10 flex items-center justify-center">
            <AlertTriangle className="h-5 w-5 text-red-500" />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-8 w-24" />
          ) : (
            <>
              <div className={`text-2xl font-bold ${s.atRisk > 0 ? "text-red-500" : ""}`} data-testid="text-at-risk">{s.atRisk}</div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                {s.atRisk === 0 ? (
                  <span>No overdue opportunities</span>
                ) : (
                  <span>Past due date, still winnable</span>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
