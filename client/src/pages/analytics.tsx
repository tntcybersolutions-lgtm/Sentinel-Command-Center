import { useState, Fragment } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  DollarSign,
  TrendingUp,
  Target,
  AlertTriangle,
  BarChart3,
  Download,
  FileText,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  Clock,
  AlertCircle,
  Shield,
  Briefcase,
  Building2,
  Users,
  Percent,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface AnalyticsStats {
  revenueMTD: number;
  revenueChange: number;
  profitMargin: number;
  marginChange: number;
  projectsROI: number;
  roiChange: number;
  riskScore: number;
  riskChange: number;
}

interface RevenueTrend {
  month: string;
  revenue: number;
  profit: number;
  target: number;
}

interface WinRateByType {
  type: string;
  winRate: number;
  bidsWon: number;
  totalBids: number;
}

interface TopProject {
  id: string;
  name: string;
  revenue: number;
  margin: number;
  status: string;
}

interface PipelineStage {
  stage: string;
  count: number;
  value: number;
  percentage: number;
}

interface ProjectProfitability {
  id: string;
  name: string;
  plannedMargin: number;
  actualMargin: number;
  variance: number;
}

interface SchedulePerformance {
  id: string;
  name: string;
  spiValue: number;
  status: "ahead" | "on-track" | "behind" | "critical";
}

interface CostVariance {
  id: string;
  name: string;
  budgeted: number;
  actual: number;
  variance: number;
  variancePercent: number;
}

interface ResourceUtilization {
  department: string;
  utilization: number;
  headcount: number;
  billable: number;
}

interface CashFlowTrend {
  period: string;
  inflows: number;
  outflows: number;
  net: number;
}

interface ARAgingBucket {
  bucket: string;
  amount: number;
  count: number;
  percentage: number;
}

interface GrossMarginByType {
  projectType: string;
  revenue: number;
  margin: number;
  marginPercent: number;
}

interface OverheadAllocation {
  category: string;
  allocated: number;
  actual: number;
  variance: number;
}

interface RiskItem {
  id: string;
  projectName: string;
  riskCategory: string;
  severity: "low" | "medium" | "high" | "critical";
  likelihood: number;
  impact: number;
  mitigationStatus: "not-started" | "in-progress" | "completed";
  description: string;
}

interface HistoricalRiskTrend {
  month: string;
  openRisks: number;
  mitigatedRisks: number;
  newRisks: number;
}

// Extended analytics data interface
interface ExecutiveDashboard {
  stats: AnalyticsStats;
  revenueTrends: RevenueTrend[];
  winRates: WinRateByType[];
  topProjects: TopProject[];
  pipelineStages: PipelineStage[];
}

interface ProjectAnalytics {
  profitability: ProjectProfitability[];
  schedulePerformance: SchedulePerformance[];
  costVariance: CostVariance[];
  resourceUtilization: ResourceUtilization[];
}

interface FinancialAnalytics {
  cashFlowTrends: CashFlowTrend[];
  arAgingBuckets: ARAgingBucket[];
  grossMarginByType: GrossMarginByType[];
  overheadAllocation: OverheadAllocation[];
}

interface RiskAnalytics {
  riskItems: RiskItem[];
  historicalTrends: HistoricalRiskTrend[];
}

export default function Analytics() {
  const [selectedTab, setSelectedTab] = useState("executive");
  const { toast } = useToast();

  // Fetch real data from API endpoints
  const { data: executiveData, isLoading: execLoading } = useQuery<ExecutiveDashboard>({
    queryKey: ["/api/analytics/executive-dashboard"],
  });

  const { data: projectData, isLoading: projectLoading } = useQuery<ProjectAnalytics>({
    queryKey: ["/api/analytics/project-performance"],
  });

  const { data: bidPerformance, isLoading: bidLoading } = useQuery<{ winRates: WinRateByType[] }>({
    queryKey: ["/api/analytics/bid-performance"],
  });

  const { data: pipelineData, isLoading: pipelineLoading } = useQuery<{ stages: PipelineStage[] }>({
    queryKey: ["/api/analytics/pipeline"],
  });

  const { data: metricsData, isLoading: metricsLoading } = useQuery<AnalyticsStats>({
    queryKey: ["/api/analytics/metrics"],
  });

  // Real data from API - no mocks (fallback to empty/zero values)
  const statsLoading = execLoading || metricsLoading;
  const displayStats: AnalyticsStats = metricsData || executiveData?.stats || {
    revenueMTD: 0, revenueChange: 0, profitMargin: 0, marginChange: 0,
    projectsROI: 0, roiChange: 0, riskScore: 0, riskChange: 0
  };
  
  const revenueTrends: RevenueTrend[] = executiveData?.revenueTrends || [];
  const winRates: WinRateByType[] = bidPerformance?.winRates || executiveData?.winRates || [];
  const topProjects: TopProject[] = executiveData?.topProjects || [];
  const pipelineStages: PipelineStage[] = pipelineData?.stages || executiveData?.pipelineStages || [];
  const projectProfitability: ProjectProfitability[] = projectData?.profitability || [];
  const schedulePerformance: SchedulePerformance[] = projectData?.schedulePerformance || [];
  const costVariance: CostVariance[] = projectData?.costVariance || [];
  const resourceUtilization: ResourceUtilization[] = projectData?.resourceUtilization || [];
  
  // Empty arrays for financial and risk data (to be populated by real endpoints)
  const cashFlowTrends: CashFlowTrend[] = [];
  const arAgingBuckets: ARAgingBucket[] = [];
  const grossMarginByType: GrossMarginByType[] = [];
  const overheadAllocation: OverheadAllocation[] = [];
  const riskItems: RiskItem[] = [];
  const historicalRiskTrends: HistoricalRiskTrend[] = [];

  const generateReportMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/services/digest/generate", { type: "analytics", format: "pdf" });
    },
    onSuccess: () => {
      toast({
        title: "Report Generated",
        description: "Analytics report has been generated and is ready for download.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Report Generation Failed", description: error.message, variant: "destructive" });
    },
  });

  const handleGenerateReport = () => {
    toast({ title: "Generating Report", description: "Creating comprehensive analytics report..." });
    generateReportMutation.mutate();
  };

  const handleExportData = () => {
    const revenue = displayStats?.revenueMTD ?? 0;
    const revChange = displayStats?.revenueChange ?? 0;
    const profit = displayStats?.profitMargin ?? 0;
    const marginChange = displayStats?.marginChange ?? 0;
    const roi = displayStats?.projectsROI ?? 0;
    const roiChange = displayStats?.roiChange ?? 0;
    const risk = displayStats?.riskScore ?? 0;
    const riskChange = displayStats?.riskChange ?? 0;
    const csvData = `Metric,Value,Change\nRevenue MTD,$${revenue.toLocaleString()},${revChange}%\nProfit Margin,${profit}%,${marginChange}%\nProjects ROI,${roi}%,${roiChange}%\nRisk Score,${risk}%,${riskChange}%`;
    const blob = new Blob([csvData], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "analytics-export-" + new Date().toISOString().split("T")[0] + ".csv";
    a.click();
    URL.revokeObjectURL(url);
    toast({
      title: "Data Exported",
      description: "Analytics data has been exported to CSV.",
    });
  };

  const scheduleBriefingMutation = useMutation({
    mutationFn: async () => {
      const startAt = new Date();
      startAt.setDate(startAt.getDate() + 1);
      startAt.setHours(9, 0, 0, 0);
      const endAt = new Date(startAt);
      endAt.setHours(10, 0, 0, 0);
      return apiRequest("POST", "/api/planner/calendar-events", {
        title: "Executive Analytics Briefing",
        description: "Scheduled executive briefing to review analytics dashboard",
        eventType: "meeting",
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        actorId: "current_user",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/planner/calendar-events"] });
      toast({
        title: "Briefing Scheduled",
        description: "Executive briefing has been scheduled for tomorrow at 9 AM.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Scheduling Failed", description: error.message, variant: "destructive" });
    },
  });

  const handleScheduleBriefing = () => {
    scheduleBriefingMutation.mutate();
  };

  const formatCurrency = (value: number | undefined | null) => {
    if (value === undefined || value === null || isNaN(value)) {
      return "$0";
    }
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(2)}M`;
    }
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(0)}K`;
    }
    return `$${value.toFixed(0)}`;
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "critical":
        return <Badge variant="destructive" className="text-xs">Critical</Badge>;
      case "high":
        return <Badge className="bg-orange-500 text-white text-xs">High</Badge>;
      case "medium":
        return <Badge className="bg-yellow-500 text-black text-xs">Medium</Badge>;
      default:
        return <Badge variant="secondary" className="text-xs">Low</Badge>;
    }
  };

  const getMitigationBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge variant="secondary" className="bg-green-500/20 text-green-500 text-xs">Completed</Badge>;
      case "in-progress":
        return <Badge variant="secondary" className="bg-blue-500/20 text-blue-500 text-xs">In Progress</Badge>;
      default:
        return <Badge variant="secondary" className="text-xs">Not Started</Badge>;
    }
  };

  const getSPIStatusBadge = (status: string) => {
    switch (status) {
      case "ahead":
        return <Badge className="bg-green-500 text-white text-xs">Ahead</Badge>;
      case "on-track":
        return <Badge variant="secondary" className="text-xs">On Track</Badge>;
      case "behind":
        return <Badge className="bg-yellow-500 text-black text-xs">Behind</Badge>;
      case "critical":
        return <Badge variant="destructive" className="text-xs">Critical</Badge>;
      default:
        return <Badge variant="secondary" className="text-xs">{status}</Badge>;
    }
  };

  const getRiskHeatmapColor = (likelihood: number, impact: number) => {
    const score = likelihood * impact;
    if (score >= 16) return "bg-red-500";
    if (score >= 9) return "bg-orange-500";
    if (score >= 4) return "bg-yellow-500";
    return "bg-green-500";
  };

  return (
    <div className="flex-1 space-y-4 md:space-y-6 p-4 md:p-6 overflow-auto" data-testid="analytics-page">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="page-title">Business Intelligence & Analytics</h1>
          <p className="text-muted-foreground">Comprehensive insights for strategic decision-making</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleGenerateReport} data-testid="button-generate-report">
            <FileText className="mr-2 h-4 w-4" />
            Generate Report
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportData} data-testid="button-export-data">
            <Download className="mr-2 h-4 w-4" />
            Export Data
          </Button>
          <Button size="sm" onClick={handleScheduleBriefing} data-testid="button-schedule-briefing">
            <Calendar className="mr-2 h-4 w-4" />
            Schedule Briefing
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card data-testid="stat-card-revenue-mtd">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revenue MTD</CardTitle>
            <div className="h-10 w-10 rounded-md bg-emerald-500/10 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-emerald-500" />
            </div>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">{formatCurrency(displayStats.revenueMTD)}</div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  {displayStats.revenueChange >= 0 ? (
                    <ArrowUpRight className="h-3 w-3 text-green-500" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3 text-red-500" />
                  )}
                  <span className={displayStats.revenueChange >= 0 ? "text-green-500" : "text-red-500"}>
                    {Math.abs(displayStats.revenueChange)}%
                  </span>
                  <span>vs last month</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="stat-card-profit-margin">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Profit Margin</CardTitle>
            <div className="h-10 w-10 rounded-md bg-blue-500/10 flex items-center justify-center">
              <Percent className="h-5 w-5 text-blue-500" />
            </div>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">{displayStats.profitMargin}%</div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  {displayStats.marginChange >= 0 ? (
                    <ArrowUpRight className="h-3 w-3 text-green-500" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3 text-red-500" />
                  )}
                  <span className={displayStats.marginChange >= 0 ? "text-green-500" : "text-red-500"}>
                    {Math.abs(displayStats.marginChange)}%
                  </span>
                  <span>improvement</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="stat-card-projects-roi">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Projects ROI</CardTitle>
            <div className="h-10 w-10 rounded-md bg-purple-500/10 flex items-center justify-center">
              <Target className="h-5 w-5 text-purple-500" />
            </div>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">{displayStats.projectsROI}%</div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  {displayStats.roiChange >= 0 ? (
                    <ArrowUpRight className="h-3 w-3 text-green-500" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3 text-red-500" />
                  )}
                  <span className={displayStats.roiChange >= 0 ? "text-green-500" : "text-red-500"}>
                    +{Math.abs(displayStats.roiChange)}%
                  </span>
                  <span>this quarter</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="stat-card-risk-score">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Risk Score</CardTitle>
            <div className="h-10 w-10 rounded-md bg-red-500/10 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-red-500" />
            </div>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">{displayStats.riskScore}/100</div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  {displayStats.riskChange <= 0 ? (
                    <ArrowDownRight className="h-3 w-3 text-green-500" />
                  ) : (
                    <ArrowUpRight className="h-3 w-3 text-red-500" />
                  )}
                  <span className={displayStats.riskChange <= 0 ? "text-green-500" : "text-red-500"}>
                    {Math.abs(displayStats.riskChange)}%
                  </span>
                  <span>reduction</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-4">
        <TabsList data-testid="analytics-tabs">
          <TabsTrigger value="executive" data-testid="tab-executive">Executive Dashboard</TabsTrigger>
          <TabsTrigger value="project" data-testid="tab-project">Project Analytics</TabsTrigger>
          <TabsTrigger value="financial" data-testid="tab-financial">Financial Trends</TabsTrigger>
          <TabsTrigger value="risk" data-testid="tab-risk">Risk Analysis</TabsTrigger>
        </TabsList>

        <TabsContent value="executive" className="space-y-4" data-testid="tab-content-executive">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card data-testid="card-revenue-trend">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Revenue & Profit Trend
                </CardTitle>
                <CardDescription>6-month performance overview</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {revenueTrends.map((trend, index) => (
                  <div key={index} className="space-y-2" data-testid={`revenue-trend-${trend.month?.toLowerCase?.() || index}`}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{trend.month || "Unknown"}</span>
                      <span className="text-muted-foreground">{formatCurrency(trend.revenue)}</span>
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <Progress value={trend.revenue ? (trend.revenue / 3000000) * 100 : 0} className="h-2" />
                      </div>
                      <div className="w-20 text-right text-xs text-muted-foreground">
                        {trend.revenue && trend.profit ? ((trend.profit / trend.revenue) * 100).toFixed(1) : "0.0"}% margin
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card data-testid="card-win-rate">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Win Rate by Project Type
                </CardTitle>
                <CardDescription>Bid success analysis</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {winRates.map((item, index) => (
                  <div key={index} className="space-y-2" data-testid={`win-rate-${item.type.toLowerCase().replace(/\s+/g, '-')}`}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{item.type}</span>
                      <span className="text-muted-foreground">{item.bidsWon}/{item.totalBids} won</span>
                    </div>
                    <div className="flex gap-2 items-center">
                      <Progress value={item.winRate} className="h-2 flex-1" />
                      <span className="w-12 text-right text-sm font-medium">{item.winRate}%</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card data-testid="card-top-projects">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Briefcase className="h-5 w-5" />
                  Top Performing Projects
                </CardTitle>
                <CardDescription>By revenue and margin</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Project</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Margin</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topProjects.map((project) => (
                      <TableRow key={project.id} data-testid={`top-project-${project.id}`}>
                        <TableCell className="font-medium">{project.name}</TableCell>
                        <TableCell className="text-right">{formatCurrency(project.revenue)}</TableCell>
                        <TableCell className="text-right">
                          <span className={project.margin >= 20 ? "text-green-500" : project.margin >= 15 ? "text-yellow-500" : "text-muted-foreground"}>
                            {project.margin}%
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card data-testid="card-pipeline-analysis">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Pipeline Analysis
                </CardTitle>
                <CardDescription>Opportunity funnel breakdown</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {pipelineStages.map((stage, index) => (
                  <div key={index} className="space-y-2" data-testid={`pipeline-stage-${stage.stage.toLowerCase().replace(/\s+/g, '-')}`}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{stage.stage}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">{stage.count}</Badge>
                        <span className="text-muted-foreground">{formatCurrency(stage.value)}</span>
                      </div>
                    </div>
                    <Progress value={stage.percentage * 3.33} className="h-2" />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="project" className="space-y-4" data-testid="tab-content-project">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card data-testid="card-profitability-comparison">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Project Profitability Comparison
                </CardTitle>
                <CardDescription>Planned vs actual margins</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Project</TableHead>
                      <TableHead className="text-right">Planned</TableHead>
                      <TableHead className="text-right">Actual</TableHead>
                      <TableHead className="text-right">Variance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projectProfitability.map((project) => (
                      <TableRow key={project.id} data-testid={`profitability-${project.id}`}>
                        <TableCell className="font-medium">{project.name}</TableCell>
                        <TableCell className="text-right">{project.plannedMargin}%</TableCell>
                        <TableCell className="text-right">{project.actualMargin}%</TableCell>
                        <TableCell className="text-right">
                          <span className={project.variance >= 0 ? "text-green-500" : "text-red-500"}>
                            {project.variance >= 0 ? "+" : ""}{project.variance}%
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card data-testid="card-schedule-performance">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Schedule Performance Index
                </CardTitle>
                <CardDescription>Project timeline adherence</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Project</TableHead>
                      <TableHead className="text-right">SPI</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {schedulePerformance.map((project) => (
                      <TableRow key={project.id} data-testid={`spi-${project.id}`}>
                        <TableCell className="font-medium">{project.name || "Unknown"}</TableCell>
                        <TableCell className="text-right">{(project.spiValue ?? 0).toFixed(2)}</TableCell>
                        <TableCell className="text-right">{getSPIStatusBadge(project.status || "unknown")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card data-testid="card-cost-variance">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5" />
                  Cost Variance Analysis
                </CardTitle>
                <CardDescription>Budget vs actual costs</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Project</TableHead>
                      <TableHead className="text-right">Budgeted</TableHead>
                      <TableHead className="text-right">Actual</TableHead>
                      <TableHead className="text-right">Variance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {costVariance.map((project) => (
                      <TableRow key={project.id} data-testid={`cost-variance-${project.id}`}>
                        <TableCell className="font-medium">{project.name}</TableCell>
                        <TableCell className="text-right">{formatCurrency(project.budgeted)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(project.actual)}</TableCell>
                        <TableCell className="text-right">
                          <span className={project.variance >= 0 ? "text-green-500" : "text-red-500"}>
                            {project.variance >= 0 ? "+" : ""}{formatCurrency(Math.abs(project.variance))}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card data-testid="card-resource-utilization">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Resource Utilization
                </CardTitle>
                <CardDescription>Department-level metrics</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {resourceUtilization.map((dept, index) => (
                  <div key={index} className="space-y-2" data-testid={`utilization-${dept.department.toLowerCase().replace(/\s+/g, '-')}`}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{dept.department}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{dept.headcount} staff</span>
                        <span className={dept.utilization >= 85 ? "text-green-500" : dept.utilization >= 70 ? "text-yellow-500" : "text-red-500"}>
                          {dept.utilization}%
                        </span>
                      </div>
                    </div>
                    <Progress value={dept.utilization} className="h-2" />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="financial" className="space-y-4" data-testid="tab-content-financial">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card data-testid="card-cash-flow-trends">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Cash Flow Trends
                </CardTitle>
                <CardDescription>Weekly inflows and outflows</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {cashFlowTrends.map((item, index) => (
                  <div key={index} className="space-y-2" data-testid={`cash-flow-${item.period.toLowerCase().replace(/\s+/g, '-')}`}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{item.period}</span>
                      <span className={item.net >= 0 ? "text-green-500" : "text-red-500"}>
                        Net: {item.net >= 0 ? "+" : ""}{formatCurrency(item.net)}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <div className="w-16 text-xs text-muted-foreground">Inflows</div>
                          <Progress value={(item.inflows / 600000) * 100} className="h-2 flex-1" />
                          <span className="text-xs text-green-500">{formatCurrency(item.inflows)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-16 text-xs text-muted-foreground">Outflows</div>
                          <Progress value={(item.outflows / 600000) * 100} className="h-2 flex-1" />
                          <span className="text-xs text-red-500">{formatCurrency(item.outflows)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card data-testid="card-ar-aging">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  AR Aging Breakdown
                </CardTitle>
                <CardDescription>Receivables by age bucket</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {arAgingBuckets.map((bucket, index) => (
                  <div key={index} className="space-y-2" data-testid={`ar-aging-${bucket.bucket.toLowerCase().replace(/\s+/g, '-')}`}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{bucket.bucket}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">{bucket.count} invoices</Badge>
                        <span className="text-muted-foreground">{formatCurrency(bucket.amount)}</span>
                      </div>
                    </div>
                    <Progress value={bucket.percentage * 2.5} className="h-2" />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card data-testid="card-gross-margin">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Percent className="h-5 w-5" />
                  Gross Margin by Project Type
                </CardTitle>
                <CardDescription>Profitability by category</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Project Type</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Margin</TableHead>
                      <TableHead className="text-right">%</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {grossMarginByType.map((item, index) => (
                      <TableRow key={index} data-testid={`gross-margin-${item.projectType.toLowerCase().replace(/\s+/g, '-')}`}>
                        <TableCell className="font-medium">{item.projectType}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.revenue)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.margin)}</TableCell>
                        <TableCell className="text-right">
                          <span className={item.marginPercent >= 20 ? "text-green-500" : "text-muted-foreground"}>
                            {item.marginPercent}%
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card data-testid="card-overhead-allocation">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Overhead Allocation
                </CardTitle>
                <CardDescription>Budget vs actual overhead</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Allocated</TableHead>
                      <TableHead className="text-right">Actual</TableHead>
                      <TableHead className="text-right">Variance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overheadAllocation.map((item, index) => (
                      <TableRow key={index} data-testid={`overhead-${item.category.toLowerCase().replace(/\s+/g, '-')}`}>
                        <TableCell className="font-medium">{item.category}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.allocated)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.actual)}</TableCell>
                        <TableCell className="text-right">
                          <span className={item.variance >= 0 ? "text-green-500" : "text-red-500"}>
                            {item.variance >= 0 ? "+" : ""}{formatCurrency(Math.abs(item.variance))}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="risk" className="space-y-4" data-testid="tab-content-risk">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card data-testid="card-risk-heatmap">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Risk Heatmap
                </CardTitle>
                <CardDescription>Likelihood vs Impact matrix</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-6 gap-1 text-xs">
                    <div></div>
                    {[1, 2, 3, 4, 5].map((impact) => (
                      <div key={impact} className="text-center text-muted-foreground">Impact {impact}</div>
                    ))}
                    {[5, 4, 3, 2, 1].map((likelihood) => (
                      <Fragment key={`row-${likelihood}`}>
                        <div className="text-right text-muted-foreground pr-2">L{likelihood}</div>
                        {[1, 2, 3, 4, 5].map((impact) => {
                          const risksInCell = riskItems.filter(
                            r => r.likelihood === likelihood && r.impact === impact
                          );
                          return (
                            <div
                              key={`${likelihood}-${impact}`}
                              className={`h-10 rounded flex items-center justify-center text-white text-xs font-medium ${getRiskHeatmapColor(likelihood, impact)}`}
                              data-testid={`heatmap-cell-${likelihood}-${impact}`}
                            >
                              {risksInCell.length > 0 ? risksInCell.length : ""}
                            </div>
                          );
                        })}
                      </Fragment>
                    ))}
                  </div>
                  <div className="flex items-center justify-center gap-4 text-xs">
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded bg-green-500"></div>
                      <span>Low</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded bg-yellow-500"></div>
                      <span>Medium</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded bg-orange-500"></div>
                      <span>High</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded bg-red-500"></div>
                      <span>Critical</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-historical-risk-trends">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Historical Risk Trends
                </CardTitle>
                <CardDescription>6-month risk evolution</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {historicalRiskTrends.map((trend, index) => (
                  <div key={index} className="space-y-2" data-testid={`risk-trend-${trend.month.toLowerCase()}`}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{trend.month}</span>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-muted-foreground">Open: {trend.openRisks}</span>
                        <span className="text-green-500">Mitigated: +{trend.mitigatedRisks}</span>
                        <span className="text-red-500">New: +{trend.newRisks}</span>
                      </div>
                    </div>
                    <Progress value={(trend.openRisks / 40) * 100} className="h-2" />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card data-testid="card-top-risks">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Top 10 Project Risks
              </CardTitle>
              <CardDescription>Critical risks requiring attention</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Project</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-center">Severity</TableHead>
                    <TableHead className="text-center">Mitigation</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {riskItems.map((risk) => (
                    <TableRow key={risk.id} data-testid={`risk-item-${risk.id}`}>
                      <TableCell className="font-medium">{risk.projectName}</TableCell>
                      <TableCell>{risk.riskCategory}</TableCell>
                      <TableCell className="max-w-xs truncate">{risk.description}</TableCell>
                      <TableCell className="text-center">{getSeverityBadge(risk.severity)}</TableCell>
                      <TableCell className="text-center">{getMitigationBadge(risk.mitigationStatus)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
