import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useEventStream } from "@/hooks/use-event-stream";
import { statusLabel as statusLabelFn } from "@/lib/labels";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  TrendingUp,
  Target,
  Zap,
  Bell,
  RefreshCw,
  Shield,
  CheckCircle2,
  Clock,
  MessageSquare,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Bot,
  Flame,
  ShieldAlert,
  CircleDot,
  Undo2,
  BookOpen,
  Settings,
  ExternalLink,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface PlannerBrief {
  greeting: string;
  focus: string;
  bullets: string[];
  topRecommendation: {
    label: string;
    targetId?: string;
    confidence?: number;
  } | null;
  chips: {
    urgentDecisions: number;
    atRiskBids: number;
    pipelineValue: string;
  };
}

interface PlannerDecision {
  id: string;
  title: string;
  actionLabel: string;
  entityType: string;
  entityId: string;
  actionType: string;
  entityRoute: string | null;
  isNavigable: boolean;
  priority: string;
  reason: string;
  requiredRole: string;
  recommendation: string;
  confidence: number;
  urgencyScore: number;
  riskTags: string[];
  createdAt: string;
  agencyName?: string | null;
  dollarValue?: number | null;
  deadline?: string | null;
  naicsCodes?: string[];
  setAside?: string | null;
  solNumber?: string | null;
  herbieReason?: string | null;
  fitScore?: number | null;
}

interface PlannerTimelineItem {
  id: string;
  bidId: string;
  title: string;
  status: string;
  dueAt: string | null;
  daysLeft: number | null;
  contractValue: string | null;
  setAside: string | null;
  naicsCodes: string[];
  winProbability: number;
  riskLevel: "low" | "medium" | "high";
  nextBestAction: string;
  slippageRisk: boolean;
}

interface PlannerRisk {
  id: string;
  title: string;
  riskType: string;
  probability: number;
  impact: string;
  riskScore: number;
  rootCause: string;
  mitigation: string;
  relatedEntityId?: string;
  relatedEntityType?: string;
}

interface PlannerFeedItem {
  id: string;
  timestamp: string;
  message: string;
  category: string;
  eventType: string;
  entityType: string;
  entityId: string;
  undoable: boolean;
}

interface PlannerMetrics {
  pipelineValue: number;
  activeBids: number;
  urgentCount: number;
  atRiskCount: number;
  pendingApprovals: number;
  totalOpportunities: number;
  openOpportunities: number;
  bidsByStatus: Record<string, number>;
}

interface PlannerPayload {
  date: string;
  generatedAt: string;
  userName: string;
  brief: PlannerBrief;
  decisions: PlannerDecision[];
  timeline: PlannerTimelineItem[];
  risks: PlannerRisk[];
  herbieFeed: PlannerFeedItem[];
  metrics: PlannerMetrics;
}

function getClientGreeting(firstName: string): string {
  const hour = new Date().getHours();
  let timeOfDay = "Good evening";
  if (hour < 12) timeOfDay = "Good morning";
  else if (hour < 17) timeOfDay = "Good afternoon";
  return `${timeOfDay}, ${firstName}`;
}

function isUuid(v: string | null | undefined): boolean {
  if (!v) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function toActionLabel(actionType: string): string {
  switch (actionType) {
    case "jacket_build":
      return "Bid Setup";
    case "bid_submission":
      return "Bid Submission";
    case "vendor_create":
      return "Vendor Approval";
    case "send_email":
      return "Email Authorization";
    case "bid":
      return "Bid Opportunity Review";
    case "bid_decision":
      return "Bid Recommendation";
    default:
      return "Action Required";
  }
}

function toListHeadline(actionType: string, title: string): string {
  if (actionType === "bid" || actionType === "bid_decision") return "Bid Opportunity Recommendation";
  return title && title.trim().length ? title.trim() : "Review Required";
}

function getEntityRoute(entityType: string, entityId: string): string | null {
  if (!isUuid(entityId)) return null;

  switch (entityType) {
    case "bid_project":
      return `/bid-jacket/${entityId}`;
    case "company":
      return `/companies/${entityId}`;
    case "contact":
      return `/contacts/${entityId}`;
    case "vendor":
      return `/vendors/${entityId}`;
    default:
      return null;
  }
}

function getRiskActionRoute(risk: PlannerRisk): string {
  if (risk.relatedEntityId && risk.relatedEntityType === "bid_project") {
    return `/bid-jacket/${risk.relatedEntityId}`;
  }
  switch (risk.riskType) {
    case "Process":
      return risk.title.includes("Approval") ? "/approvals" : "/bids";
    case "Deadline":
      return risk.relatedEntityId ? `/bid-jacket/${risk.relatedEntityId}` : "/bids";
    case "Capacity":
      return "/bids";
    case "Data Quality":
      return "/bids";
    default:
      return "/bids";
  }
}

function getRiskActionLabel(risk: PlannerRisk): string {
  if (risk.relatedEntityId && risk.relatedEntityType === "bid_project") {
    return "Open Bid Jacket";
  }
  switch (risk.riskType) {
    case "Process":
      return risk.title.includes("Approval") ? "Go to Approvals" : "View Pipeline";
    case "Deadline":
      return "Open Bid Jacket";
    case "Capacity":
      return "Review Pipeline";
    case "Data Quality":
      return "Review Bids";
    default:
      return "Take Action";
  }
}

function getFeedEntityRoute(item: PlannerFeedItem): string {
  if (item.entityId && item.entityType) {
    const r = getEntityRoute(item.entityType, item.entityId);
    if (r) return r;
  }
  if (item.eventType.includes("bid")) return "/bids";
  if (item.eventType.includes("egnyte")) return "/documents";
  if (item.eventType.includes("herbie")) return "/ai-review-queue";
  if (item.eventType.includes("digest")) return "/analytics";
  return "/audit";
}

export default function Planner() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showAllBullets, setShowAllBullets] = useState(false);
  const [timelineFilter, setTimelineFilter] = useState<string>("all");
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const dateStr = selectedDate.toISOString().split("T")[0];

  useEventStream();

  const { data: payload, isLoading, refetch } = useQuery<PlannerPayload>({
    queryKey: ["/api/planner/command-brief", dateStr],
    queryFn: async () => {
      const res = await fetch(`/api/planner/command-brief?date=${dateStr}`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
    staleTime: 1000 * 60 * 5,
    refetchInterval: 1000 * 60 * 2,
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/approvals/${id}/approve`, { actor: "current-user" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/planner/command-brief"] });
      queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
      toast({ title: "Approved", description: "Decision approved successfully." });
    },
    onError: () => toast({ title: "Error", description: "Failed to approve.", variant: "destructive" }),
  });

  const denyMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/approvals/${id}/deny`, { actor: "current-user", reason: "Sent back for review" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/planner/command-brief"] });
      queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
      toast({ title: "Sent Back", description: "Decision sent back for review." });
    },
    onError: () => toast({ title: "Error", description: "Failed to send back.", variant: "destructive" }),
  });

  const navigateDate = (direction: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + direction);
    setSelectedDate(newDate);
  };

  const formatDate = (date: Date) => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return "Today";
    if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow";
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
    return date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  };

  const formatTimestamp = (ts: string) => {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case "high": return "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20";
      case "medium": return "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20";
      default: return "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent": return "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20";
      case "high": return "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20";
      default: return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "HERBIE": return "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20";
      case "Bids": return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
      case "Documents": return "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20";
      case "Reports": return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const filteredTimeline = payload?.timeline.filter(t => {
    if (timelineFilter === "all") return true;
    if (timelineFilter === "at-risk") return t.riskLevel === "high";
    if (timelineFilter === "high-value") return t.contractValue && parseFloat(t.contractValue) > 1000000;
    if (timelineFilter === "needs-action") return t.daysLeft !== null && t.daysLeft <= 7;
    return true;
  }) || [];

  if (isLoading) {
    return (
      <div className="flex-1 p-4 md:p-6 overflow-auto space-y-6">
        <div className="flex items-center gap-3 mb-8">
          <Bot className="h-8 w-8 text-primary animate-pulse" />
          <div>
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-4 w-96" />
          </div>
        </div>
        <Skeleton className="h-48 w-full" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1,2,3].map(i => <Skeleton key={i} className="h-40" />)}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const brief = payload?.brief;
  const rawDecisions = payload?.decisions || [];
  const dedupeMap = new Map<string, typeof rawDecisions[0]>();
  for (const d of rawDecisions) {
    const k = `${d.entityType}:${d.entityId}:${d.actionType}`;
    if (!dedupeMap.has(k)) dedupeMap.set(k, d);
  }
  const decisions = Array.from(dedupeMap.values());
  const timeline = payload?.timeline || [];
  const risks = payload?.risks || [];
  const feed = payload?.herbieFeed || [];
  const metrics = payload?.metrics;
  const clientGreeting = getClientGreeting(payload?.userName || "Commander");

  return (
    <div className="page-dashboard flex-1 overflow-auto" data-testid="page-planner">
      <div className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="flex items-center justify-between gap-4 px-4 py-2 md:px-6">
          <div className="flex items-center gap-3">
            <Bot className="h-5 w-5 text-primary" />
            <span className="font-semibold text-sm hidden sm:inline">HERBIE Command Brief</span>
          </div>

          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => navigateDate(-1)} data-testid="button-prev-day">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelectedDate(new Date())} data-testid="button-today" className="px-3">
              <CalendarDays className="h-4 w-4 mr-1.5" />
              <span data-testid="text-selected-date">{formatDate(selectedDate)}</span>
            </Button>
            <Button variant="ghost" size="icon" onClick={() => navigateDate(1)} data-testid="button-next-day">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("/herbie")} data-testid="button-ask-herbie">
              <MessageSquare className="h-4 w-4 mr-1.5" />
              <span className="hidden sm:inline">Ask HERBIE</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => { refetch(); toast({ title: "Refreshing", description: "Generating fresh command brief..." }); }}
              data-testid="button-refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            {metrics && metrics.pendingApprovals > 0 && (
              <Button variant="ghost" size="icon" className="relative" onClick={() => navigate("/approvals")} data-testid="button-notifications">
                <Bell className="h-4 w-4" />
                <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-500 text-[10px] text-white flex items-center justify-center font-bold">
                  {metrics.pendingApprovals}
                </span>
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">

        <section id="brief-section" data-testid="section-brief">
          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background">
            <CardContent className="p-5 md:p-6">
              <div className="flex flex-col lg:flex-row gap-5">
                <div className="flex-1 space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Zap className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h1 className="text-xl md:text-2xl font-bold tracking-tight" data-testid="text-greeting">
                        {clientGreeting}
                      </h1>
                      {payload?.generatedAt && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Generated {formatTimestamp(payload.generatedAt)}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="pl-[52px] space-y-3">
                    <p className="text-sm md:text-base font-medium" data-testid="text-focus">
                      {brief?.focus}
                    </p>

                    {brief?.bullets && brief.bullets.length > 0 && (
                      <div className="space-y-1.5">
                        {(showAllBullets ? brief.bullets : brief.bullets.slice(0, 3)).map((bullet, i) => (
                          <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground" data-testid={`text-bullet-${i}`}>
                            <CircleDot className="h-3 w-3 mt-1 shrink-0 text-primary/60" />
                            <span>{bullet}</span>
                          </div>
                        ))}
                        {brief.bullets.length > 3 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowAllBullets(!showAllBullets)}
                            className="text-xs h-auto py-1 px-2"
                          >
                            {showAllBullets ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
                            {showAllBullets ? "Less" : "More"}
                          </Button>
                        )}
                      </div>
                    )}

                    {brief?.topRecommendation && (
                      <div className="mt-3 p-3 rounded-lg bg-primary/5 border border-primary/10" data-testid="top-recommendation">
                        <div className="flex items-start gap-2">
                          <Target className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                          <div className="flex-1">
                            <p className="text-sm font-medium">Top Recommendation</p>
                            <p className="text-sm text-muted-foreground mt-0.5">{brief.topRecommendation.label}</p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (brief.topRecommendation?.targetId) {
                                navigate(`/approvals`);
                              } else {
                                navigate("/bids");
                              }
                            }}
                            className="shrink-0"
                            data-testid="button-top-rec-go"
                          >
                            <ArrowRight className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="lg:w-48 flex lg:flex-col gap-2 flex-wrap">
                  <button
                    onClick={() => navigate("/approvals")}
                    className="flex-1 lg:flex-none p-3 rounded-lg bg-background border text-left hover-elevate"
                    data-testid="chip-urgent-decisions"
                  >
                    <p className="text-lg font-bold">{brief?.chips.urgentDecisions ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Urgent Decisions</p>
                  </button>
                  <button
                    onClick={() => navigate("/bids")}
                    className="flex-1 lg:flex-none p-3 rounded-lg bg-background border text-left hover-elevate"
                    data-testid="chip-at-risk"
                  >
                    <p className="text-lg font-bold">{brief?.chips.atRiskBids ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Bids At Risk</p>
                  </button>
                  <button
                    onClick={() => navigate("/bids")}
                    className="flex-1 lg:flex-none p-3 rounded-lg bg-background border text-left hover-elevate"
                    data-testid="chip-pipeline-value"
                  >
                    <p className="text-lg font-bold">{brief?.chips.pipelineValue ?? "$0"}</p>
                    <p className="text-xs text-muted-foreground">Pipeline Value</p>
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {decisions.length > 0 && (
          <section id="decisions-section" data-testid="section-decisions">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">Action Required</h2>
                <Badge variant="secondary">{decisions.length}</Badge>
              </div>
              <Button variant="ghost" size="sm" onClick={() => navigate("/approvals")} data-testid="button-view-all-approvals">
                View All
                <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {decisions.slice(0, 6).map((d) => (
                <Card key={d.id} data-testid={`decision-card-${d.id}`} className="overflow-visible">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Badge className={getPriorityColor(d.priority)} data-testid={`decision-priority-${d.id}`}>
                            {d.priority}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            {d.actionLabel || toActionLabel(d.actionType)}
                          </Badge>
                        </div>
                        <p className="text-sm font-medium leading-snug line-clamp-2" data-testid={`decision-title-${d.id}`}>
                          {toListHeadline(d.actionType, d.title)}
                        </p>
                        {(d.actionType === "bid" || d.actionType === "bid_decision") && d.title ? (
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{d.title}</p>
                        ) : d.reason ? (
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{d.reason}</p>
                        ) : null}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={!d.isNavigable}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (d.entityRoute) navigate(d.entityRoute);
                          }}
                          data-testid={`button-open-entity-${d.id}`}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                        {!d.isNavigable ? (
                          <span className="text-xs text-muted-foreground">Internal advisory</span>
                        ) : null}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Bot className="h-3.5 w-3.5 text-primary shrink-0" />
                        <p className="text-xs text-muted-foreground flex-1" data-testid={`decision-rec-${d.id}`}>
                          {d.recommendation}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">{d.confidence}%</span>
                        <Progress value={d.confidence} className="h-1.5 flex-1" />
                      </div>
                    </div>

                    {d.riskTags.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap">
                        {d.riskTags.map(tag => (
                          <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        onClick={() => approveMutation.mutate(d.id)}
                        disabled={approveMutation.isPending}
                        data-testid={`button-approve-${d.id}`}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                        Approve
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => denyMutation.mutate(d.id)}
                        disabled={denyMutation.isPending}
                        data-testid={`button-sendback-${d.id}`}
                      >
                        Send Back
                      </Button>
                      {d.isNavigable && d.entityRoute ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(d.entityRoute!);
                          }}
                          data-testid={`button-details-${d.id}`}
                        >
                          <ExternalLink className="h-3.5 w-3.5 mr-1" />
                          Details
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Internal advisory — no linked record
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {decisions.length === 0 && (
          <section id="decisions-section" data-testid="section-decisions-empty">
            <Card>
              <CardContent className="p-6 text-center">
                <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
                <p className="font-medium">No decisions needed</p>
                <p className="text-sm text-muted-foreground">HERBIE is executing. All approvals are resolved.</p>
              </CardContent>
            </Card>
          </section>
        )}

        <section id="timeline-section" data-testid="section-timeline">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Revenue Timeline</h2>
              <Badge variant="secondary">{timeline.length} bids</Badge>
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              {["all", "at-risk", "needs-action", "high-value"].map(f => (
                <Button
                  key={f}
                  variant={timelineFilter === f ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTimelineFilter(f)}
                  data-testid={`filter-timeline-${f}`}
                  className="text-xs capitalize"
                >
                  {f.replace("-", " ")}
                </Button>
              ))}
            </div>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {filteredTimeline.length > 0 ? filteredTimeline.map((item) => (
                  <div
                    key={item.bidId}
                    className="flex items-center gap-3 p-3 md:p-4 hover-elevate cursor-pointer"
                    onClick={() => navigate(`/bid-jacket/${item.bidId}`)}
                    data-testid={`timeline-item-${item.bidId}`}
                  >
                    <div className={`w-2 h-8 rounded-full shrink-0 ${
                      item.riskLevel === "high" ? "bg-red-500" :
                      item.riskLevel === "medium" ? "bg-yellow-500" :
                      "bg-green-500"
                    }`} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium line-clamp-2" data-testid={`timeline-title-${item.id}`}>{item.title}</p>
                        {item.slippageRisk && (
                          <Badge className="bg-red-500/10 text-red-500 border-red-500/20 text-[10px]">
                            <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                            Slip Risk
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <Badge variant="secondary" className="text-[10px] capitalize">{statusLabelFn(item.status)}</Badge>
                        {item.setAside && <Badge variant="outline" className="text-[10px]">{item.setAside}</Badge>}
                        {item.contractValue && (
                          <span className="text-xs text-muted-foreground">
                            ${parseFloat(item.contractValue).toLocaleString()}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{item.nextBestAction}</p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-center hidden sm:block">
                        <p className="text-xs text-muted-foreground">Win Prob</p>
                        <p className="text-sm font-semibold">{item.winProbability}%</p>
                        <Progress value={item.winProbability} className="h-1 w-14 mt-0.5" />
                      </div>

                      <div className="text-center">
                        {item.daysLeft !== null ? (
                          <>
                            <p className={`text-lg font-bold ${
                              item.daysLeft <= 3 ? "text-red-500" :
                              item.daysLeft <= 7 ? "text-yellow-500" :
                              "text-foreground"
                            }`}>{item.daysLeft}</p>
                            <p className="text-[10px] text-muted-foreground">days</p>
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">{"\u2014"}</span>
                        )}
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        className="hidden md:flex text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/bid-jacket/${item.bidId}`);
                        }}
                        data-testid={`button-action-${item.bidId}`}
                      >
                        <ExternalLink className="h-3 w-3 mr-1" />
                        Open
                      </Button>
                    </div>
                  </div>
                )) : (
                  <div className="p-8 text-center text-muted-foreground text-sm">
                    No items match the selected filter.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </section>

        {risks.length > 0 && (
          <section id="risks-section" data-testid="section-risks">
            <div className="flex items-center gap-2 mb-3">
              <ShieldAlert className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Risk Watchlist</h2>
              <Badge variant="secondary">{risks.length}</Badge>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {risks.map((risk) => (
                <Card key={risk.id} data-testid={`risk-card-${risk.id}`} className="overflow-visible">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={getRiskColor(risk.riskScore >= 70 ? "high" : risk.riskScore >= 40 ? "medium" : "low")}>
                          {risk.riskType}
                        </Badge>
                        <span className="text-xs text-muted-foreground">Score: {risk.riskScore}</span>
                      </div>
                      <Flame className={`h-4 w-4 shrink-0 ${
                        risk.riskScore >= 70 ? "text-red-500" :
                        risk.riskScore >= 40 ? "text-yellow-500" :
                        "text-muted-foreground"
                      }`} />
                    </div>
                    <p className="text-sm font-medium">{risk.title}</p>
                    <p className="text-xs text-muted-foreground">{risk.rootCause}</p>

                    <div className="p-2 rounded-md bg-muted/50 mt-1">
                      <p className="text-xs font-medium mb-0.5">Mitigation</p>
                      <p className="text-xs text-muted-foreground">{risk.mitigation}</p>
                    </div>

                    <div className="flex items-center gap-2 pt-1 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">
                        Impact: {risk.impact}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        Prob: {Math.round(risk.probability * 100)}%
                      </Badge>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full mt-2"
                      onClick={() => navigate(getRiskActionRoute(risk))}
                      data-testid={`button-mitigate-${risk.id}`}
                    >
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                      {getRiskActionLabel(risk)}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        <section id="feed-section" data-testid="section-feed">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">What HERBIE Did</h2>
              <Badge variant="secondary">{feed.length}</Badge>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate("/audit")} data-testid="button-view-audit-log">
              Full Log
              <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {feed.length > 0 ? feed.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 p-3 md:p-4 hover-elevate cursor-pointer"
                    onClick={() => navigate(getFeedEntityRoute(item))}
                    data-testid={`feed-item-${item.id}`}
                  >
                    <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Bot className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">{item.message}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <Badge className={getCategoryColor(item.category)} data-testid={`feed-category-${item.id}`}>
                          {item.category}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">{formatTimestamp(item.timestamp)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => { e.stopPropagation(); navigate(getFeedEntityRoute(item)); }}
                        data-testid={`button-view-${item.id}`}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )) : (
                  <div className="p-8 text-center text-muted-foreground text-sm">
                    No recent autonomous activity.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </section>

        <footer className="flex items-center justify-between gap-4 py-4 text-xs text-muted-foreground flex-wrap" data-testid="planner-footer">
          <div className="flex items-center gap-1">
            <Bot className="h-3.5 w-3.5" />
            <span>HERBIE Command Brief</span>
            {payload?.generatedAt && (
              <span>
                {" "} — Last updated {new Date(payload.generatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {metrics && (
              <>
                <span>{metrics.activeBids} active bids</span>
                <span>{metrics.totalOpportunities} opportunities</span>
                <span>{metrics.openOpportunities} open</span>
              </>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
