import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertTriangle, Clock, Shield, ChevronRight } from "lucide-react";
import type { DecisionPacket } from "@shared/schema";

interface ActionRowProps {
  packet: DecisionPacket;
  isSelected: boolean;
  onSelect: () => void;
  onApprove: () => void;
}

const riskColors: Record<string, string> = {
  low: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  medium: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  high: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  critical: "bg-red-500/10 text-red-600 dark:text-red-400",
};

const statusIcons: Record<string, typeof CheckCircle2> = {
  pending: Clock,
  in_progress: Clock,
  blocked: AlertTriangle,
  approved: CheckCircle2,
  rejected: Shield,
};

export default function ActionRow({ packet, isSelected, onSelect, onApprove }: ActionRowProps) {
  const tasks = packet.tasks || [];
  const doneTasks = tasks.filter(t => t.status === "done").length;
  const totalTasks = tasks.length;
  const StatusIcon = statusIcons[packet.status] || Clock;

  const riskLevel = packet.summary?.risk?.level || "low";
  const riskColorClass = riskColors[riskLevel] || riskColors.low;

  const requestedAgo = packet.audit?.requestedAt ? getRelativeTime(packet.audit.requestedAt) : "";

  return (
    <div
      onClick={onSelect}
      className={`flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer transition-colors ${isSelected ? "bg-accent" : "hover-elevate"}`}
      data-testid={`action-row-${packet.id}`}
    >
      <StatusIcon className="h-4 w-4 shrink-0 text-muted-foreground" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium truncate">{packet.summary.headline}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <Badge variant="outline" className="text-xs">{packet.category}</Badge>
          <Badge className={`text-xs ${riskColorClass} border-0`}>
            {riskLevel} risk
          </Badge>
          <span className="text-xs text-muted-foreground">{doneTasks}/{totalTasks} tasks</span>
          <span className="text-xs text-muted-foreground">{requestedAgo}</span>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {packet.status === "pending" && (
          <Button
            size="sm"
            variant="default"
            onClick={(e) => { e.stopPropagation(); onApprove(); }}
            data-testid={`button-approve-${packet.id}`}
          >
            Approve
          </Button>
        )}
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </div>
  );
}

function getRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}
