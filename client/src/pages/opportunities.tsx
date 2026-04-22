import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  Filter,
  Clock,
  DollarSign,
  Building2,
  ExternalLink,
  Star,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Loader2,
  ArrowUpDown,
  X,
  Target,
  Shield,
  Brain,
  Calendar,
  FileText,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Archive,
  TrendingUp,
  MapPin,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";

interface V4Opportunity {
  id: string;
  title: string;
  synopsis: string | null;
  status: string;
  naicsCodes: string[] | null;
  setAside: string | null;
  contractValue: string | null;
  postedAt: string | null;
  dueAt: string | null;
  externalId: string | null;
  locationJson: any;
  decision: string | null;
  fitScore: number | null;
  riskLevel: string | null;
  leadDays: number | null;
  explanation: string | null;
  factorBreakdown: any;
  aiConfidence: number | null;
  decidedBy: string | null;
  decidedAt: string | null;
  sourceType: string | null;
  sourceUrl: string | null;
  solicitationNumber: string | null;
  noticeType: string | null;
}

interface V4Stats {
  opportunities: number;
  bids: number;
  pursuing: number;
  pendingChanges: number;
  aiArtifacts: number;
  decisionBreakdown: Array<{ decision: string; count: number }>;
}

type SortField = "fitScore" | "dueAt" | "contractValue" | "title";
type SortDir = "asc" | "desc";

export default function Opportunities() {
  const urlParams = new URLSearchParams(window.location.search);
  const initialView = urlParams.get("view") || "all";
  const [searchQuery, setSearchQuery] = useState("");
  const [decisionFilter, setDecisionFilter] = useState<string>("all");
  const [riskFilter, setRiskFilter] = useState<string>("all");
  const [viewFilter, setViewFilter] = useState<string>(initialView);
  const [sortField, setSortField] = useState<SortField>("fitScore");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedOpp, setSelectedOpp] = useState<V4Opportunity | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const { data: response, isLoading, refetch } = useQuery<{ data: V4Opportunity[]; pagination: any }>({
    queryKey: ["/api/v4/opportunities", { limit: 200 }],
    queryFn: async () => {
      const res = await fetch("/api/v4/opportunities?limit=200");
      return res.json();
    },
  });

  const { data: stats } = useQuery<V4Stats>({
    queryKey: ["/api/v4/stats"],
    queryFn: async () => {
      const res = await fetch("/api/v4/stats");
      return res.json();
    },
  });

  const opportunities = response?.data || [];

  const decisionMutation = useMutation({
    mutationFn: async ({ id, decision }: { id: string; decision: string }) => {
      const res = await apiRequest("PUT", `/api/v4/opportunities/${id}/decision`, { decision, decidedBy: "user" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v4/opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v4/stats"] });
      toast({ title: "Decision Updated", description: "Opportunity decision has been saved." });
    },
  });

  const scanMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/herbie/autonomous/run-cycle");
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Scan Complete",
        description: `Found and evaluated ${data.stats?.evaluated || 0} opportunities.`,
        action: (
          <ToastAction altText="View Approvals" onClick={() => navigate("/approvals")} data-testid="toast-action-view-approvals">
            View
          </ToastAction>
        ),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/v4/opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v4/stats"] });
    },
    onError: () => {
      toast({ title: "Scan Failed", description: "Failed to scan for new opportunities.", variant: "destructive" });
    },
  });

  const filtered = useMemo(() => {
    let result = [...opportunities];

    const CLOSED_STATUSES = ["awarded", "lost", "dead"];
    if (viewFilter === "at_risk") {
      const now = new Date();
      result = result.filter(o =>
        !CLOSED_STATUSES.includes(o.status) &&
        o.dueAt && new Date(o.dueAt) < now
      );
    } else if (viewFilter === "awarded") {
      result = result.filter(o => o.status === "awarded");
    } else if (viewFilter === "active") {
      result = result.filter(o => !CLOSED_STATUSES.includes(o.status));
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(o =>
        (o.title || "").toLowerCase().includes(q) ||
        (o.externalId || "").toLowerCase().includes(q) ||
        (o.solicitationNumber || "").toLowerCase().includes(q) ||
        (o.locationJson?.agency || "").toLowerCase().includes(q)
      );
    }
    if (decisionFilter !== "all") {
      if (decisionFilter === "undecided") {
        result = result.filter(o => !o.decision);
      } else {
        result = result.filter(o => o.decision === decisionFilter);
      }
    }
    if (riskFilter !== "all") {
      result = result.filter(o => o.riskLevel === riskFilter);
    }
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "fitScore":
          cmp = (a.fitScore ?? 0) - (b.fitScore ?? 0);
          break;
        case "dueAt":
          cmp = new Date(a.dueAt || 0).getTime() - new Date(b.dueAt || 0).getTime();
          break;
        case "contractValue":
          cmp = parseFloat(a.contractValue || "0") - parseFloat(b.contractValue || "0");
          break;
        case "title":
          cmp = (a.title || "").localeCompare(b.title || "");
          break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
    return result;
  }, [opportunities, searchQuery, decisionFilter, riskFilter, viewFilter, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === "asc" ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />;
  };

  const openDrawer = (opp: V4Opportunity) => {
    setSelectedOpp(opp);
    setDrawerOpen(true);
  };

  const getDecisionIcon = (decision: string | null) => {
    switch (decision) {
      case "pursue": return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "maybe": return <HelpCircle className="h-4 w-4 text-yellow-500" />;
      case "pass": return <XCircle className="h-4 w-4 text-red-500" />;
      case "archived": return <Archive className="h-4 w-4 text-muted-foreground" />;
      default: return <HelpCircle className="h-4 w-4 text-muted-foreground opacity-40" />;
    }
  };

  const getDecisionBadge = (decision: string | null) => {
    switch (decision) {
      case "pursue": return <Badge className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">Pursue</Badge>;
      case "maybe": return <Badge className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20">Maybe</Badge>;
      case "pass": return <Badge className="bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20">Pass</Badge>;
      case "archived": return <Badge variant="secondary">Archived</Badge>;
      default: return <Badge variant="outline" className="text-muted-foreground">Undecided</Badge>;
    }
  };

  const getRiskBadge = (risk: string | null) => {
    switch (risk) {
      case "low": return <Badge className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">Low</Badge>;
      case "medium": return <Badge className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20">Med</Badge>;
      case "high": return <Badge className="bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20">High</Badge>;
      default: return <Badge variant="secondary">--</Badge>;
    }
  };

  const getDaysRemaining = (dueAt: string | null) => {
    if (!dueAt) return <span className="text-muted-foreground">--</span>;
    const days = Math.ceil((new Date(dueAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (days < 0) return <span className="text-muted-foreground line-through">{Math.abs(days)}d ago</span>;
    if (days <= 7) return <span className="text-red-500 font-medium">{days}d</span>;
    if (days <= 21) return <span className="text-yellow-600 dark:text-yellow-400">{days}d</span>;
    return <span className="text-muted-foreground">{days}d</span>;
  };

  const formatValue = (val: string | null) => {
    if (!val) return "--";
    const num = parseFloat(val);
    if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `$${(num / 1000).toFixed(0)}K`;
    return `$${num.toFixed(0)}`;
  };

  const getAgency = (opp: V4Opportunity) => {
    return opp.locationJson?.agency || "--";
  };

  const pursueCount = opportunities.filter(o => o.decision === "pursue").length;
  const maybeCount = opportunities.filter(o => o.decision === "maybe").length;
  const undecidedCount = opportunities.filter(o => !o.decision).length;
  const avgFitScore = opportunities.length > 0
    ? Math.round(opportunities.reduce((s, o) => s + (o.fitScore || 0), 0) / opportunities.length)
    : 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-4 md:px-6 py-4 space-y-4 border-b">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Opportunities</h1>
            <p className="text-sm text-muted-foreground">
              {opportunities.length} opportunities tracked across SAM.gov and HigherGov
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => { refetch(); toast({ title: "Refreshed", description: "Opportunity data reloaded." }); }} data-testid="button-refresh">
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button
              onClick={() => scanMutation.mutate()}
              disabled={scanMutation.isPending}
              data-testid="button-scan"
            >
              {scanMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Brain className="mr-2 h-4 w-4" />}
              {scanMutation.isPending ? "Scanning..." : "AI Scan"}
            </Button>
          </div>
        </div>

        {viewFilter !== "all" && (
          <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50" data-testid="banner-view-filter">
            <Badge variant="secondary" className="text-xs">
              {viewFilter === "active" ? "Active Only" : viewFilter === "at_risk" ? "At Risk" : viewFilter === "awarded" ? "Awarded" : viewFilter}
            </Badge>
            <span className="text-xs text-muted-foreground">
              Showing {filtered.length} filtered {filtered.length === 1 ? "opportunity" : "opportunities"}
            </span>
            <Button variant="ghost" size="icon" onClick={() => setViewFilter("all")} data-testid="button-clear-view-filter">
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-green-500" />
                <span className="text-sm text-muted-foreground">Pursuing</span>
              </div>
              <p className="text-xl font-bold mt-1" data-testid="text-pursue-count">{pursueCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <HelpCircle className="h-4 w-4 text-yellow-500" />
                <span className="text-sm text-muted-foreground">Maybe</span>
              </div>
              <p className="text-xl font-bold mt-1" data-testid="text-maybe-count">{maybeCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-500" />
                <span className="text-sm text-muted-foreground">Undecided</span>
              </div>
              <p className="text-xl font-bold mt-1" data-testid="text-undecided-count">{undecidedCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-blue-500" />
                <span className="text-sm text-muted-foreground">Avg Fit</span>
              </div>
              <p className="text-xl font-bold mt-1" data-testid="text-avg-fit">{avgFitScore}</p>
            </CardContent>
          </Card>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search title, agency, solicitation..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-search"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>
          <Select value={decisionFilter} onValueChange={setDecisionFilter}>
            <SelectTrigger className="w-[140px]" data-testid="select-decision-filter">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Decision" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Decisions</SelectItem>
              <SelectItem value="pursue">Pursue</SelectItem>
              <SelectItem value="maybe">Maybe</SelectItem>
              <SelectItem value="pass">Pass</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
              <SelectItem value="undecided">Undecided</SelectItem>
            </SelectContent>
          </Select>
          <Select value={riskFilter} onValueChange={setRiskFilter}>
            <SelectTrigger className="w-[130px]" data-testid="select-risk-filter">
              <Shield className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Risk" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Risk</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground" data-testid="text-result-count">{filtered.length} results</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : (
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead className="min-w-[300px]">
                  <button className="flex items-center text-xs font-medium" onClick={() => toggleSort("title")} data-testid="sort-title">
                    Opportunity <SortIcon field="title" />
                  </button>
                </TableHead>
                <TableHead className="w-[100px]">
                  <button className="flex items-center text-xs font-medium" onClick={() => toggleSort("fitScore")} data-testid="sort-fit-score">
                    Fit <SortIcon field="fitScore" />
                  </button>
                </TableHead>
                <TableHead className="w-[90px]">Decision</TableHead>
                <TableHead className="w-[70px]">Risk</TableHead>
                <TableHead className="w-[100px]">
                  <button className="flex items-center text-xs font-medium" onClick={() => toggleSort("contractValue")} data-testid="sort-value">
                    Value <SortIcon field="contractValue" />
                  </button>
                </TableHead>
                <TableHead className="w-[80px]">
                  <button className="flex items-center text-xs font-medium" onClick={() => toggleSort("dueAt")} data-testid="sort-due">
                    Due <SortIcon field="dueAt" />
                  </button>
                </TableHead>
                <TableHead className="w-[80px]">Source</TableHead>
                <TableHead className="w-[100px]">Set-Aside</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                    No opportunities match your filters.
                  </TableCell>
                </TableRow>
              ) : filtered.map(opp => (
                <TableRow
                  key={opp.id}
                  className="cursor-pointer hover-elevate"
                  onClick={() => openDrawer(opp)}
                  data-testid={`row-opportunity-${opp.id}`}
                >
                  <TableCell className="pr-0">
                    {getDecisionIcon(opp.decision)}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-0.5">
                      <p className="font-medium text-sm leading-tight line-clamp-1" data-testid={`text-title-${opp.id}`}>{opp.title}</p>
                      <p className="text-xs text-muted-foreground line-clamp-1">{getAgency(opp)}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    {opp.fitScore != null ? (
                      <div className="flex items-center gap-1.5">
                        <div className="w-8 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full ${opp.fitScore >= 80 ? 'bg-green-500' : opp.fitScore >= 60 ? 'bg-yellow-500' : 'bg-red-500'}`}
                            style={{ width: `${opp.fitScore}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium tabular-nums" data-testid={`text-fit-${opp.id}`}>{opp.fitScore}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">--</span>
                    )}
                  </TableCell>
                  <TableCell>{getDecisionBadge(opp.decision)}</TableCell>
                  <TableCell>{getRiskBadge(opp.riskLevel)}</TableCell>
                  <TableCell>
                    <span className="text-sm tabular-nums">{formatValue(opp.contractValue)}</span>
                  </TableCell>
                  <TableCell>{getDaysRemaining(opp.dueAt)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {opp.sourceType === "samgov" ? "SAM" : opp.sourceType === "highergov" ? "HGov" : opp.sourceType || "--"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {opp.setAside ? (
                      <Badge variant="secondary" className="text-xs">{opp.setAside}</Badge>
                    ) : <span className="text-xs text-muted-foreground">--</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto" data-testid="drawer-opportunity-detail">
          {selectedOpp && (
            <div className="space-y-6">
              <SheetHeader>
                <SheetTitle className="text-lg leading-tight pr-6" data-testid="text-drawer-title">{selectedOpp.title}</SheetTitle>
              </SheetHeader>

              <div className="flex items-center gap-2 flex-wrap">
                {getDecisionBadge(selectedOpp.decision)}
                {getRiskBadge(selectedOpp.riskLevel)}
                {selectedOpp.sourceType && (
                  <Badge variant="outline">
                    {selectedOpp.sourceType === "samgov" ? "SAM.gov" : selectedOpp.sourceType === "highergov" ? "HigherGov" : selectedOpp.sourceType}
                  </Badge>
                )}
              </div>

              {selectedOpp.fitScore != null && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Star className="h-4 w-4 text-yellow-500" />
                      Fit Score
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl font-bold" data-testid="text-drawer-fit-score">{selectedOpp.fitScore}</span>
                      <Progress value={selectedOpp.fitScore} className="flex-1" />
                    </div>
                    {selectedOpp.factorBreakdown && (
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {Object.entries(selectedOpp.factorBreakdown as Record<string, number>).map(([k, v]) => (
                          <div key={k} className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-muted/50">
                            <span className="text-muted-foreground capitalize">{k.replace(/_/g, " ")}</span>
                            <span className="font-medium tabular-nums">{v}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {selectedOpp.explanation && (
                      <p className="text-sm text-muted-foreground italic" data-testid="text-drawer-explanation">{selectedOpp.explanation}</p>
                    )}
                    {selectedOpp.aiConfidence != null && (
                      <p className="text-xs text-muted-foreground">AI confidence: {selectedOpp.aiConfidence}%</p>
                    )}
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex items-start gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-muted-foreground text-xs">Agency</p>
                      <p>{getAgency(selectedOpp)}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <DollarSign className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-muted-foreground text-xs">Value</p>
                      <p>{formatValue(selectedOpp.contractValue)}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-muted-foreground text-xs">Due Date</p>
                      <p>{selectedOpp.dueAt ? new Date(selectedOpp.dueAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "--"}</p>
                      {selectedOpp.leadDays != null && <p className="text-xs text-muted-foreground">{selectedOpp.leadDays} days lead time</p>}
                    </div>
                  </div>
                  {selectedOpp.naicsCodes && selectedOpp.naicsCodes.length > 0 && (
                    <div className="flex items-start gap-2">
                      <Target className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <p className="text-muted-foreground text-xs">NAICS</p>
                        <div className="flex gap-1 flex-wrap mt-0.5">
                          {selectedOpp.naicsCodes.map(c => (
                            <Badge key={c} variant="secondary" className="text-xs">{c}</Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  {selectedOpp.setAside && (
                    <div className="flex items-start gap-2">
                      <Shield className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <p className="text-muted-foreground text-xs">Set-Aside</p>
                        <p>{selectedOpp.setAside}</p>
                      </div>
                    </div>
                  )}
                  {selectedOpp.solicitationNumber && (
                    <div className="flex items-start gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <p className="text-muted-foreground text-xs">Solicitation</p>
                        <p>{selectedOpp.solicitationNumber}</p>
                      </div>
                    </div>
                  )}
                  {selectedOpp.locationJson?.program && (
                    <div className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <p className="text-muted-foreground text-xs">Program</p>
                        <p>{selectedOpp.locationJson.program}</p>
                      </div>
                    </div>
                  )}
                  {selectedOpp.locationJson?.vehicle && (
                    <div className="flex items-start gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <p className="text-muted-foreground text-xs">Vehicle</p>
                        <p>{selectedOpp.locationJson.vehicle}</p>
                      </div>
                    </div>
                  )}
                  {selectedOpp.locationJson?.isRecompete && (
                    <Badge className="bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20">Recompete</Badge>
                  )}
                  {selectedOpp.locationJson?.incumbent && (
                    <div className="flex items-start gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <p className="text-muted-foreground text-xs">Incumbent</p>
                        <p>{selectedOpp.locationJson.incumbent}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {selectedOpp.synopsis && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Synopsis</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground" data-testid="text-drawer-synopsis">{selectedOpp.synopsis}</p>
                  </CardContent>
                </Card>
              )}

              <Separator />

              <div className="space-y-2">
                <p className="text-sm font-medium">Set Decision</p>
                <div className="flex gap-2 flex-wrap">
                  {(["pursue", "maybe", "pass", "archived"] as const).map(d => (
                    <Button
                      key={d}
                      variant={selectedOpp.decision === d ? "default" : "outline"}
                      className={`capitalize toggle-elevate ${selectedOpp.decision === d ? "toggle-elevated" : ""}`}
                      disabled={decisionMutation.isPending}
                      onClick={() => {
                        decisionMutation.mutate({ id: selectedOpp.id, decision: d });
                        setSelectedOpp({ ...selectedOpp, decision: d });
                      }}
                      data-testid={`button-decision-${d}`}
                    >
                      {d === "pursue" && <CheckCircle2 className="h-4 w-4 mr-1" />}
                      {d === "maybe" && <HelpCircle className="h-4 w-4 mr-1" />}
                      {d === "pass" && <XCircle className="h-4 w-4 mr-1" />}
                      {d === "archived" && <Archive className="h-4 w-4 mr-1" />}
                      {d}
                    </Button>
                  ))}
                </div>
              </div>

              {selectedOpp.sourceUrl && (
                <Button variant="outline" className="w-full" asChild>
                  <a href={selectedOpp.sourceUrl} target="_blank" rel="noopener noreferrer" data-testid="link-source">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    View on {selectedOpp.sourceType === "samgov" ? "SAM.gov" : "HigherGov"}
                  </a>
                </Button>
              )}

              {selectedOpp.decidedBy && selectedOpp.decidedAt && (
                <p className="text-xs text-muted-foreground text-center">
                  Last decided by {selectedOpp.decidedBy} on {new Date(selectedOpp.decidedAt).toLocaleDateString()}
                </p>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
