import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Kanban,
  Brain,
  Loader2,
  DollarSign,
  Clock,
  GripVertical,
  Inbox,
  CalendarDays,
  AlertTriangle,
} from "lucide-react";

const STAGES = [
  { key: "new", label: "New" },
  { key: "capture", label: "Capture" },
  { key: "submitted", label: "Submitted" },
  { key: "awarded", label: "Awarded" },
  { key: "closed", label: "Closed" },
] as const;

interface PipelineItem {
  id: string | null;
  tenantId: string;
  entityType: string;
  entityId: string;
  stage: string;
  ownerUserId: string | null;
  priority: string | null;
  aiScore: number | null;
  aiScoreLabel: string | null;
  aiRationale: string | null;
  aiSummary: string | null;
  tags: string[] | null;
  nextActionAt: string | null;
  nextActionDescription: string | null;
  lastActivityAt: string | null;
  createdAt: string;
  updatedAt: string;
  opportunity: {
    id: string;
    title: string;
    synopsis: string | null;
    setAside: string | null;
    contractValue: string | number | null;
    dueAt: string | null;
    naicsCodes: string[] | null;
    locationJson: Record<string, unknown> | null;
    status: string | null;
  } | null;
}

function itemKey(item: PipelineItem): string {
  return item.id || `fallback-${item.entityId}`;
}

function formatCurrency(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "--";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num) || num === 0) return "--";
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(0)}K`;
  return `$${num.toFixed(0)}`;
}

function getDaysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function getScoreColor(score: number | null): string {
  if (score === null) return "bg-muted text-muted-foreground";
  if (score >= 70) return "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20";
  if (score >= 50) return "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20";
  return "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20";
}

function getDueColor(days: number | null): string {
  if (days === null) return "text-muted-foreground";
  if (days < 7) return "text-red-600 dark:text-red-400";
  if (days < 14) return "text-yellow-600 dark:text-yellow-400";
  return "text-muted-foreground";
}

function getPriorityBadge(priority: string | null) {
  if (!priority) return null;
  switch (priority.toLowerCase()) {
    case "urgent":
      return <Badge className="bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20 text-xs">{priority}</Badge>;
    case "high":
      return <Badge className="bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20 text-xs">{priority}</Badge>;
    default:
      return <Badge variant="secondary" className="text-xs">{priority}</Badge>;
  }
}

export default function CapturePipeline() {
  const { toast } = useToast();
  const [dragItemId, setDragItemId] = useState<string | null>(null);

  const { data: items, isLoading, error } = useQuery<PipelineItem[]>({
    queryKey: ["/api/capture/pipeline"],
  });

  const updateStageMutation = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: string }) => {
      const res = await apiRequest("PATCH", `/api/capture/pipeline/${id}`, { stage });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/capture/pipeline"] });
      toast({ title: "Stage Updated", description: "Pipeline item moved to new stage." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update stage.", variant: "destructive" });
    },
  });

  const scoreAllMutation = useMutation({
    mutationFn: async () => {
      const unscored = (items || []).filter((i) => i.aiScore === null && i.entityId);
      const results = [];
      for (const item of unscored.slice(0, 10)) {
        try {
          const res = await apiRequest("POST", `/api/capture/ai/score/${item.entityId}`);
          results.push(await res.json());
        } catch {
          // continue scoring others
        }
      }
      return results;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/capture/pipeline"] });
      toast({ title: "Scoring Complete", description: `Scored ${data.length} items.` });
    },
    onError: () => {
      toast({ title: "Scoring Failed", description: "Could not score items.", variant: "destructive" });
    },
  });

  const getStageItems = (stage: string) => (items || []).filter((i) => i.stage === stage);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDragItemId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, targetStage: string) => {
    e.preventDefault();
    const droppedId = e.dataTransfer.getData("text/plain") || dragItemId;
    if (!droppedId) return;
    const item = (items || []).find((i) => itemKey(i) === droppedId);
    if (item && item.id && item.stage !== targetStage) {
      updateStageMutation.mutate({ id: item.id, stage: targetStage });
    } else if (item && !item.id) {
      toast({ title: "Cannot move", description: "This item needs to be synced first. Try refreshing." });
    }
    setDragItemId(null);
  };

  const unscoredCount = (items || []).filter((i) => i.aiScore === null).length;

  if (isLoading) {
    return (
      <div className="flex-1 overflow-auto p-4 md:p-6 space-y-6" data-testid="page-capture-pipeline">
        <div className="flex items-center gap-3 mb-6">
          <Kanban className="h-6 w-6 text-muted-foreground" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STAGES.map((s) => (
            <div key={s.key} className="min-w-[280px] w-[280px] shrink-0 space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6 space-y-4" data-testid="page-capture-pipeline">
      {error && (
        <div className="flex items-center gap-2 py-2 px-3 bg-red-500/10 border border-red-500/20 rounded-md text-sm" data-testid="pipeline-error-banner">
          <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
          <span className="text-red-600 dark:text-red-400">Pipeline failed to load: {error instanceof Error ? error.message : "Unknown error"}</span>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Kanban className="h-6 w-6 text-muted-foreground" />
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">
            Capture Pipeline
          </h1>
          <div className="flex items-center gap-1.5 flex-wrap">
            {STAGES.map((s) => {
              const count = getStageItems(s.key).length;
              if (count === 0) return null;
              return (
                <Badge key={s.key} variant="secondary" className="text-xs" data-testid={`badge-stage-count-${s.key}`}>
                  {s.label}: {count}
                </Badge>
              );
            })}
            <Badge variant="outline" className="text-xs" data-testid="badge-total-count">
              Total: {(items || []).length}
            </Badge>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={() => scoreAllMutation.mutate()}
          disabled={scoreAllMutation.isPending || unscoredCount === 0}
          data-testid="button-score-all"
        >
          {scoreAllMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Brain className="h-4 w-4 mr-2" />
          )}
          {scoreAllMutation.isPending ? "Scoring..." : `Score All (${unscoredCount})`}
        </Button>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4" data-testid="kanban-board">
        {STAGES.map((stage) => {
          const stageItems = getStageItems(stage.key);
          return (
            <div
              key={stage.key}
              className="min-w-[280px] w-[280px] shrink-0 flex flex-col"
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, stage.key)}
              data-testid={`column-${stage.key}`}
            >
              <div className="flex items-center justify-between gap-2 mb-3 px-1">
                <h3 className="text-sm font-semibold" data-testid={`text-column-title-${stage.key}`}>
                  {stage.label}
                </h3>
                <Badge variant="outline" className="text-xs" data-testid={`text-column-count-${stage.key}`}>
                  {stageItems.length}
                </Badge>
              </div>

              <div className="flex-1 space-y-2 min-h-[200px] bg-muted/30 rounded-md p-2">
                {stageItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-center">
                    <Inbox className="h-6 w-6 text-muted-foreground/50 mb-1" />
                    <p className="text-xs text-muted-foreground" data-testid={`text-empty-column-${stage.key}`}>
                      No items
                    </p>
                  </div>
                ) : (
                  stageItems.map((item) => {
                    const key = itemKey(item);
                    const opp = item.opportunity;
                    const daysLeft = getDaysUntil(opp?.dueAt || null);

                    return (
                      <Link
                        key={key}
                        href={`/capture/opportunity/${item.entityId}`}
                        data-testid={`card-pipeline-${key}`}
                      >
                        <Card
                          draggable={!!item.id}
                          onDragStart={(e) => item.id && handleDragStart(e, key)}
                          className="cursor-grab active:cursor-grabbing hover-elevate active-elevate-2 overflow-visible"
                        >
                          <CardContent className="p-3 space-y-2">
                            <div className="flex items-start gap-1.5">
                              <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0 mt-0.5" />
                              <p className="text-sm font-medium leading-snug line-clamp-2" data-testid={`text-pipeline-title-${key}`}>
                                {opp?.title || "Untitled Opportunity"}
                              </p>
                            </div>

                            <div className="flex items-center gap-1.5 flex-wrap pl-5">
                              {opp?.contractValue && (
                                <Badge variant="outline" className="text-xs gap-1" data-testid={`badge-pipeline-value-${key}`}>
                                  <DollarSign className="h-3 w-3" />
                                  {formatCurrency(opp.contractValue)}
                                </Badge>
                              )}

                              {opp?.setAside && (
                                <Badge variant="secondary" className="text-xs" data-testid={`badge-pipeline-setaside-${key}`}>
                                  {opp.setAside}
                                </Badge>
                              )}

                              {item.aiScore !== null && (
                                <Badge className={`text-xs ${getScoreColor(item.aiScore)}`} data-testid={`badge-pipeline-score-${key}`}>
                                  {item.aiScore}
                                </Badge>
                              )}

                              {getPriorityBadge(item.priority)}
                            </div>

                            {daysLeft !== null && (
                              <div className={`flex items-center gap-1 text-xs pl-5 ${getDueColor(daysLeft)}`} data-testid={`text-pipeline-due-${key}`}>
                                <CalendarDays className="h-3 w-3" />
                                {daysLeft <= 0 ? "Overdue" : `${daysLeft}d left`}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </Link>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
