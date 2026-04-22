import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

export function PipelineCard() {
  const [, navigate] = useLocation();

  const { data: bidProjects, isLoading } = useQuery<{ status: string }[]>({
    queryKey: ["/api/bid-projects"],
  });

  const pipelineCounts = {
    drafting: bidProjects?.filter((b) => b.status === "drafting").length || 0,
    review: bidProjects?.filter((b) => b.status === "review" || b.status === "pending_approval").length || 0,
    ready: bidProjects?.filter((b) => b.status === "ready_to_submit").length || 0,
  };

  const total = pipelineCounts.drafting + pipelineCounts.review + pipelineCounts.ready;

  return (
    <Card
      className="cursor-pointer hover-elevate"
      onClick={() => navigate("/bids")}
      data-testid="card-bid-pipeline"
    >
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Bid Pipeline</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : total === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No active bids in the pipeline yet.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2" data-testid="pipeline-drafting">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span>Drafting</span>
                <span className="font-medium">{pipelineCounts.drafting}</span>
              </div>
              <Progress value={total > 0 ? (pipelineCounts.drafting / total) * 100 : 0} className="h-2" />
            </div>
            <div className="space-y-2" data-testid="pipeline-review">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span>In Review</span>
                <span className="font-medium">{pipelineCounts.review}</span>
              </div>
              <Progress value={total > 0 ? (pipelineCounts.review / total) * 100 : 0} className="h-2" />
            </div>
            <div className="space-y-2" data-testid="pipeline-ready">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span>Ready to Submit</span>
                <span className="font-medium">{pipelineCounts.ready}</span>
              </div>
              <Progress value={total > 0 ? (pipelineCounts.ready / total) * 100 : 0} className="h-2" />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
