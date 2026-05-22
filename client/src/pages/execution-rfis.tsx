import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileQuestion, Plus, Search, ChevronRight, Calendar, Building2, AlertCircle, CheckCircle2, Clock, Send, Pencil, X } from "lucide-react";

interface Rfi {
  id: string;
  rfiNumber: string;
  subject: string;
  question: string;
  projectId: string;
  projectName?: string;
  status: string;
  priority: string;
  dueDate?: string | null;
  response?: string | null;
  respondedAt?: string | null;
  createdAt?: string;
}

const STATUS_TONES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  draft: { bg: "bg-zinc-500/15", text: "text-zinc-300", border: "border-zinc-500/30", label: "Draft" },
  open: { bg: "bg-amber-500/15", text: "text-amber-300", border: "border-amber-500/30", label: "Open" },
  submitted: { bg: "bg-blue-500/15", text: "text-blue-300", border: "border-blue-500/30", label: "Submitted" },
  answered: { bg: "bg-emerald-500/15", text: "text-emerald-300", border: "border-emerald-500/30", label: "Answered" },
  closed: { bg: "bg-green-500/15", text: "text-green-300", border: "border-green-500/30", label: "Closed" },
  overdue: { bg: "bg-red-500/15", text: "text-red-300", border: "border-red-500/30", label: "Overdue" },
};

const PRIORITY_TONES: Record<string, string> = { low: "text-zinc-400", normal: "text-blue-400", high: "text-amber-400", urgent: "text-red-400" };

function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONES[status] ?? STATUS_TONES.draft;
  return <Badge variant="outline" className={`text-[10px] h-5 px-2 ${tone.bg} ${tone.text} ${tone.border} font-semibold uppercase tracking-wide`}>{tone.label}</Badge>;
}

function fmtDate(s?: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" });
}

function isOverdue(rfi: Rfi): boolean {
  if (!rfi.dueDate || rfi.status === "answered" || rfi.status === "closed") return false;
  return new Date(rfi.dueDate).getTime() < Date.now();
}

export default function ExecutionRfis() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Rfi | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const { data: rfis = [], isLoading } = useQuery<Rfi[]>({ queryKey: ["/api/rfis"], queryFn: async () => { const r = await fetch("/api/rfis"); if (!r.ok) return []; return r.json(); }, staleTime: 30_000 });

  const counts = useMemo(() => { const c: Record<string, number> = { all: rfis.length, draft: 0, open: 0, submitted: 0, answered: 0, overdue: 0 }; for (const r of rfis) { c[r.status] = (c[r.status] || 0) + 1; if (isOverdue(r)) c.overdue++; } return c; }, [rfis]);
  const filtered = useMemo(() => { let list = rfis; if (filter === "overdue") list = list.filter(isOverdue); else if (filter !== "all") list = list.filter((r) => r.status === filter); if (search.trim()) { const q = search.toLowerCase(); list = list.filter((r) => r.rfiNumber.toLowerCase().includes(q) || r.subject.toLowerCase().includes(q) || (r.question || "").toLowerCase().includes(q)); } return list; }, [rfis, filter, search]);

  const updateMutation = useMutation({ mutationFn: async ({ id, updates }: { id: string; updates: Partial<Rfi> }) => apiRequest("PATCH", `/api/rfis/${id}`, updates), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/rfis"] }); queryClient.invalidateQueries({ queryKey: ["/api/nav-counts"] }); toast({ title: "RFI updated" }); }, onError: (e: any) => toast({ title: "Update failed", description: e?.message, variant: "destructive" }) });
  const createMutation = useMutation({ mutationFn: async (rfi: Partial<Rfi>) => apiRequest("POST", "/api/rfis", rfi), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/rfis"] }); queryClient.invalidateQueries({ queryKey: ["/api/nav-counts"] }); toast({ title: "RFI created" }); setCreateOpen(false); }, onError: (e: any) => toast({ title: "Create failed", description: e?.message, variant: "destructive" }) });

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3"><div className="h-10 w-10 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center ring-1 ring-amber-500/30"><FileQuestion className="h-5 w-5" /></div><div><h1 className="text-xl font-bold tracking-tight">RFIs</h1><p className="text-xs text-muted-foreground">Requests for Information — ball-in-court tracking</p></div></div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2" data-testid="button-new-rfi"><Plus className="h-4 w-4" />New RFI</Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {[["all", "All"], ["open", "Open"], ["submitted", "Submitted"], ["answered", "Answered"], ["draft", "Draft"], ["overdue", "Overdue"]].map(([key, label]) => (<Button key={key} variant={filter === key ? "default" : "outline"} size="sm" onClick={() => setFilter(key)} className="gap-2" data-testid={`filter-${key}`}>{label}<Badge variant="secondary" className="font-mono tabular-nums text-[10px] h-4 px-1.5">{counts[key] ?? 0}</Badge></Button>))}
        <div className="relative flex-1 min-w-[200px] max-w-md ml-auto"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" /><Input placeholder="Search RFIs…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" data-testid="input-search-rfis" /></div>
      </div>
      <Card className="bg-card/80 border-white/10 shadow-lg"><CardContent className="p-0">
        <div className="hidden md:grid grid-cols-12 gap-3 px-4 py-2 border-b border-white/10 bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold"><div className="col-span-2">RFI #</div><div className="col-span-4">Subject</div><div className="col-span-2">Project</div><div className="col-span-2">Due</div><div className="col-span-1">Priority</div><div className="col-span-1 text-right">Status</div></div>
        {isLoading && [0,1,2,3,4].map(i => (<div key={i} className="px-4 py-3 border-b last:border-b-0 border-white/10"><Skeleton className="h-4 w-full" /></div>))}
        {!isLoading && filtered.length === 0 && (<div className="px-6 py-12 text-center text-sm text-muted-foreground">{search ? "No RFIs match your search." : "No RFIs yet. Click “New RFI” to create one."}</div>)}
        {!isLoading && filtered.map((rfi) => { const overdue = isOverdue(rfi); return (
          <button key={rfi.id} onClick={() => setSelected(rfi)} className="group w-full grid grid-cols-12 gap-3 px-4 py-3 border-b last:border-b-0 border-white/10 text-left hover:bg-white/[0.03] transition-colors" data-testid={`row-rfi-${rfi.rfiNumber}`}>
            <div className="col-span-12 md:col-span-2 font-mono text-xs font-semibold text-amber-300">{rfi.rfiNumber}</div>
            <div className="col-span-12 md:col-span-4"><p className="text-sm font-medium truncate">{rfi.subject}</p><p className="text-xs text-muted-foreground line-clamp-1">{rfi.question}</p></div>
            <div className="col-span-6 md:col-span-2 text-xs text-muted-foreground truncate"><Building2 className="h-3 w-3 inline mr-1" />{rfi.projectName ?? "—"}</div>
            <div className={`col-span-6 md:col-span-2 text-xs ${overdue ? "text-red-400 font-semibold" : "text-muted-foreground"}`}><Calendar className="h-3 w-3 inline mr-1" />{fmtDate(rfi.dueDate)}{overdue && <span className="ml-1">• Overdue</span>}</div>
            <div className={`col-span-6 md:col-span-1 text-xs font-medium capitalize ${PRIORITY_TONES[rfi.priority] ?? "text-muted-foreground"}`}>{rfi.priority}</div>
            <div className="col-span-6 md:col-span-1 flex items-center justify-end gap-1"><StatusBadge status={overdue ? "overdue" : rfi.status} /><ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground hidden md:inline" /></div>
          </button>
        ); })}
      </CardContent></Card>
      <RfiDetailSheet rfi={selected} onClose={() => setSelected(null)} onSave={(id, updates) => updateMutation.mutate({ id, updates })} saving={updateMutation.isPending} />
      <CreateRfiDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreate={(rfi) => createMutation.mutate(rfi)} saving={createMutation.isPending} />
    </div>
  );
}

function RfiDetailSheet({ rfi, onClose, onSave, saving }: { rfi: Rfi | null; onClose: () => void; onSave: (id: string, updates: Partial<Rfi>) => void; saving: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<Rfi>>({});
  if (!rfi) return null;
  const startEdit = () => { setDraft({ subject: rfi.subject, question: rfi.question, response: rfi.response ?? "", status: rfi.status, priority: rfi.priority, dueDate: rfi.dueDate ?? "" }); setEditing(true); };
  const save = () => { onSave(rfi.id, draft); setEditing(false); };
  const transition = (status: string) => onSave(rfi.id, { status });
  return (
    <Sheet open={!!rfi} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader><div className="flex items-center gap-2"><span className="font-mono text-sm font-bold text-amber-300">{rfi.rfiNumber}</span><StatusBadge status={rfi.status} /></div><SheetTitle className="text-lg">{rfi.subject}</SheetTitle><SheetDescription className="flex items-center gap-2 text-xs"><Building2 className="h-3 w-3" />{rfi.projectName ?? "Unknown project"}<span className="mx-1">•</span><Calendar className="h-3 w-3" />Due {fmtDate(rfi.dueDate)}</SheetDescription></SheetHeader>
        <div className="py-4 space-y-5">
          <div className="flex flex-wrap gap-2">
            {rfi.status === "draft" && <Button size="sm" onClick={() => transition("open")} disabled={saving} className="gap-2" data-testid="button-open-rfi"><Send className="h-3.5 w-3.5" />Open RFI</Button>}
            {rfi.status === "open" && <Button size="sm" onClick={() => transition("submitted")} disabled={saving} className="gap-2" data-testid="button-submit-rfi"><Send className="h-3.5 w-3.5" />Submit to architect</Button>}
            {rfi.status === "submitted" && <Button size="sm" onClick={() => transition("answered")} disabled={saving} className="gap-2" data-testid="button-mark-answered"><CheckCircle2 className="h-3.5 w-3.5" />Mark answered</Button>}
            {rfi.status === "answered" && <Button size="sm" variant="outline" onClick={() => transition("closed")} disabled={saving} className="gap-2" data-testid="button-close-rfi"><CheckCircle2 className="h-3.5 w-3.5" />Close out</Button>}
            {!editing && <Button size="sm" variant="outline" onClick={startEdit} className="gap-2 ml-auto" data-testid="button-edit-rfi"><Pencil className="h-3.5 w-3.5" />Edit</Button>}
            {editing && (<><Button size="sm" onClick={save} disabled={saving} className="gap-2 ml-auto" data-testid="button-save-rfi"><CheckCircle2 className="h-3.5 w-3.5" />Save</Button><Button size="sm" variant="ghost" onClick={() => setEditing(false)} className="gap-2" data-testid="button-cancel-edit"><X className="h-3.5 w-3.5" />Cancel</Button></>)}
          </div>
          {!editing ? (<>
            <Field label="Question"><p className="text-sm whitespace-pre-wrap leading-relaxed">{rfi.question}</p></Field>
            <Field label="Response">{rfi.response ? <p className="text-sm whitespace-pre-wrap leading-relaxed">{rfi.response}</p> : <p className="text-sm text-muted-foreground italic">No response yet.</p>}</Field>
            <div className="grid grid-cols-2 gap-4"><Field label="Priority"><Badge variant="outline" className={`capitalize ${PRIORITY_TONES[rfi.priority] ?? ""}`}>{rfi.priority}</Badge></Field><Field label="Due date">{fmtDate(rfi.dueDate)}</Field></div>
          </>) : (<>
            <div className="grid gap-2"><Label>Subject</Label><Input value={draft.subject ?? ""} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} data-testid="input-edit-subject" /></div>
            <div className="grid gap-2"><Label>Question</Label><Textarea rows={4} value={draft.question ?? ""} onChange={(e) => setDraft({ ...draft, question: e.target.value })} data-testid="textarea-edit-question" /></div>
            <div className="grid gap-2"><Label>Response</Label><Textarea rows={4} placeholder="Architect's response…" value={draft.response ?? ""} onChange={(e) => setDraft({ ...draft, response: e.target.value })} data-testid="textarea-edit-response" /></div>
            <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Priority</Label><Select value={draft.priority ?? "normal"} onValueChange={(v) => setDraft({ ...draft, priority: v })}><SelectTrigger data-testid="select-priority"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="normal">Normal</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent></Select></div><div className="grid gap-2"><Label>Due date</Label><Input type="date" value={(draft.dueDate ?? "").slice(0,10)} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} data-testid="input-edit-due" /></div></div>
          </>)}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return (<div className="space-y-1"><p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p><div>{children}</div></div>); }

function CreateRfiDialog({ open, onClose, onCreate, saving }: { open: boolean; onClose: () => void; onCreate: (rfi: Partial<Rfi>) => void; saving: boolean }) {
  const [form, setForm] = useState<Partial<Rfi>>({ rfiNumber: "", subject: "", question: "", priority: "normal", status: "draft" });
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (!form.subject?.trim() || !form.question?.trim()) return; onCreate({ ...form, rfiNumber: form.rfiNumber || `RFI-${Date.now().toString().slice(-6)}` }); setForm({ rfiNumber: "", subject: "", question: "", priority: "normal", status: "draft" }); };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg"><DialogHeader><DialogTitle>New RFI</DialogTitle><DialogDescription>Create a new Request for Information.</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>RFI Number</Label><Input value={form.rfiNumber ?? ""} onChange={(e) => setForm({ ...form, rfiNumber: e.target.value })} placeholder="Auto if blank" data-testid="input-new-number" /></div><div className="grid gap-2"><Label>Priority</Label><Select value={form.priority ?? "normal"} onValueChange={(v) => setForm({ ...form, priority: v })}><SelectTrigger data-testid="select-new-priority"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="normal">Normal</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent></Select></div></div>
          <div className="grid gap-2"><Label>Subject *</Label><Input required value={form.subject ?? ""} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Short description" data-testid="input-new-subject" /></div>
          <div className="grid gap-2"><Label>Question *</Label><Textarea required rows={5} value={form.question ?? ""} onChange={(e) => setForm({ ...form, question: e.target.value })} placeholder="What do you need clarified?" data-testid="textarea-new-question" /></div>
          <div className="grid gap-2"><Label>Due date</Label><Input type="date" value={(form.dueDate ?? "").slice(0,10)} onChange={(e) => setForm({ ...form, dueDate: e.target.value || null })} data-testid="input-new-due" /></div>
          <DialogFooter><Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving || !form.subject?.trim() || !form.question?.trim()} className="gap-2" data-testid="button-create-rfi"><Plus className="h-4 w-4" />{saving ? "Creating…" : "Create RFI"}</Button></DialogFooter>
        </form></DialogContent>
    </Dialog>
  );
}
