import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  ArrowLeft,
  Brain,
  Loader2,
  DollarSign,
  CalendarDays,
  Shield,
  FileText,
  Target,
  Mail,
  MapPin,
  Hash,
  Building2,
  Clock,
  Sparkles,
  ClipboardList,
  Send,
  CheckCircle2,
  Users,
  AlertTriangle,
  TrendingUp,
  ListChecks,
  Crosshair,
  Star,
  Zap,
  ThumbsUp,
  ThumbsDown,
  Paperclip,
  RefreshCw,
  ExternalLink,
  Download,
  FolderOpen,
} from "lucide-react";

interface PipelineItem {
  id: string;
  entityId: string;
  stage: string;
  aiScore: number | null;
  aiScoreLabel: string | null;
  opportunity: {
    id: string;
    title: string;
    synopsis: string | null;
    description: string | null;
    setAside: string | null;
    contractValue: string | number | null;
    dueAt: string | null;
    naicsCodes: string[] | null;
    locationJson: Record<string, unknown> | null;
    status: string | null;
    url: string | null;
  } | null;
}

interface OpportunityFallback {
  id: string;
  title: string;
  synopsis: string | null;
  description: string | null;
  setAside: string | null;
  contractValue: string | number | null;
  dueAt: string | null;
  naicsCodes: string[] | null;
  locationJson: Record<string, unknown> | null;
  status: string | null;
  url: string | null;
}

interface SummaryResult {
  executiveSummary: string;
  keyRequirements: string[];
  criticalDates: ({ label: string; date: string } | string)[];
  competitiveFactors: string[];
  riskAssessment: string;
  recommendedAction: string;
}

interface ScoreResult {
  overall: number;
  breakdown: Record<string, number>;
  rationale: string;
  recommendation: string;
}

interface CapturePlanResult {
  strategyNarrative: string;
  phases: { name: string; tasks: string[] }[];
  teamingStrategy: string;
  pricingApproach: string;
  winThemes: string[];
  discriminators: string[];
}

interface OutreachResult {
  subject: string;
  body: string;
  recipientType: string;
  callToAction: string;
  talkingPoints: string[];
}

interface SimilarOpp {
  id: string;
  title: string;
  score: number;
  reasons: string[];
  setAside: string | null;
  agency: string;
  value: string | null;
}

interface PartnerRec {
  id: string;
  partnerName: string;
  partnerType: string;
  capabilities: string[];
  relevanceScore: number;
  rationale: string;
}

interface PartnerShortlistItem {
  id: string;
  partnerName: string;
  status: string;
}

interface CompetitorEntry {
  name: string;
  threat: string;
  strengths: string[];
}

interface PressureResult {
  pressureLevel: string;
  pressureScore: number;
  competitorCount: number;
  topCompetitors: CompetitorEntry[];
  analysisJson?: { analysis: string };
  rationale: string;
}

interface RequirementItem {
  id: string;
  category: string;
  requirement: string;
  priority: string;
  source: string;
  status: string;
}

interface ChecklistItem {
  id: string;
  section: string;
  item: string;
  requirementIds: string[];
  status: string;
  assignee: string;
}

interface RequirementsResult {
  requirements: RequirementItem[];
  checklist: ChecklistItem[];
  summary: string;
}

interface OptimizeAction {
  title: string;
  description: string;
  type: string;
  priority: string;
  expectedLift: number;
  dueInDays: number;
}

interface OptimizeResult {
  probability: number;
  confidenceLevel: string;
  factors: {
    positive: string[];
    negative: string[];
    neutral: string[];
  };
  nextActions: OptimizeAction[];
}

function formatCurrency(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "--";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num) || num === 0) return "--";
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(0)}K`;
  return `$${num.toFixed(0)}`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "--";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "--";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getDaysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export default function CaptureDetail() {
  const [, params] = useRoute("/capture/opportunity/:id");
  const id = params?.id;
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");
  const [recipientType, setRecipientType] = useState("teaming_partner");

  const [summaryResult, setSummaryResult] = useState<SummaryResult | null>(null);
  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(null);
  const [capturePlanResult, setCapturePlanResult] = useState<CapturePlanResult | null>(null);
  const [outreachResult, setOutreachResult] = useState<OutreachResult | null>(null);
  const [optimizeResult, setOptimizeResult] = useState<OptimizeResult | null>(null);
  const [showOptimize, setShowOptimize] = useState(false);

  const { data: pipelineItems, isLoading: pipelineLoading } = useQuery<PipelineItem[]>({
    queryKey: ["/api/capture/pipeline"],
  });

  const { data: allOpps } = useQuery<OpportunityFallback[]>({
    queryKey: ["/api/opportunities"],
  });

  const pipelineItem = pipelineItems?.find((p) => p.entityId === id);
  const oppFromPipeline = pipelineItem?.opportunity;
  const oppFallback = allOpps?.find((o) => o.id === id);
  const opportunity = oppFromPipeline || oppFallback;
  const isLoading = pipelineLoading;

  const aiScore = pipelineItem?.aiScore ?? scoreResult?.overall ?? null;
  const agency = opportunity?.locationJson ? (opportunity.locationJson as Record<string, unknown>).agency as string : null;
  const location = opportunity?.locationJson ? (opportunity.locationJson as Record<string, unknown>).state as string : null;
  const daysLeft = getDaysUntil(opportunity?.dueAt || null);

  const summarizeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/capture/ai/summarize/${id}`);
      return res.json();
    },
    onSuccess: (data: SummaryResult) => {
      setSummaryResult(data);
      toast({ title: "Summary Generated", description: "AI analysis complete." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to generate summary.", variant: "destructive" });
    },
  });

  const scoreMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/capture/ai/score/${id}`);
      return res.json();
    },
    onSuccess: (data: ScoreResult) => {
      setScoreResult(data);
      toast({ title: "Score Generated", description: `Overall score: ${data.overall}` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to score opportunity.", variant: "destructive" });
    },
  });

  const capturePlanMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/capture/ai/capture-plan/${id}`);
      return res.json();
    },
    onSuccess: (data: CapturePlanResult) => {
      setCapturePlanResult(data);
      toast({ title: "Capture Plan Generated", description: "Strategy ready for review." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to generate capture plan.", variant: "destructive" });
    },
  });

  const outreachMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/capture/ai/outreach/${id}`, { recipientType });
      return res.json();
    },
    onSuccess: (data: OutreachResult) => {
      setOutreachResult(data);
      toast({ title: "Draft Generated", description: "Outreach email draft ready." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to generate outreach draft.", variant: "destructive" });
    },
  });

  const { data: similarData, isLoading: similarLoading } = useQuery<{ similar: SimilarOpp[]; totalCandidates: number }>({
    queryKey: ["/api/opportunity", id, "similar"],
    queryFn: async () => {
      const res = await fetch(`/api/opportunity/${id}/similar`);
      if (!res.ok) throw new Error("Failed to fetch similar");
      return res.json();
    },
    enabled: activeTab === "similar" && !!id,
  });

  const { data: partnersData, isLoading: partnersLoading, refetch: refetchPartners } = useQuery<{ recommendations: PartnerRec[]; shortlist: PartnerShortlistItem[] }>({
    queryKey: ["/api/opportunity", id, "partners"],
    queryFn: async () => {
      const res = await fetch(`/api/opportunity/${id}/partners`);
      if (!res.ok) throw new Error("Failed to fetch partners");
      return res.json();
    },
    enabled: activeTab === "partners" && !!id,
  });

  const shortlistMutation = useMutation({
    mutationFn: async ({ partnerName, recommendationId }: { partnerName: string; recommendationId?: string }) => {
      const res = await apiRequest("POST", `/api/opportunity/${id}/partners/shortlist`, { partnerName, recommendationId });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Shortlisted", description: "Partner added to shortlist." });
      refetchPartners();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to shortlist partner.", variant: "destructive" });
    },
  });

  const { data: pressureData, isLoading: pressureLoading } = useQuery<PressureResult>({
    queryKey: ["/api/opportunity", id, "pressure"],
    queryFn: async () => {
      const res = await fetch(`/api/opportunity/${id}/pressure`);
      if (!res.ok) throw new Error("Failed to fetch pressure");
      return res.json();
    },
    enabled: activeTab === "pressure" && !!id,
  });

  const { data: requirementsData, isLoading: requirementsLoading } = useQuery<RequirementsResult>({
    queryKey: ["/api/opportunity", id, "requirements"],
    queryFn: async () => {
      const res = await fetch(`/api/opportunity/${id}/requirements`);
      if (!res.ok) throw new Error("Failed to fetch requirements");
      return res.json();
    },
    enabled: activeTab === "requirements" && !!id,
  });

  const optimizeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/pipeline/${pipelineItem?.id}/optimize`);
      return res.json();
    },
    onSuccess: (data: OptimizeResult) => {
      setOptimizeResult(data);
      setShowOptimize(true);
      toast({ title: "Optimization Complete", description: `Win probability: ${Math.round(data.probability * 100)}%` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to optimize pursuit.", variant: "destructive" });
    },
  });

  const pressureLevelColor = (level: string) => {
    switch (level) {
      case "low": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "medium": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
      case "high": return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
      case "critical": return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      default: return "";
    }
  };

  const priorityColor = (priority: string) => {
    switch (priority) {
      case "mandatory": return "destructive" as const;
      case "desirable": return "secondary" as const;
      default: return "outline" as const;
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 overflow-auto p-4 md:p-6 space-y-6" data-testid="page-capture-detail">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-10 w-96" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!opportunity) {
    return (
      <div className="flex-1 overflow-auto p-4 md:p-6" data-testid="page-capture-detail">
        <Link href="/capture/pipeline">
          <Button variant="ghost" size="sm" data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Pipeline
          </Button>
        </Link>
        <Card className="mt-6">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-lg font-medium mb-1">Opportunity Not Found</p>
            <p className="text-sm text-muted-foreground">
              This opportunity may not be in the pipeline yet.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6 space-y-6" data-testid="page-capture-detail">
      <Link href="/capture/pipeline">
        <Button variant="ghost" size="sm" data-testid="button-back">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Pipeline
        </Button>
      </Link>

      <div className="space-y-2">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1 flex-1 min-w-0">
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-opportunity-title">
              {opportunity.title}
            </h1>
            {agency && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Building2 className="h-4 w-4" />
                <span data-testid="text-opportunity-agency">{agency}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {pipelineItem && (
              <Button
                variant="outline"
                onClick={() => optimizeMutation.mutate()}
                disabled={optimizeMutation.isPending || !pipelineItem?.id}
                data-testid="button-optimize"
              >
                {optimizeMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Crosshair className="h-4 w-4 mr-2" />
                )}
                {optimizeMutation.isPending ? "Optimizing..." : "Optimize"}
              </Button>
            )}
            {opportunity.status && (
              <Badge variant="outline" data-testid="badge-opportunity-status">
                {opportunity.status}
              </Badge>
            )}
            {pipelineItem && (
              <Badge variant="secondary" data-testid="badge-pipeline-stage">
                {pipelineItem.stage}
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="section-key-metrics">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <DollarSign className="h-5 w-5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Contract Value</p>
              <p className="text-lg font-semibold" data-testid="text-metric-value">
                {formatCurrency(opportunity.contractValue)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Shield className="h-5 w-5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Set-Aside</p>
              <p className="text-sm font-medium" data-testid="text-metric-setaside">
                {opportunity.setAside || "None"}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <CalendarDays className="h-5 w-5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Due Date</p>
              <p
                className={`text-sm font-medium ${daysLeft !== null && daysLeft < 7 ? "text-red-600 dark:text-red-400" : daysLeft !== null && daysLeft < 14 ? "text-yellow-600 dark:text-yellow-400" : ""}`}
                data-testid="text-metric-due"
              >
                {formatDate(opportunity.dueAt)}
                {daysLeft !== null && (
                  <span className="ml-1 text-xs">({daysLeft <= 0 ? "Overdue" : `${daysLeft}d`})</span>
                )}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Brain className="h-5 w-5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">AI Score</p>
              <p
                className={`text-lg font-semibold ${
                  aiScore !== null
                    ? aiScore >= 70
                      ? "text-green-600 dark:text-green-400"
                      : aiScore >= 50
                        ? "text-yellow-600 dark:text-yellow-400"
                        : "text-red-600 dark:text-red-400"
                    : ""
                }`}
                data-testid="text-metric-score"
              >
                {aiScore !== null ? aiScore : "--"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {showOptimize && optimizeResult && (
        <Card data-testid="card-optimize-result">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Crosshair className="h-4 w-4" />
              Pursuit Optimization
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="text-center">
                <p className="text-3xl font-bold text-primary" data-testid="text-win-probability">
                  {Math.round(optimizeResult.probability * 100)}%
                </p>
                <p className="text-xs text-muted-foreground">Win Probability</p>
              </div>
              <Badge variant="secondary" data-testid="badge-confidence-level">
                {optimizeResult.confidenceLevel}
              </Badge>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {optimizeResult.factors.positive?.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-sm font-medium flex items-center gap-1.5">
                    <ThumbsUp className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                    Positive Factors
                  </p>
                  <ul className="space-y-1">
                    {optimizeResult.factors.positive.map((f, i) => (
                      <li key={i} className="text-sm text-muted-foreground" data-testid={`text-positive-factor-${i}`}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}
              {optimizeResult.factors.negative?.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-sm font-medium flex items-center gap-1.5">
                    <ThumbsDown className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                    Negative Factors
                  </p>
                  <ul className="space-y-1">
                    {optimizeResult.factors.negative.map((f, i) => (
                      <li key={i} className="text-sm text-muted-foreground" data-testid={`text-negative-factor-${i}`}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {optimizeResult.nextActions?.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Next Best Actions</p>
                <div className="grid gap-2">
                  {optimizeResult.nextActions.map((action, i) => (
                    <div key={i} className="flex items-start gap-3 bg-muted/50 rounded-md px-3 py-2" data-testid={`card-action-${i}`}>
                      <Zap className="h-4 w-4 mt-0.5 shrink-0 text-primary/70" />
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{action.title}</span>
                          <Badge variant="outline" className="text-[10px]">{action.priority}</Badge>
                          {action.expectedLift > 0 && (
                            <span className="text-xs text-green-600 dark:text-green-400" data-testid={`text-lift-${i}`}>
                              +{Math.round(action.expectedLift * 100)}%
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{action.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} data-testid="tabs-detail">
        <TabsList className="flex-wrap" data-testid="tablist-detail">
          <TabsTrigger value="overview" data-testid="tab-overview">
            <FileText className="h-4 w-4 mr-1.5" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="analysis" data-testid="tab-analysis">
            <Sparkles className="h-4 w-4 mr-1.5" />
            Analysis
          </TabsTrigger>
          <TabsTrigger value="capture-plan" data-testid="tab-capture-plan">
            <ClipboardList className="h-4 w-4 mr-1.5" />
            Plan
          </TabsTrigger>
          <TabsTrigger value="outreach" data-testid="tab-outreach">
            <Mail className="h-4 w-4 mr-1.5" />
            Outreach
          </TabsTrigger>
          <TabsTrigger value="similar" data-testid="tab-similar">
            <TrendingUp className="h-4 w-4 mr-1.5" />
            Similar
          </TabsTrigger>
          <TabsTrigger value="partners" data-testid="tab-partners">
            <Users className="h-4 w-4 mr-1.5" />
            Partners
          </TabsTrigger>
          <TabsTrigger value="pressure" data-testid="tab-pressure">
            <AlertTriangle className="h-4 w-4 mr-1.5" />
            Pressure
          </TabsTrigger>
          <TabsTrigger value="requirements" data-testid="tab-requirements">
            <ListChecks className="h-4 w-4 mr-1.5" />
            Reqs
          </TabsTrigger>
          <TabsTrigger value="documents" data-testid="tab-documents">
            <Paperclip className="h-4 w-4 mr-1.5" />
            Docs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          {opportunity.synopsis && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Synopsis</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed" data-testid="text-synopsis">
                  {opportunity.synopsis}
                </p>
              </CardContent>
            </Card>
          )}

          {(opportunity as OpportunityFallback).description && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed whitespace-pre-wrap" data-testid="text-description">
                  {(opportunity as OpportunityFallback).description}
                </p>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {opportunity.naicsCodes && opportunity.naicsCodes.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Hash className="h-4 w-4" />
                    NAICS Codes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1.5">
                    {opportunity.naicsCodes.map((code) => (
                      <Badge key={code} variant="outline" data-testid={`badge-naics-${code}`}>
                        {code}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {(agency || location) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Location
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  {agency && (
                    <p className="text-sm" data-testid="text-detail-agency">
                      <span className="text-muted-foreground">Agency: </span>{agency}
                    </p>
                  )}
                  {location && (
                    <p className="text-sm" data-testid="text-detail-location">
                      <span className="text-muted-foreground">State: </span>{location}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="analysis" className="mt-4 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              onClick={() => summarizeMutation.mutate()}
              disabled={summarizeMutation.isPending}
              data-testid="button-generate-summary"
            >
              {summarizeMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              {summarizeMutation.isPending ? "Analyzing..." : "Generate Summary"}
            </Button>
            <Button
              variant="outline"
              onClick={() => scoreMutation.mutate()}
              disabled={scoreMutation.isPending}
              data-testid="button-score-opportunity"
            >
              {scoreMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Target className="h-4 w-4 mr-2" />
              )}
              {scoreMutation.isPending ? "Scoring..." : "Score Opportunity"}
            </Button>
          </div>

          {scoreResult && (
            <Card data-testid="card-score-result">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  AI Score
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <span
                    className={`text-3xl font-bold ${
                      scoreResult.overall >= 70
                        ? "text-green-600 dark:text-green-400"
                        : scoreResult.overall >= 50
                          ? "text-yellow-600 dark:text-yellow-400"
                          : "text-red-600 dark:text-red-400"
                    }`}
                    data-testid="text-analysis-score"
                  >
                    {scoreResult.overall}
                  </span>
                  <span className="text-sm text-muted-foreground">/ 100</span>
                </div>
                {Object.keys(scoreResult.breakdown).length > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(scoreResult.breakdown).map(([key, value]) => (
                      <div key={key} className="flex items-center justify-between text-sm bg-muted/50 rounded-md px-3 py-2">
                        <span className="text-muted-foreground capitalize">{key.replace(/_/g, " ")}</span>
                        <span className="font-medium">{value}</span>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-sm text-muted-foreground">{scoreResult.rationale}</p>
                <p className="text-sm font-medium">{scoreResult.recommendation}</p>
              </CardContent>
            </Card>
          )}

          {summaryResult && (
            <Card data-testid="card-summary-result">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  AI Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Executive Summary</p>
                  <p className="text-sm text-muted-foreground" data-testid="text-executive-summary">
                    {summaryResult.executiveSummary}
                  </p>
                </div>

                {summaryResult.keyRequirements?.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Key Requirements</p>
                    <ul className="space-y-1">
                      {summaryResult.keyRequirements.map((req, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <CheckCircle2 className="h-3 w-3 mt-1 shrink-0 text-primary/60" />
                          <span>{typeof req === 'string' ? req : JSON.stringify(req)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {summaryResult.criticalDates?.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-sm font-medium flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      Critical Dates
                    </p>
                    <ul className="space-y-1">
                      {summaryResult.criticalDates.map((d, i) => {
                        const label = typeof d === "string" ? null : (d as any).label;
                        const date = typeof d === "string" ? d : (d as any).date;
                        return (
                          <li key={i} className="text-sm text-muted-foreground">
                            {label && <span className="font-medium text-foreground">{label}: </span>}
                            <span>{date}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {summaryResult.competitiveFactors?.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Competitive Factors</p>
                    <ul className="space-y-1">
                      {summaryResult.competitiveFactors.map((factor, i) => (
                        <li key={i} className="text-sm text-muted-foreground">{typeof factor === 'string' ? factor : JSON.stringify(factor)}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {summaryResult.riskAssessment && (
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Risk Assessment</p>
                    <p className="text-sm text-muted-foreground">{summaryResult.riskAssessment}</p>
                  </div>
                )}

                {summaryResult.recommendedAction && (
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Recommended Action</p>
                    <p className="text-sm text-muted-foreground">{summaryResult.recommendedAction}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {!scoreResult && !summaryResult && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Brain className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">
                  Click the buttons above to generate AI analysis for this opportunity.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="capture-plan" className="mt-4 space-y-4">
          <Button
            onClick={() => capturePlanMutation.mutate()}
            disabled={capturePlanMutation.isPending}
            data-testid="button-generate-capture-plan"
          >
            {capturePlanMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <ClipboardList className="h-4 w-4 mr-2" />
            )}
            {capturePlanMutation.isPending ? "Analyzing..." : "Generate Capture Plan"}
          </Button>

          {capturePlanResult ? (
            <div className="space-y-4">
              <Card data-testid="card-capture-plan-result">
                <CardHeader>
                  <CardTitle className="text-base">Strategy Narrative</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed" data-testid="text-strategy-narrative">
                    {capturePlanResult.strategyNarrative}
                  </p>
                </CardContent>
              </Card>

              {capturePlanResult.phases?.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Phases</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {capturePlanResult.phases.map((phase, i) => (
                      <div key={i} className="space-y-2">
                        <p className="text-sm font-medium" data-testid={`text-phase-name-${i}`}>
                          {phase.name}
                        </p>
                        <ul className="space-y-1 pl-4">
                          {phase.tasks.map((task, j) => (
                            <li key={j} className="flex items-start gap-2 text-sm text-muted-foreground">
                              <CheckCircle2 className="h-3 w-3 mt-1 shrink-0 text-primary/60" />
                              <span>{task}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {capturePlanResult.winThemes?.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Win Themes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-1.5">
                      {capturePlanResult.winThemes.map((theme, i) => (
                        <Badge key={i} variant="outline" data-testid={`badge-win-theme-${i}`}>
                          {theme}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {capturePlanResult.discriminators?.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Discriminators</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-1.5">
                      {capturePlanResult.discriminators.map((d, i) => (
                        <Badge key={i} variant="secondary" data-testid={`badge-discriminator-${i}`}>
                          {d}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {capturePlanResult.teamingStrategy && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Teaming Strategy</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed" data-testid="text-teaming-strategy">
                      {capturePlanResult.teamingStrategy}
                    </p>
                  </CardContent>
                </Card>
              )}

              {capturePlanResult.pricingApproach && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Pricing Approach</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed" data-testid="text-pricing-approach">
                      {capturePlanResult.pricingApproach}
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <ClipboardList className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">
                  Generate a capture plan to see strategy, phases, and win themes.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="outreach" className="mt-4 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={recipientType} onValueChange={setRecipientType}>
              <SelectTrigger className="w-[220px]" data-testid="select-recipient-type">
                <SelectValue placeholder="Recipient Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="teaming_partner">Teaming Partner</SelectItem>
                <SelectItem value="agency_contact">Agency Contact</SelectItem>
                <SelectItem value="subcontractor">Subcontractor</SelectItem>
                <SelectItem value="mentor_protege">Mentor-Protege</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={() => outreachMutation.mutate()}
              disabled={outreachMutation.isPending}
              data-testid="button-generate-outreach"
            >
              {outreachMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              {outreachMutation.isPending ? "Generating..." : "Generate Draft"}
            </Button>
          </div>

          {outreachResult ? (
            <Card data-testid="card-outreach-result">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Outreach Draft
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Recipient Type</p>
                  <Badge variant="secondary" data-testid="badge-outreach-recipient">
                    {outreachResult.recipientType.replace(/_/g, " ")}
                  </Badge>
                </div>

                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Subject</p>
                  <p className="text-sm font-medium" data-testid="text-outreach-subject">
                    {outreachResult.subject}
                  </p>
                </div>

                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Body</p>
                  <div className="bg-muted/50 rounded-md p-4">
                    <p className="text-sm whitespace-pre-wrap leading-relaxed" data-testid="text-outreach-body">
                      {outreachResult.body}
                    </p>
                  </div>
                </div>

                {outreachResult.callToAction && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Call to Action</p>
                    <p className="text-sm font-medium" data-testid="text-outreach-cta">
                      {outreachResult.callToAction}
                    </p>
                  </div>
                )}

                {outreachResult.talkingPoints?.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Talking Points</p>
                    <ul className="space-y-1">
                      {outreachResult.talkingPoints.map((point, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <CheckCircle2 className="h-3 w-3 mt-1 shrink-0 text-primary/60" />
                          <span data-testid={`text-talking-point-${i}`}>{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Mail className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">
                  Select a recipient type and generate an outreach draft.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="similar" className="mt-4 space-y-4">
          {similarLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
            </div>
          ) : similarData?.similar && similarData.similar.length > 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground" data-testid="text-similar-count">
                {similarData.similar.length} similar opportunities found from {similarData.totalCandidates} candidates
              </p>
              {similarData.similar.map((s) => (
                <Card key={s.id} data-testid={`card-similar-${s.id}`}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <Link href={`/capture/opportunity/${s.id}`}>
                          <span className="text-sm font-medium hover:underline cursor-pointer" data-testid={`text-similar-title-${s.id}`}>
                            {s.title}
                          </span>
                        </Link>
                      </div>
                      <Badge variant="secondary" data-testid={`badge-similarity-${s.id}`}>
                        {s.score}% match
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      <span data-testid={`text-similar-agency-${s.id}`}>{s.agency}</span>
                      {s.setAside && <Badge variant="outline">{s.setAside}</Badge>}
                      {s.value && <span data-testid={`text-similar-value-${s.id}`}>{formatCurrency(s.value)}</span>}
                    </div>
                    {s.reasons.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {s.reasons.map((r, i) => (
                          <Badge key={i} variant="outline" className="text-[10px]" data-testid={`badge-reason-${s.id}-${i}`}>
                            {r}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <TrendingUp className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">
                  No similar opportunities found.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="partners" className="mt-4 space-y-4">
          {partnersLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
            </div>
          ) : partnersData ? (
            <div className="space-y-4">
              {partnersData.shortlist?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium flex items-center gap-1.5">
                    <Star className="h-3.5 w-3.5 text-yellow-500" />
                    Shortlisted Partners
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {partnersData.shortlist.map((s) => (
                      <Badge key={s.id} variant="secondary" data-testid={`badge-shortlisted-${s.id}`}>
                        {s.partnerName}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {partnersData.recommendations?.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground" data-testid="text-partner-count">
                    {partnersData.recommendations.length} partner recommendations
                  </p>
                  {partnersData.recommendations.map((p) => {
                    const isShortlisted = partnersData.shortlist?.some((s) => s.partnerName === p.partnerName);
                    return (
                      <Card key={p.id} data-testid={`card-partner-${p.id}`}>
                        <CardContent className="p-4 space-y-2">
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="flex-1 min-w-0 space-y-1">
                              <p className="text-sm font-medium" data-testid={`text-partner-name-${p.id}`}>{p.partnerName}</p>
                              <Badge variant="outline" className="text-[10px]">{p.partnerType.replace(/_/g, " ")}</Badge>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" data-testid={`badge-relevance-${p.id}`}>
                                {p.relevanceScore}%
                              </Badge>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => shortlistMutation.mutate({ partnerName: p.partnerName, recommendationId: p.id })}
                                disabled={shortlistMutation.isPending || isShortlisted}
                                data-testid={`button-shortlist-${p.id}`}
                              >
                                {isShortlisted ? (
                                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                                ) : (
                                  <Star className="h-3.5 w-3.5 mr-1" />
                                )}
                                {isShortlisted ? "Listed" : "Shortlist"}
                              </Button>
                            </div>
                          </div>
                          {p.capabilities?.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {p.capabilities.map((c, i) => (
                                <Badge key={i} variant="outline" className="text-[10px]" data-testid={`badge-capability-${p.id}-${i}`}>
                                  {c}
                                </Badge>
                              ))}
                            </div>
                          )}
                          {p.rationale && (
                            <p className="text-xs text-muted-foreground" data-testid={`text-rationale-${p.id}`}>{p.rationale}</p>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                    <Users className="h-10 w-10 text-muted-foreground mb-3" />
                    <p className="text-sm text-muted-foreground">
                      No partner recommendations available yet.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Users className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">
                  Switch to the Partners tab to load partner suggestions.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="pressure" className="mt-4 space-y-4">
          {pressureLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20" />
              <Skeleton className="h-48" />
            </div>
          ) : pressureData ? (
            <div className="space-y-4">
              <Card data-testid="card-pressure-overview">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className={`px-3 py-1 rounded-md text-sm font-medium ${pressureLevelColor(pressureData.pressureLevel)}`} data-testid="badge-pressure-level">
                      {pressureData.pressureLevel.toUpperCase()}
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold" data-testid="text-pressure-score">{pressureData.pressureScore}</p>
                      <p className="text-xs text-muted-foreground">Pressure Score</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold" data-testid="text-competitor-count">{pressureData.competitorCount}</p>
                      <p className="text-xs text-muted-foreground">Est. Competitors</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {pressureData.topCompetitors?.length > 0 && (
                <Card data-testid="card-competitors-list">
                  <CardHeader>
                    <CardTitle className="text-base">Top Competitors</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {pressureData.topCompetitors.map((c, i) => (
                      <div key={i} className="flex items-start justify-between gap-3 bg-muted/50 rounded-md px-3 py-2" data-testid={`card-competitor-${i}`}>
                        <div className="space-y-1">
                          <p className="text-sm font-medium" data-testid={`text-competitor-name-${i}`}>{c.name}</p>
                          {c.strengths?.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {c.strengths.map((s, j) => (
                                <Badge key={j} variant="outline" className="text-[10px]">{s}</Badge>
                              ))}
                            </div>
                          )}
                        </div>
                        <Badge
                          variant={c.threat === "high" ? "destructive" : c.threat === "medium" ? "secondary" : "outline"}
                          data-testid={`badge-threat-${i}`}
                        >
                          {c.threat}
                        </Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {(pressureData.analysisJson?.analysis || pressureData.rationale) && (
                <Card data-testid="card-pressure-analysis">
                  <CardHeader>
                    <CardTitle className="text-base">Analysis</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {pressureData.analysisJson?.analysis && (
                      <p className="text-sm text-muted-foreground" data-testid="text-pressure-analysis">{pressureData.analysisJson.analysis}</p>
                    )}
                    {pressureData.rationale && (
                      <p className="text-sm text-muted-foreground" data-testid="text-pressure-rationale">{pressureData.rationale}</p>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <AlertTriangle className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">
                  No competitor pressure data available yet.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="requirements" className="mt-4 space-y-4">
          {requirementsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16" />)}
            </div>
          ) : requirementsData ? (
            <div className="space-y-4">
              {requirementsData.summary && (
                <Card data-testid="card-requirements-summary">
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground" data-testid="text-requirements-summary">{requirementsData.summary}</p>
                  </CardContent>
                </Card>
              )}

              {requirementsData.requirements?.length > 0 && (
                <Card data-testid="card-requirements-list">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <ListChecks className="h-4 w-4" />
                      Requirements ({requirementsData.requirements.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {Object.entries(
                      requirementsData.requirements.reduce<Record<string, RequirementItem[]>>((acc, req) => {
                        const cat = req.category || "other";
                        if (!acc[cat]) acc[cat] = [];
                        acc[cat].push(req);
                        return acc;
                      }, {})
                    ).map(([category, reqs]) => (
                      <div key={category} className="space-y-1.5">
                        <p className="text-xs font-medium uppercase text-muted-foreground tracking-wider">
                          {category.replace(/_/g, " ")}
                        </p>
                        {reqs.map((req) => (
                          <div key={req.id} className="flex items-start gap-2 bg-muted/50 rounded-md px-3 py-2" data-testid={`card-req-${req.id}`}>
                            <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary/60" />
                            <div className="flex-1 min-w-0 space-y-0.5">
                              <p className="text-sm" data-testid={`text-req-${req.id}`}>{req.requirement}</p>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <Badge variant={priorityColor(req.priority)} className="text-[10px]" data-testid={`badge-priority-${req.id}`}>
                                  {req.priority}
                                </Badge>
                                {req.source && (
                                  <span className="text-[10px] text-muted-foreground">{req.source}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {requirementsData.checklist?.length > 0 && (
                <Card data-testid="card-checklist">
                  <CardHeader>
                    <CardTitle className="text-base">Checklist</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {requirementsData.checklist.map((item) => (
                      <div key={item.id} className="flex items-start gap-2 bg-muted/50 rounded-md px-3 py-2" data-testid={`card-checklist-${item.id}`}>
                        <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary/60" />
                        <div className="flex-1 min-w-0 space-y-0.5">
                          <p className="text-sm" data-testid={`text-checklist-${item.id}`}>{item.item}</p>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Badge variant="outline" className="text-[10px]">{item.section}</Badge>
                            <Badge variant="outline" className="text-[10px]">{item.assignee}</Badge>
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <ListChecks className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">
                  No requirements data available yet.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="documents" className="mt-4 space-y-4">
          <DocumentsTab opportunityId={id!} opportunity={opportunity} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================================
// DocumentsTab — SAM.gov documents for this opportunity, with live-fetch.
// ============================================================================
interface SamDoc { url: string; name: string; source: string; sizeBytes?: number; mime?: string; }
interface SamDocsResponse { ok: boolean; noticeId: string | null; cached: boolean; fetchedAt?: string; documents: SamDoc[]; descriptionHtml?: string; rawTitle?: string; agency?: string; error?: string; }

function DocumentsTab({ opportunityId, opportunity }: { opportunityId: string; opportunity: any }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading, isError, refetch } = useQuery<SamDocsResponse>({
    queryKey: [`/api/opportunities/${opportunityId}/sam-documents`],
    queryFn: async () => { const r = await fetch(`/api/opportunities/${opportunityId}/sam-documents`); if (!r.ok) throw new Error("Failed to load docs"); return r.json(); },
    staleTime: 60_000,
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/opportunities/${opportunityId}/sync-sam-documents`);
      return r.json();
    },
    onSuccess: (d: any) => {
      queryClient.invalidateQueries({ queryKey: [`/api/opportunities/${opportunityId}/sam-documents`] });
      const found = d?.documents?.length ?? 0;
      toast({ title: `SAM.gov sync: ${found} document${found === 1 ? "" : "s"}`, description: d?.message });
    },
    onError: (e: any) => toast({ title: "Sync failed", description: e?.message ?? "Server error", variant: "destructive" }),
  });

  const docs = data?.documents ?? [];
  const noticeId = data?.noticeId ?? opportunity?.externalId ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2"><Paperclip className="h-4 w-4" />SAM.gov Source Documents</h3>
          <p className="text-xs text-muted-foreground">All attachments, the description body, and amendments — live from SAM.gov.</p>
        </div>
        <div className="flex items-center gap-2">
          {noticeId && <a href={`https://sam.gov/opp/${noticeId}`} target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:underline flex items-center gap-1"><ExternalLink className="h-3 w-3" />Open on SAM.gov</a>}
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isLoading} className="gap-1"><RefreshCw className="h-3 w-3" />Reload</Button>
          <Button size="sm" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending} className="gap-1" data-testid="btn-sync-sam-docs">{syncMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}{syncMutation.isPending ? "Pulling from SAM.gov..." : "Pull from SAM.gov"}</Button>
        </div>
      </div>

      {noticeId && (
        <div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
          <span><strong className="text-foreground">Notice ID:</strong> <code className="font-mono">{noticeId}</code></span>
          {data?.fetchedAt && <span><strong className="text-foreground">Last fetched:</strong> {new Date(data.fetchedAt).toLocaleString()}</span>}
          {data?.cached && <Badge variant="outline" className="text-[10px]">cached</Badge>}
        </div>
      )}

      {isLoading && <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Loading documents…</CardContent></Card>}
      {isError && <Card><CardContent className="py-8 text-center text-sm"><p className="text-red-400 mb-2">Failed to load documents</p><Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button></CardContent></Card>}

      {!isLoading && !isError && docs.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <FolderOpen className="h-10 w-10 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">{data?.error || "No SAM.gov documents have been pulled for this opportunity yet."}</p>
            <p className="text-xs text-muted-foreground">Click <strong>Pull from SAM.gov</strong> above to fetch the full opportunity package (attachments, description, amendments).</p>
            {!noticeId && <p className="text-xs text-amber-400">This opportunity has no noticeId — it may have been ingested from a non-SAM source.</p>}
          </CardContent>
        </Card>
      )}

      {docs.length > 0 && (
        <Card>
          <CardHeader className="py-2 px-4 border-b border-white/10"><CardTitle className="text-xs font-medium text-muted-foreground grid grid-cols-12 gap-3"><span className="col-span-7">File</span><span className="col-span-2">Source</span><span className="col-span-2 text-right">Size</span><span className="col-span-1 text-right">Open</span></CardTitle></CardHeader>
          <CardContent className="p-0">
            {docs.map((d, i) => (
              <div key={i} className="grid grid-cols-12 gap-3 px-4 py-2.5 border-b last:border-b-0 border-white/10 text-sm items-center hover:bg-white/[0.02]">
                <div className="col-span-7 flex items-center gap-2 min-w-0">
                  <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate" title={d.name}>{d.name}</span>
                </div>
                <div className="col-span-2 text-xs"><Badge variant="outline" className="text-[10px]">{d.source}</Badge></div>
                <div className="col-span-2 text-xs text-right font-mono text-muted-foreground">{d.sizeBytes ? `${(d.sizeBytes/1024).toFixed(1)} KB` : "—"}</div>
                <div className="col-span-1 flex justify-end"><a href={d.url} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300" title="Open"><ExternalLink className="h-3.5 w-3.5" /></a></div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {data?.descriptionHtml && (
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-1.5"><FileText className="h-4 w-4" />Opportunity Description</CardTitle></CardHeader>
          <CardContent>
            <div className="prose prose-sm prose-invert max-w-none text-sm" dangerouslySetInnerHTML={{ __html: data.descriptionHtml }} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
