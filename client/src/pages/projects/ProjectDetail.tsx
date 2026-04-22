import { useLocation, useRoute } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  DollarSign,
  ListChecks,
  FileQuestion,
  FileCheck,
  ShoppingCart,
  ArrowLeftRight,
  FileText,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Circle,
  Loader2,
  Ban,
  Plus,
  ClipboardList,
} from "lucide-react";
import { useProjectContext } from "@/nav/project-context";
import { apiRequest } from "@/lib/queryClient";

async function fetchJson(url: string) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

function currency(v: number | string | null | undefined) {
  if (v === null || v === undefined) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(v));
}

function statusColor(status: string) {
  const s = (status || "").toLowerCase();
  if (s === "completed" || s === "approved" || s === "paid" || s === "closed") return "default";
  if (s === "overdue" || s === "rejected" || s === "cancelled") return "destructive";
  if (s === "in_progress" || s === "in_review" || s === "submitted") return "secondary";
  return "outline";
}

function KpiCard({
  icon: Icon,
  label,
  value,
  subtitle,
  testId,
}: {
  icon: any;
  label: string;
  value: string | number;
  subtitle?: string;
  testId: string;
}) {
  return (
    <Card className="p-4" data-testid={testId}>
      <div className="flex items-center gap-3">
        <div className="rounded-md bg-primary/10 p-2">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-bold truncate">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
    </Card>
  );
}

const statusIcons: Record<string, any> = {
  completed: CheckCircle2,
  in_progress: Loader2,
  not_started: Circle,
  skipped: Ban,
};

function ChecklistItemRow({ item, onUpdate }: { item: any; onUpdate: (id: string, status: string) => void }) {
  const StatusIcon = statusIcons[item.status] || Circle;
  const isCompleted = item.status === "completed";
  const isSkipped = item.status === "skipped";

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-md border text-sm ${isCompleted ? "opacity-60" : ""} ${isSkipped ? "opacity-40" : ""}`}
      data-testid={`checklist-item-${item.id}`}
    >
      <button
        className="flex-shrink-0"
        onClick={() => onUpdate(item.id, isCompleted ? "not_started" : "completed")}
        data-testid={`toggle-checklist-${item.id}`}
      >
        <StatusIcon className={`h-5 w-5 ${isCompleted ? "text-green-600" : item.status === "in_progress" ? "text-blue-500" : "text-muted-foreground"}`} />
      </button>
      <div className="flex-1 min-w-0">
        <div className={`font-medium ${isCompleted ? "line-through" : ""}`}>{item.title}</div>
        {item.description && <div className="text-xs text-muted-foreground mt-0.5">{item.description}</div>}
      </div>
      <Select value={item.status} onValueChange={(v) => onUpdate(item.id, v)}>
        <SelectTrigger className="w-32" data-testid={`select-status-${item.id}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="not_started">Not Started</SelectItem>
          <SelectItem value="in_progress">In Progress</SelectItem>
          <SelectItem value="completed">Completed</SelectItem>
          <SelectItem value="skipped">Skipped</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function ProjectChecklistTab({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();

  const { data: checklists, isLoading: loadingChecklists } = useQuery<any[]>({
    queryKey: ["/api/projects", projectId, "checklist"],
    queryFn: () => fetchJson(`/api/projects/${encodeURIComponent(projectId)}/checklist`),
  });

  const { data: templates } = useQuery<any[]>({
    queryKey: ["/api/checklist-templates"],
    queryFn: () => fetchJson("/api/checklist-templates"),
  });

  const createFromTemplate = useMutation({
    mutationFn: async (templateId: string) => {
      const res = await apiRequest("POST", `/api/projects/${encodeURIComponent(projectId)}/checklist/from-template`, {
        templateId,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "checklist"] });
    },
  });

  const updateItem = useMutation({
    mutationFn: async ({ checklistId, itemId, status }: { checklistId: string; itemId: string; status: string }) => {
      const res = await apiRequest("PATCH", `/api/project-checklist-items/${itemId}`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "checklist"] });
    },
  });

  if (loadingChecklists) {
    return <div className="space-y-3"><Skeleton className="h-8 w-1/3" /><Skeleton className="h-40 w-full" /></div>;
  }

  const activeChecklists = checklists ?? [];

  return (
    <div className="space-y-4" data-testid="project-checklist-tab">
      {activeChecklists.length === 0 ? (
        <Card className="p-6">
          <div className="text-center space-y-3">
            <ClipboardList className="h-10 w-10 mx-auto text-muted-foreground" />
            <div>
              <h3 className="font-semibold">No Checklists</h3>
              <p className="text-sm text-muted-foreground mt-1">Create a checklist from a template to get started.</p>
            </div>
            {templates && templates.length > 0 && (
              <div className="flex items-center justify-center gap-2 flex-wrap">
                {templates.map((t: any) => (
                  <Button
                    key={t.id}
                    variant="outline"
                    size="sm"
                    onClick={() => createFromTemplate.mutate(t.id)}
                    disabled={createFromTemplate.isPending}
                    data-testid={`create-from-template-${t.id}`}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    {t.name}
                  </Button>
                ))}
              </div>
            )}
          </div>
        </Card>
      ) : (
        activeChecklists.map((cl: any) => {
          const items = cl.items || [];
          const completed = items.filter((i: any) => i.status === "completed" || i.status === "skipped").length;
          const total = items.length;
          const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

          return (
            <Card key={cl.id} className="p-4 space-y-3" data-testid={`checklist-${cl.id}`}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <h3 className="font-semibold flex items-center gap-2">
                    <ClipboardList className="h-4 w-4" />
                    {cl.name}
                  </h3>
                  {cl.description && <p className="text-xs text-muted-foreground mt-0.5">{cl.description}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={pct === 100 ? "default" : "secondary"} data-testid={`checklist-progress-${cl.id}`}>
                    {completed}/{total} ({pct}%)
                  </Badge>
                </div>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-primary rounded-full h-2 transition-all"
                  style={{ width: `${pct}%` }}
                  data-testid={`checklist-bar-${cl.id}`}
                />
              </div>
              <div className="space-y-2">
                {items.map((item: any) => (
                  <ChecklistItemRow
                    key={item.id}
                    item={item}
                    onUpdate={(itemId, status) =>
                      updateItem.mutate({ checklistId: cl.id, itemId, status })
                    }
                  />
                ))}
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}

export default function ProjectDetail() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/projects/:id");
  const id = params?.id;
  const { selectProject } = useProjectContext();

  const { data: workspace, isLoading, isError, error } = useQuery<any>({
    queryKey: ["/api/projects", id, "workspace"],
    enabled: Boolean(id),
    queryFn: () => fetchJson(`/api/projects/${encodeURIComponent(String(id))}/workspace`),
  });

  useEffect(() => {
    if (workspace?.project) {
      selectProject(workspace.project.id, workspace.project.name);
    }
  }, [workspace?.project?.id]);

  const p = workspace?.project;
  const kpis = workspace?.kpis;

  return (
    <div className="p-6 space-y-6" data-testid="project-detail-page">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Button variant="ghost" onClick={() => setLocation("/projects/active")} data-testid="button-back-to-projects">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Projects
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-1/2" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </div>
      ) : isError ? (
        <Card className="p-6 space-y-2" data-testid="project-detail-error">
          <div className="font-medium">Failed to load project</div>
          <div className="text-sm text-muted-foreground">{(error as any)?.message ?? "Unknown error"}</div>
        </Card>
      ) : (
        <>
          <Card className="p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h1 className="text-xl font-bold" data-testid="project-detail-name">{p?.name || "Untitled"}</h1>
                <p className="text-sm text-muted-foreground">
                  {p?.projectNumber && `Project ${p.projectNumber}`}
                  {p?.clientName && ` | ${p.clientName}`}
                  {p?.location && ` | ${p.location}`}
                </p>
              </div>
              <Badge data-testid="project-detail-status" variant={statusColor(p?.status)}>
                {p?.status || "unknown"}
              </Badge>
            </div>
          </Card>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-testid="project-kpis">
            <KpiCard icon={DollarSign} label="Budget" value={currency(kpis?.budget)} testId="kpi-budget" />
            <KpiCard icon={DollarSign} label="Actual Costs" value={currency(kpis?.actualCosts)} testId="kpi-costs" />
            <KpiCard icon={DollarSign} label="Contract Value" value={currency(kpis?.contractValue)} testId="kpi-contract" />
            <KpiCard
              icon={DollarSign}
              label="Profit"
              value={currency((kpis?.budget || 0) - (kpis?.actualCosts || 0))}
              subtitle={kpis?.budget ? `${(((kpis.budget - kpis.actualCosts) / kpis.budget) * 100).toFixed(1)}% margin` : undefined}
              testId="kpi-profit"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4" data-testid="project-counts">
            <KpiCard icon={ListChecks} label="Open Tasks" value={kpis?.openTaskCount ?? 0}
              subtitle={kpis?.overdueTaskCount > 0 ? `${kpis.overdueTaskCount} overdue` : undefined}
              testId="kpi-tasks" />
            <KpiCard icon={FileQuestion} label="Open RFIs" value={kpis?.openRfiCount ?? 0} testId="kpi-rfis" />
            <KpiCard icon={FileCheck} label="Pending Submittals" value={kpis?.pendingSubmittalCount ?? 0} testId="kpi-submittals" />
            <KpiCard icon={ShoppingCart} label="PO Total" value={currency(kpis?.poTotal)} testId="kpi-pos" />
            <KpiCard icon={ArrowLeftRight} label="CO Total" value={currency(kpis?.coTotal)} testId="kpi-cos" />
          </div>

          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList data-testid="project-tabs">
              <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
              <TabsTrigger value="checklist" data-testid="tab-checklist">
                <ClipboardList className="h-4 w-4 mr-1" /> Checklist
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="p-4" data-testid="card-project-tasks">
                  <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <ListChecks className="h-4 w-4" /> Tasks
                    </h3>
                    <Badge variant="secondary">{workspace?.tasks?.length ?? 0}</Badge>
                  </div>
                  {workspace?.tasks?.length > 0 ? (
                    <div className="space-y-2 max-h-64 overflow-auto">
                      {workspace.tasks.slice(0, 10).map((t: any) => (
                        <div key={t.id} className="flex items-center justify-between gap-2 p-2 rounded-md border text-sm">
                          <span className="truncate flex-1">{t.name}</span>
                          <div className="flex items-center gap-2">
                            {t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'completed' && (
                              <AlertTriangle className="h-3 w-3 text-destructive" />
                            )}
                            <Badge variant={statusColor(t.status)} className="text-xs">{t.status}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No tasks</p>
                  )}
                </Card>

                <Card className="p-4" data-testid="card-project-rfis">
                  <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <FileQuestion className="h-4 w-4" /> RFIs
                    </h3>
                    <Badge variant="secondary">{workspace?.rfis?.length ?? 0}</Badge>
                  </div>
                  {workspace?.rfis?.length > 0 ? (
                    <div className="space-y-2 max-h-64 overflow-auto">
                      {workspace.rfis.slice(0, 10).map((r: any) => (
                        <div key={r.id} className="flex items-center justify-between gap-2 p-2 rounded-md border text-sm">
                          <span className="truncate flex-1">{r.rfiNumber ? `${r.rfiNumber}: ` : ""}{r.subject}</span>
                          <Badge variant={statusColor(r.status)} className="text-xs">{r.status}</Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No RFIs</p>
                  )}
                </Card>

                <Card className="p-4" data-testid="card-project-submittals">
                  <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <FileCheck className="h-4 w-4" /> Submittals
                    </h3>
                    <Badge variant="secondary">{workspace?.submittals?.length ?? 0}</Badge>
                  </div>
                  {workspace?.submittals?.length > 0 ? (
                    <div className="space-y-2 max-h-64 overflow-auto">
                      {workspace.submittals.slice(0, 10).map((s: any) => (
                        <div key={s.id} className="flex items-center justify-between gap-2 p-2 rounded-md border text-sm">
                          <span className="truncate flex-1">{s.submittalNumber ? `${s.submittalNumber}: ` : ""}{s.name}</span>
                          <Badge variant={statusColor(s.status)} className="text-xs">{s.status}</Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No submittals</p>
                  )}
                </Card>

                <Card className="p-4" data-testid="card-project-financials">
                  <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <DollarSign className="h-4 w-4" /> Financial Activity
                    </h3>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <ShoppingCart className="h-3 w-3" /> Purchase Orders
                      </span>
                      <span className="font-medium">{workspace?.purchaseOrders?.length ?? 0} ({currency(kpis?.poTotal)})</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <ArrowLeftRight className="h-3 w-3" /> Change Orders
                      </span>
                      <span className="font-medium">{workspace?.changeOrders?.length ?? 0} ({currency(kpis?.coTotal)})</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <FileText className="h-3 w-3" /> Invoices
                      </span>
                      <span className="font-medium">{workspace?.invoices?.length ?? 0} ({currency(kpis?.invoiceTotal)})</span>
                    </div>
                    {kpis?.unpaidInvoiceCount > 0 && (
                      <div className="flex items-center gap-1 text-sm text-destructive">
                        <Clock className="h-3 w-3" />
                        {kpis.unpaidInvoiceCount} unpaid invoice{kpis.unpaidInvoiceCount !== 1 ? "s" : ""}
                      </div>
                    )}
                  </div>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="checklist">
              <ProjectChecklistTab projectId={id!} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
