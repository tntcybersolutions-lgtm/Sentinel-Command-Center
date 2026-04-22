import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Bot,
  Workflow,
  Search,
  Filter,
  X,
  Brain,
  Star,
  FileText,
  CheckSquare,
  ListChecks,
  Sparkles,
  Clock,
  Eye,
} from "lucide-react";
import ReviewBoard from "@/components/ai-review/ReviewBoard";

interface AiArtifact {
  id: string;
  tenantId: string;
  entityType: string;
  entityId: string;
  artifactType: string;
  payloadJson: any;
  evidenceJson: any;
  confidence: number | null;
  modelVersion: string | null;
  promptVersion: string | null;
  createdAt: string;
}

interface PaginatedArtifacts {
  data: AiArtifact[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export default function AIReviewQueue() {
  const [activeTab, setActiveTab] = useState("artifacts");
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [selectedArtifact, setSelectedArtifact] = useState<AiArtifact | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: response, isLoading } = useQuery<PaginatedArtifacts>({
    queryKey: ["/api/v4/ai-artifacts", { limit: 200 }],
    queryFn: async () => {
      const res = await fetch("/api/v4/ai-artifacts?limit=200");
      return res.json();
    },
  });

  const artifacts = response?.data || [];

  const filtered = useMemo(() => {
    let result = [...artifacts];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(a =>
        (a.artifactType || "").toLowerCase().includes(q) ||
        (a.entityId || "").toLowerCase().includes(q) ||
        JSON.stringify(a.payloadJson || {}).toLowerCase().includes(q)
      );
    }
    if (typeFilter !== "all") {
      result = result.filter(a => a.artifactType === typeFilter);
    }
    return result;
  }, [artifacts, searchQuery, typeFilter]);

  const getArtifactIcon = (type: string) => {
    switch (type) {
      case "fit_score": return <Star className="h-4 w-4 text-yellow-500" />;
      case "ai_summary": return <FileText className="h-4 w-4 text-blue-500" />;
      case "requirements_extract": return <ListChecks className="h-4 w-4 text-purple-500" />;
      case "compliance_checklist": return <CheckSquare className="h-4 w-4 text-green-500" />;
      default: return <Sparkles className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getArtifactBadge = (type: string) => {
    const colors: Record<string, string> = {
      fit_score: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20",
      ai_summary: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
      requirements_extract: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
      compliance_checklist: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
    };
    return <Badge className={colors[type] || ""}>{type.replace(/_/g, " ")}</Badge>;
  };

  const getPreview = (artifact: AiArtifact): string => {
    const p = artifact.payloadJson;
    switch (artifact.artifactType) {
      case "fit_score":
        return `Score: ${p?.score ?? "--"} - ${p?.recommendation ?? ""}`;
      case "ai_summary":
        return p?.summary?.substring(0, 100) || "AI-generated summary";
      case "requirements_extract":
        return `${(p?.requirements || p?.total_count || 0)} requirements identified`;
      case "compliance_checklist":
        return `${p?.complete_count ?? 0}/${p?.total_count ?? 0} items complete`;
      default:
        return JSON.stringify(p).substring(0, 80);
    }
  };

  const formatTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const fitScoreCount = artifacts.filter(a => a.artifactType === "fit_score").length;
  const summaryCount = artifacts.filter(a => a.artifactType === "ai_summary").length;
  const checklistCount = artifacts.filter(a => a.artifactType === "compliance_checklist").length;

  return (
    <div className="flex flex-col h-full" data-testid="ai-review-queue-page">
      <div className="flex items-center justify-between gap-4 px-6 py-3 border-b shrink-0 flex-wrap">
        <div className="flex items-center gap-2">
          <Workflow className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold" data-testid="text-page-title">AI Review Queue</h1>
          <Badge variant="outline" className="text-xs">
            <Bot className="h-3 w-3 mr-1" />
            HERBIE
          </Badge>
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList data-testid="tablist-view-mode">
            <TabsTrigger value="artifacts" data-testid="tab-artifacts">
              <Brain className="h-4 w-4 mr-1" />
              AI Artifacts
            </TabsTrigger>
            <TabsTrigger value="work-packages" data-testid="tab-work-packages">
              <Workflow className="h-4 w-4 mr-1" />
              Work Packages
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {activeTab === "work-packages" ? (
        <div className="flex-1 overflow-hidden">
          <ReviewBoard />
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-4 md:px-6 py-3 space-y-3 border-b">
            <div className="grid grid-cols-3 gap-3">
              <Card>
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <Star className="h-4 w-4 text-yellow-500" />
                    <span className="text-sm text-muted-foreground">Fit Scores</span>
                  </div>
                  <p className="text-xl font-bold mt-1" data-testid="text-fit-count">{fitScoreCount}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-blue-500" />
                    <span className="text-sm text-muted-foreground">Summaries</span>
                  </div>
                  <p className="text-xl font-bold mt-1" data-testid="text-summary-count">{summaryCount}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <CheckSquare className="h-4 w-4 text-green-500" />
                    <span className="text-sm text-muted-foreground">Checklists</span>
                  </div>
                  <p className="text-xl font-bold mt-1" data-testid="text-checklist-count">{checklistCount}</p>
                </CardContent>
              </Card>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search artifacts..."
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
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[160px]" data-testid="select-type-filter">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="fit_score">Fit Scores</SelectItem>
                  <SelectItem value="ai_summary">Summaries</SelectItem>
                  <SelectItem value="requirements_extract">Requirements</SelectItem>
                  <SelectItem value="compliance_checklist">Checklists</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-sm text-muted-foreground" data-testid="text-result-count">{filtered.length} artifacts</span>
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            {isLoading ? (
              <div className="p-4 space-y-2">
                {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : (
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead className="w-[140px]">Type</TableHead>
                    <TableHead className="min-w-[300px]">Preview</TableHead>
                    <TableHead className="w-[90px]">Confidence</TableHead>
                    <TableHead className="w-[100px]">Model</TableHead>
                    <TableHead className="w-[80px]">When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                        No AI artifacts match your filters.
                      </TableCell>
                    </TableRow>
                  ) : filtered.map(artifact => (
                    <TableRow
                      key={artifact.id}
                      className="cursor-pointer hover-elevate"
                      onClick={() => { setSelectedArtifact(artifact); setDrawerOpen(true); }}
                      data-testid={`row-artifact-${artifact.id}`}
                    >
                      <TableCell className="pr-0">
                        {getArtifactIcon(artifact.artifactType)}
                      </TableCell>
                      <TableCell>
                        {getArtifactBadge(artifact.artifactType)}
                      </TableCell>
                      <TableCell>
                        <p className="text-sm line-clamp-1" data-testid={`text-preview-${artifact.id}`}>
                          {getPreview(artifact)}
                        </p>
                      </TableCell>
                      <TableCell>
                        {artifact.confidence != null ? (
                          <div className="flex items-center gap-1.5">
                            <div className="w-6 h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className={`h-full rounded-full ${artifact.confidence >= 80 ? 'bg-green-500' : artifact.confidence >= 60 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                style={{ width: `${artifact.confidence}%` }}
                              />
                            </div>
                            <span className="text-xs tabular-nums">{artifact.confidence}%</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">--</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">{artifact.modelVersion || "--"}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">{formatTimeAgo(artifact.createdAt)}</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      )}

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto" data-testid="drawer-artifact-detail">
          {selectedArtifact && (
            <div className="space-y-6">
              <SheetHeader>
                <SheetTitle className="text-lg leading-tight pr-6 flex items-center gap-2" data-testid="text-drawer-title">
                  {getArtifactIcon(selectedArtifact.artifactType)}
                  {selectedArtifact.artifactType.replace(/_/g, " ")}
                </SheetTitle>
              </SheetHeader>

              <div className="flex items-center gap-2 flex-wrap">
                {getArtifactBadge(selectedArtifact.artifactType)}
                {selectedArtifact.confidence != null && (
                  <Badge variant="outline">{selectedArtifact.confidence}% confidence</Badge>
                )}
                {selectedArtifact.modelVersion && (
                  <Badge variant="secondary">{selectedArtifact.modelVersion}</Badge>
                )}
              </div>

              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground mb-2">Entity</p>
                  <p className="text-sm font-medium">{selectedArtifact.entityType} / {selectedArtifact.entityId.substring(0, 8)}...</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground mb-2">Payload</p>
                  {selectedArtifact.artifactType === "fit_score" && selectedArtifact.payloadJson && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <span className="text-3xl font-bold">{selectedArtifact.payloadJson.score}</span>
                        <Badge className={
                          selectedArtifact.payloadJson.recommendation === "pursue"
                            ? "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20"
                            : "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20"
                        }>
                          {selectedArtifact.payloadJson.recommendation}
                        </Badge>
                      </div>
                      {selectedArtifact.payloadJson.factors && (
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          {Object.entries(selectedArtifact.payloadJson.factors as Record<string, number>).map(([k, v]) => (
                            <div key={k} className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-muted/50">
                              <span className="text-muted-foreground capitalize">{k.replace(/_/g, " ")}</span>
                              <span className="font-medium tabular-nums">{v}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {selectedArtifact.artifactType === "ai_summary" && (
                    <div className="space-y-2">
                      <p className="text-sm">{selectedArtifact.payloadJson?.summary}</p>
                      {selectedArtifact.payloadJson?.key_points && (
                        <div className="flex gap-1 flex-wrap mt-2">
                          {(Array.isArray(selectedArtifact.payloadJson.key_points) ? selectedArtifact.payloadJson.key_points : JSON.parse(selectedArtifact.payloadJson.key_points)).map((p: string, i: number) => (
                            <Badge key={i} variant="secondary" className="text-xs">{p}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {selectedArtifact.artifactType === "compliance_checklist" && selectedArtifact.payloadJson?.items && (
                    <div className="space-y-2">
                      {(Array.isArray(selectedArtifact.payloadJson.items) ? selectedArtifact.payloadJson.items : JSON.parse(selectedArtifact.payloadJson.items)).map((item: any, i: number) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          {item.status === "complete" ? (
                            <CheckSquare className="h-4 w-4 text-green-500 shrink-0" />
                          ) : item.status === "pending" ? (
                            <Clock className="h-4 w-4 text-yellow-500 shrink-0" />
                          ) : (
                            <div className="h-4 w-4 border rounded shrink-0" />
                          )}
                          <span className={item.status === "complete" ? "line-through text-muted-foreground" : ""}>{item.item}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {selectedArtifact.artifactType === "requirements_extract" && selectedArtifact.payloadJson?.requirements && (
                    <div className="space-y-2">
                      {(Array.isArray(selectedArtifact.payloadJson.requirements) ? selectedArtifact.payloadJson.requirements : JSON.parse(selectedArtifact.payloadJson.requirements)).map((req: any, i: number) => (
                        <div key={i} className="p-2 rounded bg-muted/50 text-sm">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="secondary" className="text-xs">{req.category || "general"}</Badge>
                            {req.mandatory && <Badge className="bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20 text-xs">Required</Badge>}
                          </div>
                          <p>{req.text}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {selectedArtifact.evidenceJson && (
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground mb-2">Evidence Sources</p>
                    <div className="flex gap-1 flex-wrap">
                      {(selectedArtifact.evidenceJson.sources || []).map((s: string, i: number) => (
                        <Badge key={i} variant="outline" className="text-xs">{s}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              <p className="text-xs text-muted-foreground text-center">
                Generated {new Date(selectedArtifact.createdAt).toLocaleString()} using {selectedArtifact.modelVersion}
              </p>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
