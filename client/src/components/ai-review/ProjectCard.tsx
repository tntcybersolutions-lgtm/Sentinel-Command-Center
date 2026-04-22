import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, Calendar, DollarSign, Hash, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { DecisionPacket } from "@shared/schema";
import ActionRow from "./ActionRow";

interface ProjectCardProps {
  projectId: string;
  projectName: string;
  packages: DecisionPacket[];
  onSelect: (packet: DecisionPacket) => void;
  selectedId?: string;
  onApprove: (id: string) => void;
}

export default function ProjectCard({ projectId, projectName, packages, onSelect, selectedId, onApprove }: ProjectCardProps) {
  const [expanded, setExpanded] = useState(true);
  const firstPackage = packages[0];
  const project = firstPackage?.project;

  const completedTasks = packages.reduce((acc, p) => acc + p.tasks.filter(t => t.status === "done").length, 0);
  const totalTasks = packages.reduce((acc, p) => acc + p.tasks.length, 0);
  const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const formatCurrency = (val: number | null) => {
    if (!val) return null;
    if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `$${(val / 1000).toFixed(0)}K`;
    return `$${val.toLocaleString()}`;
  };

  return (
    <Card data-testid={`project-card-${projectId}`} className={selectedId && packages.some(p => p.id === selectedId) ? "ring-1 ring-primary/40" : ""}>
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2 pt-3 px-3">
        <div className="flex-1 min-w-0">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 w-full text-left"
            data-testid={`toggle-project-${projectId}`}
          >
            {expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
            <span className="font-semibold text-sm truncate">{projectName}</span>
          </button>
          <div className="flex items-center gap-2 mt-1 ml-5 flex-wrap">
            {project?.setAside && (
              <Badge variant="outline" className="text-xs">{project.setAside}</Badge>
            )}
            {project?.naicsCode && (
              <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                <Hash className="h-3 w-3" />
                {project.naicsCode}
              </span>
            )}
            {project?.client && (
              <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                <Building2 className="h-3 w-3" />
                {project.client}
              </span>
            )}
            {project?.estimatedValue && (
              <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                <DollarSign className="h-3 w-3" />
                {formatCurrency(project.estimatedValue)}
              </span>
            )}
            {project?.dueDate && (
              <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" />
                {new Date(project.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="secondary" className="text-xs">{packages.length} {packages.length === 1 ? "package" : "packages"}</Badge>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="px-3 pb-3 pt-0">
          <div className="mb-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>{completedTasks}/{totalTasks} tasks</span>
              <span>{progress}%</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <div className="space-y-1">
            {packages.map(pkg => (
              <ActionRow
                key={pkg.id}
                packet={pkg}
                isSelected={selectedId === pkg.id}
                onSelect={() => onSelect(pkg)}
                onApprove={() => onApprove(pkg.id)}
              />
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
