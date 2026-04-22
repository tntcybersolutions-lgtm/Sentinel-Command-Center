import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CheckCircle2,
  Circle,
  Loader2,
  Ban,
  MinusCircle,
  ChevronDown,
  ChevronRight,
  Link2,
} from "lucide-react";

interface ChecklistItem {
  id: string;
  tenantId: string;
  bidProjectId: string;
  templateItemId: string;
  templateCode: string | null;
  title: string;
  phase: string;
  status: string;
  priority: string;
  notes: string | null;
  ownerUserId: string | null;
  dueAt: string | null;
  blockedReason: string | null;
  requiredArtifactCodes: string[] | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ChecklistSummary {
  todo: number;
  doing: number;
  blocked: number;
  done: number;
  na: number;
  total: number;
}

const PHASE_ORDER = ["Capture", "PreBid", "SiteVisit", "Takeoff", "Estimating", "Proposal", "Submission", "Award", "Execution", "Closeout"];
const PHASE_LABELS: Record<string, string> = {
  Capture: "A. Capture / Intake",
  PreBid: "B. Pre-Bid Review",
  SiteVisit: "C. Site Visit / Due Diligence",
  Takeoff: "D. Takeoff",
  Estimating: "E. Estimating / Pricing",
  Proposal: "F. Proposal Assembly",
  Submission: "G. Submission / Close",
  Award: "H. Award",
  Execution: "I. Execution",
  Closeout: "J. Closeout",
};

const STATUS_ICONS: Record<string, any> = {
  todo: Circle,
  doing: Loader2,
  blocked: Ban,
  done: CheckCircle2,
  na: MinusCircle,
};

const STATUS_COLORS: Record<string, string> = {
  todo: "text-muted-foreground",
  doing: "text-blue-500",
  blocked: "text-red-500",
  done: "text-green-500",
  na: "text-gray-400",
};

const PRIORITY_VARIANTS: Record<string, "destructive" | "default" | "secondary" | "outline"> = {
  p0: "destructive",
  p1: "default",
  p2: "secondary",
  p3: "outline",
};

const PRIORITY_LABELS: Record<string, string> = {
  p0: "Critical",
  p1: "Standard",
  p2: "Optional",
  p3: "Nice-to-have",
};

export function MasterChecklistPanel({ bidProjectId }: { bidProjectId: string }) {
  const { toast } = useToast();
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set(PHASE_ORDER));
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");

  const { data: items = [], isLoading } = useQuery<ChecklistItem[]>({
    queryKey: ["/api/bid-projects", bidProjectId, "jacket-checklist"],
    queryFn: () => fetch(`/api/bid-projects/${bidProjectId}/jacket-checklist`).then(r => r.json()),
  });

  const { data: summary } = useQuery<ChecklistSummary>({
    queryKey: ["/api/bid-projects", bidProjectId, "jacket-checklist", "summary"],
    queryFn: () => fetch(`/api/bid-projects/${bidProjectId}/jacket-checklist/summary`).then(r => r.json()),
  });

  const { data: artifacts = [] } = useQuery<any[]>({
    queryKey: ["/api/bid-projects", bidProjectId, "artifacts"],
    queryFn: () => fetch(`/api/bid-projects/${bidProjectId}/artifacts`).then(r => r.json()),
  });

  const artifactMap = new Map<string, any>();
  for (const a of artifacts) {
    if (a.templateCode) artifactMap.set(a.templateCode, a);
  }

  const updateMutation = useMutation({
    mutationFn: async ({ itemId, updates }: { itemId: string; updates: Record<string, any> }) => {
      const res = await apiRequest("PATCH", `/api/bid-projects/${bidProjectId}/jacket-checklist/${itemId}`, updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bid-projects", bidProjectId, "jacket-checklist"] });
      queryClient.invalidateQueries({ queryKey: ["/api/nav-counts"] });
    },
    onError: () => {
      toast({ title: "Failed to update checklist item", variant: "destructive" });
    },
  });

  const filtered = items.filter(i => {
    if (filterStatus !== "all" && i.status !== filterStatus) return false;
    if (filterPriority !== "all" && i.priority !== filterPriority) return false;
    return true;
  });

  const grouped = PHASE_ORDER.reduce<Record<string, ChecklistItem[]>>((acc, phase) => {
    const phaseItems = filtered.filter(i => i.phase === phase);
    if (phaseItems.length > 0) acc[phase] = phaseItems;
    return acc;
  }, {});

  const togglePhase = (phase: string) => {
    const next = new Set(expandedPhases);
    if (next.has(phase)) next.delete(phase);
    else next.add(phase);
    setExpandedPhases(next);
  };

  const hasMissingDeps = (item: ChecklistItem): boolean => {
    const deps = item.requiredArtifactCodes || [];
    if (deps.length === 0) return false;
    return deps.some(code => {
      const art = artifactMap.get(code);
      return !art || art.status === "missing";
    });
  };

  const cycleStatus = (item: ChecklistItem) => {
    const order = ["todo", "doing", "blocked", "done", "na"];
    const idx = order.indexOf(item.status);
    let next = order[(idx + 1) % order.length];

    if (next === "done" && hasMissingDeps(item)) {
      const missingCodes = (item.requiredArtifactCodes || []).filter(code => {
        const art = artifactMap.get(code);
        return !art || art.status === "missing";
      });
      toast({
        title: "Cannot mark as done",
        description: `Required artifacts still missing: ${missingCodes.join(", ")}`,
        variant: "destructive",
      });
      next = "blocked";
      updateMutation.mutate({
        itemId: item.id,
        updates: { status: next, blockedReason: `Missing artifacts: ${missingCodes.join(", ")}` },
      });
      return;
    }

    updateMutation.mutate({ itemId: item.id, updates: { status: next } });
  };

  const completionPct = summary && summary.total > 0
    ? Math.round(((summary.done + summary.na) / summary.total) * 100)
    : 0;

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading checklist...</div>;
  }

  return (
    <div className="space-y-4" data-testid="master-checklist-panel">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold">Master Bid Checklist</h2>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{summary?.done ?? 0}/{summary?.total ?? 0} done</span>
          <span>({completionPct}%)</span>
        </div>
      </div>

      {summary && (
        <div className="space-y-2">
          <Progress value={completionPct} className="h-2" data-testid="checklist-progress" />
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card>
              <CardContent className="p-3 text-center">
                <div className="text-2xl font-bold text-muted-foreground">{summary.todo}</div>
                <div className="text-xs text-muted-foreground">To Do</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <div className="text-2xl font-bold text-blue-500">{summary.doing}</div>
                <div className="text-xs text-muted-foreground">Doing</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <div className="text-2xl font-bold text-red-500">{summary.blocked}</div>
                <div className="text-xs text-muted-foreground">Blocked</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <div className="text-2xl font-bold text-green-500">{summary.done}</div>
                <div className="text-xs text-muted-foreground">Done</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <div className="text-2xl font-bold text-gray-400">{summary.na}</div>
                <div className="text-xs text-muted-foreground">N/A</div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[140px]" data-testid="select-checklist-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="todo">To Do</SelectItem>
            <SelectItem value="doing">Doing</SelectItem>
            <SelectItem value="blocked">Blocked</SelectItem>
            <SelectItem value="done">Done</SelectItem>
            <SelectItem value="na">N/A</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="w-[140px]" data-testid="select-checklist-priority-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            <SelectItem value="p0">P0 Critical</SelectItem>
            <SelectItem value="p1">P1 Standard</SelectItem>
            <SelectItem value="p2">P2 Optional</SelectItem>
            <SelectItem value="p3">P3 Nice-to-have</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpandedPhases(new Set(PHASE_ORDER))}
          data-testid="btn-expand-all-phases"
        >
          Expand All
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpandedPhases(new Set())}
          data-testid="btn-collapse-all-phases"
        >
          Collapse All
        </Button>
      </div>

      {Object.entries(grouped).map(([phase, phaseItems]) => {
        const expanded = expandedPhases.has(phase);
        const doneCount = phaseItems.filter(i => i.status === "done" || i.status === "na").length;
        const blockedCount = phaseItems.filter(i => i.status === "blocked").length;
        return (
          <div key={phase} className="border rounded-lg" data-testid={`checklist-phase-${phase}`}>
            <button
              className="w-full flex items-center justify-between p-3 hover:bg-accent/50 transition-colors"
              onClick={() => togglePhase(phase)}
              data-testid={`btn-toggle-phase-${phase}`}
            >
              <div className="flex items-center gap-2">
                {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <span className="font-medium text-sm">{PHASE_LABELS[phase] || phase}</span>
                {blockedCount > 0 && (
                  <Badge variant="destructive" className="text-[10px]">{blockedCount} blocked</Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{doneCount}/{phaseItems.length}</span>
                <Progress value={phaseItems.length > 0 ? (doneCount / phaseItems.length) * 100 : 0} className="h-1.5 w-16" />
              </div>
            </button>
            {expanded && (
              <div className="border-t px-2 pb-2">
                {phaseItems.map(item => {
                  const StatusIcon = STATUS_ICONS[item.status] || Circle;
                  const statusColor = STATUS_COLORS[item.status] || "text-muted-foreground";
                  const deps = item.requiredArtifactCodes || [];

                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-2 py-1.5 px-2 hover:bg-accent/30 rounded transition-colors"
                      data-testid={`checklist-item-${item.id}`}
                    >
                      <button
                        onClick={() => cycleStatus(item)}
                        className="flex-shrink-0"
                        data-testid={`btn-toggle-status-${item.id}`}
                      >
                        <StatusIcon className={`h-4 w-4 ${statusColor}`} />
                      </button>
                      <div className="flex-1 min-w-0">
                        <span
                          className={`text-sm ${
                            item.status === "done" ? "line-through text-muted-foreground" :
                            item.status === "na" ? "text-muted-foreground italic" : ""
                          }`}
                        >
                          {item.templateCode && (
                            <span className="font-mono text-[10px] text-muted-foreground mr-1.5">{item.templateCode}</span>
                          )}
                          {item.title}
                        </span>
                        {item.blockedReason && (
                          <p className="text-xs text-red-500 mt-0.5">{item.blockedReason}</p>
                        )}
                        {deps.length > 0 && (
                          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                            <Link2 className="h-3 w-3 text-muted-foreground" />
                            {deps.map(code => {
                              const art = artifactMap.get(code);
                              const artStatus = art?.status || "missing";
                              const chipColor = artStatus === "missing" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                                artStatus === "ready" || artStatus === "approved" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                                "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
                              return (
                                <Tooltip key={code}>
                                  <TooltipTrigger asChild>
                                    <span className={`inline-flex items-center text-[10px] font-mono px-1.5 py-0.5 rounded ${chipColor}`} data-testid={`dep-chip-${code}`}>
                                      {code}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>{art?.name || code}</p>
                                    <p className="text-xs capitalize">Status: {artStatus}</p>
                                  </TooltipContent>
                                </Tooltip>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <Badge variant={PRIORITY_VARIANTS[item.priority] || "outline"} className="text-[10px] shrink-0" data-testid={`priority-${item.id}`}>
                        {PRIORITY_LABELS[item.priority] || item.priority}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {filtered.length === 0 && items.length > 0 && (
        <div className="text-center text-muted-foreground py-8">
          No items match your filter.
        </div>
      )}

      {items.length === 0 && (
        <div className="text-center text-muted-foreground py-8">
          No checklist items yet. They'll be created automatically when a bid project is set up.
        </div>
      )}
    </div>
  );
}
