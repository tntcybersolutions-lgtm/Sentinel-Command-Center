import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { projectWorkspaceModules } from "@/nav/projectWorkspaceConfig";

async function fetchJson(url: string) {
  const res = await fetch(url, { credentials: "include" });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

interface Props {
  projectId: string;
  module: string;
}

function ModuleOverview({ projectId }: { projectId: string }) {
  const { data: project, isLoading } = useQuery<any>({
    queryKey: ["/api/projects", projectId],
    queryFn: () => fetchJson(`/api/projects/${projectId}`),
  });

  const { data: tasks } = useQuery<any[]>({
    queryKey: ["/api/projects", projectId, "tasks"],
    queryFn: () => fetchJson(`/api/projects/${projectId}/tasks`),
  });

  const { data: rfis } = useQuery<any[]>({
    queryKey: ["/api/projects", projectId, "rfis"],
    queryFn: () => fetchJson(`/api/projects/${projectId}/rfis`),
  });

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  const taskCount = tasks?.length ?? 0;
  const openRfis = rfis?.filter((r: any) => r.status === "open")?.length ?? 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-testid="module-overview">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Status</CardTitle></CardHeader>
        <CardContent><p className="text-2xl font-bold capitalize" data-testid="overview-status">{project?.status || "—"}</p></CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Tasks</CardTitle></CardHeader>
        <CardContent><p className="text-2xl font-bold" data-testid="overview-tasks">{taskCount}</p></CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Open RFIs</CardTitle></CardHeader>
        <CardContent><p className="text-2xl font-bold" data-testid="overview-rfis">{openRfis}</p></CardContent>
      </Card>
      {project?.description && (
        <Card className="md:col-span-3">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Description</CardTitle></CardHeader>
          <CardContent><p className="text-sm" data-testid="overview-description">{project.description}</p></CardContent>
        </Card>
      )}
    </div>
  );
}

function ModuleListView({ title, queryKey, endpoint, columns }: {
  title: string;
  queryKey: string[];
  endpoint: string;
  columns: { key: string; label: string; render?: (val: any, row: any) => any }[];
}) {
  const { data, isLoading } = useQuery<any[]>({
    queryKey,
    queryFn: () => fetchJson(endpoint),
  });

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  const items = Array.isArray(data) ? data : [];

  return (
    <Card data-testid={`module-${title.toLowerCase().replace(/\s/g, "-")}`}>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
        <Badge variant="outline">{items.length}</Badge>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center" data-testid="module-empty">No {title.toLowerCase()} found for this project.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((col) => (
                    <TableHead key={col.key}>{col.label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.slice(0, 50).map((item: any, i: number) => (
                  <TableRow key={item.id || i}>
                    {columns.map((col) => (
                      <TableCell key={col.key}>
                        {col.render ? col.render(item[col.key], item) : (item[col.key] ?? "—")}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant = status === "done" || status === "completed" || status === "approved" || status === "closed" ? "default" :
    status === "open" || status === "in_progress" || status === "doing" ? "secondary" :
    status === "overdue" || status === "blocked" ? "destructive" : "outline";
  return <Badge variant={variant} className="capitalize">{status?.replace(/_/g, " ") || "—"}</Badge>;
}

function dateCol(val: any) {
  if (!val) return "—";
  return new Date(val).toLocaleDateString();
}

export function ProjectModuleView({ projectId, module }: Props) {
  const modConfig = projectWorkspaceModules.find((m) => m.path === module);
  if (!modConfig && module !== "overview") {
    return <p className="text-muted-foreground p-4">Module not found.</p>;
  }

  switch (module) {
    case "overview":
      return <ModuleOverview projectId={projectId} />;
    case "tasks":
      return (
        <ModuleListView
          title="Tasks"
          queryKey={["/api/projects", projectId, "tasks"]}
          endpoint={`/api/projects/${projectId}/tasks`}
          columns={[
            { key: "title", label: "Title" },
            { key: "status", label: "Status", render: (v: string) => <StatusBadge status={v} /> },
            { key: "priority", label: "Priority", render: (v: string) => v ? <Badge variant="outline" className="capitalize">{v}</Badge> : "—" },
            { key: "dueDate", label: "Due", render: dateCol },
            { key: "assignedTo", label: "Assigned To" },
          ]}
        />
      );
    case "rfis":
      return (
        <ModuleListView
          title="RFIs"
          queryKey={["/api/projects", projectId, "rfis"]}
          endpoint={`/api/projects/${projectId}/rfis`}
          columns={[
            { key: "subject", label: "Subject" },
            { key: "status", label: "Status", render: (v: string) => <StatusBadge status={v} /> },
            { key: "createdAt", label: "Created", render: dateCol },
            { key: "dueDate", label: "Due", render: dateCol },
          ]}
        />
      );
    case "submittals":
      return (
        <ModuleListView
          title="Submittals"
          queryKey={["/api/projects", projectId, "submittals"]}
          endpoint={`/api/projects/${projectId}/submittals`}
          columns={[
            { key: "title", label: "Title" },
            { key: "status", label: "Status", render: (v: string) => <StatusBadge status={v} /> },
            { key: "specSection", label: "Spec Section" },
            { key: "dueDate", label: "Due", render: dateCol },
          ]}
        />
      );
    case "purchase-orders":
      return (
        <ModuleListView
          title="Purchase Orders"
          queryKey={["/api/purchase-orders"]}
          endpoint={`/api/purchase-orders?projectId=${projectId}`}
          columns={[
            { key: "poNumber", label: "PO #" },
            { key: "vendorName", label: "Vendor" },
            { key: "status", label: "Status", render: (v: string) => <StatusBadge status={v} /> },
            { key: "totalAmount", label: "Total", render: (v: any) => v != null ? `$${Number(v).toLocaleString()}` : "—" },
          ]}
        />
      );
    case "invoices":
      return (
        <ModuleListView
          title="Invoices"
          queryKey={["/api/invoices"]}
          endpoint={`/api/invoices?projectId=${projectId}`}
          columns={[
            { key: "invoiceNumber", label: "Invoice #" },
            { key: "vendorName", label: "Vendor" },
            { key: "status", label: "Status", render: (v: string) => <StatusBadge status={v} /> },
            { key: "amount", label: "Amount", render: (v: any) => v != null ? `$${Number(v).toLocaleString()}` : "—" },
            { key: "dueDate", label: "Due", render: dateCol },
          ]}
        />
      );
    case "change-orders":
      return (
        <ModuleListView
          title="Change Orders"
          queryKey={["/api/change-orders"]}
          endpoint={`/api/change-orders?projectId=${projectId}`}
          columns={[
            { key: "title", label: "Title" },
            { key: "status", label: "Status", render: (v: string) => <StatusBadge status={v} /> },
            { key: "amount", label: "Amount", render: (v: any) => v != null ? `$${Number(v).toLocaleString()}` : "—" },
            { key: "createdAt", label: "Created", render: dateCol },
          ]}
        />
      );
    case "budget":
      return (
        <ModuleListView
          title="Budget Lines"
          queryKey={["/api/projects", projectId, "budget"]}
          endpoint={`/api/projects/${projectId}/budget`}
          columns={[
            { key: "costCode", label: "Cost Code" },
            { key: "description", label: "Description" },
            { key: "budgetAmount", label: "Budget", render: (v: any) => v != null ? `$${Number(v).toLocaleString()}` : "—" },
            { key: "committedAmount", label: "Committed", render: (v: any) => v != null ? `$${Number(v).toLocaleString()}` : "—" },
          ]}
        />
      );
    case "documents":
      return (
        <ModuleListView
          title="Documents"
          queryKey={["/api/documents", "project", projectId]}
          endpoint={`/api/documents/scoped?jacketType=project&jacketId=${projectId}`}
          columns={[
            { key: "fileName", label: "File Name" },
            { key: "category", label: "Category" },
            { key: "uploadedAt", label: "Uploaded", render: dateCol },
          ]}
        />
      );
    case "daily-logs":
      return (
        <ModuleListView
          title="Daily Logs"
          queryKey={["/api/projects", projectId, "daily-logs"]}
          endpoint={`/api/projects/${projectId}/daily-logs`}
          columns={[
            { key: "logDate", label: "Date", render: dateCol },
            { key: "weather", label: "Weather" },
            { key: "notes", label: "Notes", render: (v: string) => v ? (v.length > 80 ? v.slice(0, 80) + "..." : v) : "—" },
          ]}
        />
      );
    default:
      return (
        <Card data-testid={`module-${module}-placeholder`}>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              {modConfig?.label || module} module coming soon.
            </p>
          </CardContent>
        </Card>
      );
  }
}
