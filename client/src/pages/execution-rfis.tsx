import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileQuestion, Plus, Search, ChevronRight, Calendar, Building2, AlertCircle, CheckCircle2, Send, Pencil, X, DollarSign, Clock, FileText, User, Layers } from "lucide-react";

interface Rfi { id: string; rfiNumber: string; subject: string; question: string; projectId: string; projectName?: string; status: string; priority: string; dueDate?: string | null; response?: string | null; respondedAt?: string | null; ballInCourt?: string | null; specSection?: string | null; drawingReference?: string | null; costImpact?: boolean; costAmount?: string | number | null; scheduleImpactDays?: number | null; createdAt?: string; }
interface Project { id: string; name: string; status?: string; }

const STATUS_TONES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  draft: { bg: "bg-zinc-500/15", text: "text-zinc-300", border: "border-zinc-500/30", label: "Draft" },
  open: { bg: "bg-amber-500/15", text: "text-amber-300", border: "border-amber-500/30", label: "Open" },
  submitted: { bg: "bg-blue-500/15", text: "text-blue-300", border: "border-blue-500/30", label: "Submitted" },
  answered: { bg: "bg-emerald-500/15", text: "text-emerald-300", border: "border-emerald-500/30", label: "Answered" },
  closed: { bg: "bg-green-500/15", text: "text-green-300", border: "border-green-500/30", label: "Closed" },
  void: { bg: "bg-zinc-500/10", text: "text-muted-foreground", border: "border-zinc-500/30", label: "Void" },
  overdue: { bg: "bg-red-500/15", text: "text-red-300", border: "border-red-500/30", label: "Overdue" },
};
const PRIORITY_TONES: Record<string, string> = { low: "text-zinc-400", normal: "text-blue-400", high: "text-amber-400", urgent: "text-red-400" };

function StatusBadge({ status }: { status: string }) { const tone = STATUS_TONES[status] ?? STATUS_TONES.draft; return <Badge variant="outline" className={`text-[10px] h-5 px-2 ${tone.bg} ${tone.text} ${tone.border} font-semibold uppercase tracking-wide`}>{tone.label}</Badge>; }
function fmtDate(s?: string | null): string { if (!s) return "—"; const d = new Date(s); if (isNaN(d.getTime())) return "—"; return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" }); }
function fmtMoney(v: string | number | null | undefined): string { if (v == null) return "—"; const n = typeof v === "string" ? parseFloat(v) : v; if (isNaN(n as number)) return "—"; return "$" + (n as number).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
function isOverdue(rfi: Rfi): boolean { if (!rfi.dueDate || ["answered","closed","void"].includes(rfi.status)) return false; return new Date(rfi.dueDate).getTime() < Date.now(); }

function useProjects() { return useQuery<Project[]>({ queryKey: ["/api/projects"], queryFn: async () => { const r = await fetch("/api/projects"); if (!r.ok) return []; const j = await r.json(); return Array.isArray(j) ? j : (j.data ?? j.projects ?? []); }, staleTime: 5 * 60_000 }); }

export default function ExecutionRfis() {
  const { toast } = useToast();
  const [filter, setFilter] = useState<string>("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Rfi | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ id: string; status: string; label: string } | null>(null);

  const { data: projects = [] } = useProjects();
  const { data: rfis = [], isLoading, isError, refetch } = useQuery<Rfi[]>({ queryKey: ["/api/rfis"], queryFn: async () => { const r = await fetch("/api/rfis"); if (!r.ok) throw new Error("Failed to load RFIs"); return r.json(); }, staleTime: 30_000 });

  const counts = useMemo(() => { const c: Record<string, number> = { all: rfis.length, draft: 0, open: 0, submitted: 0, answered: 0, closed: 0, overdue: 0 }; for (const r of rfis) { c[r.status] = (c[r.status] || 0) + 1; if (isOverdue(r)) c.overdue++; } return c; }, [rfis]);
  const filtered = useMemo(() => { let list = rfis; if (projectFilter !== "all") list = list.filter(r => r.projectId === projectFilter); if (filter === "overdue") list = list.filter(isOverdue); else if (filter !== "all") list = list.filter(r => r.status === filter); if (search.trim()) { const q = search.toLowerCase(); list = list.filter(r => r.rfiNumber.toLowerCase().includes(q) || r.subject.toLowerCase().includes(q) || (r.question || "").toLowerCase().includes(q) || (r.specSection || "").toLowerCase().includes(q)); } return list; }, [rfis, filter, projectFilter, search]);

  const updateMutation = useMutation({ mutationFn: async ({ id, updates }: { id: string; updates: Partial<Rfi> }) => apiRequest("PATCH", `/api/rfis/${id}`, updates), onMutate: async ({ id, updates }) => { await queryClient.cancelQueries({ queryKey: ["/api/rfis"] }); const prev = queryClient.getQueryData<Rfi[]>(["/api/rfis"]); queryClient.setQueryData<Rfi[]>(["/api/rfis"], (old = []) => old.map(r => r.id === id ? { ...r, ...updates } : r)); return { prev }; }, onError: (e: any, _vars, ctx: any) => { if (ctx?.prev) queryClient.setQueryData(["/api/rfis"], ctx.prev); toast({ title: "Update failed", description: e?.message, variant: "destructive" }); }, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/rfis"] }); queryClient.invalidateQueries({ queryKey: ["/api/nav-counts"] }); toast({ title: "RFI updated" }); } });
  const createMutation = useMutation({ mutationFn: async (rfi: Partial<Rfi>) => apiRequest("POST", "/api/rfis", rfi), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/rfis"] }); queryClient.invalidateQueries({ queryKey: ["/api/nav-counts"] }); toast({ title: "RFI created" }); setCreateOpen(false); }, onError: (e: any) => toast({ title: "Create failed", description: e?.message ?? "Server rejected the request", variant: "destructive" }) });

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><div className="h-10 w-10 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center ring-1 ring-amber-500/30"><FileQuestion className="h-5 w-5" /></div><div><h1 className="text-xl font-bold tracking-tight">RFIs</h1><p className="text-xs text-muted-foreground">Requests for Information — ball-in-court tracking{counts.overdue > 0 && <span className="ml-2 text-red-400 font-semibold">{counts.overdue} overdue</span>}</p></div></div><Button onClick={() => setCreateOpen(true)} className="gap-2" data-testid="button-new-rfi"><Plus className="h-4 w-4" />New RFI</Button></div>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={projectFilter} onValueChange={setProjectFilter}><SelectTrigger className="w-[220px] h-9" data-testid="select-project-filter"><Building2 className="h-3.5 w-3.5 mr-2" /><SelectValue placeholder="All projects" /></SelectTrigger><SelectContent><SelectItem value="all">All projects ({counts.all})</SelectItem>{projects.map(p => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}</SelectContent></Select>
        {[["all", "All"], ["open", "Open"], ["submitted", "Submitted"], ["answered", "Answered"], ["draft", "Draft"], ["overdue", "Overdue"]].map(([key, label]) => (<Button key={key} variant={filter === key ? "default" : "outline"} size="sm" onClick={() => setFilter(key)} className="gap-2" data-testid={`filter-${key}`}>{label}<Badge variant="secondary" className="font-mono tabular-nums text-[10px] h-4 px-1.5">{counts[key] ?? 0}</Badge></Button>))}
        <div className="relative flex-1 min-w-[200px] max-w-md ml-auto"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" /><Input placeholder="Search RFIs, spec sections…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" data-testid="input-search-rfis" /></div>
      </div>
      <Card className="bg-card/80 border-white/10 shadow-lg"><CardContent className="p-0">
        <div className="hidden md:grid grid-cols-12 gap-3 px-4 py-2 border-b border-white/10 bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold"><div className="col-span-2">RFI #</div><div className="col-span-4">Subject</div><div className="col-span-2">Ball-in-court</div><div className="col-span-2">Due</div><div className="col-span-1">$ / Days</div><div className="col-span-1 text-right">Status</div></div>
        {isLoading && [0,1,2,3,4].map(i => (<div key={i} className="px-4 py-3 border-b last:border-b-0 border-white/10"><Skeleton className="h-4 w-full" /></div>))}
        {isError && (<div className="px-6 py-12 text-center"><AlertCircle className="h-8 w-8 mx-auto text-red-400 mb-2" /><p className="text-sm font-medium">Couldn't load RFIs</p><Button variant="outline" size="sm" onClick={() => refetch()} className="mt-3">Retry</Button></div>)}
        {!isLoading && !isError && filtered.length === 0 && (<div className="px-6 py-12 text-center text-sm text-muted-foreground">{search ? "No RFIs match your search." : projectFilter !== "all" ? "No RFIs for this project yet." : "No RFIs yet. Click “New RFI” to create one."}</div>)}
        {!isLoading && filtered.map((rfi) => { const overdue = isOverdue(rfi); return (
          <button key={rfi.id} onClick={() => setSelected(rfi)} className="group w-full grid grid-cols-12 gap-3 px-4 py-3 border-b last:border-b-0 border-white/10 text-left hover:bg-white/[0.03] transition-colors" data-testid={`row-rfi-${rfi.rfiNumber}`}>
            <div className="col-span-12 md:col-span-2 font-mono text-xs font-semibold text-amber-300">{rfi.rfiNumber}{rfi.specSection && <span className="block text-[10px] text-muted-foreground font-normal mt-0.5">§ {rfi.specSection}</span>}</div>
            <div className="col-span-12 md:col-span-4"><p className="text-sm font-medium truncate">{rfi.subject}</p><p className="text-xs text-muted-foreground line-clamp-1">{rfi.question}</p>{rfi.projectName && projectFilter === "all" && <p className="text-[10px] text-muted-foreground mt-0.5"><Building2 className="h-2.5 w-2.5 inline mr-0.5" />{rfi.projectName}</p>}</div>
            <div className="col-span-6 md:col-span-2 text-xs">{rfi.ballInCourt ? (<span className="flex items-center gap-1 text-foreground"><User className="h-3 w-3" />{rfi.ballInCourt}</span>) : <span className="text-muted-foreground italic">Unassigned</span>}</div>
            <div className={`col-span-6 md:col-span-2 text-xs ${overdue ? "text-red-400 font-semibold" : "text-muted-foreground"}`}><Calendar className="h-3 w-3 inline mr-1" />{fmtDate(rfi.dueDate)}{overdue && <span className="ml-1">• Overdue</span>}</div>
            <div className="col-span-6 md:col-span-1 text-xs space-y-0.5">{rfi.costImpact && <span className="flex items-center gap-1 text-amber-400"><DollarSign className="h-3 w-3" />{rfi.costAmount ? fmtMoney(rfi.costAmount) : "Pending"}</span>}{rfi.scheduleImpactDays != null && rfi.scheduleImpactDays > 0 && <span className="flex items-center gap-1 text-orange-400"><Clock className="h-3 w-3" />+{rfi.scheduleImpactDays}d</span>}</div>
            <div className="col-span-6 md:col-span-1 flex items-center justify-end gap-1"><StatusBadge status={overdue ? "overdue" : rfi.status} /><ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground hidden md:inline" /></div>
          </button>
        ); })}
      </CardContent></Card>
      <RfiDetailSheet rfi={selected} onClose={() => setSelected(null)} onSave={(id, updates) => updateMutation.mutate({ id, updates })} saving={updateMutation.isPending} onConfirmAction={(id, status, label) => setConfirmAction({ id, status, label })} />
      <CreateRfiDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreate={(rfi) => createMutation.mutate(rfi)} saving={createMutation.isPending} projects={projects} defaultProjectId={projectFilter !== "all" ? projectFilter : undefined} />
      <AlertDialog open={!!confirmAction} onOpenChange={(o) => !o && setConfirmAction(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{confirmAction?.label}</AlertDialogTitle><AlertDialogDescription>This will change the status and notify watchers. Continue?</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => { if (confirmAction) { updateMutation.mutate({ id: confirmAction.id, updates: { status: confirmAction.status } }); setConfirmAction(null); } }}>Confirm</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
}

function RfiDetailSheet({ rfi, onClose, onSave, saving, onConfirmAction }: { rfi: Rfi | null; onClose: () => void; onSave: (id: string, updates: Partial<Rfi>) => void; saving: boolean; onConfirmAction: (id: string, status: string, label: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<Rfi>>({});
  useEffect(() => { setEditing(false); }, [rfi?.id]);
  if (!rfi) return null;
  const startEdit = () => { setDraft({ subject: rfi.subject, question: rfi.question, response: rfi.response ?? "", status: rfi.status, priority: rfi.priority, dueDate: rfi.dueDate ?? "", ballInCourt: rfi.ballInCourt ?? "", specSection: rfi.specSection ?? "", drawingReference: rfi.drawingReference ?? "", costImpact: rfi.costImpact ?? false, costAmount: rfi.costAmount ?? "", scheduleImpactDays: rfi.scheduleImpactDays ?? null }); setEditing(true); };
  const save = () => { onSave(rfi.id, draft); setEditing(false); };
  return (
    <Sheet open={!!rfi} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader><div className="flex items-center gap-2 flex-wrap"><span className="font-mono text-sm font-bold text-amber-300">{rfi.rfiNumber}</span><StatusBadge status={rfi.status} />{rfi.specSection && <Badge variant="outline" className="text-[10px] font-mono">§ {rfi.specSection}</Badge>}{rfi.costImpact && <Badge variant="outline" className="text-[10px] bg-amber-500/15 text-amber-300 border-amber-500/30">$ Impact</Badge>}</div><SheetTitle className="text-lg">{rfi.subject}</SheetTitle><SheetDescription className="flex items-center gap-2 text-xs flex-wrap"><Building2 className="h-3 w-3" />{rfi.projectName ?? "Unknown project"}<span className="mx-1">•</span><Calendar className="h-3 w-3" />Due {fmtDate(rfi.dueDate)}{rfi.ballInCourt && <><span className="mx-1">•</span><User className="h-3 w-3" />{rfi.ballInCourt}</>}</SheetDescription></SheetHeader>
        <div className="py-4 space-y-5">
          <div className="flex flex-wrap gap-2">
            {rfi.status === "draft" && <Button size="sm" onClick={() => onSave(rfi.id, { status: "open" })} disabled={saving} className="gap-2"><Send className="h-3.5 w-3.5" />Open RFI</Button>}
            {rfi.status === "open" && <Button size="sm" onClick={() => onSave(rfi.id, { status: "submitted" })} disabled={saving} className="gap-2"><Send className="h-3.5 w-3.5" />Submit to architect</Button>}
            {rfi.status === "submitted" && <Button size="sm" onClick={() => onSave(rfi.id, { status: "answered" })} disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Mark answered</Button>}
            {rfi.status === "answered" && <Button size="sm" variant="outline" onClick={() => onConfirmAction(rfi.id, "closed", "Close out this RFI?")} disabled={saving} className="gap-2"><CheckCircle2 className="h-3.5 w-3.5" />Close out</Button>}
            {rfi.status !== "void" && rfi.status !== "closed" && <Button size="sm" variant="ghost" onClick={() => onConfirmAction(rfi.id, "void", "Void this RFI?")} disabled={saving} className="gap-2 text-muted-foreground">Void</Button>}
            {!editing && <Button size="sm" variant="outline" onClick={startEdit} className="gap-2 ml-auto"><Pencil className="h-3.5 w-3.5" />Edit</Button>}
            {editing && (<><Button size="sm" onClick={save} disabled={saving} className="gap-2 ml-auto"><CheckCircle2 className="h-3.5 w-3.5" />Save</Button><Button size="sm" variant="ghost" onClick={() => setEditing(false)}><X className="h-3.5 w-3.5" /></Button></>)}
          </div>
          {!editing ? (<>
            <Field icon={FileText} label="Question"><p className="text-sm whitespace-pre-wrap leading-relaxed">{rfi.question}</p></Field>
            <Field icon={CheckCircle2} label="Response">{rfi.response ? <p className="text-sm whitespace-pre-wrap leading-relaxed">{rfi.response}</p> : <p className="text-sm text-muted-foreground italic">No response yet.</p>}</Field>
            <div className="grid grid-cols-2 gap-4"><Field icon={Layers} label="Spec section">{rfi.specSection ?? "—"}</Field><Field icon={FileText} label="Drawing ref">{rfi.drawingReference ?? "—"}</Field><Field icon={DollarSign} label="Cost impact">{rfi.costImpact ? (rfi.costAmount ? fmtMoney(rfi.costAmount) : "Yes — pending estimate") : "None"}</Field><Field icon={Clock} label="Schedule impact">{rfi.scheduleImpactDays != null && rfi.scheduleImpactDays > 0 ? `+${rfi.scheduleImpactDays} day(s)` : "None"}</Field><Field icon={AlertCircle} label="Priority"><Badge variant="outline" className={`capitalize ${PRIORITY_TONES[rfi.priority] ?? ""}`}>{rfi.priority}</Badge></Field><Field icon={Calendar} label="Due">{fmtDate(rfi.dueDate)}</Field></div>
          </>) : (<>
            <div className="grid gap-2"><Label>Subject</Label><Input value={draft.subject ?? ""} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} /></div>
            <div className="grid gap-2"><Label>Question</Label><Textarea rows={4} value={draft.question ?? ""} onChange={(e) => setDraft({ ...draft, question: e.target.value })} /></div>
            <div className="grid gap-2"><Label>Architect's response</Label><Textarea rows={4} placeholder="Response from architect…" value={draft.response ?? ""} onChange={(e) => setDraft({ ...draft, response: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Ball-in-court</Label><Input placeholder="e.g. Jane @ ABC Arch." value={draft.ballInCourt ?? ""} onChange={(e) => setDraft({ ...draft, ballInCourt: e.target.value })} /></div><div className="grid gap-2"><Label>Priority</Label><Select value={draft.priority ?? "normal"} onValueChange={(v) => setDraft({ ...draft, priority: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="normal">Normal</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent></Select></div><div className="grid gap-2"><Label>Spec section</Label><Input placeholder="e.g. 08-2113" value={draft.specSection ?? ""} onChange={(e) => setDraft({ ...draft, specSection: e.target.value })} /></div><div className="grid gap-2"><Label>Drawing ref</Label><Input placeholder="e.g. A-201 / Detail 4" value={draft.drawingReference ?? ""} onChange={(e) => setDraft({ ...draft, drawingReference: e.target.value })} /></div><div className="grid gap-2"><Label>Due date</Label><Input type="date" value={(draft.dueDate ?? "").slice(0,10)} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value || null })} /></div><div className="grid gap-2"><Label>Schedule impact (days)</Label><Input type="number" min="0" placeholder="0" value={String(draft.scheduleImpactDays ?? "")} onChange={(e) => setDraft({ ...draft, scheduleImpactDays: e.target.value ? Number(e.target.value) : null })} /></div></div>
            <div className="flex items-center justify-between p-3 rounded-md border border-white/10 bg-muted/20"><div className="flex items-center gap-2"><DollarSign className="h-4 w-4 text-amber-400" /><div><Label htmlFor="cost-impact" className="cursor-pointer">Cost impact</Label><p className="text-xs text-muted-foreground">May drive a change order</p></div></div><Switch id="cost-impact" checked={!!draft.costImpact} onCheckedChange={(v) => setDraft({ ...draft, costImpact: v })} /></div>
            {draft.costImpact && <div className="grid gap-2"><Label>Estimated cost</Label><Input type="number" step="0.01" placeholder="0.00" value={String(draft.costAmount ?? "")} onChange={(e) => setDraft({ ...draft, costAmount: e.target.value })} /></div>}
          </>)}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({ icon: Icon, label, children }: { icon?: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode }) { return (<div className="space-y-1"><p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">{Icon && <Icon className="h-3 w-3" />}{label}</p><div className="text-sm">{children}</div></div>); }

function CreateRfiDialog({ open, onClose, onCreate, saving, projects, defaultProjectId }: { open: boolean; onClose: () => void; onCreate: (rfi: Partial<Rfi>) => void; saving: boolean; projects: Project[]; defaultProjectId?: string }) {
  const [form, setForm] = useState<Partial<Rfi>>({ rfiNumber: "", subject: "", question: "", priority: "normal", status: "draft", projectId: defaultProjectId, costImpact: false });
  useEffect(() => { if (open) setForm({ rfiNumber: "", subject: "", question: "", priority: "normal", status: "draft", projectId: defaultProjectId, costImpact: false }); }, [open, defaultProjectId]);
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (!form.subject?.trim() || !form.question?.trim() || !form.projectId) return; onCreate({ ...form, rfiNumber: form.rfiNumber || `RFI-${Date.now().toString().slice(-6)}` }); };
  const canSubmit = !!form.subject?.trim() && !!form.question?.trim() && !!form.projectId;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>New RFI</DialogTitle><DialogDescription>Request for Information — will route to architect or engineer.</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-2"><Label>Project *</Label><Select value={form.projectId ?? ""} onValueChange={(v) => setForm({ ...form, projectId: v })}><SelectTrigger data-testid="select-new-project"><SelectValue placeholder="Select project…" /></SelectTrigger><SelectContent>{projects.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">No projects available</div>}{projects.map(p => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}</SelectContent></Select></div>
          <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>RFI Number</Label><Input value={form.rfiNumber ?? ""} onChange={(e) => setForm({ ...form, rfiNumber: e.target.value })} placeholder="Auto if blank" /></div><div className="grid gap-2"><Label>Priority</Label><Select value={form.priority ?? "normal"} onValueChange={(v) => setForm({ ...form, priority: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="normal">Normal</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent></Select></div></div>
          <div className="grid gap-2"><Label>Subject *</Label><Input required value={form.subject ?? ""} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Short description" /></div>
          <div className="grid gap-2"><Label>Question *</Label><Textarea required rows={4} value={form.question ?? ""} onChange={(e) => setForm({ ...form, question: e.target.value })} placeholder="What needs to be clarified?" /></div>
          <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Ball-in-court</Label><Input value={form.ballInCourt ?? ""} onChange={(e) => setForm({ ...form, ballInCourt: e.target.value })} placeholder="Who answers?" /></div><div className="grid gap-2"><Label>Due date</Label><Input type="date" value={(form.dueDate ?? "").slice(0,10)} onChange={(e) => setForm({ ...form, dueDate: e.target.value || null })} /></div><div className="grid gap-2"><Label>Spec section</Label><Input value={form.specSection ?? ""} onChange={(e) => setForm({ ...form, specSection: e.target.value })} placeholder="e.g. 08-2113" /></div><div className="grid gap-2"><Label>Drawing ref</Label><Input value={form.drawingReference ?? ""} onChange={(e) => setForm({ ...form, drawingReference: e.target.value })} placeholder="e.g. A-201 / 4" /></div></div>
          <DialogFooter><Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving || !canSubmit} className="gap-2"><Plus className="h-4 w-4" />{saving ? "Creating…" : "Create RFI"}</Button></DialogFooter>
        </form></DialogContent>
    </Dialog>
  );
}
