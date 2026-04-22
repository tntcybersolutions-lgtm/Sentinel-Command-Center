import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AlertTriangle, CheckCircle2, Clock, Eye, Loader2, Workflow } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { DecisionPacket } from "@shared/schema";

const riskColors: Record<string, string> = {
  low: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  medium: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  high: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  critical: "bg-red-500/10 text-red-600 dark:text-red-400",
};

export function ApprovalList() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: packets, isLoading } = useQuery<DecisionPacket[]>({
    queryKey: ["/api/work-packages", "pending", "dashboard"],
    queryFn: async () => {
      const res = await fetch("/api/work-packages?status=pending&limit=5", { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/work-packages/${id}/approve`, { notes: "Approved from dashboard" });
    },
    onSuccess: () => {
      toast({ title: "Approved", description: "Work package approved." });
      queryClient.invalidateQueries({ queryKey: ["/api/work-packages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to approve.", variant: "destructive" });
    },
  });

  const displayPackets = packets || [];
  const visiblePackets = displayPackets.slice(0, 3);
  const remainingCount = Math.max(0, displayPackets.length - 3);

  return (
    <Card data-testid="card-approval-list">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Workflow className="h-4 w-4 text-primary" />
            Work Packages
          </CardTitle>
          {displayPackets.length > 0 && (
            <Badge variant="secondary" className="text-xs">{displayPackets.length}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : visiblePackets.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">All clear — no pending work packages</p>
          </div>
        ) : (
          <div className="space-y-3">
            {visiblePackets.map((packet) => {
              const tasks = packet.tasks || [];
              const doneTasks = tasks.filter(t => t.status === "done").length;
              const totalTasks = tasks.length;
              const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

              const projectName = packet.project?.name || packet.summary?.headline || packet.category;
              const dueDateStr = packet.project?.dueDate
                ? new Date(packet.project.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                : null;
              const requestedAt = packet.audit?.requestedAt
                ? new Date(packet.audit.requestedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
                : null;

              const reviewUrl = packet.routing?.reviewUrl || "/dashboard";

              return (
                <div
                  key={packet.id}
                  className="rounded-md border p-3 space-y-2 cursor-pointer hover-elevate transition-colors"
                  data-testid={`work-package-item-${packet.id}`}
                  onClick={() => navigate(reviewUrl)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter") navigate(reviewUrl); }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold leading-tight truncate" data-testid={`wp-name-${packet.id}`}>
                        {projectName}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{packet.summary?.headline || packet.category}</p>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <Badge variant="outline" className="text-xs">{packet.category}</Badge>
                        <Badge className={`text-xs ${riskColors[packet.summary?.risk?.level || "low"] || riskColors.low}`}>
                          {packet.summary?.risk?.level || "low"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{doneTasks}/{totalTasks} tasks</span>
                      </div>
                      {(dueDateStr || requestedAt) && (
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                          {dueDateStr && (
                            <span className="flex items-center gap-1" data-testid={`wp-due-${packet.id}`}>
                              <Clock className="h-3 w-3" />
                              Due {dueDateStr}
                            </span>
                          )}
                          {requestedAt && (
                            <span data-testid={`wp-requested-${packet.id}`}>
                              Requested {requestedAt}
                            </span>
                          )}
                        </div>
                      )}
                      <div className="mt-1.5">
                        <div className="h-1 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <Button
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); approveMutation.mutate(packet.id); }}
                        disabled={approveMutation.isPending}
                        data-testid={`button-approve-${packet.id}`}
                      >
                        {approveMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => { e.stopPropagation(); navigate(reviewUrl); }}
                        data-testid={`button-review-${packet.id}`}
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        Review
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}

            {remainingCount > 0 && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => navigate("/ai-review-queue")}
                data-testid="button-view-all-packages"
              >
                View All ({displayPackets.length})
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
