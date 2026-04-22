import { useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useProjectContext } from "@/nav/project-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import ProjectModulePage from "@/pages/projects/ProjectModulePage";
import ProjectDocumentsCenter from "@/pages/projects/ProjectDocumentsCenter";
import ProjectTakeoffPanel from "@/pages/projects/ProjectTakeoffPanel";
import IngestionActivityPanel from "@/components/IngestionActivityPanel";

async function fetchJson(url: string) {
  const res = await fetch(url, { credentials: "include" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

function ProjectOverview({ projectId, project }: { projectId: string; project: any }) {
  const { data: tasks } = useQuery<any[]>({
    queryKey: [`/api/projects/${projectId}/tasks`],
    queryFn: () => fetch(`/api/projects/${projectId}/tasks`, { credentials: "include" }).then(r => r.ok ? r.json() : []),
  });

  const { data: rfis } = useQuery<any[]>({
    queryKey: [`/api/projects/${projectId}/rfis`],
    queryFn: () => fetch(`/api/projects/${projectId}/rfis`, { credentials: "include" }).then(r => r.ok ? r.json() : []),
  });

  const taskCount = tasks?.length ?? 0;
  const openRfis = rfis?.filter((r: any) => r.status === "open")?.length ?? 0;

  return (
    <div className="space-y-4" data-testid="module-overview">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold capitalize" data-testid="overview-status">
              {project?.status || "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">To-Dos</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" data-testid="overview-tasks">{taskCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Open RFIs</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" data-testid="overview-rfis">{openRfis}</p>
          </CardContent>
        </Card>
      </div>
      {project?.description && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm" data-testid="overview-description">{project.description}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function ProjectWorkspace() {
  const [, params] = useRoute("/projects/:projectId/:module");
  const [, setLocation] = useLocation();
  const projectId = params?.projectId;
  const module = params?.module || "overview";
  const { selectProject } = useProjectContext();

  const { data: project, isLoading } = useQuery<any>({
    queryKey: ["/api/projects", projectId],
    enabled: Boolean(projectId),
    queryFn: () => fetchJson(`/api/projects/${encodeURIComponent(String(projectId))}`),
  });

  const ensuredRef = useRef<string | null>(null);

  useEffect(() => {
    if (project) {
      selectProject(project.id, project.name || project.projectNumber || "Project");
    }
  }, [project?.id]);

  useEffect(() => {
    if (projectId && project && ensuredRef.current !== projectId) {
      ensuredRef.current = projectId;
      fetch(`/api/projects/${projectId}/ensure-documents`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }).catch(() => {});
    }
  }, [projectId, project?.id]);

  if (!projectId) {
    setLocation("/projects/active");
    return null;
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4" data-testid="project-workspace-loading">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4" data-testid="project-workspace">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-xl font-bold" data-testid="project-workspace-title">
          {project?.name || "Project"}
        </h1>
        {project?.projectNumber && (
          <Badge variant="outline" data-testid="project-workspace-number">{project.projectNumber}</Badge>
        )}
        {project?.status && (
          <Badge variant="secondary" data-testid="project-workspace-status">{project.status}</Badge>
        )}
      </div>

      {module === "overview" ? (
        <ProjectOverview projectId={projectId} project={project} />
      ) : module === "documents" ? (
        <ProjectDocumentsCenter />
      ) : module === "takeoff" ? (
        <ProjectTakeoffPanel projectId={projectId} project={project} />
      ) : module === "ingestion" ? (
        <IngestionActivityPanel projectId={projectId} />
      ) : (
        <ProjectModulePage />
      )}
    </div>
  );
}
