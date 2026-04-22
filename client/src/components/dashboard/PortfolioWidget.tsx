import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Building2,
  AlertTriangle,
  FileQuestion,
  ClipboardList,
  Receipt,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";

interface PortfolioData {
  totalProjects: number;
  activeProjects: number;
  totalBudget: number;
  totalActualCosts: number;
  totalPaidInvoices: number;
  totalGrossProfit: number;
  projectsByStatus: Array<{ status: string; count: number; totalBudget: number }>;
  overdueTasksByProject: Array<{ projectId: string; projectName: string; overdueCount: number }>;
  openRFIsByProject: Array<{ projectId: string; projectName: string; openCount: number }>;
  pendingSubmittalsByProject: Array<{ projectId: string; projectName: string; pendingCount: number }>;
  outstandingPOsTotal: number;
  changeOrdersTotal: number;
  invoicesTotal: number;
  upcomingDeadlines: Array<{ entityType: string; id: string; projectId: string; title: string; dueDate: string; status: string }>;
  topProjectsByBudget: Array<{ id: string; name: string; budget: number; status: string }>;
}

function formatCurrency(val: number): string {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val.toFixed(0)}`;
}

function formatFullCurrency(val: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val);
}

export function PortfolioWidget() {
  const [, navigate] = useLocation();
  const { data: portfolio, isLoading } = useQuery<PortfolioData>({
    queryKey: ["/api/dashboard/portfolio"],
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <Card data-testid="card-portfolio-overview">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4 text-primary" />
            Portfolio Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!portfolio) {
    return (
      <Card data-testid="card-portfolio-overview">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4 text-primary" />
            Portfolio Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 text-muted-foreground">
            <Building2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No portfolio data available.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const profitMargin = portfolio.totalBudget > 0
    ? ((portfolio.totalGrossProfit / portfolio.totalBudget) * 100)
    : 0;

  const costUtilization = portfolio.totalBudget > 0
    ? ((portfolio.totalActualCosts / portfolio.totalBudget) * 100)
    : 0;

  const totalOverdueTasks = portfolio.overdueTasksByProject.reduce((sum, p) => sum + p.overdueCount, 0);
  const totalOpenRFIs = portfolio.openRFIsByProject.reduce((sum, p) => sum + p.openCount, 0);
  const totalPendingSubmittals = portfolio.pendingSubmittalsByProject.reduce((sum, p) => sum + p.pendingCount, 0);

  return (
    <Card data-testid="card-portfolio-overview">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4 text-primary" />
            Portfolio Overview
          </CardTitle>
          <CardDescription>{portfolio.totalProjects} projects tracked</CardDescription>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <a href="/projects/active" data-testid="link-view-all-projects">
            View All <ArrowRight className="ml-1 h-3 w-3" />
          </a>
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="portfolio-kpis">
          <div className="p-3 rounded-md border space-y-1" data-testid="kpi-total-budget">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <DollarSign className="h-3 w-3" />
              Total Budget
            </div>
            <div className="text-lg font-bold" data-testid="text-total-budget">{formatCurrency(portfolio.totalBudget)}</div>
            <div className="text-xs text-muted-foreground">{formatFullCurrency(portfolio.totalBudget)}</div>
          </div>

          <div className="p-3 rounded-md border space-y-1" data-testid="kpi-actual-costs">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <TrendingDown className="h-3 w-3" />
              Actual Costs
            </div>
            <div className="text-lg font-bold" data-testid="text-actual-costs">{formatCurrency(portfolio.totalActualCosts)}</div>
            <div className="text-xs text-muted-foreground">{costUtilization.toFixed(1)}% of budget</div>
          </div>

          <div className="p-3 rounded-md border space-y-1" data-testid="kpi-paid-invoices">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Receipt className="h-3 w-3" />
              Paid Invoices
            </div>
            <div className="text-lg font-bold" data-testid="text-paid-invoices">{formatCurrency(portfolio.totalPaidInvoices)}</div>
            <div className="text-xs text-muted-foreground">{formatFullCurrency(portfolio.totalPaidInvoices)}</div>
          </div>

          <div className="p-3 rounded-md border space-y-1" data-testid="kpi-gross-profit">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <TrendingUp className="h-3 w-3" />
              Gross Profit
            </div>
            <div className={`text-lg font-bold ${portfolio.totalGrossProfit >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`} data-testid="text-gross-profit">
              {formatCurrency(portfolio.totalGrossProfit)}
            </div>
            <div className="text-xs text-muted-foreground">{profitMargin.toFixed(1)}% margin</div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">Cost Utilization</span>
            <span className="font-medium">{costUtilization.toFixed(1)}%</span>
          </div>
          <Progress value={Math.min(costUtilization, 100)} className="h-2" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3" data-testid="portfolio-health">
          <div className="flex items-center gap-2 p-2 rounded-md border" data-testid="health-overdue-tasks">
            <AlertTriangle className={`h-4 w-4 shrink-0 ${totalOverdueTasks > 0 ? "text-red-500" : "text-muted-foreground"}`} />
            <div>
              <div className="text-sm font-medium">{totalOverdueTasks}</div>
              <div className="text-xs text-muted-foreground">Overdue Tasks</div>
            </div>
          </div>
          <div className="flex items-center gap-2 p-2 rounded-md border" data-testid="health-open-rfis">
            <FileQuestion className={`h-4 w-4 shrink-0 ${totalOpenRFIs > 0 ? "text-orange-500" : "text-muted-foreground"}`} />
            <div>
              <div className="text-sm font-medium">{totalOpenRFIs}</div>
              <div className="text-xs text-muted-foreground">Open RFIs</div>
            </div>
          </div>
          <div className="flex items-center gap-2 p-2 rounded-md border" data-testid="health-pending-submittals">
            <ClipboardList className={`h-4 w-4 shrink-0 ${totalPendingSubmittals > 0 ? "text-yellow-500" : "text-muted-foreground"}`} />
            <div>
              <div className="text-sm font-medium">{totalPendingSubmittals}</div>
              <div className="text-xs text-muted-foreground">Pending Submittals</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3" data-testid="portfolio-outstanding">
          <div className="p-2 rounded-md border text-center" data-testid="outstanding-pos">
            <div className="text-sm font-medium">{formatCurrency(portfolio.outstandingPOsTotal)}</div>
            <div className="text-xs text-muted-foreground">Open POs</div>
          </div>
          <div className="p-2 rounded-md border text-center" data-testid="outstanding-cos">
            <div className="text-sm font-medium">{formatCurrency(portfolio.changeOrdersTotal)}</div>
            <div className="text-xs text-muted-foreground">Change Orders</div>
          </div>
          <div className="p-2 rounded-md border text-center" data-testid="outstanding-invoices">
            <div className="text-sm font-medium">{formatCurrency(portfolio.invoicesTotal)}</div>
            <div className="text-xs text-muted-foreground">Unpaid Invoices</div>
          </div>
        </div>

        {portfolio.topProjectsByBudget.length > 0 && (
          <div className="space-y-2" data-testid="top-projects-by-budget">
            <p className="text-sm font-medium">Top Projects by Budget</p>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {portfolio.topProjectsByBudget.slice(0, 5).map((proj) => (
                <div
                  key={proj.id}
                  className="flex items-center justify-between gap-3 p-2 rounded-md border hover-elevate cursor-pointer"
                  onClick={() => navigate(`/projects/${proj.id}`)}
                  data-testid={`top-project-${proj.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" data-testid="text-project-name">{proj.name}</p>
                    <Badge variant="outline" className="text-xs" data-testid="text-project-status">{proj.status}</Badge>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold" data-testid="text-project-budget">{formatCurrency(proj.budget)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {(portfolio.overdueTasksByProject.length > 0 || portfolio.openRFIsByProject.length > 0) && (
          <div className="space-y-2" data-testid="project-health-details">
            <p className="text-sm font-medium">Attention Required</p>
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {portfolio.overdueTasksByProject.slice(0, 3).map((p) => (
                <div key={p.projectId} className="flex items-center justify-between gap-2 p-2 rounded-md border text-sm" data-testid={`overdue-project-${p.projectId}`}>
                  <span className="truncate flex-1">{p.projectName}</span>
                  <Badge variant="destructive" className="text-xs shrink-0">{p.overdueCount} overdue</Badge>
                </div>
              ))}
              {portfolio.openRFIsByProject.slice(0, 3).map((p) => (
                <div key={p.projectId} className="flex items-center justify-between gap-2 p-2 rounded-md border text-sm" data-testid={`rfi-project-${p.projectId}`}>
                  <span className="truncate flex-1">{p.projectName}</span>
                  <Badge variant="secondary" className="text-xs shrink-0">{p.openCount} open RFIs</Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
