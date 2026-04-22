import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import {
  FolderKanban,
  FolderOpen,
  Plus,
  Clock,
  DollarSign,
  User,
  FileText,
  CheckSquare,
  Send,
  Trophy,
  ChevronRight,
  AlertCircle,
  Calendar,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { RowActionMenu } from "@/features/row-actions/RowActionMenu";
import { BidDetailModal } from "@/components/bid-detail-modal";

interface BidDocumentation {
  executiveSummary?: string;
  technicalApproach?: string;
  pastPerformance?: string;
  keyPersonnel?: string;
  complianceNotes?: string;
  riskAssessment?: string;
  competitiveAnalysis?: string;
  pricingStrategy?: string;
}

interface BidProject {
  id: string;
  opportunityTitle: string;
  agency: string;
  status: "initiated" | "drafting" | "review" | "final_review" | "ready" | "submitted" | "won" | "lost";
  owner: { name: string; initials: string } | null;
  value: number;
  dueAt: string;
  progress: number;
  tasksCompleted: number;
  tasksTotal: number;
  artifactsReady: number;
  artifactsTotal: number;
  documentation?: BidDocumentation | null;
  createdAt?: string;
}

const pipelineStages = [
  { key: "initiated", label: "Initiated", icon: FolderKanban },
  { key: "drafting", label: "Drafting", icon: FileText },
  { key: "review", label: "Review", icon: CheckSquare },
  { key: "final_review", label: "Final Review", icon: AlertCircle },
  { key: "ready", label: "Ready", icon: Send },
  { key: "submitted", label: "Submitted", icon: Trophy },
];

export default function Bids() {
  const [selectedBid, setSelectedBid] = useState<BidProject | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [newBidModalOpen, setNewBidModalOpen] = useState(false);
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const handleNewBid = () => {
    // Navigate to opportunities page to start a new bid from an opportunity
    navigate("/opportunities");
    toast({ 
      title: "Start New Bid", 
      description: "Select an opportunity to start a bid project" 
    });
  };

  const { data: bidProjects, isLoading } = useQuery<BidProject[]>({
    queryKey: ["/api/bid-projects"],
  });

  // Real data from API - no mocks
  const displayProjects = bidProjects || [];

  const handleBidClick = (bid: BidProject) => {
    // Navigate directly to bid jacket page
    navigate(`/bid-jacket/${bid.id}`);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "initiated":
        return <Badge variant="outline">Initiated</Badge>;
      case "drafting":
        return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">Drafting</Badge>;
      case "review":
        return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">Review</Badge>;
      case "final_review":
        return <Badge className="bg-orange-500/10 text-orange-500 border-orange-500/20">Final Review</Badge>;
      case "ready":
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Ready</Badge>;
      case "submitted":
        return <Badge className="bg-primary/10 text-primary border-primary/20">Submitted</Badge>;
      case "won":
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Won</Badge>;
      case "lost":
        return <Badge variant="secondary">Lost</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getDaysRemaining = (dueAt: string) => {
    const days = Math.ceil((new Date(dueAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (days < 0) return <span className="text-muted-foreground">Past due</span>;
    if (days <= 3) return <span className="text-red-500 font-medium">{days}d left</span>;
    if (days <= 7) return <span className="text-yellow-500">{days}d left</span>;
    return <span className="text-muted-foreground">{days}d left</span>;
  };

  const getProjectsByStage = (stage: string) => {
    return displayProjects.filter((p) => p.status === stage);
  };

  const activeBids = displayProjects.filter((p) => !["submitted", "won", "lost"].includes(p.status));
  const submittedBids = displayProjects.filter((p) => p.status === "submitted");

  return (
    <div className="page-list flex-1 space-y-4 md:space-y-6 p-4 md:p-6 overflow-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-heading tracking-tight">Bid Pipeline</h1>
          <p className="text-muted-foreground">Manage active bids and track submission progress</p>
        </div>
        <Button onClick={handleNewBid} data-testid="button-new-bid">
          <Plus className="mr-2 h-4 w-4" />
          New Bid Project
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card data-testid="stat-card-active-bids">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Bids</CardTitle>
            <div className="h-10 w-10 rounded-md bg-blue-500/10 flex items-center justify-center">
              <FolderKanban className="h-5 w-5 text-blue-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-active-bids">{activeBids.length}</div>
            <p className="text-xs text-muted-foreground">In progress</p>
          </CardContent>
        </Card>
        <Card data-testid="stat-card-awaiting">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Awaiting Results</CardTitle>
            <div className="h-10 w-10 rounded-md bg-amber-500/10 flex items-center justify-center">
              <Trophy className="h-5 w-5 text-amber-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-submitted-bids">{submittedBids.length}</div>
            <p className="text-xs text-muted-foreground">Submitted</p>
          </CardContent>
        </Card>
        <Card data-testid="stat-card-bid-value">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pipeline Value</CardTitle>
            <div className="h-10 w-10 rounded-md bg-emerald-500/10 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-emerald-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-pipeline-value">
              ${(activeBids.reduce((sum, p) => sum + p.value, 0) / 1000000).toFixed(1)}M
            </div>
            <p className="text-xs text-muted-foreground">Active value</p>
          </CardContent>
        </Card>
        <Card data-testid="stat-card-due-week">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Due This Week</CardTitle>
            <div className="h-10 w-10 rounded-md bg-red-500/10 flex items-center justify-center">
              <Clock className="h-5 w-5 text-red-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-due-this-week">
              {activeBids.filter((p) => {
                const days = Math.ceil((new Date(p.dueAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                return days <= 7 && days >= 0;
              }).length}
            </div>
            <p className="text-xs text-muted-foreground">Urgent submissions</p>
          </CardContent>
        </Card>
      </div>

      <div className="hidden xl:block overflow-x-auto">
        <div className="flex gap-4 min-w-max pb-4">
          {pipelineStages.slice(0, -1).map((stage) => {
            const stageProjects = getProjectsByStage(stage.key);
            return (
              <div key={stage.key} className="w-80 flex-shrink-0">
                <div className="flex items-center justify-between mb-3 px-1">
                  <div className="flex items-center gap-2">
                    <stage.icon className="h-4 w-4 text-muted-foreground" />
                    <h3 className="font-medium text-sm">{stage.label}</h3>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {stageProjects.length}
                  </Badge>
                </div>
                <div className="space-y-3">
                  {stageProjects.map((project) => (
                    <Card
                      key={project.id}
                      className="hover-elevate cursor-pointer"
                      data-testid={`bid-card-${project.id}`}
                      onClick={() => handleBidClick(project)}
                    >
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-1">
                          <div className="space-y-1 flex-1 min-w-0">
                            <h4 className="font-medium text-sm line-clamp-2">{project.opportunityTitle}</h4>
                            <p className="text-xs text-muted-foreground">{project.agency}</p>
                          </div>
                          <div onClick={(e) => e.stopPropagation()}>
                            <RowActionMenu entityType="bidProject" entity={project} listQueryKey={["/api/bid-projects"]} />
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground flex items-center gap-1">
                            <DollarSign className="h-3 w-3" />
                            ${(project.value / 1000000).toFixed(1)}M
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {getDaysRemaining(project.dueAt)}
                          </span>
                        </div>
                        <Progress value={project.progress} className="h-1" />
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              <AvatarFallback className="text-xs">{project.owner?.initials || "BH"}</AvatarFallback>
                            </Avatar>
                            <span className="text-xs text-muted-foreground">
                              {project.tasksCompleted}/{project.tasksTotal} tasks
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {project.artifactsReady}/{project.artifactsTotal} docs
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {stageProjects.length === 0 && (
                    <div className="rounded-lg border border-dashed p-6 text-center">
                      <p className="text-sm text-muted-foreground">No bids in this stage</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="xl:hidden space-y-4">
        <h2 className="text-lg font-semibold">Active Bid Projects</h2>
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {displayProjects.map((project) => (
              <Card key={project.id} className="hover-elevate cursor-pointer" data-testid={`bid-card-mobile-${project.id}`} onClick={() => handleBidClick(project)}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-medium">{project.opportunityTitle}</h3>
                          <p className="text-sm text-muted-foreground">{project.agency}</p>
                        </div>
                        {getStatusBadge(project.status)}
                      </div>

                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <DollarSign className="h-4 w-4" />
                          ${(project.value / 1000000).toFixed(1)}M
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          {getDaysRemaining(project.dueAt)}
                        </span>
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <User className="h-4 w-4" />
                          {project.owner?.name || "Unassigned"}
                        </span>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Progress</span>
                          <span className="font-medium">{project.progress}%</span>
                        </div>
                        <Progress value={project.progress} className="h-2" />
                      </div>

                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <CheckSquare className="h-4 w-4" />
                          {project.tasksCompleted}/{project.tasksTotal} tasks
                        </span>
                        <span className="flex items-center gap-1">
                          <FileText className="h-4 w-4" />
                          {project.artifactsReady}/{project.artifactsTotal} documents
                        </span>
                      </div>

                      <Button 
                        variant="default" 
                        size="sm"
                        className="mt-2 w-full"
                        onClick={(e) => { e.stopPropagation(); navigate(`/bid-jacket/${project.id}`); }}
                        data-testid={`button-open-jacket-${project.id}`}
                      >
                        <FolderOpen className="h-4 w-4 mr-2" />
                        Open Bid Jacket
                      </Button>
                    </div>

                    <div onClick={(e) => e.stopPropagation()}>
                      <RowActionMenu entityType="bidProject" entity={project} listQueryKey={["/api/bid-projects"]} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <BidDetailModal
        open={detailModalOpen}
        onOpenChange={setDetailModalOpen}
        bid={selectedBid}
      />
    </div>
  );
}
