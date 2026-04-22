import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  CheckCircle2, AlertTriangle, Clock, XCircle,
  Shield, ArrowRight, ExternalLink, FileText,
  FolderOpen, AlertCircle, Workflow,
} from "lucide-react";
import { useState } from "react";
import type { DecisionPacket, WorkPackageTaskData } from "@shared/schema";

interface ActionDrawerProps {
  packet: DecisionPacket | null;
  onApprove: (id: string, notes?: string) => void;
  onReject: (id: string, reason: string) => void;
  isPending: boolean;
}

const taskStatusConfig: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
  done: { icon: CheckCircle2, color: "text-emerald-500", label: "Done" },
  ready: { icon: Clock, color: "text-blue-500", label: "Ready" },
  in_progress: { icon: Clock, color: "text-amber-500", label: "In Progress" },
  blocked: { icon: AlertTriangle, color: "text-orange-500", label: "Blocked" },
  failed: { icon: XCircle, color: "text-red-500", label: "Failed" },
};

const riskBadgeColors: Record<string, string> = {
  low: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  medium: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  high: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  critical: "bg-red-500/10 text-red-600 dark:text-red-400",
};

export default function ActionDrawer({ packet, onApprove, onReject, isPending }: ActionDrawerProps) {
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);

  if (!packet) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground" data-testid="drawer-empty">
        <div className="text-center space-y-2">
          <FileText className="h-10 w-10 mx-auto opacity-30" />
          <p className="text-sm">Select a work package to view details</p>
        </div>
      </div>
    );
  }

  const summary = packet.summary || { headline: "", why: "", risk: { level: "low" as const, score: 0, flags: [] }, impact: { financialDelta: 0, scheduleImpactDays: 0, downstreamWorkflows: [] } };
  const project = packet.project || { id: "", name: "Unknown", client: null, naicsCode: null, setAside: null, stage: null, dueDate: null, estimatedValue: null };
  const tasks = packet.tasks || [];
  const missingArtifacts = packet.missingArtifacts || [];
  const routing = packet.routing || { reviewUrl: "/ai-review-queue", projectUrl: "/ai-review-queue", batchKey: "" };
  const audit = packet.audit || { requestedBy: "system", requestedAt: new Date().toISOString() };
  const doneTasks = tasks.filter(t => t.status === "done").length;
  const progress = tasks.length > 0 ? Math.round((doneTasks / tasks.length) * 100) : 0;

  return (
    <div className="h-full overflow-y-auto space-y-4 p-4" data-testid="action-drawer">
      <div>
        <h3 className="font-semibold text-base">{project.name}</h3>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <Badge variant="outline">{packet.category}</Badge>
          <Badge className={`${riskBadgeColors[summary.risk.level]} border-0`}>
            Risk: {summary.risk.level} ({summary.risk.score})
          </Badge>
          {packet.priority !== "normal" && (
            <Badge variant={packet.priority === "urgent" ? "destructive" : "default"}>
              {packet.priority}
            </Badge>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2 pt-3 px-3">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Decision Summary</span>
        </CardHeader>
        <CardContent className="px-3 pb-3 space-y-2">
          <p className="text-sm font-medium">{summary.headline}</p>
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Why</span>
            <p className="text-sm text-muted-foreground">{summary.why}</p>
          </div>
        </CardContent>
      </Card>

      {summary.risk.flags.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-3 px-3">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> Risk Flags
            </span>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <ul className="space-y-1">
              {summary.risk.flags.map((flag, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
                  <span>{flag}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2 pt-3 px-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <Workflow className="h-3 w-3" /> Task Checklist
            </span>
            <span className="text-xs text-muted-foreground">{doneTasks}/{tasks.length} ({progress}%)</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-1">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <div className="space-y-2">
            {tasks.map((task) => (
              <TaskItem key={task.taskId} task={task} allTasks={tasks} />
            ))}
          </div>
        </CardContent>
      </Card>

      {missingArtifacts.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-3 px-3">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <FolderOpen className="h-3 w-3" /> Missing Artifacts
            </span>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <ul className="space-y-1">
              {missingArtifacts.map((artifact, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <XCircle className="h-3 w-3 text-red-500 shrink-0" />
                  <span>{artifact}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {summary.impact.downstreamWorkflows.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-3 px-3">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <ArrowRight className="h-3 w-3" /> Downstream Impact
            </span>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <div className="flex flex-wrap gap-1">
              {summary.impact.downstreamWorkflows.map((wf) => (
                <Badge key={wf} variant="secondary" className="text-xs">{wf}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Requested by <span className="font-medium">{audit.requestedBy}</span></span>
        <span>{new Date(audit.requestedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
      </div>

      {packet.status === "pending" && (
        <div className="space-y-2 pt-2 border-t">
          {!showRejectForm ? (
            <div className="flex items-center gap-2">
              <Button
                className="flex-1"
                onClick={() => onApprove(packet.id)}
                disabled={isPending}
                data-testid="drawer-approve-btn"
              >
                <CheckCircle2 className="h-4 w-4 mr-1" />
                Approve
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowRejectForm(true)}
                disabled={isPending}
                data-testid="drawer-reject-toggle"
              >
                <XCircle className="h-4 w-4 mr-1" />
                Reject
              </Button>
              <Button
                variant="ghost"
                size="icon"
                asChild
              >
                <a href={routing.reviewUrl} data-testid="drawer-review-link">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Textarea
                placeholder="Rejection reason (required)"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="text-sm"
                data-testid="drawer-reject-reason"
              />
              <div className="flex items-center gap-2">
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => { onReject(packet.id, rejectReason); setShowRejectForm(false); setRejectReason(""); }}
                  disabled={!rejectReason.trim() || isPending}
                  data-testid="drawer-reject-confirm"
                >
                  Confirm Reject
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => { setShowRejectForm(false); setRejectReason(""); }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TaskItem({ task, allTasks }: { task: WorkPackageTaskData; allTasks: WorkPackageTaskData[] }) {
  const config = taskStatusConfig[task.status] || taskStatusConfig.blocked;
  const Icon = config.icon;

  const blockerNames = task.blockedBy
    .map(id => allTasks.find(t => t.taskId === id))
    .filter(Boolean)
    .map(t => t!.taskType);

  return (
    <div className="flex items-start gap-2" data-testid={`task-${task.taskId}`}>
      <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${config.color}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{formatTaskType(task.taskType)}</span>
          <Badge variant="outline" className="text-xs">{task.ownerRole}</Badge>
        </div>
        {task.status === "blocked" && blockerNames.length > 0 && (
          <p className="text-xs text-muted-foreground mt-0.5">
            Blocked by: {blockerNames.map(formatTaskType).join(", ")}
          </p>
        )}
        {task.artifacts.length > 0 && task.artifacts[0].name && (
          <div className="flex flex-wrap gap-1 mt-1">
            {task.artifacts.slice(0, 3).map((a, i) => (
              <span key={i} className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {a.name}
              </span>
            ))}
          </div>
        )}
      </div>
      <Badge variant="outline" className="text-xs shrink-0">{config.label}</Badge>
    </div>
  );
}

function formatTaskType(type: string): string {
  return type.replace(/([A-Z])/g, " $1").trim();
}
