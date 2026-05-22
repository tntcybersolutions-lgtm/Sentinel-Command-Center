import { useState, useMemo } from "react";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileCheck2, Plus, Search, ChevronRight, Calendar, Building2, CheckCircle2, XCircle, Send, Pencil, X, RotateCw } from "lucide-react";

interface Sub { id: string; submittalNumber: string; name: string; projectId: string; projectName?: string; revision?: number; status: string; priority: string; submittalType?: string; description?: string | null; managerName?: string | null; contractorName?: string | null; dueDate?: string | null; }

const STATUS_TONES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  draft: { bg: "bg-zinc-500/15", text: "text-zinc-300", border: "border-zinc-500/30", label: "Draft" },
  submitted: { bg: "bg-blue-500/15", text: "text-blue-300", border: "border-blue-500/30", label: "Submitted" },
  pending: { bg: "bg-amber-500/15", text: "text-amber-300", border: "border-amber-500/30", label: "Pending" },
  approved: { bg: "bg-emerald-500/15", text: "text-emerald-300", border: "border-emerald-500/30", label: "Approved" },
  rejected: { bg: "bg-red-500/15", text: "text-red-300", border: "border-red-500/30", label: "Rejected" },
  revise: { bg: "bg-orange-500/15", text: "text-orange-300", border: "border-orange-500/30", label: "Revise & Resubmit" },
  closed: { bg: "bg-green-500/15", text: "text-green-300", border: "border-green-500/30", label: "Closed" },
};
const PRIORITY_TONES: Record<string, string> = { low: "text-zinc-400", medium: "text-blue-400", normal: "text-blue-400", high: "text-amber-400", urgent: "text-red-400" };

function StatusBadge({ status }: { status: string }) { const tone = STATUS_TONES[status] ?? STATUS_TONES.draft; return <Badge variant="outline" className={`text-[10px] h-5 px-2 ${tone.bg} ${tone.text} ${tone.border} font-semibold uppercase tracking-wide`}>{tone.label}</Badge>; }
function fmtDate(s?: string | null): string { if (!s) return "—"; const d = new Date(s); if (isNaN(d.getTime())) return "—"; return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" }); }

export default function ExecutionSubmittals() {
  const { toast } = useToast();
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Sub | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const { data: subs = [], isLoading } = useQuery<Sub[]>({ queryKey: ["/api/submittals"], queryFn: async () => { const r = await fetch("/api/submittals"); if (!r.ok) return []; return r.json(); }, staleTime: 30_000 });
  const counts = useMemo(() => { const c: Record<string, number> = { all: subs.length, draft: 0, pending: 0, submitted: 0, approved: 0, rejected: 0, closed: 0 }; for (const s of subs) c[s.status] = (c[s.status] || 0) + 1; return c; }, [subs]);
  const filtered = useMemo(() => { let list = subs; if (filter !== "all") list = list.filter(s => s.status === filter); if (search.trim()) { const q = search.toLowerCase(); list = list.filter(s => s.submittalNumber.toLowerCase().includes(q) || s.name.toLowerCase().includes(q) || (s.description || "").toLowerCase().includes(q)); } return list; }, [subs, filter, search]);
  const updateMutation = useMutation({ mutationFn: async ({ id, updates }: { id: string; updates: Partial<Sub> }) => apiRequest("PATCH", `/api/submittals/${id}`, updates), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/submittals"] }); queryClient.invalidateQueries({ queryKey: ["/api/nav-counts"] }); toast({ title: "Submittal updated" }); }, onError: (e: any) => toast({ title: "Update failed", description: e?.message, variant: "destructive" }) });
  const createMutation = useMutation({ mutationFn: async (s: Partial<Sub>) => apiRequest("POST", "/api/submittals", s), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/submittals"] }); queryClient.invalidateQueries({ queryKey: ["/api/nav-counts"] }); toast({ title: "Submittal created" }); setCreateOpen(false); }, onError: (e: any) => toast({ title: "Create failed", description: e?.message, variant: "destructive" }) });

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><div className="h-10 w-10 rounded-lg bg-blue-500/15 text-blue-400 flex items-center justify-center ring-1 ring-blue-500/30"><FileCheck2 className="h-5 w-5" /></div><div><h1 className="text-xl font-bold tracking-tight">Submittals</h1><p className="text-xs text-muted-foreground">Spec submittals — review cycle tracking</p></div></div><Button onClick={() => setCreateOpen(true)} className="gap-2" data-testid="button-new-submittal"><Plus className="h-4 w-4" />New submittal</Button></div>
      <div className="flex flex-wrap items-center gap-2">{[["all", "All"], ["pending", "Pending"], ["submitted", "Submitted"], ["approved", "Approved"], ["rejected", "Rejected"], ["draft", "Draft"]].map(([key, label]) => (<Button key={key} variant={filter === key ? "default" : "outline"} size="sm" onClick={() => setFilter(key)} className="gap-2" data-testid={`filter-${key}`}>{label}<Badge variant="secondary" className="font-mono tabular-nums text-[10px] h-4 px-1.5">{counts[key] ?? 0}</Badge></Button>))}<div className="relative flex-1 min-w-[200px] max-w-md ml-auto"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" /><Input placeholder="Search submittals…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" data-testid="input-search-submittals" /></div></div>
      <Card className="bg-card/80 border-white/10 shadow-lg"><CardContent className="p-0"><div className="hidden md:grid grid-cols-12 gap-3 px-4 py-2 border-b border-white/10 bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold"><div className="col-span-2">Number</div><div className="col-span-4">Name</div><div className="col-span-2">Project</div><div className="col-span-1">Rev</div><div className="col-span-1">Priority</div><div className="col-span-2 text-right">Status</div></div>
        {isLoading && [0,1,2,3].map(i => (<div key={i} className="px-4 py-3 border-b last:border-b-0 border-white/10"><Skeleton className="h-4 w-full" /></div>))}
        {!isLoading && filtered.length === 0 && (<div className="px-6 py-12 text-center text-sm text-muted-foreground">{search ? "No submittals match your search." : "No submittals yet. Click “New submittal” to create one."}</div>)}
        {!isLoading && filtered.map((s) => (
          <button key={s.id} onClick={() => setSelected(s)} className="group w-full grid grid-cols-12 gap-3 px-4 py-3 border-b last:border-b-0 border-white/10 text-left hover:bg-white/[0.03] transition-colors" data-testid={`row-sub-${s.submittalNumber}`}>
            <div className="col-span-12 md:col-span-2 font-mono text-xs font-semibold text-blue-300">{s.submittalNumber}</div>
            <div className="col-span-12 md:col-span-4"><p className="text-sm font-medium truncate">{s.name}</p>{s.description && <p className="text-xs text-muted-foreground line-clamp-1">{s.description}</p>}</div>
            <div className="col-span-6 md:col-span-2 text-xs text-muted-foreground truncate"><Building2 className="h-3 w-3 inline mr-1" />{s.projectName ?? "—"}</div>
            <div className="col-span-3 md:col-span-1 text-xs font-mono text-muted-foreground">v{s.revision ?? 1}</div>
            <div className={`col-span-3 md:col-span-1 text-xs font-medium capitalize ${PRIORITY_TONES[s.priority] ?? "text-muted-foreground"}`}>{s.priority}</div>
            <div className="col-span-6 md:col-span-2 flex items-center justify-end gap-1"><StatusBadge status={s.status} /><ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground hidden md:inline" /></div>
          </button>
        ))}
      </CardContent></Card>
      <SubDetail sub={selected} onClose={() => setSelected(null)} onSave={(id, updates) => updateMutation.mutate({ id, updates })} saving={updateMutation.isPending} />
      <CreateDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreate={(s) => createMutation.mutate(s)} saving={createMutation.isPending} />
    </div>
  );
}

function SubDetail({ sub, onClose, onSave, saving }: { sub: Sub | null; onClose: () => void; onSave: (id: string, updates: Partial<Sub>) => void; saving: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<Sub>>({});
  if (!sub) return null;
  const startEdit = () => { setDraft({ name: sub.name, description: sub.description ?? "", status: sub.status, priority: sub.priority, submittalType: sub.submittalType, managerName: sub.managerName ?? "", contractorName: sub.contractorName ?? "" }); setEditing(true); };
  const save = () => { onSave(sub.id, draft); setEditing(false); };
  const transition = (status: string, extras: Partial<Sub> = {}) => onSave(sub.id, { status, ...extras });
  return (
    <Sheet open={!!sub} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader><div className="flex items-center gap-2"><span className="font-mono text-sm font-bold text-blue-300">{sub.submittalNumber}</span><Badge variant="outline" className="text-[10px] font-mono">v{sub.revision ?? 1}</Badge><StatusBadge status={sub.status} /></div><SheetTitle className="text-lg">{sub.name}</SheetTitle><SheetDescription className="flex items-center gap-2 text-xs"><Building2 className="h-3 w-3" />{sub.projectName ?? "Unknown project"}{sub.submittalType && <><span className="mx-1">•</span>{sub.submittalType}</>}</SheetDescription></SheetHeader>
        <div className="py-4 space-y-5">
          <div className="flex flex-wrap gap-2">
            {sub.status === "draft" && <Button size="sm" onClick={() => transition("submitted")} disabled={saving} className="gap-2" data-testid="button-submit"><Send className="h-3.5 w-3.5" />Submit</Button>}
            {sub.status === "submitted" && <Button size="sm" onClick={() => transition("pending")} disabled={saving} className="gap-2" data-testid="button-mark-pending"><RotateCw className="h-3.5 w-3.5" />Mark under review</Button>}
            {(sub.status === "pending" || sub.status === "submitted") && <><Button size="sm" onClick={() => transition("approved")} disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700" data-testid="button-approve"><CheckCircle2 className="h-3.5 w-3.5" />Approve</Button><Button size="sm" variant="destructive" onClick={() => transition("rejected")} disabled={saving} className="gap-2" data-testid="button-reject"><XCircle className="h-3.5 w-3.5" />Reject</Button><Button size="sm" variant="outline" onClick={() => transition("revise", { revision: (sub.revision ?? 1) + 1 })} disabled={saving} className="gap-2" data-testid="button-revise"><RotateCw className="h-3.5 w-3.5" />Revise & Resubmit</Button></>}
            {sub.status === "approved" && <Button size="sm" variant="outline" onClick={() => transition("closed")} disabled={saving} className="gap-2" data-testid="button-close"><CheckCircle2 className="h-3.5 w-3.5" />Close out</Button>}
            {!editing && <Button size="sm" variant="outline" onClick={startEdit} className="gap-2 ml-auto" data-testid="button-edit"><Pencil className="h-3.5 w-3.5" />Edit</Button>}
            {editing && (<><Button size="sm" onClick={save} disabled={saving} className="gap-2 ml-auto" data-testid="button-save"><CheckCircle2 className="h-3.5 w-3.5" />Save</Button><Button size="sm" variant="ghost" onClick={() => setEditing(false)} className="gap-2"><X className="h-3.5 w-3.5" />Cancel</Button></>)}
          </div>
          {!editing ? (<>
            <Field label="Description">{sub.description ? <p className="text-sm whitespace-pre-wrap leading-relaxed">{sub.description}</p> : <p className="text-sm text-muted-foreground italic">No description.</p>}</Field>
            <div className="grid grid-cols-2 gap-4"><Field label="Submittal type">{sub.submittalType ?? "—"}</Field><Field label="Priority"><Badge variant="outline" className={`capitalize ${PRIORITY_TONES[sub.priority] ?? ""}`}>{sub.priority}</Badge></Field><Field label="Manager">{sub.managerName ?? "—"}</Field><Field label="Contractor">{sub.contractorName ?? "—"}</Field></div>
          </>) : (<>
            <div className="grid gap-2"><Label>Name</Label><Input value={draft.name ?? ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} data-testid="input-edit-name" /></div>
            <div className="grid gap-2"><Label>Description</Label><Textarea rows={4} value={draft.description ?? ""} onChange={(e) => setDraft({ ...draft, description: e.target.value })} data-testid="textarea-edit-description" /></div>
            <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Priority</Label><Select value={draft.priority ?? "medium"} onValueChange={(v) => setDraft({ ...draft, priority: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent></Select></div><div className="grid gap-2"><Label>Type</Label><Input value={draft.submittalType ?? ""} onChange={(e) => setDraft({ ...draft, submittalType: e.target.value })} placeholder="shop drawings, cut sheets, etc." /></div><div className="grid gap-2"><Label>Manager</Label><Input value={draft.managerName ?? ""} onChange={(e) => setDraft({ ...draft, managerName: e.target.value })} /></div><div className="grid gap-2"><Label>Contractor</Label><Input value={draft.contractorName ?? ""} onChange={(e) => setDraft({ ...draft, contractorName: e.target.value })} /></div></div>
          </>)}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return (<div className="space-y-1"><p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p><div className="text-sm">{children}</div></div>); }

function CreateDialog({ open, onClose, onCreate, saving }: { open: boolean; onClose: () => void; onCreate: (s: Partial<Sub>) => void; saving: boolean }) {
  const [form, setForm] = useState<Partial<Sub>>({ submittalNumber: "", name: "", description: "", priority: "medium", status: "draft", submittalType: "" });
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (!form.name?.trim()) return; onCreate({ ...form, submittalNumber: form.submittalNumber || `SUB-${Date.now().toString().slice(-6)}`, revision: 1 }); setForm({ submittalNumber: "", name: "", description: "", priority: "medium", status: "draft", submittalType: "" }); };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg"><DialogHeader><DialogTitle>New submittal</DialogTitle><DialogDescription>Create a new submittal package.</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Number</Label><Input value={form.submittalNumber ?? ""} onChange={(e) => setForm({ ...form, submittalNumber: e.target.value })} placeholder="Auto if blank" /></div><div className="grid gap-2"><Label>Priority</Label><Select value={form.priority ?? "medium"} onValueChange={(v) => setForm({ ...form, priority: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent></Select></div></div>
          <div className="grid gap-2"><Label>Name *</Label><Input required value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Storefront Glazing — cut sheets" /></div>
          <div className="grid gap-2"><Label>Type</Label><Input value={form.submittalType ?? ""} onChange={(e) => setForm({ ...form, submittalType: e.target.value })} placeholder="shop drawings, cut sheets, samples…" /></div>
          <div className="grid gap-2"><Label>Description</Label><Textarea rows={4} value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Scope of submittal" /></div>
          <DialogFooter><Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving || !form.name?.trim()} className="gap-2"><Plus className="h-4 w-4" />{saving ? "Creating…" : "Create submittal"}</Button></DialogFooter>
        </form></DialogContent>
    </Dialog>
  );
}
