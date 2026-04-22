import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Zap,
  RotateCcw,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Settings2,
  History,
  Loader2,
  Trash2,
} from "lucide-react";
import { useState } from "react";

interface AutomationRule {
  id: string;
  name: string;
  description: string;
  triggerType: string;
  actionType: string;
  enabled: boolean;
  runCount: number;
  lastRunAt: string | null;
}

interface AutomationRun {
  id: string;
  ruleId: string;
  ruleName: string | null;
  triggerEntityType: string;
  triggerEntityId: string;
  status: string;
  resultJson: Record<string, unknown> | null;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
}

function formatTimeAgo(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function triggerLabel(type: string): string {
  switch (type) {
    case "on_sync": return "On Sync";
    case "on_stage_change": return "Stage Change";
    case "on_stale_pursuit": return "Stale Pursuit";
    default: return type;
  }
}

function actionLabel(type: string): string {
  switch (type) {
    case "auto_score": return "Auto-Score";
    case "auto_capture_plan": return "Capture Plan";
    case "auto_nba_tasks": return "NBA Tasks";
    default: return type;
  }
}

function statusIcon(status: string) {
  switch (status) {
    case "completed": return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case "failed": return <XCircle className="h-4 w-4 text-red-500" />;
    case "running": return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
    default: return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
}

export default function CaptureAutomation() {
  const { toast } = useToast();
  const [tab, setTab] = useState("rules");

  const { data: rules, isLoading: rulesLoading } = useQuery<AutomationRule[]>({
    queryKey: ["/api/automation/rules"],
  });

  const { data: runs, isLoading: runsLoading } = useQuery<AutomationRun[]>({
    queryKey: ["/api/automation/runs"],
    enabled: tab === "history",
  });

  const toggleMutation = useMutation({
    mutationFn: async (ruleId: string) => {
      const res = await apiRequest("PATCH", `/api/automation/rules/${ruleId}/toggle`);
      return res.json();
    },
    onSuccess: (data: AutomationRule) => {
      queryClient.invalidateQueries({ queryKey: ["/api/automation/rules"] });
      toast({
        title: data.enabled ? "Rule Enabled" : "Rule Disabled",
        description: `${data.name} is now ${data.enabled ? "active" : "paused"}.`,
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to toggle rule.", variant: "destructive" });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/reset-demo-data");
      return res.json();
    },
    onSuccess: (data: { message: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/automation/rules"] });
      queryClient.invalidateQueries({ queryKey: ["/api/automation/runs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/capture/pipeline"] });
      queryClient.invalidateQueries({ queryKey: ["/api/capture/change-events"] });
      toast({ title: "Reset Complete", description: data.message });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to reset demo data.", variant: "destructive" });
    },
  });

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="heading-automation">
            <Zap className="h-6 w-6" />
            Capture Automation
          </h1>
          <p className="text-sm text-muted-foreground mt-1" data-testid="text-automation-subtitle">
            Manage automated rules for scoring, capture plans, and stale pursuit nudges.
          </p>
        </div>
        <Button
          variant="destructive"
          onClick={() => resetMutation.mutate()}
          disabled={resetMutation.isPending}
          data-testid="button-reset-demo"
        >
          {resetMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
          {resetMutation.isPending ? "Resetting..." : "Reset Demo Data"}
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab} data-testid="tabs-automation">
        <TabsList data-testid="tablist-automation">
          <TabsTrigger value="rules" data-testid="tab-rules">
            <Settings2 className="h-4 w-4 mr-1.5" />
            Rules
          </TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">
            <History className="h-4 w-4 mr-1.5" />
            Run History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="mt-4 space-y-4">
          {rulesLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-full" />)}
            </div>
          ) : rules && rules.length > 0 ? (
            <div className="space-y-3">
              {rules.map((rule) => (
                <Card key={rule.id} data-testid={`card-rule-${rule.id}`}>
                  <CardContent className="flex items-start justify-between gap-4 py-5">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold" data-testid={`text-rule-name-${rule.id}`}>
                          {rule.name}
                        </h3>
                        <Badge variant={rule.enabled ? "default" : "secondary"} data-testid={`badge-rule-status-${rule.id}`}>
                          {rule.enabled ? "Active" : "Paused"}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground" data-testid={`text-rule-desc-${rule.id}`}>
                        {rule.description}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Zap className="h-3 w-3" />
                          Trigger: {triggerLabel(rule.triggerType)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Settings2 className="h-3 w-3" />
                          Action: {actionLabel(rule.actionType)}
                        </span>
                        <span className="flex items-center gap-1">
                          <RotateCcw className="h-3 w-3" />
                          Runs: {rule.runCount}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Last: {formatTimeAgo(rule.lastRunAt)}
                        </span>
                      </div>
                    </div>
                    <Switch
                      checked={rule.enabled}
                      onCheckedChange={() => toggleMutation.mutate(rule.id)}
                      data-testid={`switch-rule-${rule.id}`}
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Settings2 className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">No automation rules configured.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4 space-y-4">
          {runsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : runs && runs.length > 0 ? (
            <Card>
              <CardContent className="py-0">
                <div className="divide-y">
                  {runs.map((run) => (
                    <div key={run.id} className="flex items-center gap-3 py-3" data-testid={`row-run-${run.id}`}>
                      {statusIcon(run.status)}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" data-testid={`text-run-rule-${run.id}`}>
                          {run.ruleName || "Unknown Rule"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {run.triggerEntityType}: {run.triggerEntityId.substring(0, 8)}...
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <Badge
                          variant={run.status === "completed" ? "default" : run.status === "failed" ? "destructive" : "secondary"}
                          data-testid={`badge-run-status-${run.id}`}
                        >
                          {run.status}
                        </Badge>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatTimeAgo(run.startedAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <History className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">No automation runs yet.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
