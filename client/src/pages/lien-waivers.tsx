// Lien Waivers main page.
//
// Lists all waivers for the active tenant with stats, filters, and a
// table of row actions wired to the backend lifecycle. Supports creating
// new waivers, editing drafts, viewing the generated document, and
// transitioning state (send / sign / receive / void).

import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FileCheck,
  Plus,
  Send,
  CheckCircle2,
  Inbox,
  Ban,
  FileText,
  DollarSign,
  Eye,
} from "lucide-react";

type WaiverType =
  | "conditional_partial"
  | "unconditional_partial"
  | "conditional_final"
  | "unconditional_final";

type WaiverStatus = "draft" | "sent" | "signed" | "received" | "voided";

interface LienWaiver {
  id: string;
  tenantId: string;
  projectId: string;
  vendorId: string;
  payAppId: string | null;
  waiverNumber: string;
  waiverType: WaiverType;
  status: WaiverStatus;
  throughDate: string;
  paymentAmount: string;
  exceptionsJson: { description: string; amount: number }[] | null;
  signerName: string | null;
  signerTitle: string | null;
  signerEmail: string | null;
  sentAt: string | null;
  signedAt: string | null;
  receivedAt: string | null;
  voidedAt: string | null;
  expiresAt: string | null;
  notesText: string | null;
  createdAt: string;
  updatedAt: string;
}

interface WaiverStats {
  total: number;
  draft: number;
  sent: number;
  signed: number;
  received: number;
  voided: number;
  outstandingAmount: number;
}

interface ProjectLite {
  id: string;
  name: string;
  projectNumber: string;
}

interface VendorLite {
  id: string;
  companyName: string;
  vendorNumber: string;
}

const WAIVER_TYPE_LABELS: Record<WaiverType, string> = {
  conditional_partial: "Conditional · Partial",
  unconditional_partial: "Unconditional · Partial",
  conditional_final: "Conditional · Final",
  unconditional_final: "Unconditional · Final",
};

const STATUS_VARIANTS: Record<
  WaiverStatus,
  { label: string; className: string }
> = {
  draft: { label: "Draft", className: "bg-muted text-foreground" },
  sent: {
    label: "Sent",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  },
  signed: {
    label: "Signed",
    className:
      "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  },
  received: {
    label: "Received",
    className:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  },
  voided: {
    label: "Voided",
    className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  },
};

function formatMoney(s: string | number | null | undefined) {
  const n = typeof s === "number" ? s : parseFloat(s ?? "0");
  if (!Number.isFinite(n)) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(d?: string | null) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString();
  } catch {
    return d;
  }
}

export default function LienWaiversPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [filterStatus, setFilterStatus] = useState<WaiverStatus | "all">("all");
  const [filterType, setFilterType] = useState<WaiverType | "all">("all");
  const [filterProject, setFilterProject] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [docOpen, setDocOpen] = useState<string | null>(null);
  const [voidTarget, setVoidTarget] = useState<LienWaiver | null>(null);
  const [voidReason, setVoidReason] = useState("");

  // Data ----------------------------------------------------------------
  const waiversQ = useQuery<LienWaiver[]>({
    queryKey: ["/api/lien-waivers"],
  });
  const statsQ = useQuery<WaiverStats>({
    queryKey: ["/api/lien-waivers/stats"],
  });
  const projectsQ = useQuery<ProjectLite[]>({
    queryKey: ["/api/projects"],
  });
  const vendorsQ = useQuery<VendorLite[]>({
    queryKey: ["/api/vendors"],
  });

  const projectMap = useMemo(() => {
    const m = new Map<string, ProjectLite>();
    (projectsQ.data ?? []).forEach((p) => m.set(p.id, p));
    return m;
  }, [projectsQ.data]);
  const vendorMap = useMemo(() => {
    const m = new Map<string, VendorLite>();
    (vendorsQ.data ?? []).forEach((v) => m.set(v.id, v));
    return m;
  }, [vendorsQ.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (waiversQ.data ?? []).filter((w) => {
      if (filterStatus !== "all" && w.status !== filterStatus) return false;
      if (filterType !== "all" && w.waiverType !== filterType) return false;
      if (filterProject !== "all" && w.projectId !== filterProject) return false;
      if (!q) return true;
      const proj = projectMap.get(w.projectId)?.name ?? "";
      const vend = vendorMap.get(w.vendorId)?.companyName ?? "";
      return (
        w.waiverNumber.toLowerCase().includes(q) ||
        proj.toLowerCase().includes(q) ||
        vend.toLowerCase().includes(q)
      );
    });
  }, [waiversQ.data, search, filterStatus, filterType, filterProject, projectMap, vendorMap]);

  // Mutations -----------------------------------------------------------
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/lien-waivers"] });
    queryClient.invalidateQueries({ queryKey: ["/api/lien-waivers/stats"] });
  };

  const sendMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/lien-waivers/${id}/send`, {});
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Waiver sent for signature" });
    },
    onError: (e: Error) =>
      toast({ title: "Send failed", description: e.message, variant: "destructive" }),
  });

  const signMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/lien-waivers/${id}/sign`, {});
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Waiver marked signed" });
    },
    onError: (e: Error) =>
      toast({ title: "Sign failed", description: e.message, variant: "destructive" }),
  });

  const receiveMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/lien-waivers/${id}/receive`, {});
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Waiver received & filed" });
    },
    onError: (e: Error) =>
      toast({ title: "Receive failed", description: e.message, variant: "destructive" }),
  });

  const voidMut = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await apiRequest("POST", `/api/lien-waivers/${id}/void`, { reason });
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      setVoidTarget(null);
      setVoidReason("");
      toast({ title: "Waiver voided" });
    },
    onError: (e: Error) =>
      toast({ title: "Void failed", description: e.message, variant: "destructive" }),
  });

  // Render --------------------------------------------------------------
  return (
    <div className="flex flex-col h-full p-6 gap-6" data-testid="page-lien-waivers">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <FileCheck className="h-7 w-7 text-primary" />
            Lien Waivers
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage conditional & unconditional waivers for vendor payments.
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          data-testid="button-new-waiver"
        >
          <Plus className="h-4 w-4 mr-1" />
          New Waiver
        </Button>
      </header>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3" data-testid="row-waiver-stats">
        <StatCard label="Total" value={statsQ.data?.total ?? 0} testId="stat-total" />
        <StatCard label="Draft" value={statsQ.data?.draft ?? 0} testId="stat-draft" />
        <StatCard label="Sent" value={statsQ.data?.sent ?? 0} testId="stat-sent" tone="blue" />
        <StatCard label="Signed" value={statsQ.data?.signed ?? 0} testId="stat-signed" tone="amber" />
        <StatCard label="Received" value={statsQ.data?.received ?? 0} testId="stat-received" tone="emerald" />
        <StatCard
          label="Outstanding"
          value={formatMoney(statsQ.data?.outstandingAmount ?? 0)}
          testId="stat-outstanding"
          tone="red"
          icon={<DollarSign className="h-3.5 w-3.5" />}
        />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <Input
            placeholder="Search waiver #, project, vendor…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
            data-testid="input-search-waivers"
          />
          <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as WaiverStatus | "all")}>
            <SelectTrigger className="w-44" data-testid="select-filter-status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="signed">Signed</SelectItem>
              <SelectItem value="received">Received</SelectItem>
              <SelectItem value="voided">Voided</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterType} onValueChange={(v) => setFilterType(v as WaiverType | "all")}>
            <SelectTrigger className="w-56" data-testid="select-filter-type">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {(Object.keys(WAIVER_TYPE_LABELS) as WaiverType[]).map((t) => (
                <SelectItem key={t} value={t}>
                  {WAIVER_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterProject} onValueChange={setFilterProject}>
            <SelectTrigger className="w-56" data-testid="select-filter-project">
              <SelectValue placeholder="Project" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              {(projectsQ.data ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.projectNumber} — {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Table — scrollable inside its container */}
      <Card className="flex-1 min-h-0 flex flex-col">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {filtered.length} {filtered.length === 1 ? "waiver" : "waivers"}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 overflow-auto p-0">
          <Table data-testid="table-waivers">
            <TableHeader>
              <TableRow>
                <TableHead>Waiver #</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Through</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {waiversQ.isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={8}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8}>
                    <div className="py-12 text-center" data-testid="empty-state-waivers">
                      <FileCheck className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                      <div className="text-sm font-medium">No lien waivers yet</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Click "New Waiver" to create one.
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((w) => {
                  const sv = STATUS_VARIANTS[w.status];
                  const proj = projectMap.get(w.projectId);
                  const vend = vendorMap.get(w.vendorId);
                  return (
                    <TableRow key={w.id} data-testid={`row-waiver-${w.id}`}>
                      <TableCell className="font-mono text-xs">
                        {w.waiverNumber}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {proj?.name ?? w.projectId.slice(0, 8)}
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate">
                        {vend?.companyName ?? w.vendorId.slice(0, 8)}
                      </TableCell>
                      <TableCell>
                        <span className="text-xs">
                          {WAIVER_TYPE_LABELS[w.waiverType]}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatMoney(w.paymentAmount)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {formatDate(w.throughDate)}
                      </TableCell>
                      <TableCell>
                        <Badge className={sv.className} data-testid={`badge-status-${w.id}`}>
                          {sv.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDocOpen(w.id)}
                            data-testid={`button-view-${w.id}`}
                            title="View document"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {w.status === "draft" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => sendMut.mutate(w.id)}
                              disabled={sendMut.isPending}
                              data-testid={`button-send-${w.id}`}
                              title="Send for signature"
                            >
                              <Send className="h-4 w-4" />
                            </Button>
                          )}
                          {w.status === "sent" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => signMut.mutate(w.id)}
                              disabled={signMut.isPending}
                              data-testid={`button-sign-${w.id}`}
                              title="Mark signed"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                            </Button>
                          )}
                          {w.status === "signed" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => receiveMut.mutate(w.id)}
                              disabled={receiveMut.isPending}
                              data-testid={`button-receive-${w.id}`}
                              title="Mark received & file"
                            >
                              <Inbox className="h-4 w-4" />
                            </Button>
                          )}
                          {w.status !== "voided" && w.status !== "received" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setVoidTarget(w)}
                              data-testid={`button-void-${w.id}`}
                              title="Void waiver"
                            >
                              <Ban className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <CreateWaiverDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        projects={projectsQ.data ?? []}
        vendors={vendorsQ.data ?? []}
        onCreated={() => {
          invalidate();
          setCreateOpen(false);
          toast({ title: "Lien waiver draft created" });
        }}
      />

      <DocumentDialog
        waiverId={docOpen}
        onClose={() => setDocOpen(null)}
      />

      <Dialog
        open={!!voidTarget}
        onOpenChange={(o) => {
          if (!o) {
            setVoidTarget(null);
            setVoidReason("");
          }
        }}
      >
        <DialogContent data-testid="dialog-void">
          <DialogHeader>
            <DialogTitle>Void Lien Waiver</DialogTitle>
            <DialogDescription>
              Voiding {voidTarget?.waiverNumber}. This is permanent and audited.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="void-reason">Reason</Label>
            <Textarea
              id="void-reason"
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="e.g., signer disputes amount, replaced by amended waiver…"
              data-testid="textarea-void-reason"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setVoidTarget(null);
                setVoidReason("");
              }}
              data-testid="button-cancel-void"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={voidMut.isPending || !voidTarget}
              onClick={() =>
                voidTarget &&
                voidMut.mutate({
                  id: voidTarget.id,
                  reason: voidReason || "voided",
                })
              }
              data-testid="button-confirm-void"
            >
              {voidMut.isPending ? "Voiding…" : "Void Waiver"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({
  label,
  value,
  testId,
  tone = "default",
  icon,
}: {
  label: string;
  value: number | string;
  testId: string;
  tone?: "default" | "blue" | "amber" | "emerald" | "red";
  icon?: React.ReactNode;
}) {
  const toneClass: Record<string, string> = {
    default: "text-foreground",
    blue: "text-blue-600 dark:text-blue-400",
    amber: "text-amber-600 dark:text-amber-400",
    emerald: "text-emerald-600 dark:text-emerald-400",
    red: "text-red-600 dark:text-red-400",
  };
  return (
    <Card data-testid={`card-${testId}`}>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
          {icon}
          {label}
        </div>
        <div className={`text-2xl font-bold mt-1 ${toneClass[tone]}`} data-testid={`text-${testId}`}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function CreateWaiverDialog({
  open,
  onOpenChange,
  projects,
  vendors,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projects: ProjectLite[];
  vendors: VendorLite[];
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [projectId, setProjectId] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [waiverType, setWaiverType] = useState<WaiverType>("conditional_partial");
  const [throughDate, setThroughDate] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [paymentAmount, setPaymentAmount] = useState("");
  const [signerName, setSignerName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [notesText, setNotesText] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/lien-waivers", {
        projectId,
        vendorId,
        waiverType,
        throughDate: new Date(throughDate).toISOString(),
        paymentAmount,
        signerName: signerName || null,
        signerEmail: signerEmail || null,
        notesText: notesText || null,
      });
      return res.json();
    },
    onSuccess: () => {
      setProjectId("");
      setVendorId("");
      setWaiverType("conditional_partial");
      setPaymentAmount("");
      setSignerName("");
      setSignerEmail("");
      setNotesText("");
      onCreated();
    },
    onError: (e: Error) =>
      toast({ title: "Create failed", description: e.message, variant: "destructive" }),
  });

  const valid = projectId && vendorId && paymentAmount && throughDate;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="dialog-create-waiver">
        <DialogHeader>
          <DialogTitle>New Lien Waiver</DialogTitle>
          <DialogDescription>
            Create a draft waiver. You can edit and send it from the table.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>Project</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger data-testid="select-create-project">
                <SelectValue placeholder="Select project…" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.projectNumber} — {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Vendor / Subcontractor</Label>
            <Select value={vendorId} onValueChange={setVendorId}>
              <SelectTrigger data-testid="select-create-vendor">
                <SelectValue placeholder="Select vendor…" />
              </SelectTrigger>
              <SelectContent>
                {vendors.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.companyName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Waiver Type</Label>
            <Select value={waiverType} onValueChange={(v) => setWaiverType(v as WaiverType)}>
              <SelectTrigger data-testid="select-create-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(WAIVER_TYPE_LABELS) as WaiverType[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {WAIVER_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="lw-amount">Payment Amount</Label>
              <Input
                id="lw-amount"
                type="number"
                step="0.01"
                min="0"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="0.00"
                data-testid="input-create-amount"
              />
            </div>
            <div>
              <Label htmlFor="lw-through">Through Date</Label>
              <Input
                id="lw-through"
                type="date"
                value={throughDate}
                onChange={(e) => setThroughDate(e.target.value)}
                data-testid="input-create-through"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="lw-signer">Signer Name</Label>
              <Input
                id="lw-signer"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="Optional"
                data-testid="input-create-signer"
              />
            </div>
            <div>
              <Label htmlFor="lw-email">Signer Email</Label>
              <Input
                id="lw-email"
                type="email"
                value={signerEmail}
                onChange={(e) => setSignerEmail(e.target.value)}
                placeholder="Optional"
                data-testid="input-create-email"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="lw-notes">Notes (optional)</Label>
            <Textarea
              id="lw-notes"
              value={notesText}
              onChange={(e) => setNotesText(e.target.value)}
              placeholder="Reference PO, change order #, exceptions…"
              data-testid="textarea-create-notes"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-create">
            Cancel
          </Button>
          <Button
            onClick={() => create.mutate()}
            disabled={!valid || create.isPending}
            data-testid="button-submit-create"
          >
            {create.isPending ? "Creating…" : "Create Draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DocumentDialog({
  waiverId,
  onClose,
}: {
  waiverId: string | null;
  onClose: () => void;
}) {
  const docQ = useQuery<{ text: string }>({
    queryKey: ["/api/lien-waivers", waiverId, "document"],
    queryFn: async () => {
      const res = await fetch(`/api/lien-waivers/${waiverId}/document`);
      if (!res.ok) throw new Error("doc load failed");
      return res.json();
    },
    enabled: !!waiverId,
  });

  return (
    <Dialog open={!!waiverId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl" data-testid="dialog-document">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Waiver Document
          </DialogTitle>
        </DialogHeader>
        {docQ.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : docQ.error ? (
          <div className="text-sm text-destructive" data-testid="text-doc-error">
            Failed to load document.
          </div>
        ) : (
          <pre
            className="text-xs whitespace-pre-wrap font-mono bg-muted p-4 rounded max-h-[60vh] overflow-auto"
            data-testid="text-document-body"
          >
            {docQ.data?.text}
          </pre>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-close-doc">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
