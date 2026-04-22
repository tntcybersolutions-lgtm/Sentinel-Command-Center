import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  Filter,
  Brain,
  Plus,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Archive,
  Send,
  Shield,
  Tag,
  FileText,
  Link2,
  Loader2,
  ArrowUpDown,
  X,
  Eye,
  ChevronDown,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const CATEGORIES = [
  { value: "general", label: "General" },
  { value: "win_theme", label: "Win Theme" },
  { value: "past_perf", label: "Past Performance" },
  { value: "pricing", label: "Pricing" },
  { value: "risk", label: "Risk" },
  { value: "template", label: "Template" },
  { value: "policy", label: "Policy" },
  { value: "capability", label: "Capability" },
  { value: "compliance", label: "Compliance" },
];

const SENSITIVITIES = [
  { value: "public", label: "Public" },
  { value: "internal", label: "Internal" },
  { value: "confidential", label: "Confidential" },
];

interface OrgMemoryItem {
  id: string;
  tenantId: string;
  title: string;
  summary: string;
  body: string;
  category: string;
  sensitivity: string;
  status: string;
  requiresApproval: boolean;
  approvedAt: string | null;
  approvedBy: string | null;
  tagsJson: string[];
  metaJson: any;
  searchText: string;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface OrgMemoryApproval {
  id: string;
  memoryItemId: string;
  proposedTitle: string;
  proposedSummary: string;
  proposedBody: string;
  proposedCategory: string;
  proposedSensitivity: string;
  status: string;
  reviewerNote: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  createdAt: string;
}

function statusIcon(status: string) {
  switch (status) {
    case "approved": return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case "pending": return <Clock className="h-4 w-4 text-yellow-500" />;
    case "rejected": return <XCircle className="h-4 w-4 text-red-500" />;
    case "archived": return <Archive className="h-4 w-4 text-muted-foreground" />;
    default: return <FileText className="h-4 w-4 text-muted-foreground" />;
  }
}

function statusBadge(status: string) {
  const variant = status === "approved" ? "default" : status === "pending" ? "secondary" : status === "rejected" ? "destructive" : "outline";
  return <Badge variant={variant} data-testid={`badge-status-${status}`}>{(status || "draft").charAt(0).toUpperCase() + (status || "draft").slice(1)}</Badge>;
}

function categoryLabel(cat: string) {
  return CATEGORIES.find(c => c.value === cat)?.label || cat;
}

function sensitivityBadge(sens: string) {
  if (sens === "confidential") return <Badge variant="destructive"><Shield className="h-3 w-3 mr-1" />{sens}</Badge>;
  if (sens === "internal") return <Badge variant="secondary"><Shield className="h-3 w-3 mr-1" />{sens}</Badge>;
  return <Badge variant="outline">{sens}</Badge>;
}

function formatDate(d: string | null) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function OrgBrain() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [selected, setSelected] = useState<OrgMemoryItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [sortField, setSortField] = useState<"title" | "category" | "status" | "updatedAt">("updatedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [formTitle, setFormTitle] = useState("");
  const [formSummary, setFormSummary] = useState("");
  const [formBody, setFormBody] = useState("");
  const [formCategory, setFormCategory] = useState("general");
  const [formSensitivity, setFormSensitivity] = useState("internal");
  const [formTags, setFormTags] = useState("");

  const queryParams = new URLSearchParams();
  if (search) queryParams.set("q", search);
  if (statusFilter) queryParams.set("status", statusFilter);
  if (categoryFilter) queryParams.set("category", categoryFilter);

  const { data, isLoading, refetch } = useQuery<{ items: OrgMemoryItem[] }>({
    queryKey: ["/api/v4/org-memory", search, statusFilter, categoryFilter],
    queryFn: () => fetch(`/api/v4/org-memory?${queryParams.toString()}`).then(r => r.json()),
  });

  const { data: approvalsData } = useQuery<{ approvals: OrgMemoryApproval[] }>({
    queryKey: ["/api/v4/org-memory", selected?.id, "approvals"],
    queryFn: () => fetch(`/api/v4/org-memory/${selected?.id}/approvals`).then(r => r.json()),
    enabled: !!selected?.id,
  });

  const createMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/v4/org-memory", body),
    onSuccess: () => {
      toast({ title: "Memory item created" });
      queryClient.invalidateQueries({ queryKey: ["/api/v4/org-memory"] });
      setCreating(false);
      resetForm();
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }: any) => apiRequest("PATCH", `/api/v4/org-memory/${id}`, body),
    onSuccess: (_, vars) => {
      toast({ title: "Updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/v4/org-memory"] });
      if (selected) fetchDetail(vars.id);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const submitMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/v4/org-memory/${id}/submit`, {}),
    onSuccess: (_, id) => {
      toast({ title: "Submitted for approval" });
      queryClient.invalidateQueries({ queryKey: ["/api/v4/org-memory"] });
      fetchDetail(id);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, approvalId }: { id: string; approvalId: string }) =>
      apiRequest("POST", `/api/v4/org-memory/${id}/approve`, { approvalId }),
    onSuccess: (_, vars) => {
      toast({ title: "Approved" });
      queryClient.invalidateQueries({ queryKey: ["/api/v4/org-memory"] });
      fetchDetail(vars.id);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, approvalId }: { id: string; approvalId: string }) =>
      apiRequest("POST", `/api/v4/org-memory/${id}/reject`, { approvalId }),
    onSuccess: (_, vars) => {
      toast({ title: "Rejected" });
      queryClient.invalidateQueries({ queryKey: ["/api/v4/org-memory"] });
      fetchDetail(vars.id);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/v4/org-memory/${id}/archive`, {}),
    onSuccess: (_, id) => {
      toast({ title: "Archived" });
      queryClient.invalidateQueries({ queryKey: ["/api/v4/org-memory"] });
      setDrawerOpen(false);
      setSelected(null);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  async function fetchDetail(id: string) {
    const r = await fetch(`/api/v4/org-memory/${id}`);
    const j = await r.json();
    if (j.item) setSelected(j.item);
  }

  function resetForm() {
    setFormTitle("");
    setFormSummary("");
    setFormBody("");
    setFormCategory("general");
    setFormSensitivity("internal");
    setFormTags("");
  }

  function openCreate() {
    resetForm();
    setCreating(true);
    setSelected(null);
    setDrawerOpen(true);
  }

  function openDetail(item: OrgMemoryItem) {
    setCreating(false);
    setSelected(item);
    setFormTitle(item.title);
    setFormSummary(item.summary || "");
    setFormBody(item.body || "");
    setFormCategory(item.category || "general");
    setFormSensitivity(item.sensitivity || "internal");
    setFormTags(Array.isArray(item.tagsJson) ? item.tagsJson.join(", ") : "");
    setDrawerOpen(true);
  }

  function handleCreate() {
    const tags = formTags.split(",").map(t => t.trim()).filter(Boolean);
    createMutation.mutate({
      title: formTitle,
      summary: formSummary,
      body: formBody,
      category: formCategory,
      sensitivity: formSensitivity,
      tagsJson: tags,
    });
  }

  function handleUpdate() {
    if (!selected) return;
    const tags = formTags.split(",").map(t => t.trim()).filter(Boolean);
    updateMutation.mutate({
      id: selected.id,
      title: formTitle,
      summary: formSummary,
      body: formBody,
      category: formCategory,
      sensitivity: formSensitivity,
      tagsJson: tags,
    });
  }

  function toggleSort(field: typeof sortField) {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  }

  const items = useMemo(() => {
    const list = data?.items || [];
    return [...list].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortField === "updatedAt") return dir * ((a.updatedAt || "").localeCompare(b.updatedAt || ""));
      if (sortField === "title") return dir * ((a.title || "").localeCompare(b.title || ""));
      if (sortField === "category") return dir * ((a.category || "").localeCompare(b.category || ""));
      if (sortField === "status") return dir * ((a.status || "").localeCompare(b.status || ""));
      return 0;
    });
  }, [data?.items, sortField, sortDir]);

  const pendingApproval = (approvalsData?.approvals || []).find(a => a.status === "pending");

  return (
    <div className="flex flex-col h-full" data-testid="page-org-brain">
      <div className="flex items-center justify-between gap-2 p-4 border-b flex-wrap">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Knowledge Base</h1>
          <Badge variant="outline" data-testid="badge-item-count">{items.length} items</Badge>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search memory..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 w-60"
              data-testid="input-search"
            />
          </div>
          <Select value={statusFilter} onValueChange={v => setStatusFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-32" data-testid="select-status-filter">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={v => setCategoryFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-36" data-testid="select-category-filter">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {CATEGORIES.map(c => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={openCreate} data-testid="button-create-memory">
            <Plus className="h-4 w-4 mr-1" />
            New
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground" data-testid="text-empty-state">
            <Brain className="h-12 w-12 mb-3 opacity-50" />
            <p className="text-sm">No memory items found</p>
            <Button variant="outline" className="mt-3" onClick={openCreate} data-testid="button-create-first">
              Create your first item
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer" onClick={() => toggleSort("title")} data-testid="header-title">
                  <div className="flex items-center gap-1">Title <ArrowUpDown className="h-3 w-3" /></div>
                </TableHead>
                <TableHead className="cursor-pointer" onClick={() => toggleSort("category")} data-testid="header-category">
                  <div className="flex items-center gap-1">Category <ArrowUpDown className="h-3 w-3" /></div>
                </TableHead>
                <TableHead>Sensitivity</TableHead>
                <TableHead className="cursor-pointer" onClick={() => toggleSort("status")} data-testid="header-status">
                  <div className="flex items-center gap-1">Status <ArrowUpDown className="h-3 w-3" /></div>
                </TableHead>
                <TableHead>Tags</TableHead>
                <TableHead className="cursor-pointer" onClick={() => toggleSort("updatedAt")} data-testid="header-updated">
                  <div className="flex items-center gap-1">Updated <ArrowUpDown className="h-3 w-3" /></div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow
                  key={item.id}
                  className="cursor-pointer"
                  onClick={() => openDetail(item)}
                  data-testid={`row-memory-${item.id}`}
                >
                  <TableCell className="font-medium max-w-xs truncate" data-testid={`text-title-${item.id}`}>
                    <div className="flex items-center gap-2">
                      {statusIcon(item.status)}
                      <span className="truncate">{item.title || "Untitled"}</span>
                    </div>
                  </TableCell>
                  <TableCell data-testid={`text-category-${item.id}`}>
                    <Badge variant="outline">{categoryLabel(item.category)}</Badge>
                  </TableCell>
                  <TableCell>{sensitivityBadge(item.sensitivity)}</TableCell>
                  <TableCell>{statusBadge(item.status)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {(Array.isArray(item.tagsJson) ? item.tagsJson : []).slice(0, 3).map((t: string, i: number) => (
                        <Badge key={i} variant="outline" className="text-xs">{t}</Badge>
                      ))}
                      {(Array.isArray(item.tagsJson) ? item.tagsJson : []).length > 3 && (
                        <Badge variant="outline" className="text-xs">+{(item.tagsJson as string[]).length - 3}</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm" data-testid={`text-updated-${item.id}`}>
                    {formatDate(item.updatedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto" data-testid="drawer-memory">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              {creating ? "New Memory Item" : (selected?.title || "Memory Item")}
            </SheetTitle>
          </SheetHeader>

          <Separator className="my-4" />

          {creating ? (
            <div className="space-y-4">
              <div>
                <Label>Title</Label>
                <Input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="e.g., SDVOSB Capability Statement" data-testid="input-form-title" />
              </div>
              <div>
                <Label>Summary</Label>
                <Input value={formSummary} onChange={e => setFormSummary(e.target.value)} placeholder="Brief description" data-testid="input-form-summary" />
              </div>
              <div>
                <Label>Body</Label>
                <Textarea value={formBody} onChange={e => setFormBody(e.target.value)} rows={6} placeholder="Full content..." data-testid="input-form-body" />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <Label>Category</Label>
                  <Select value={formCategory} onValueChange={setFormCategory}>
                    <SelectTrigger data-testid="select-form-category"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1">
                  <Label>Sensitivity</Label>
                  <Select value={formSensitivity} onValueChange={setFormSensitivity}>
                    <SelectTrigger data-testid="select-form-sensitivity"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SENSITIVITIES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Tags (comma-separated)</Label>
                <Input value={formTags} onChange={e => setFormTags(e.target.value)} placeholder="construction, federal, SDVOSB" data-testid="input-form-tags" />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => { setCreating(false); setDrawerOpen(false); }} data-testid="button-cancel-create">Cancel</Button>
                <Button onClick={handleCreate} disabled={createMutation.isPending || !formTitle.trim()} data-testid="button-save-create">
                  {createMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Create
                </Button>
              </div>
            </div>
          ) : selected ? (
            <Tabs defaultValue="details">
              <TabsList className="w-full flex-wrap h-auto gap-1 p-1" data-testid="tabs-memory">
                <TabsTrigger value="details" data-testid="tab-details">Overview</TabsTrigger>
                <TabsTrigger value="approvals" data-testid="tab-approvals">
                  Approval {(approvalsData?.approvals || []).length > 0 && `(${approvalsData?.approvals.length})`}
                </TabsTrigger>
                <TabsTrigger value="linked-docs" data-testid="tab-linked-docs">Linked Docs</TabsTrigger>
                <TabsTrigger value="ai-rag" data-testid="tab-ai-rag">AI/RAG</TabsTrigger>
                <TabsTrigger value="activity" data-testid="tab-activity">Activity</TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="space-y-4 mt-4">
                <div className="flex items-center gap-2 flex-wrap">
                  {statusBadge(selected.status)}
                  {sensitivityBadge(selected.sensitivity)}
                  <Badge variant="outline">{categoryLabel(selected.category)}</Badge>
                </div>

                <div>
                  <Label>Title</Label>
                  <Input value={formTitle} onChange={e => setFormTitle(e.target.value)} data-testid="input-edit-title" />
                </div>
                <div>
                  <Label>Summary</Label>
                  <Input value={formSummary} onChange={e => setFormSummary(e.target.value)} data-testid="input-edit-summary" />
                </div>
                <div>
                  <Label>Body</Label>
                  <Textarea value={formBody} onChange={e => setFormBody(e.target.value)} rows={8} data-testid="input-edit-body" />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <Label>Category</Label>
                    <Select value={formCategory} onValueChange={setFormCategory}>
                      <SelectTrigger data-testid="select-edit-category"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1">
                    <Label>Sensitivity</Label>
                    <Select value={formSensitivity} onValueChange={setFormSensitivity}>
                      <SelectTrigger data-testid="select-edit-sensitivity"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SENSITIVITIES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Tags (comma-separated)</Label>
                  <Input value={formTags} onChange={e => setFormTags(e.target.value)} data-testid="input-edit-tags" />
                </div>

                <Separator />

                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    onClick={handleUpdate}
                    disabled={updateMutation.isPending}
                    data-testid="button-save-edit"
                  >
                    {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                    Save Changes
                  </Button>

                  {(selected.status === "draft" || selected.status === "rejected") && (
                    <Button
                      onClick={() => submitMutation.mutate(selected.id)}
                      disabled={submitMutation.isPending}
                      data-testid="button-submit-approval"
                    >
                      {submitMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                      <Send className="h-4 w-4 mr-1" />
                      Submit for Approval
                    </Button>
                  )}

                  {selected.status === "pending" && pendingApproval && (
                    <>
                      <Button
                        onClick={() => approveMutation.mutate({ id: selected.id, approvalId: pendingApproval.id })}
                        disabled={approveMutation.isPending}
                        data-testid="button-approve"
                      >
                        {approveMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                        <CheckCircle2 className="h-4 w-4 mr-1" />
                        Approve
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => rejectMutation.mutate({ id: selected.id, approvalId: pendingApproval.id })}
                        disabled={rejectMutation.isPending}
                        data-testid="button-reject"
                      >
                        {rejectMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                        <XCircle className="h-4 w-4 mr-1" />
                        Reject
                      </Button>
                    </>
                  )}

                  {selected.status !== "archived" && (
                    <Button
                      variant="outline"
                      onClick={() => archiveMutation.mutate(selected.id)}
                      disabled={archiveMutation.isPending}
                      data-testid="button-archive"
                    >
                      <Archive className="h-4 w-4 mr-1" />
                      Archive
                    </Button>
                  )}
                </div>

                <div className="text-xs text-muted-foreground space-y-1 mt-4">
                  <p>Created: {formatDate(selected.createdAt)}</p>
                  <p>Updated: {formatDate(selected.updatedAt)}</p>
                  {selected.approvedAt && <p>Approved: {formatDate(selected.approvedAt)}</p>}
                </div>
              </TabsContent>

              <TabsContent value="approvals" className="mt-4">
                {(approvalsData?.approvals || []).length === 0 ? (
                  <div className="text-center text-muted-foreground py-8" data-testid="text-no-approvals">
                    <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No approval history</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {(approvalsData?.approvals || []).map((a) => (
                      <Card key={a.id}>
                        <CardContent className="p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            {statusBadge(a.status)}
                            <span className="text-xs text-muted-foreground">{formatDate(a.createdAt)}</span>
                          </div>
                          <p className="text-sm font-medium">{a.proposedTitle}</p>
                          {a.proposedSummary && <p className="text-xs text-muted-foreground">{a.proposedSummary}</p>}
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">{a.proposedCategory}</Badge>
                            <Badge variant="outline" className="text-xs">{a.proposedSensitivity}</Badge>
                          </div>
                          {a.reviewerNote && (
                            <p className="text-xs border-l-2 pl-2 text-muted-foreground italic">{a.reviewerNote}</p>
                          )}
                          {a.reviewedAt && (
                            <p className="text-xs text-muted-foreground">Reviewed: {formatDate(a.reviewedAt)}</p>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="linked-docs" className="mt-4">
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">Documents linked to this memory item</p>
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground" data-testid="linked-docs-empty">
                    <FileText className="h-8 w-8 mb-2 opacity-40" />
                    <p className="text-sm">No linked documents yet</p>
                    <p className="text-xs mt-1">Documents will appear here when attached to this memory item</p>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="ai-rag" className="mt-4">
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">AI embeddings and RAG indexing status</p>
                  <Card>
                    <CardContent className="p-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Embedding Status</span>
                        <Badge variant={selected.status === "approved" ? "default" : "outline"} data-testid="badge-embedding-status">
                          {selected.status === "approved" ? "Indexed" : "Not indexed"}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Search Text</span>
                        <Badge variant={selected.searchText ? "default" : "outline"} data-testid="badge-search-text">
                          {selected.searchText ? "Generated" : "Pending"}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Category</span>
                        <Badge variant="outline">{categoryLabel(selected.category)}</Badge>
                      </div>
                    </CardContent>
                  </Card>
                  <p className="text-xs text-muted-foreground">
                    Items are automatically indexed for RAG retrieval once approved. HERBIE uses these entries to enhance proposal generation and strategic recommendations.
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="activity" className="mt-4">
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">Activity timeline for this memory item</p>
                  <div className="space-y-3" data-testid="activity-timeline">
                    <div className="flex items-start gap-3">
                      <div className="mt-1 h-2 w-2 rounded-full bg-green-500 shrink-0" />
                      <div>
                        <p className="text-sm">Created</p>
                        <p className="text-xs text-muted-foreground">{formatDate(selected.createdAt)}</p>
                      </div>
                    </div>
                    {selected.updatedAt !== selected.createdAt && (
                      <div className="flex items-start gap-3">
                        <div className="mt-1 h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                        <div>
                          <p className="text-sm">Last Updated</p>
                          <p className="text-xs text-muted-foreground">{formatDate(selected.updatedAt)}</p>
                        </div>
                      </div>
                    )}
                    {selected.approvedAt && (
                      <div className="flex items-start gap-3">
                        <div className="mt-1 h-2 w-2 rounded-full bg-green-500 shrink-0" />
                        <div>
                          <p className="text-sm">Approved</p>
                          <p className="text-xs text-muted-foreground">{formatDate(selected.approvedAt)}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
