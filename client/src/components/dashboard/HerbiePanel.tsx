import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { actionLabel as actionLabelFn } from "@/lib/labels";
import { Zap, RefreshCw, Loader2, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { apiRequest } from "@/lib/queryClient";

interface HerbieStatus {
  status: "active" | "idle" | "processing";
  lastCycle: string;
  stats: {
    newOpportunities: number;
    pendingApprovals: number;
    activeBids: number;
    upcomingDeadlines: number;
    exceptionsCount: number;
  };
}

interface HerbieActivity {
  id: string;
  timestamp: Date;
  action: string;
  entityType: string;
  entityId: string;
  details: Record<string, unknown>;
  outcome: "success" | "pending" | "error";
}

export function HerbiePanel() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: herbieStatus, isLoading, refetch: refetchHerbie } = useQuery<HerbieStatus>({
    queryKey: ["/api/herbie/autonomous/status"],
    refetchInterval: 30000,
  });

  const { data: herbieActivity, refetch: refetchActivity } = useQuery<HerbieActivity[]>({
    queryKey: ["/api/herbie/autonomous/activity-log"],
    refetchInterval: 30000,
  });

  const quickScanMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/herbie/autonomous/run-cycle");
      return response.json();
    },
    onSuccess: (data: { stats?: { evaluated?: number; approvalRequests?: number } }) => {
      toast({
        title: "Quick Scan Complete",
        description: `Evaluated ${data.stats?.evaluated || 0} opportunities, created ${data.stats?.approvalRequests || 0} approval requests.`,
        action: (
          <ToastAction altText="View Approvals" onClick={() => navigate("/approvals")} data-testid="toast-action-view-approvals">
            View
          </ToastAction>
        ),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    },
    onError: () => {
      toast({ title: "Scan Failed", description: "Failed to run quick scan.", variant: "destructive" });
    },
  });

  return (
    <Card data-testid="card-herbie-panel" className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="h-4 w-4 text-primary" />
            HERBIE
            <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600 border-green-500/30">
              Active
            </Badge>
          </CardTitle>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => { refetchHerbie(); refetchActivity(); }}
            data-testid="button-refresh-herbie"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
        <CardDescription>AI-powered opportunity intelligence</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : herbieStatus ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md border p-2 text-center">
                <div className="text-lg font-bold text-primary">{herbieStatus.stats.newOpportunities}</div>
                <div className="text-xs text-muted-foreground">New Today</div>
              </div>
              <div className="rounded-md border p-2 text-center">
                <div className="text-lg font-bold text-yellow-500">{herbieStatus.stats.pendingApprovals}</div>
                <div className="text-xs text-muted-foreground">Pending</div>
              </div>
              <div className="rounded-md border p-2 text-center">
                <div className="text-lg font-bold text-blue-500">{herbieStatus.stats.activeBids}</div>
                <div className="text-xs text-muted-foreground">Active Bids</div>
              </div>
              <div className="rounded-md border p-2 text-center">
                <div className="text-lg font-bold text-orange-500">{herbieStatus.stats.upcomingDeadlines}</div>
                <div className="text-xs text-muted-foreground">Upcoming</div>
              </div>
            </div>

            {herbieActivity && herbieActivity.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Recent Activity</div>
                <div className="space-y-1 max-h-28 overflow-y-auto">
                  {herbieActivity.slice(0, 4).map((activity, idx) => (
                    <div key={activity.id || idx} className="flex items-center gap-2 text-xs p-1.5 rounded bg-muted/30">
                      <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                        activity.outcome === "success" ? "bg-green-500" :
                        activity.outcome === "error" ? "bg-red-500" : "bg-yellow-500"
                      }`} />
                      <span className="truncate flex-1">{actionLabelFn(activity.action)}</span>
                      <span className="text-muted-foreground shrink-0">
                        {new Date(activity.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-center text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
            Connecting to HERBIE...
          </div>
        )}

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => quickScanMutation.mutate()}
            disabled={quickScanMutation.isPending}
            data-testid="button-quick-scan"
          >
            {quickScanMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Zap className="h-3.5 w-3.5 mr-1.5" />
            )}
            Quick Scan
          </Button>
          <Button variant="outline" size="sm" className="flex-1" asChild>
            <Link href="/herbie" data-testid="link-herbie-chat">
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              Chat
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
