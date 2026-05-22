import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { FileCheck, Plus, Search, Building2, Calendar, AlertCircle, CheckCircle2, X, ChevronRight, Send, RotateCcw, Pencil, History, Paperclip, Layers, User, FileText, RefreshCw } from "lucide-react";

interface Submittal {
  id: string; submittalNumber: string; name: string; projectId: string; projectName?: string;
  revision: number; status: string; priority: string; submittalType?: string; description?: string;
  managerName?: string; contractorName?: string; approvers?: string; reference?: string;
  specSection?: string; approver?: string; dueDate?: string | null;
  revisionHistory?: { revision: number; status: string; at: string; note?: string }[];
  attachments?: { name: string; url?: string; size?: number }[];
  createdAt: string; updatedAt?: string;
}
interface Project { id: string; name: string; }

const STATUS_TONES: Record<string,string> = { draft:"bg-slate-500/15 text-slate-300 border-slate-500/30", submitted:"bg-blue-500/15 text-blue-300 border-blue-500/30", pending_review:"bg-amber-500/15 text-amber-300 border-amber-500/30", approved:"bg-emerald-500/15 text-emerald-300 border-emerald-500/30", approved_as_noted:"bg-emerald-500/15 text-emerald-200 border-emerald-500/30", revise_resubmit:"bg-orange-500/15 text-orange-300 border-orange-500/30", rejected:"bg-red-500/15 text-red-300 border-red-500/30", closed:"bg-slate-600/20 text-slate-400 border-slate-600/30" };
const PRIORITY_TONES: Record<string,string> = { low:"bg-slate-500/15 text-slate-300 border-slate-500/30", medium:"bg-blue-500/15 text-blue-300 border-blue-500/30", high:"bg-amber-500/15 text-amber-300 border-amber-500/30", urgent:"bg-red-500/15 text-red-300 border-red-500/30" };
function StatusBadge({ status }: { status: string }) { const cls = STATUS_TONES[status] ?? STATUS_TONES.draft; return <Badge variant="outline" className={`${cls} capitalize text-[10px]`}>{status.replace(/_/g," ")}</Badge>; }
const fmtDate = (d?: string | null) => { if (!d) return "—"; const dt = new Date(d); return isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); };
const isOverdue = (s: Submittal) => { if (!s.dueDate) return false; const d = new Date(s.dueDate); return !isNaN(d.getTime()) && d < new Date() && !["approved","approved_as_noted","closed","rejected"].includes(s.status); };

export default function ExecutionSubmittals() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Submittal | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ id: string; status: string; label: string } | null>(null);

  const { data: projects = [] } = useQuery<Project[]>({ queryKey: ["/api/projects"], queryFn: async () => { const r = await fetch("/api/projects"); if (!r.ok) return []; return r.json(); }, staleTime: 60_000 });
  const { data: subs = [], isLoading, isError, refetch } = useQuery<Submittal[]>({ queryKey: ["/api/submittals"], queryFn: async () => { const r = await fetch("/api/submittals"); if (!r.ok) throw new Error("Failed to load submittals"); return r.json(); }, staleTime: 30_000 });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Submittal> }) => apiRequest("PATCH", `/api/submittals/${id}`, updates),
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/submittals"] });
      const prev = queryClient.getQueryData<Submittal[]>(["/api/submittals"]);
      queryClient.setQueryData<Submittal[]>(["/api/submittals"], (old = []) => old.map(s => s.id === id ? { ...s, ...updates } : s));
      return { prev };
    },
    onError: (e: any, _v, ctx: any) => { if (ctx?.prev) queryClient.setQueryData(["/api/submittals"], ctx.prev); toast({ title: "Update failed", description: e?.message, variant: "destructive" }); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/submittals"] }); queryClient.invalidateQueries({ queryKey: ["/api/nav-counts"] }); toast({ title: "Submittal updated" }); },
  });
  const createMutation = useMutation({
    mutationFn: async (s: Partial<Submittal>) => apiRequest("POST", "/api/submittals", s),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/submittals"] }); queryClient.invalidateQueries({ queryKey: ["/api/nav-counts"] }); toast({ title: "Submittal created" }); setCreateOpen(false); },
    onError: (e: any) => toast({ title: "Create failed", description: e?.message ?? "Server rejected the request", variant: "destructive" }),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return subs.filter(s => {
      if (projectFilter !== "all" && s.projectId !== projectFilter) return false;
      if (statusFilter === "overdue" ? !isOverdue(s) : statusFilter !== "all" && s.status !== statusFilter) return false;
      if (q && !`${s.submittalNumber} ${s.name} ${s.description ?? ""} ${s.specSection ?? ""} ${s.contractorName ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [subs, search, statusFilter, projectFilter]);

  const counts = useMemo(() => {
    const scope = projectFilter === "all" ? subs : subs.filter(s => s.projectId === projectFilter);
    const c: Record<string, number> = { all: scope.length, overdue: scope.filter(isOverdue).length };
    for (const s of scope) c[s.status] = (c[s.status] ?? 0) + 1;
    return c;
  }, [subs, projectFilter]);

  return (
    <div className="space-y-4 p-4 md:p-6" data-testid="page-execution-submittals">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-bold flex items-center gap-2"><FileCheck className="h-6 w-6 text-emerald-400" />Submittals{counts.overdue > 0 && <Badge variant="outline" className="bg-red-500/15 text-red-300 border-red-500/30 ml-2">{counts.overdue} overdue</Badge>}</h1><p className="text-sm text-muted-foreground">Track product data, shop drawings, and material samples through architect approval</p></div>
        <div className="flex items-center gap-2"><Button variant="ghost" size="sm" onClick={() => refetch()} className="gap-2" data-testid="button-refresh"><RefreshCw className="h-4 w-4" /></Button><Button onClick={() => setCreateOpen(true)} className="gap-2" data-testid="button-new-submittal"><Plus className="h-4 w-4" />New Submittal</Button></div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px]"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Search by number, name, spec, contractor…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" data-testid="input-search" /></div>
        <Select value={projectFilter} onValueChange={setProjectFilter}><SelectTrigger className="w-[220px]" data-testid="select-project-filter"><Building2 className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" /><SelectValue placeholder="All projects" /></SelectTrigger><SelectContent><SelectItem value="all">All projects ({subs.length})</SelectItem>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap text-xs">
        {[{ k: "all", l: "All" },{ k: "draft", l: "Draft" },{ k: "submitted", l: "Submitted" },{ k: "pending_review", l: "Pending review" },{ k: "approved", l: "Approved" },{ k: "revise_resubmit", l: "Revise" },{ k: "rejected", l: "Rejected" },{ k: "overdue", l: "Overdue" }].map(f => (
          <button key={f.k} onClick={() => setStatusFilter(f.k)} data-testid={`chip-${f.k}`} className={`px-2.5 py-1 rounded-full border transition-colors ${statusFilter === f.k ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" : "bg-white/[0.02] text-muted-foreground border-white/10 hover:border-white/20"}`}>{f.l}{counts[f.k] != null && <span className="ml-1.5 text-[10px] opacity-70">{counts[f.k]}</span>}</button>
        ))}
      </div>
      <Card><CardHeader className="py-2 px-4 border-b border-white/10"><CardTitle className="text-xs font-medium text-muted-foreground grid grid-cols-12 gap-3"><span className="col-span-2">Number / Spec</span><span className="col-span-4">Name</span><span className="col-span-2">Contractor</span><span className="col-span-2">Due</span><span className="col-span-1">Rev</span><span className="col-span-1 text-right">Status</span></CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading && <div className="px-6 py-12 text-center text-sm text-muted-foreground">Loading submittals…</div>}
          {isError && <div className="px-6 py-12 text-center text-sm"><p className="text-red-400 mb-2">Couldn't load submittals</p><Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button></div>}
          {!isLoading && !isError && filtered.length === 0 && <div className="px-6 py-12 text-center text-sm text-muted-foreground">{search ? "No submittals match your search." : projectFilter !== "all" ? "No submittals for this project yet." : "No submittals yet. Click “New Submittal” to create one."}</div>}
          {!isLoading && filtered.map((s) => { const overdue = isOverdue(s); return (
            <button key={s.id} onClick={() => setSelected(s)} className="group w-full grid grid-cols-12 gap-3 px-4 py-3 border-b last:border-b-0 border-white/10 text-left hover:bg-white/[0.03] transition-colors" data-testid={`row-submittal-${s.submittalNumber}`}>
              <div className="col-span-12 md:col-span-2 font-mono text-xs font-semibold text-emerald-300">{s.submittalNumber}{s.specSection && <span className="block text-[10px] text-muted-foreground font-normal mt-0.5">§ {s.specSection}</span>}</div>
              <div className="col-span-12 md:col-span-4"><p className="text-sm font-medium truncate">{s.name}</p>{s.submittalType && <p className="text-xs text-muted-foreground line-clamp-1">{s.submittalType}</p>}{s.projectName && projectFilter === "all" && <p className="text-[10px] text-muted-foreground mt-0.5"><Building2 className="h-2.5 w-2.5 inline mr-0.5" />{s.projectName}</p>}</div>
              <div className="col-span-6 md:col-span-2 text-xs">{s.contractorName ? <span className="flex items-center gap-1"><User className="h-3 w-3" />{s.contractorName}</span> : <span className="text-muted-foreground italic">Unassigned</span>}</div>
              <div className={`col-span-6 md:col-span-2 text-xs ${overdue ? "text-red-400 font-semibold" : "text-muted-foreground"}`}><Calendar className="h-3 w-3 inline mr-1" />{fmtDate(s.dueDate)}{overdue && <span className="ml-1">• Overdue</span>}</div>
              <div className="col-span-6 md:col-span-1 text-xs"><Badge variant="outline" className="text-[10px] font-mono">R{s.revision ?? 0}</Badge></div>
              <div className="col-span-6 md:col-span-1 flex items-center justify-end gap-1"><StatusBadge status={overdue ? "overdue" : s.status} /><ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground hidden md:inline" /></div>
            </button>
          ); })}
        </CardContent></Card>
      <SubmittalSheet sub={selected} onClose={() => setSelected(null)} onSave={(id, updates) => updateMutation.mutate({ id, updates })} saving={updateMutation.isPending} onConfirmAction={(id, status, label) => setConfirmAction({ id, status, label })} />
      <CreateDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreate={(s) => createMutation.mutate(s)} saving={createMutation.isPending} projects={projects} defaultProjectId={projectFilter !== "all" ? projectFilter : undefined} />
      <AlertDialog open={!!confirmAction} onOpenChange={(o) => !o && setConfirmAction(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{confirmAction?.label}</AlertDialogTitle><AlertDialogDescription>This will change the status and notify watchers. Continue?</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => { if (confirmAction) { updateMutation.mutate({ id: confirmAction.id, updates: { status: confirmAction.status } }); setConfirmAction(null); } }}>Confirm</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
}

function Field({ icon: Icon, label, children }: { icon: any; label: string; children: any }) {
  return <div className="space-y-1"><div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground"><Icon className="h-3 w-3" />{label}</div><div>{children}</div></div>;
}

function SubmittalSheet({ sub, onClose, onSave, saving, onConfirmAction }: { sub: Submittal | null; onClose: () => void; onSave: (id: string, updates: Partial<Submittal>) => void; saving: boolean; onConfirmAction: (id: string, status: string, label: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<Submittal>>({});
  useEffect(() => { setEditing(false); }, [sub?.id]);
  if (!sub) return null;
  const startEdit = () => { setDraft({ name: sub.name, description: sub.description ?? "", submittalType: sub.submittalType ?? "", priority: sub.priority, dueDate: sub.dueDate ?? "", managerName: sub.managerName ?? "", contractorName: sub.contractorName ?? "", approver: sub.approver ?? "", specSection: sub.specSection ?? "", reference: sub.reference ?? "" }); setEditing(true); };
  const save = () => { onSave(sub.id, draft); setEditing(false); };
  const reviseAndResubmit = () => { const newRev = (sub.revision ?? 0) + 1; const note = window.prompt(`Note for revision R${newRev}? (optional)`) ?? ""; const history = [...(sub.revisionHistory ?? []), { revision: newRev, status: "revise_resubmit", at: new Date().toISOString(), note }]; onSave(sub.id, { status: "revise_resubmit", revision: newRev, revisionHistory: history } as any); };
  return (
    <Sheet open={!!sub} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader><div className="flex items-center gap-2 flex-wrap"><span className="font-mono text-sm font-bold text-emerald-300">{sub.submittalNumber}</span><StatusBadge status={sub.status} /><Badge variant="outline" className="text-[10px] font-mono">R{sub.revision ?? 0}</Badge>{sub.specSection && <Badge variant="outline" className="text-[10px] font-mono">§ {sub.specSection}</Badge>}</div><SheetTitle className="text-lg">{sub.name}</SheetTitle><SheetDescription className="flex items-center gap-2 text-xs flex-wrap"><Building2 className="h-3 w-3" />{sub.projectName ?? "Unknown project"}<span className="mx-1">•</span><Calendar className="h-3 w-3" />Due {fmtDate(sub.dueDate)}{sub.contractorName && <><span className="mx-1">•</span><User className="h-3 w-3" />{sub.contractorName}</>}</SheetDescription></SheetHeader>
        <div className="py-4 space-y-5">
          <div className="flex flex-wrap gap-2">
            {sub.status === "draft" && <Button size="sm" onClick={() => onSave(sub.id, { status: "submitted" })} disabled={saving} className="gap-2"><Send className="h-3.5 w-3.5" />Submit</Button>}
            {sub.status === "submitted" && <Button size="sm" onClick={() => onSave(sub.id, { status: "pending_review" })} disabled={saving} className="gap-2"><Send className="h-3.5 w-3.5" />Mark in review</Button>}
            {sub.status === "pending_review" && <><Button size="sm" onClick={() => onSave(sub.id, { status: "approved" })} disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Approve</Button><Button size="sm" onClick={() => onSave(sub.id, { status: "approved_as_noted" })} disabled={saving} variant="outline" className="gap-2">Approve as noted</Button><Button size="sm" variant="outline" onClick={reviseAndResubmit} disabled={saving} className="gap-2"><RotateCcw className="h-3.5 w-3.5" />Revise & resubmit</Button><Button size="sm" variant="outline" onClick={() => onConfirmAction(sub.id, "rejected", "Reject this submittal?")} disabled={saving} className="gap-2 text-red-400 border-red-500/30"><X className="h-3.5 w-3.5" />Reject</Button></>}
            {(sub.status === "approved" || sub.status === "approved_as_noted") && <Button size="sm" variant="outline" onClick={() => onConfirmAction(sub.id, "closed", "Close out this submittal?")} disabled={saving} className="gap-2"><CheckCircle2 className="h-3.5 w-3.5" />Close out</Button>}
            {!editing && <Button size="sm" variant="outline" onClick={startEdit} className="gap-2 ml-auto"><Pencil className="h-3.5 w-3.5" />Edit</Button>}
            {editing && (<><Button size="sm" onClick={save} disabled={saving} className="gap-2 ml-auto"><CheckCircle2 className="h-3.5 w-3.5" />Save</Button><Button size="sm" variant="ghost" onClick={() => setEditing(false)}><X className="h-3.5 w-3.5" /></Button></>)}
          </div>
          {!editing ? (<>
            {sub.description && <Field icon={FileText} label="Description"><p className="text-sm whitespace-pre-wrap leading-relaxed">{sub.description}</p></Field>}
            <div className="grid grid-cols-2 gap-4"><Field icon={Layers} label="Spec section">{sub.specSection ?? "—"}</Field><Field icon={FileText} label="Submittal type">{sub.submittalType ?? "—"}</Field><Field icon={User} label="Approver">{sub.approver ?? "—"}</Field><Field icon={User} label="Manager">{sub.managerName ?? "—"}</Field><Field icon={AlertCircle} label="Priority"><Badge variant="outline" className={`capitalize ${PRIORITY_TONES[sub.priority] ?? ""}`}>{sub.priority}</Badge></Field><Field icon={Calendar} label="Due">{fmtDate(sub.dueDate)}</Field></div>
            {sub.revisionHistory && sub.revisionHistory.length > 0 && <Field icon={History} label="Revision history"><div className="space-y-2 text-xs">{sub.revisionHistory.slice().reverse().map((r, idx) => <div key={idx} className="flex items-start gap-2 py-1.5 px-2 rounded bg-white/[0.02] border border-white/5"><Badge variant="outline" className="font-mono text-[10px]">R{r.revision}</Badge><div className="flex-1"><div className="flex items-center gap-2"><StatusBadge status={r.status} /><span className="text-muted-foreground">{fmtDate(r.at)}</span></div>{r.note && <p className="mt-1 text-muted-foreground">{r.note}</p>}</div></div>)}</div></Field>}
            {sub.attachments && sub.attachments.length > 0 && <Field icon={Paperclip} label={`Attachments (${sub.attachments.length})`}><ul className="space-y-1 text-xs">{sub.attachments.map((a, i) => <li key={i} className="flex items-center gap-2 py-1 px-2 rounded bg-white/[0.02] hover:bg-white/[0.04]"><Paperclip className="h-3 w-3 text-muted-foreground" />{a.url ? <a href={a.url} target="_blank" rel="noreferrer" className="text-blue-300 hover:underline">{a.name}</a> : <span>{a.name}</span>}{a.size && <span className="ml-auto text-muted-foreground">{(a.size / 1024).toFixed(1)} KB</span>}</li>)}</ul></Field>}
          </>) : (<>
            <div className="grid gap-2"><Label>Name</Label><Input value={draft.name ?? ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
            <div className="grid gap-2"><Label>Description</Label><Textarea rows={4} value={draft.description ?? ""} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Spec section</Label><Input placeholder="e.g. 08-2113" value={draft.specSection ?? ""} onChange={(e) => setDraft({ ...draft, specSection: e.target.value })} /></div>
              <div className="grid gap-2"><Label>Submittal type</Label><Input placeholder="e.g. Product Data, Shop Drawing" value={draft.submittalType ?? ""} onChange={(e) => setDraft({ ...draft, submittalType: e.target.value })} /></div>
              <div className="grid gap-2"><Label>Approver</Label><Input placeholder="e.g. Jane @ ABC Arch" value={draft.approver ?? ""} onChange={(e) => setDraft({ ...draft, approver: e.target.value })} /></div>
              <div className="grid gap-2"><Label>Contractor</Label><Input placeholder="e.g. Acme Glass Inc." value={draft.contractorName ?? ""} onChange={(e) => setDraft({ ...draft, contractorName: e.target.value })} /></div>
              <div className="grid gap-2"><Label>Priority</Label><Select value={draft.priority ?? "medium"} onValueChange={(v) => setDraft({ ...draft, priority: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent></Select></div>
              <div className="grid gap-2"><Label>Due date</Label><Input type="date" value={(draft.dueDate ?? "").toString().slice(0,10)} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value || null })} /></div>
            </div>
          </>)}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function CreateDialog({ open, onClose, onCreate, saving, projects, defaultProjectId }: { open: boolean; onClose: () => void; onCreate: (s: Partial<Submittal>) => void; saving: boolean; projects: Project[]; defaultProjectId?: string }) {
  const [form, setForm] = useState<Partial<Submittal>>({ name: "", description: "", priority: "medium", projectId: defaultProjectId, submittalType: "", specSection: "", contractorName: "" });
  useEffect(() => { if (open) setForm({ name: "", description: "", priority: "medium", projectId: defaultProjectId, submittalType: "", specSection: "", contractorName: "", dueDate: "" }); }, [open, defaultProjectId]);
  const canSubmit = !!(form.projectId && form.name && form.name.trim());
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg" data-testid="dialog-new-submittal">
        <DialogHeader><DialogTitle>New Submittal</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-2"><Label>Project <span className="text-red-400">*</span></Label><Select value={form.projectId ?? ""} onValueChange={(v) => setForm({ ...form, projectId: v })}><SelectTrigger data-testid="select-project"><Building2 className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" /><SelectValue placeholder="Pick a project (required)" /></SelectTrigger><SelectContent>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select>{!form.projectId && <p className="text-[11px] text-amber-400">Required — prevents orphaned submittals.</p>}</div>
          <div className="grid gap-2"><Label>Name <span className="text-red-400">*</span></Label><Input placeholder="e.g. Curtain Wall Shop Drawings" value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="input-name" /></div>
          <div className="grid gap-2"><Label>Description</Label><Textarea rows={3} value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2"><Label>Spec section</Label><Input placeholder="e.g. 08-2113" value={form.specSection ?? ""} onChange={(e) => setForm({ ...form, specSection: e.target.value })} /></div>
            <div className="grid gap-2"><Label>Submittal type</Label><Input placeholder="Product Data, Shop Drawing…" value={form.submittalType ?? ""} onChange={(e) => setForm({ ...form, submittalType: e.target.value })} /></div>
            <div className="grid gap-2"><Label>Contractor</Label><Input placeholder="e.g. Acme Glass" value={form.contractorName ?? ""} onChange={(e) => setForm({ ...form, contractorName: e.target.value })} /></div>
            <div className="grid gap-2"><Label>Approver</Label><Input placeholder="Architect / Engineer" value={form.approver ?? ""} onChange={(e) => setForm({ ...form, approver: e.target.value })} /></div>
            <div className="grid gap-2"><Label>Priority</Label><Select value={form.priority ?? "medium"} onValueChange={(v) => setForm({ ...form, priority: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent></Select></div>
            <div className="grid gap-2"><Label>Due date</Label><Input type="date" value={(form.dueDate ?? "").toString().slice(0,10)} onChange={(e) => setForm({ ...form, dueDate: e.target.value || null })} /></div>
          </div>
        </div>
        <DialogFooter><Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button><Button onClick={() => onCreate(form)} disabled={!canSubmit || saving} data-testid="button-create-submittal" className="gap-2">{saving ? "Creating…" : <><Plus className="h-4 w-4" />Create</>}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
