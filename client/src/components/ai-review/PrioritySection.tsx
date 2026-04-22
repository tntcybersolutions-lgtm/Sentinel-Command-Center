import { Badge } from "@/components/ui/badge";
import { AlertTriangle, AlertCircle, Clock } from "lucide-react";
import type { DecisionPacket } from "@shared/schema";
import ProjectCard from "./ProjectCard";

interface PrioritySectionProps {
  priority: string;
  projectGroups: Map<string, DecisionPacket[]>;
  onSelect: (packet: DecisionPacket) => void;
  selectedId?: string;
  onApprove: (id: string) => void;
}

const priorityConfig: Record<string, { icon: typeof AlertTriangle; color: string; bgColor: string; label: string }> = {
  urgent: { icon: AlertCircle, color: "text-red-600 dark:text-red-400", bgColor: "bg-red-500/10", label: "Urgent" },
  high: { icon: AlertTriangle, color: "text-orange-600 dark:text-orange-400", bgColor: "bg-orange-500/10", label: "High Priority" },
  normal: { icon: Clock, color: "text-muted-foreground", bgColor: "bg-muted", label: "Normal" },
};

export default function PrioritySection({ priority, projectGroups, onSelect, selectedId, onApprove }: PrioritySectionProps) {
  const config = priorityConfig[priority] || priorityConfig.normal;
  const Icon = config.icon;
  const totalPackages = Array.from(projectGroups.values()).reduce((acc, pkgs) => acc + pkgs.length, 0);

  return (
    <div className="space-y-2" data-testid={`priority-section-${priority}`}>
      <div className="flex items-center gap-2 px-1">
        <Icon className={`h-4 w-4 ${config.color}`} />
        <span className={`text-sm font-semibold ${config.color}`}>{config.label}</span>
        <Badge variant="secondary" className="text-xs">{totalPackages}</Badge>
      </div>
      <div className="space-y-2">
        {Array.from(projectGroups.entries()).map(([projectId, packets]) => (
          <ProjectCard
            key={projectId}
            projectId={projectId}
            projectName={packets[0].project.name}
            packages={packets}
            onSelect={onSelect}
            selectedId={selectedId}
            onApprove={onApprove}
          />
        ))}
      </div>
    </div>
  );
}
