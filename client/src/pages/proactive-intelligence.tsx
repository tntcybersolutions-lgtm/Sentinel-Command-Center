import { useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Brain,
  Zap,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  ArrowRight,
  Loader2,
  Link2,
} from "lucide-react";

type Priority = "critical" | "high" | "medium" | "low";
type ActionType =
  | "run_ingestion"
  | "retry_artifact"
  | "seed_checklist"
  | "create_bid_project"
  | "compliance_review"
  | "follow_up";

interface ProactiveTask {
  id: string;
  tenantId: string;
  title: string;
  description: string | null;
  priority: Priority;
  status: string;
  source: "ai" | "system";
  sourceEntityType: string | null;
  sourceEntityId: string | null;
  actionType: ActionType | null;
  actionPayload: Record<string, unknown> | null;
  dueAt: string | null;
  createdAt: string;
}

const PRIORITY_ORDER: Priority[] = ["critical", "high", "medium", "low"];

const PRIORITY_META: Record<
  Priority,
  { label: string; chip: string; section: string; icon: typeof AlertTriangle; iconColor: string }
> = {
  critical: {
    label: "CRITICAL",
    chip: "bg-red-100 text-red-800 border-red-200",
    section: "border-red-200",
    icon: AlertTriangle,
    iconColor: "text-red-500",
  },
  high: {
    label: "HIGH",
    chip: "bg-orange-100 text-orange-800 border-orange-200",
    section: "border-orange-200",
    icon: Zap,
    iconColor: "text-orange-500",
  },
  medium: {
    label: "MEDIUM",
    chip: "bg-yellow-100 text-yellow-800 border-yellow-200",
    section: "border-yellow-200",
    icon: Clock,
    iconColor: "text-yellow-500",
  },
  low: {
    label: "LOW",
    chip: "bg-blue-100 text-blue-800 border-blue-200",
    section: "border-blue-200",
    icon: CheckCircle2,
    iconColor: "text-blue-500",
  },
};

const ACTION_LABEL: Record<ActionType, string> = {
  run_ingestion: "Run Ingestion",
  retry_artifact: "Retry Artifact",
  seed_checklist: "Seed Checklist",
  create_bid_project: "Create Bid Project",
  compliance_review: "Compliance Review",
  follow_up: "Follow Up",
};

function formatDueAt(due: string | null): string | null {
  if (!due) return null;
  const d = new Date(due);
  const now = new Date();
  const days = Math.ceil((d.getTime() - now.getTime()) / 86400000);
  const dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  if (days < 0) return `Overdue ${Math.abs(days)}d · ${dateStr}`;
  if (days === 0) return `Due today · ${dateStr}`;
  if (days === 1) return `Due tomorrow · ${dateStr}`;
  return `Due in ${days}d · ${dateStr}`;
}

function SourceBadge({ task }: { task: ProactiveTask }) {
  if (!task.sourceEntityType) return null;
  const label = task.sourceEntityType.replace(/_/g, " ");
  const tail = task.sourceEntityId ? ` · ${task.sourceEntityId.slice(0, 8)}` : "";
  return (
    <Badge variant="outline" className="text-xs text-gray-600 gap-1" data-testid={`badge-source-${task.id}`}>
      <Link2 className="h-3 w-3" />
      <span className="capitalize">{label}</span>
      {tail && <span className="font-mono text-[10px] text-gray-400">{tail}</span>}
    </Badge>
  );
}

export default function ProactiveIntelligenceCenter() {
  const { toast } = useToast();
  const { data: tasks = [], isLoading, isError } = useQuery<ProactiveTask[]>({
    queryKey: ["/api/proactive-intelligence/tasks"],
  });

  const runAnalysis = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/proactive-intelligence/run", {});
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Analysis complete",
        description: `${data?.created ?? 0} new task(s), ${data?.updated ?? 0} updated.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/proactive-intelligence/tasks"] });
    },
    onError: (err: any) => {
      toast({
        title: "Analysis failed",
        description: err?.message ?? "Could not run analysis.",
        variant: "destructive",
      });
    },
  });

  const executeTask = useMutation({
    mutationFn: async (taskId: string) => {
      const res = await apiRequest(
        "POST",
        `/api/proactive-intelligence/tasks/${taskId}/execute`,
        {},
      );
      return { taskId, payload: await res.json() };
    },
    onSuccess: ({ payload }) => {
      toast({
        title: "Action executed",
        description: payload?.note ?? (payload?.executed ? "Task completed." : "Action attempted."),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/proactive-intelligence/tasks"] });
    },
    onError: (err: any) => {
      toast({
        title: "Action failed",
        description: err?.message ?? "Could not execute task.",
        variant: "destructive",
      });
    },
  });

  const grouped = useMemo(() => {
    const buckets: Record<Priority, ProactiveTask[]> = { critical: [], high: [], medium: [], low: [] };
    for (const t of tasks) {
      const p = (PRIORITY_ORDER.includes(t.priority) ? t.priority : "low") as Priority;
      buckets[p].push(t);
    }
    return buckets;
  }, [tasks]);

  const counts = {
    critical: grouped.critical.length,
    high: grouped.high.length,
    medium: grouped.medium.length,
    low: grouped.low.length,
  };
  const totalShown = counts.critical + counts.high + counts.medium + counts.low;

  return (
    <div className="p-6 space-y-6" data-testid="page-proactive-intelligence">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Brain className="h-7 w-7 text-purple-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900" data-testid="text-page-title">
              Proactive Intelligence Center
            </h1>
            <p className="text-sm text-gray-500">AI-generated action items and system recommendations</p>
          </div>
        </div>
        <Button
          data-testid="button-refresh"
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => runAnalysis.mutate()}
          disabled={runAnalysis.isPending}
        >
          {runAnalysis.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {runAnalysis.isPending ? "Analyzing…" : "Run Analysis"}
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {PRIORITY_ORDER.map((p) => {
          const meta = PRIORITY_META[p];
          const Icon = meta.icon;
          return (
            <Card key={p} className={meta.section} data-testid={`stat-${p}`}>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Icon className={`h-5 w-5 ${meta.iconColor}`} />
                  <div>
                    <div className={`text-2xl font-bold ${meta.iconColor.replace("500", "600")}`}>
                      {counts[p]}
                    </div>
                    <div className="text-xs text-gray-500">{meta.label}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {isLoading && (
        <div className="text-center py-12 text-gray-400" data-testid="state-loading">
          <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin opacity-50" />
          <p>Loading tasks…</p>
        </div>
      )}

      {isError && !isLoading && (
        <div
          className="text-center py-12 text-red-500 border border-red-200 rounded"
          data-testid="state-error"
        >
          <AlertTriangle className="h-8 w-8 mx-auto mb-3" />
          <p>Failed to load proactive intelligence tasks.</p>
        </div>
      )}

      {!isLoading && !isError && totalShown === 0 && (
        <div
          className="text-center py-16 text-gray-500 border border-gray-200 rounded bg-gray-50"
          data-testid="state-empty"
        >
          <Brain className="h-12 w-12 mx-auto mb-3 text-purple-400" />
          <p className="font-medium text-gray-700">
            Herbie is monitoring your projects. No urgent items right now.
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Click "Run Analysis" to scan for new action items.
          </p>
        </div>
      )}

      {!isLoading && !isError && totalShown > 0 && (
        <div className="space-y-8" data-testid="task-groups">
          {PRIORITY_ORDER.map((p) => {
            const items = grouped[p];
            if (items.length === 0) return null;
            const meta = PRIORITY_META[p];
            const Icon = meta.icon;
            return (
              <section key={p} data-testid={`group-${p}`}>
                <div className="flex items-center gap-2 mb-3">
                  <Icon className={`h-4 w-4 ${meta.iconColor}`} />
                  <h2 className="text-sm font-semibold tracking-wider text-gray-700">
                    {meta.label}
                  </h2>
                  <span className="text-xs text-gray-400">({items.length})</span>
                </div>
                <div className="space-y-3">
                  {items.map((task) => (
                    <Card
                      key={task.id}
                      className="hover:shadow-md transition-shadow"
                      data-testid={`card-task-${task.id}`}
                    >
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge className={`text-xs font-semibold border ${meta.chip}`}>
                                {meta.label}
                              </Badge>
                              {task.actionType && (
                                <Badge variant="outline" className="text-xs">
                                  {ACTION_LABEL[task.actionType] ?? task.actionType}
                                </Badge>
                              )}
                              <Badge variant="outline" className="text-xs text-gray-500">
                                {task.source === "ai" ? "🤖 AI" : "⚙️ System"}
                              </Badge>
                              <SourceBadge task={task} />
                            </div>
                            <h3
                              className="font-semibold text-gray-900"
                              data-testid={`text-title-${task.id}`}
                            >
                              {task.title}
                            </h3>
                            {task.description && (
                              <p
                                className="text-sm text-gray-500"
                                data-testid={`text-description-${task.id}`}
                              >
                                {task.description}
                              </p>
                            )}
                            {task.dueAt && (
                              <div
                                className="flex items-center gap-1 text-xs text-gray-400"
                                data-testid={`text-due-${task.id}`}
                              >
                                <Clock className="h-3 w-3" />
                                <span>{formatDueAt(task.dueAt)}</span>
                              </div>
                            )}
                          </div>
                          <Button
                            data-testid={`button-action-${task.id}`}
                            size="sm"
                            variant="outline"
                            className="gap-1 flex-shrink-0"
                            onClick={() => executeTask.mutate(task.id)}
                            disabled={executeTask.isPending && executeTask.variables === task.id}
                          >
                            {executeTask.isPending && executeTask.variables === task.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <ArrowRight className="h-4 w-4" />
                            )}
                            {task.actionType
                              ? ACTION_LABEL[task.actionType] ?? "Take Action"
                              : "Take Action"}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
