import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Activity, Zap, Check, X, RefreshCw, Loader2, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";

interface AutomationTabProps {
  entityType?: string;
  entityId?: string;
  showGlobal?: boolean;
}

export function AutomationTab({ entityType, entityId, showGlobal = false }: AutomationTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const eventsQuery = useQuery<any[]>({
    queryKey: ["/api/events/all-with-outbox"],
    enabled: showGlobal,
  });

  const entityEventsQuery = useQuery<any[]>({
    queryKey: ["/api/events", entityType, entityId],
    queryFn: async () => {
      const res = await fetch(`/api/events?entityType=${entityType}&entityId=${entityId}`);
      if (!res.ok) throw new Error("Failed to fetch entity events");
      return res.json();
    },
    enabled: !!(entityType && entityId) && !showGlobal,
  });

  const autofillQuery = useQuery<any[]>({
    queryKey: ["/api/autofill/history", entityType, entityId],
    queryFn: async () => {
      const res = await fetch(`/api/autofill/history?entityType=${entityType}&entityId=${entityId}`);
      if (!res.ok) throw new Error("Failed to fetch autofill history");
      return res.json();
    },
    enabled: !!(entityType && entityId),
  });

  const rulesQuery = useQuery<any[]>({
    queryKey: ["/api/autofill/rules"],
  });

  const retryMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/events/retry-failed");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events/all-with-outbox"] });
      toast({ title: "Retried", description: `${data.retriedCount} failed entries retried.` });
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async (runId: string) => {
      const res = await apiRequest("POST", `/api/autofill/confirm/${runId}`, { confirmedBy: "user" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/autofill/history"] });
      toast({ title: "Confirmed", description: "Autofill run confirmed." });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (runId: string) => {
      const res = await apiRequest("POST", `/api/autofill/reject/${runId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/autofill/history"] });
      toast({ title: "Rejected", description: "Autofill run rejected." });
    },
  });

  const events = showGlobal ? eventsQuery.data : entityEventsQuery.data;
  const isLoading = showGlobal ? eventsQuery.isLoading : entityEventsQuery.isLoading;

  const getOutboxBadge = (status: string) => {
    switch (status) {
      case "completed": return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Completed</Badge>;
      case "failed": return <Badge variant="destructive">Failed</Badge>;
      case "pending": return <Badge variant="secondary">Pending</Badge>;
      case "skipped": return <Badge variant="outline">Skipped</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-4" data-testid="automation-tab">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Activity className="h-5 w-5" /> Automation History
        </h3>
        <Button
          size="sm"
          variant="outline"
          onClick={() => retryMutation.mutate()}
          disabled={retryMutation.isPending}
          data-testid="button-retry-failed"
        >
          {retryMutation.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
          Retry Failed
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="h-4 w-4" /> Events & Workflows
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : events && events.length > 0 ? (
            <div className="space-y-3">
              {events.slice(0, 20).map((evt: any) => (
                <div key={evt.id} className="border rounded-md p-3 space-y-2" data-testid={`event-${evt.id}`}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{evt.eventType}</Badge>
                      <span className="text-xs text-muted-foreground">{evt.entityType}:{evt.entityId?.slice(0, 8)}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(evt.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Triggered by: {evt.triggeredBy || "system"}
                  </div>
                  {evt.outboxEntries && evt.outboxEntries.length > 0 && (
                    <div className="space-y-1 pl-4 border-l-2">
                      {evt.outboxEntries.map((entry: any) => (
                        <div key={entry.id} className="flex items-center justify-between gap-2 flex-wrap text-xs">
                          <span>{entry.handlerName}</span>
                          <div className="flex items-center gap-2">
                            {getOutboxBadge(entry.status)}
                            {entry.lastError && (
                              <span className="text-destructive max-w-[200px] truncate">{entry.lastError}</span>
                            )}
                            <span className="text-muted-foreground">Attempts: {entry.attempts}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">No events recorded yet</p>
          )}
        </CardContent>
      </Card>

      {rulesQuery.data && rulesQuery.data.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="h-4 w-4" /> Active Autofill Rules
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {rulesQuery.data.map((rule: any) => (
                <div key={rule.id} className="flex items-center justify-between gap-2 flex-wrap border rounded-md p-2" data-testid={`rule-${rule.id}`}>
                  <div>
                    <span className="text-sm font-medium">{rule.name}</span>
                    <div className="text-xs text-muted-foreground">{rule.sourceEntityType} → {rule.targetEntityType}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={rule.ruleType === "deterministic" ? "default" : rule.ruleType === "rule_based" ? "secondary" : "outline"}>
                      {rule.ruleType}
                    </Badge>
                    {rule.requiresConfirmation && <Badge variant="outline">Confirm Required</Badge>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {autofillQuery.data && autofillQuery.data.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> Autofill Runs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {autofillQuery.data.map((run: any) => (
                <div key={run.id} className="border rounded-md p-3 space-y-2" data-testid={`autofill-run-${run.id}`}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <Badge variant={run.status === "applied" ? "default" : run.status === "confirmed" ? "default" : run.status === "rejected" ? "destructive" : "secondary"}>
                      {run.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{new Date(run.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="text-xs">
                    <span className="text-muted-foreground">Source:</span> {run.sourceEntityType}:{run.sourceEntityId?.slice(0, 8)}
                  </div>
                  {run.fieldsApplied && (
                    <div className="text-xs font-mono bg-muted p-2 rounded">
                      {JSON.stringify(run.fieldsApplied, null, 2)}
                    </div>
                  )}
                  {run.status === "pending_confirmation" && (
                    <div className="flex items-center gap-2">
                      <Button size="sm" onClick={() => confirmMutation.mutate(run.id)} disabled={confirmMutation.isPending} data-testid={`button-confirm-${run.id}`}>
                        <Check className="h-3 w-3 mr-1" /> Confirm
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => rejectMutation.mutate(run.id)} disabled={rejectMutation.isPending} data-testid={`button-reject-${run.id}`}>
                        <X className="h-3 w-3 mr-1" /> Reject
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
