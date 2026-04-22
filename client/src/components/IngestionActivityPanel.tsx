import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  RefreshCw,
  Download,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileText,
  Clock,
  ArrowDownToLine,
  Package,
  Globe,
  Play,
  Lock,
  Scale,
  Brain,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  FolderOpen,
  Search,
  ExternalLink,
} from "lucide-react";

interface ArtifactItem {
  id: string;
  title: string;
  templateCode: string | null;
  sourceType: string;
  sourceUrl: string | null;
  storageKey: string | null;
  status: string;
  metadataJson: any;
  updatedAt: string;
}

interface IngestionStatusResponse {
  hasBidProject: boolean;
  bidProjectId?: string;
  total: number;
  byStatus: Record<string, number>;
  bySource: Record<string, number>;
  lastRunId: string | null;
  lastRunAt: string | null;
  artifacts: ArtifactItem[];
}

interface IngestionEvent {
  id: string;
  tenantId: string;
  projectId?: string;
  bidProjectId?: string;
  runId?: string;
  eventType: string;
  entityType?: string;
  entityId?: string;
  message?: string;
  detailsJson?: any;
  createdAt: string;
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; variant: string; className: string }> = {
    missing: { label: "Missing", variant: "secondary", className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
    ready: { label: "Ready", variant: "secondary", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-400" },
    downloading: { label: "Downloading", variant: "secondary", className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-400 animate-pulse" },
    downloaded: { label: "Downloaded", variant: "default", className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-400" },
    fetch_failed: { label: "Failed", variant: "destructive", className: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-400" },
  };
  const s = map[status] ?? { label: status, variant: "secondary", className: "" };
  return <Badge className={`text-[10px] px-1.5 py-0 ${s.className}`} data-testid={`status-badge-${status}`}>{s.label}</Badge>;
}

function sourceIcon(sourceType: string) {
  if (sourceType === "samgov") return <Globe className="h-3 w-3 text-blue-500" />;
  if (sourceType === "highergov") return <Search className="h-3 w-3 text-purple-500" />;
  if (sourceType === "zip_extract") return <Package className="h-3 w-3 text-orange-500" />;
  return <FileText className="h-3 w-3 text-muted-foreground" />;
}

function eventTypeIcon(type: string) {
  if (type.includes("completed") || type.includes("inserted") || type.includes("success")) return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
  if (type.includes("failed") || type.includes("error")) return <XCircle className="h-3.5 w-3.5 text-red-500" />;
  if (type.includes("skipped") || type.includes("no_api_key") || type.includes("no_opportunity")) return <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />;
  if (type.includes("started") || type.includes("batch") || type.includes("pipeline")) return <ArrowDownToLine className="h-3.5 w-3.5 text-blue-500" />;
  if (type.includes("zip")) return <Package className="h-3.5 w-3.5 text-purple-500" />;
  if (type.includes("discover")) return <Search className="h-3.5 w-3.5 text-cyan-500" />;
  return <FileText className="h-3.5 w-3.5 text-muted-foreground" />;
}

function eventTypeBadgeVariant(type: string): string {
  if (type.includes("failed") || type.includes("error")) return "destructive";
  if (type.includes("completed") || type.includes("inserted") || type.includes("success")) return "default";
  if (type.includes("discover")) return "outline";
  return "secondary";
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  if (diffMs < 60_000) return "just now";
  if (diffMs < 3600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86400_000) return `${Math.floor(diffMs / 3600_000)}h ago`;
  return d.toLocaleDateString();
}

function confidenceIcon(method?: string) {
  if (method === "deterministic") return <Lock className="h-3 w-3 text-green-600" />;
  if (method === "rule_scored") return <Scale className="h-3 w-3 text-blue-600" />;
  if (method === "ai") return <Brain className="h-3 w-3 text-purple-600" />;
  if (method === "ai_low_confidence") return <Brain className="h-3 w-3 text-orange-500" />;
  return null;
}

function DiagnosticBanner({ events }: { events: IngestionEvent[] | undefined }) {
  if (!events?.length) return null;

  const noResults = events.find(e => e.eventType === "discover.no_results");
  const noApiKey = events.filter(e => e.eventType.includes("no_api_key"));

  if (!noResults && !noApiKey.length) return null;

  const diag = noResults?.detailsJson;

  return (
    <div className="space-y-2" data-testid="diagnostic-banners">
      {noResults && diag && (
        <div className="rounded-md border border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-950/30 px-3 py-2 text-xs" data-testid="banner-no-results">
          <div className="flex items-center gap-1.5 font-medium text-yellow-800 dark:text-yellow-400 mb-1">
            <AlertTriangle className="h-3.5 w-3.5" />
            Discovery returned zero documents
          </div>
          <ul className="space-y-0.5 text-yellow-700 dark:text-yellow-500 ml-5 list-disc">
            {!diag.hasUrl && <li>Opportunity has no URL set</li>}
            {!diag.hasExternalId && <li>Opportunity has no external ID</li>}
            {!diag.hasSamKey && <li>SAM.gov API key not configured</li>}
            {!diag.hasHigherGovKey && <li>HigherGov API key not configured</li>}
            {diag.sourceSystemKey && <li>Source system: {diag.sourceSystemKey}</li>}
          </ul>
          {diag.note && <p className="text-[10px] text-yellow-600 dark:text-yellow-600 mt-1">{diag.note}</p>}
        </div>
      )}
      {noApiKey.length > 0 && !noResults && (
        <div className="rounded-md border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/30 px-3 py-2 text-xs" data-testid="banner-no-api-key">
          <div className="flex items-center gap-1.5 font-medium text-blue-800 dark:text-blue-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            Some discovery sources skipped (missing API key)
          </div>
        </div>
      )}
    </div>
  );
}

export default function IngestionActivityPanel({ projectId }: { projectId: string }) {
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [expandedArtifact, setExpandedArtifact] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"artifacts" | "activity">("artifacts");

  const { data: status, isLoading: statusLoading } = useQuery<IngestionStatusResponse>({
    queryKey: ["/api/projects", projectId, "ingestion", "status"],
    queryFn: () => fetch(`/api/projects/${projectId}/ingestion/status`, { credentials: "include" }).then(r => r.json()),
    refetchInterval: 15_000,
  });

  const { data: events, isLoading: eventsLoading } = useQuery<IngestionEvent[]>({
    queryKey: ["/api/projects", projectId, "ingestion-events"],
    queryFn: () => fetch(`/api/projects/${projectId}/ingestion-events?limit=100`, { credentials: "include" }).then(r => r.json()),
    refetchInterval: 15_000,
  });

  const runIngestionMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/projects/${projectId}/ingestion/run`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "ingestion", "status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "ingestion-events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "project-documents"] });
    },
  });

  const resyncMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/projects/${projectId}/ingestion/resync`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "ingestion", "status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "ingestion-events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "project-documents"] });
    },
  });

  const retryMutation = useMutation({
    mutationFn: (artifactId: string) => apiRequest("POST", `/api/ingestion/artifacts/${artifactId}/retry`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "ingestion", "status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "ingestion-events"] });
    },
  });

  const isRunning = runIngestionMutation.isPending || resyncMutation.isPending;

  if (statusLoading) {
    return (
      <div className="space-y-4" data-testid="ingestion-panel-loading">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!status?.hasBidProject) {
    return (
      <Card data-testid="ingestion-panel-empty">
        <CardContent className="py-8 text-center text-muted-foreground">
          <Globe className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No linked bid project — document ingestion not available for this project.</p>
        </CardContent>
      </Card>
    );
  }

  const artifacts = status.artifacts ?? [];
  const byStatus = status.byStatus ?? {};
  const bySource = status.bySource ?? {};

  const totalArtifacts = artifacts.length;
  const downloaded = byStatus["downloaded"] ?? 0;
  const failed = byStatus["fetch_failed"] ?? 0;
  const ready = byStatus["ready"] ?? 0;
  const missing = byStatus["missing"] ?? 0;
  const filed = artifacts.filter(a => a.storageKey).length;
  const progressPct = totalArtifacts > 0 ? Math.round((filed / totalArtifacts) * 100) : 0;

  const displayedEvents = showAllEvents ? events : events?.slice(0, 20);

  return (
    <div className="space-y-4" data-testid="ingestion-activity-panel">
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          size="sm"
          onClick={() => runIngestionMutation.mutate()}
          disabled={isRunning}
          data-testid="btn-run-ingestion"
        >
          <Play className={`h-3.5 w-3.5 mr-1.5 ${runIngestionMutation.isPending ? "animate-pulse" : ""}`} />
          {runIngestionMutation.isPending ? "Running..." : "Run Full Ingestion"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => resyncMutation.mutate()}
          disabled={isRunning}
          data-testid="btn-resync"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${resyncMutation.isPending ? "animate-spin" : ""}`} />
          {resyncMutation.isPending ? "Re-syncing..." : "Re-sync Sources"}
        </Button>
        {status.lastRunAt && (
          <span className="text-[11px] text-muted-foreground ml-auto">
            Last run: {formatTime(status.lastRunAt)}
          </span>
        )}
      </div>

      <DiagnosticBanner events={events} />

      <div className="grid grid-cols-5 gap-2">
        <Card data-testid="stat-total">
          <CardContent className="pt-3 pb-2 px-3">
            <div className="text-[10px] text-muted-foreground font-medium">Total</div>
            <div className="text-xl font-bold">{totalArtifacts}</div>
          </CardContent>
        </Card>
        <Card data-testid="stat-downloaded">
          <CardContent className="pt-3 pb-2 px-3">
            <div className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
              <Download className="h-2.5 w-2.5" /> Downloaded
            </div>
            <div className="text-xl font-bold text-green-600">{downloaded}</div>
          </CardContent>
        </Card>
        <Card data-testid="stat-ready">
          <CardContent className="pt-3 pb-2 px-3">
            <div className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
              <Clock className="h-2.5 w-2.5" /> Ready
            </div>
            <div className="text-xl font-bold text-yellow-600">{ready}</div>
          </CardContent>
        </Card>
        <Card data-testid="stat-missing">
          <CardContent className="pt-3 pb-2 px-3">
            <div className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
              <AlertTriangle className="h-2.5 w-2.5" /> Missing
            </div>
            <div className="text-xl font-bold text-gray-500">{missing}</div>
          </CardContent>
        </Card>
        <Card data-testid="stat-failed">
          <CardContent className="pt-3 pb-2 px-3">
            <div className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
              <XCircle className="h-2.5 w-2.5" /> Failed
            </div>
            <div className="text-xl font-bold text-red-600">{failed}</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3">
        <Progress value={progressPct} className="flex-1 h-2" data-testid="progress-bar" />
        <span className="text-xs text-muted-foreground whitespace-nowrap">{progressPct}% complete</span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-muted-foreground">Sources:</span>
        {Object.entries(bySource).map(([src, count]) => (
          <Badge key={src} variant="outline" className="text-[10px] gap-1" data-testid={`source-${src}`}>
            {sourceIcon(src)}
            {src === "samgov" ? "SAM.gov" : src === "highergov" ? "HigherGov" : src === "zip_extract" ? "ZIP" : src}: {count as number}
          </Badge>
        ))}
      </div>

      <div className="flex gap-1 border-b">
        <button
          className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${activeTab === "artifacts" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          onClick={() => setActiveTab("artifacts")}
          data-testid="tab-artifacts"
        >
          Artifacts ({totalArtifacts})
        </button>
        <button
          className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${activeTab === "activity" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          onClick={() => setActiveTab("activity")}
          data-testid="tab-activity"
        >
          Activity Feed ({events?.length ?? 0})
        </button>
      </div>

      {activeTab === "artifacts" && (
        <Card data-testid="artifacts-list">
          <CardContent className="p-0">
            {artifacts.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                No artifacts found. Run ingestion to discover documents from SAM.gov and HigherGov.
              </div>
            ) : (
              <div className="divide-y">
                {artifacts.map((a) => {
                  const meta = a.metadataJson as any;
                  const classification = meta?.classification;
                  const isExpanded = expandedArtifact === a.id;

                  return (
                    <div key={a.id} data-testid={`artifact-row-${a.id}`}>
                      <div
                        className="flex items-center gap-2 px-3 py-2 hover:bg-muted/30 transition-colors cursor-pointer"
                        onClick={() => setExpandedArtifact(isExpanded ? null : a.id)}
                      >
                        {isExpanded ? <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}
                        {sourceIcon(a.sourceType)}
                        <span className="text-xs font-medium truncate flex-1" data-testid={`artifact-title-${a.id}`}>{a.title}</span>
                        {a.templateCode && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">{a.templateCode}</Badge>
                        )}
                        {classification && (
                          <span className="flex items-center gap-0.5 shrink-0" title={`${classification.method}: ${classification.confidence}`}>
                            {confidenceIcon(classification.method)}
                            <Badge variant="outline" className="text-[9px] px-1 py-0 gap-0.5" data-testid={`folder-badge-${a.id}`}>
                              <FolderOpen className="h-2.5 w-2.5" />
                              {classification.folder?.replace(/^\d+_/, "")}
                            </Badge>
                            <span className="text-[9px] text-muted-foreground">{Math.round((classification.confidence ?? 0) * 100)}%</span>
                          </span>
                        )}
                        {statusBadge(a.status)}
                        {a.status === "fetch_failed" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-[10px]"
                            onClick={(e) => { e.stopPropagation(); retryMutation.mutate(a.id); }}
                            disabled={retryMutation.isPending}
                            data-testid={`btn-retry-${a.id}`}
                          >
                            <RotateCcw className="h-3 w-3 mr-1" />
                            Retry
                          </Button>
                        )}
                      </div>
                      {isExpanded && (
                        <div className="px-8 pb-3 space-y-1.5 bg-muted/20 text-[11px]" data-testid={`artifact-detail-${a.id}`}>
                          {a.sourceUrl && (
                            <div className="flex items-center gap-1.5">
                              <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
                              <span className="text-muted-foreground">URL:</span>
                              <a href={a.sourceUrl} target="_blank" rel="noopener" className="text-blue-600 hover:underline truncate">{a.sourceUrl}</a>
                            </div>
                          )}
                          {a.storageKey && (
                            <div className="flex items-center gap-1.5">
                              <FolderOpen className="h-3 w-3 text-muted-foreground shrink-0" />
                              <span className="text-muted-foreground">Stored:</span>
                              <span className="truncate">{a.storageKey}</span>
                            </div>
                          )}
                          {classification && (
                            <div className="space-y-1 mt-1 p-2 rounded bg-muted/40">
                              <div className="flex items-center gap-1.5">
                                {confidenceIcon(classification.method)}
                                <span className="font-medium">Classification:</span>
                                <span>{classification.folder}</span>
                                <span className="text-muted-foreground">({classification.method}, {Math.round((classification.confidence ?? 0) * 100)}%)</span>
                              </div>
                              <div className="text-muted-foreground">{classification.reasoning}</div>
                              {classification.alternativeFolders?.length > 0 && (
                                <div className="text-muted-foreground">Alternatives: {classification.alternativeFolders.join(", ")}</div>
                              )}
                            </div>
                          )}
                          {meta?.lastFetchError && (
                            <div className="text-red-600 flex items-center gap-1">
                              <XCircle className="h-3 w-3" />
                              Error: {meta.lastFetchError}
                            </div>
                          )}
                          {meta?.originalFilename && (
                            <div className="text-muted-foreground">Original: {meta.originalFilename}</div>
                          )}
                          {meta?.size && (
                            <div className="text-muted-foreground">Size: {(meta.size / 1024).toFixed(1)} KB</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "activity" && (
        <Card data-testid="ingestion-event-log">
          <CardContent className="p-0">
            {eventsLoading ? (
              <div className="p-4 space-y-2">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-3/4" />
              </div>
            ) : !displayedEvents || displayedEvents.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                No ingestion events yet. Click "Run Full Ingestion" to start discovering and downloading documents.
              </div>
            ) : (
              <div className="divide-y">
                {displayedEvents.map((ev) => (
                  <div key={ev.id} className="flex items-start gap-2.5 px-4 py-2.5 hover:bg-muted/30 transition-colors" data-testid={`event-row-${ev.id}`}>
                    <div className="mt-0.5">{eventTypeIcon(ev.eventType)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={eventTypeBadgeVariant(ev.eventType) as any} className="text-[10px] px-1.5 py-0" data-testid={`event-badge-${ev.eventType}`}>
                          {ev.eventType.replace("pipeline.", "").replace("discover.", "").replace("import.", "").replace("fetch.", "")}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">{formatTime(ev.createdAt)}</span>
                        {ev.runId && (
                          <span className="text-[9px] text-muted-foreground font-mono">run:{ev.runId.substring(0, 8)}</span>
                        )}
                      </div>
                      <p className="text-xs mt-0.5" data-testid={`event-msg-${ev.id}`}>
                        {ev.message || ev.eventType}
                      </p>
                      {ev.detailsJson?.folderName && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <FolderOpen className="h-2.5 w-2.5" /> {ev.detailsJson.folderName}
                        </span>
                      )}
                      {ev.detailsJson?.error && (
                        <span className="text-[10px] text-red-600">{ev.detailsJson.error}</span>
                      )}
                      {ev.detailsJson?.sourceUrl && !ev.message?.includes(ev.detailsJson.sourceUrl) && (
                        <span className="text-[10px] text-muted-foreground truncate block">{ev.detailsJson.sourceUrl}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {events && events.length > 20 && (
              <div className="p-2 text-center border-t">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => setShowAllEvents(!showAllEvents)}
                  data-testid="btn-toggle-events"
                >
                  {showAllEvents ? "Show Less" : `Show All (${events.length})`}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
