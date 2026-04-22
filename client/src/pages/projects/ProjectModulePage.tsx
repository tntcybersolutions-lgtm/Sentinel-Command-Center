import { useMemo, useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus } from "lucide-react";
import {
  projectWorkspaceModules,
  type ProjectModuleKey,
} from "@/nav/projectWorkspaceConfig";

type ModuleApi = {
  title: string;
  listUrl: (projectId: string) => string;
  createUrl: (projectId: string) => string;
  createPayload: (title: string, projectId: string) => any;
  columns: { key: string; label: string }[];
};

function moduleApi(key: ProjectModuleKey): ModuleApi {
  if (key === "bills") {
    return {
      title: "Bills",
      listUrl: (pid) => `/api/projects/${pid}/bills`,
      createUrl: (pid) => `/api/projects/${pid}/bills`,
      createPayload: (title, pid) => ({
        projectId: pid,
        invoiceType: "payable",
        invoiceNumber: title,
        title,
      }),
      columns: [
        { key: "invoiceNumber", label: "Invoice #" },
        { key: "status", label: "Status" },
        { key: "totalAmount", label: "Total" },
      ],
    };
  }

  if (key === "client-invoices") {
    return {
      title: "Client Invoices",
      listUrl: (pid) => `/api/projects/${pid}/client-invoices`,
      createUrl: (pid) => `/api/projects/${pid}/client-invoices`,
      createPayload: (title, pid) => ({
        projectId: pid,
        invoiceType: "receivable",
        invoiceNumber: title,
        title,
      }),
      columns: [
        { key: "invoiceNumber", label: "Invoice #" },
        { key: "status", label: "Status" },
        { key: "totalAmount", label: "Total" },
      ],
    };
  }

  if (key === "purchase-orders") {
    return {
      title: "PO and Subcontracts",
      listUrl: (pid) => `/api/projects/${pid}/purchase-orders`,
      createUrl: (pid) => `/api/projects/${pid}/purchase-orders`,
      createPayload: (title, pid) => ({
        projectId: pid,
        poNumber: title,
        vendorId: "",
      }),
      columns: [
        { key: "poNumber", label: "PO #" },
        { key: "vendorName", label: "Vendor" },
        { key: "status", label: "Status" },
        { key: "totalAmount", label: "Total" },
      ],
    };
  }

  if (key === "change-orders") {
    return {
      title: "Change Orders",
      listUrl: (pid) => `/api/projects/${pid}/change-orders`,
      createUrl: (pid) => `/api/projects/${pid}/change-orders`,
      createPayload: (title, pid) => ({
        projectId: pid,
        title,
        coNumber: title,
      }),
      columns: [
        { key: "coNumber", label: "CO #" },
        { key: "title", label: "Title" },
        { key: "status", label: "Status" },
        { key: "amount", label: "Amount" },
      ],
    };
  }

  if (key === "tasks") {
    return {
      title: "To-Dos",
      listUrl: (pid) => `/api/projects/${pid}/tasks`,
      createUrl: (pid) => `/api/projects/${pid}/tasks`,
      createPayload: (title, pid) => ({ projectId: pid, name: title }),
      columns: [
        { key: "name", label: "Title" },
        { key: "status", label: "Status" },
        { key: "priority", label: "Priority" },
        { key: "dueDate", label: "Due" },
      ],
    };
  }

  if (key === "rfis") {
    return {
      title: "RFIs",
      listUrl: (pid) => `/api/projects/${pid}/rfis`,
      createUrl: (pid) => `/api/projects/${pid}/rfis`,
      createPayload: (title, pid) => ({
        projectId: pid,
        subject: title,
        question: title,
      }),
      columns: [
        { key: "rfiNumber", label: "No." },
        { key: "subject", label: "Subject" },
        { key: "status", label: "Status" },
        { key: "priority", label: "Priority" },
      ],
    };
  }

  if (key === "submittals") {
    return {
      title: "Submittals",
      listUrl: (pid) => `/api/projects/${pid}/submittals`,
      createUrl: (pid) => `/api/projects/${pid}/submittals`,
      createPayload: (title, pid) => ({
        projectId: pid,
        name: title,
      }),
      columns: [
        { key: "submittalNumber", label: "No." },
        { key: "name", label: "Name" },
        { key: "status", label: "Status" },
        { key: "submittalType", label: "Type" },
      ],
    };
  }

  const label =
    projectWorkspaceModules.find((x) => x.id === key)?.label ?? key;
  return {
    title: label,
    listUrl: (pid) => `/api/projects/${pid}/${key}`,
    createUrl: (pid) => `/api/projects/${pid}/${key}`,
    createPayload: (title) => ({ title }),
    columns: [
      { key: "title", label: "Title" },
      { key: "status", label: "Status" },
      { key: "createdAt", label: "Created" },
    ],
  };
}

function formatApiError(err: unknown): string {
  const anyErr = err as any;
  const msg = typeof anyErr?.message === "string" ? anyErr.message : "";

  if (!msg) return "Create failed";

  const idx = msg.indexOf(": ");
  const statusPart = idx >= 0 ? msg.slice(0, idx) : "";
  const bodyPart = idx >= 0 ? msg.slice(idx + 2) : msg;

  try {
    const parsed = JSON.parse(bodyPart);

    const issues =
      parsed?.issues ??
      parsed?.errors ??
      parsed?.details?.issues ??
      parsed?.details;

    if (Array.isArray(issues) && issues.length) {
      const lines = issues.slice(0, 8).map((i: any) => {
        const path = Array.isArray(i?.path) ? i.path.join(".") : i?.path;
        const m = i?.message ?? i?.msg ?? String(i);
        return path ? `${path}: ${m}` : m;
      });

      return statusPart ? `${statusPart}\n${lines.join("\n")}` : lines.join("\n");
    }

    const friendly =
      parsed?.error ??
      parsed?.message ??
      parsed?.detail ??
      parsed?.title;

    if (typeof friendly === "string" && friendly.trim()) {
      return statusPart ? `${statusPart}: ${friendly}` : friendly;
    }

    const compact = JSON.stringify(parsed);
    return statusPart ? `${statusPart}: ${compact}` : compact;
  } catch {
    return msg;
  }
}

function formatCell(value: any, key: string): string {
  if (value === null || value === undefined) return "\u2014";
  if (key === "createdAt" || key === "dueDate" || key === "invoiceDate") {
    try {
      return new Date(value).toLocaleDateString();
    } catch {
      return String(value);
    }
  }
  if (key === "totalAmount" || key === "amount" || key === "total") {
    const num = parseFloat(value);
    if (!isNaN(num)) return `$${num.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  }
  return String(value);
}

async function fetchJson(url: string) {
  const res = await fetch(url, { credentials: "include" });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

export default function ProjectModulePage() {
  const params = useParams() as { projectId: string; module: string };
  const { projectId } = params;
  const moduleKey = params.module as ProjectModuleKey;

  if (moduleKey === "documents" || moduleKey === "overview" || moduleKey === "takeoff") {
    return null;
  }

  const cfg = useMemo(() => moduleApi(moduleKey), [moduleKey]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");

  const listQ = useQuery<any[]>({
    queryKey: [cfg.listUrl(projectId)],
    queryFn: () => fetchJson(cfg.listUrl(projectId)),
  });

  const createM = useMutation({
    mutationFn: async () => {
      const t = title.trim();
      if (!t) throw new Error("Title required");
      return apiRequest("POST", cfg.createUrl(projectId), cfg.createPayload(t, projectId));
    },
    onSuccess: async () => {
      setOpen(false);
      setTitle("");
      await queryClient.invalidateQueries({ queryKey: [cfg.listUrl(projectId)] });
    },
  });

  return (
    <div className="p-4 space-y-4" data-testid={`module-page-${moduleKey}`}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold" data-testid="module-title">{cfg.title}</h1>
          <p className="text-sm text-muted-foreground">
            {listQ.data?.length ?? 0} records
          </p>
        </div>
        <Button onClick={() => setOpen(true)} data-testid={`button-create-${moduleKey}`}>
          <Plus className="h-4 w-4 mr-1" />
          Create
        </Button>
      </div>

      <Card className="p-0 overflow-hidden">
        {listQ.isLoading ? (
          <div className="p-4 space-y-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (listQ.data?.length ?? 0) === 0 ? (
          <div className="p-8 text-center">
            <p className="font-medium text-muted-foreground">No records yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Create the first {cfg.title.toLowerCase()} record for this project.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="module-table">
              <thead>
                <tr className="border-b bg-muted/50">
                  {cfg.columns.map((c) => (
                    <th
                      key={c.key}
                      className="text-left px-4 py-3 font-medium text-muted-foreground"
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {listQ.data!.map((row: any, idx: number) => (
                  <tr
                    key={row.id ?? idx}
                    className="border-b hover:bg-muted/30 transition-colors"
                    data-testid={`row-${row.id ?? idx}`}
                  >
                    {cfg.columns.map((c) => (
                      <td key={c.key} className="px-4 py-3">
                        {c.key === "status" ? (
                          <Badge variant="outline" className="capitalize" data-testid={`badge-status-${row.id}`}>
                            {String(row[c.key] ?? "\u2014")}
                          </Badge>
                        ) : (
                          formatCell(row[c.key], c.key)
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="dialog-create-module">
          <DialogHeader>
            <DialogTitle>Create {cfg.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title / Number"
              data-testid="input-create-title"
              onKeyDown={(e) => {
                if (e.key === "Enter" && title.trim() && !createM.isPending) {
                  e.preventDefault();
                  createM.mutate();
                }
              }}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)} data-testid="button-cancel-create">
                Cancel
              </Button>
              <Button
                onClick={() => createM.mutate()}
                disabled={createM.isPending || !title.trim()}
                data-testid="button-confirm-create"
              >
                {createM.isPending ? "Creating\u2026" : "Create"}
              </Button>
            </div>
            {createM.isError && (
              <pre className="text-sm text-destructive whitespace-pre-wrap" data-testid="create-error">
                {formatApiError(createM.error)}
              </pre>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
