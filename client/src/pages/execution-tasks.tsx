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
import { CheckSquare, Plus, Search, ChevronRight, Calendar, Building2, CheckCircle2, Play, Ban, Pencil, X, Circle } from "lucide-react";

interface Task { id: string; name: string; description?: string | null; projectId: string; projectName?: string; assignees?: string[] | null; status: string; priority: string; labels?: string[] | null; dueDate?: string | null; source?: string | null; }

const STATUS_TONES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  not_started: { bg: "bg-zinc-500/15", text: "text-zinc-300", border: "border-zinc-500/30", label: "Not Started" },
  open: { bg: "bg-amber-500/15", text: "text-amber-300", border: "border-amber-500/30", label: "Open" },
  in_progress: { bg: "bg-blue-500/15", text: "text-blue-300", border: "border-blue-500/30", label: "In Progress" },
  blocked: { bg: "bg-red-500/15", text: "text-red-300", border: "border-red-500/30", label: "Blocked" },
  completed: { bg: "bg-emerald-500/15", text: "text-emerald-300", border: "border-emerald-500/30", label: "Completed" },
  cancelled: { bg: "bg-zinc-500/10", text: "text-muted-foreground", border: "border-zinc-500/30", label: "Cancelled" },
};
const PRIORITY_TONES: Record<string, string> = { low: "text-zinc-400", medium: "text-blue-400", normal: "text-blue-400", high: "text-amber-400", urgent: "text-red-400" };

function StatusBadge({ status }: { status: string }) { const tone = STATUS_TONES[status] ?? STATUS_TONES.not_started; return <Badge variant="outline" className={`text-[10px] h-5 px-2 ${tone.bg} ${tone.text} ${tone.border} font-semibold uppercase tracking-wide`}>{tone.label}</Badge>; }
function fmtDate(s?: string | null): string { if (!s) return "—"; const d = new Date(s); if (isNaN(d.getTime())) return "—"; return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" }); }
function isOverdue(t: Task): boolean { if (!t.dueDate || t.status === "completed" || t.status === "cancelled") return false; return new Date(t.dueDate).getTime() < Date.now(); }

export default function ExecutionTasks() {
  const { toast } = useToast();
  const [filter, setFilter] = useState<string>("active");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Task | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const { data: tasks = [], isLoading } = useQuery<Task[]>({ queryKey: ["/api/project-tasks"], queryFn: async () => { const r = await fetch("/api/project-tasks"); if (!r.ok) return []; return r.json(); }, staleTime: 30_000 });
  const counts = useMemo(() => { const c: Record<string, number> = { all: tasks.length, active: 0, not_started: 0, in_progress: 0, completed: 0, overdue: 0, blocked: 0 }; for (const t of tasks) { c[t.status] = (c[t.status] || 0) + 1; if (t.status !== "completed" && t.status !== "cancelled") c.active++; if (isOverdue(t)) c.overdue++; } return c; }, [tasks]);
  const filtered = useMemo(() => { let list = tasks; if (filter === "active") list = list.filter(t => t.status !== "completed" && t.status !== "cancelled"); else if (filter === "overdue") list = list.filter(isOverdue); else if (filter !== "all") list = list.filter(t => t.status === filter); if (search.trim()) { const q = search.toLowerCase(); list = list.filter(t => t.name.toLowerCase().includes(q) || (t.description || "").toLowerCase().includes(q)); } return list; }, [tasks, filter, search]);
  const updateMutation = useMutation({ mutationFn: async ({ id, updates }: { id: string; updates: Partial<Task> }) => apiRequest("PATCH", `/api/project-tasks/${id}`, updates), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/project-tasks"] }); queryClient.invalidateQueries({ queryKey: ["/api/nav-counts"] }); toast({ title: "Task updated" }); }, onError: (e: any) => toast({ title: "Update failed", description: e?.message, variant: "destructive" }) });
  const createMutation = useMutation({ mutationFn: async (t: Partial<Task>) => apiRequest("POST", "/api/project-tasks", t), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/project-tasks"] }); queryClient.invalidateQueries({ queryKey: ["/api/nav-counts"] }); toast({ title: "Task created" }); setCreateOpen(false); }, onError: (e: any) => toast({ title: "Create failed", description: e?.message, variant: "destructive" }) });

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><div className="h-10 w-10 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center ring-1 ring-emerald-500/30"><CheckSquare className="h-5 w-5" /></div><div><h1 className="text-xl font-bold tracking-tight">Tasks</h1><p className="text-xs text-muted-foreground">Project tasks across all jobs</p></div></div><Button onClick={() => setCreateOpen(true)} className="gap-2" data-testid="button-new-task"><Plus className="h-4 w-4" />New task</Button></div>
      <div className="flex flex-wrap items-center gap-2">{[["active", "Active"], ["all", "All"], ["not_started", "Not started"], ["in_progress", "In progress"], ["completed", "Completed"], ["overdue", "Overdue"], ["blocked", "Blocked"]].map(([key, label]) => (<Button key={key} variant={filter === key ? "default" : "outline"} size="sm" onClick={() => setFilter(key)} className="gap-2" data-testid={`filter-${key}`}>{label}<Badge variant="secondary" className="font-mono tabular-nums text-[10px] h-4 px-1.5">{counts[key] ?? 0}</Badge></Button>))}<div className="relative flex-1 min-w-[200px] max-w-md ml-auto"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" /><Input placeholder="Search tasks…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" data-testid="input-search-tasks" /></div></div>
      <Card className="bg-card/80 border-white/10 shadow-lg"><CardContent className="p-0">
        <div className="hidden md:grid grid-cols-12 gap-3 px-4 py-2 border-b border-white/10 bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold"><div className="col-span-1"></div><div className="col-span-5">Task</div><div className="col-span-2">Project</div><div className="col-span-2">Due</div><div className="col-span-1">Pri</div><div className="col-span-1 text-right">Status</div></div>
        {isLoading && [0,1,2,3,4].map(i => (<div key={i} className="px-4 py-3 border-b last:border-b-0 border-white/10"><Skeleton className="h-4 w-full" /></div>))}
        {!isLoading && filtered.length === 0 && (<div className="px-6 py-12 text-center text-sm text-muted-foreground">{search ? "No tasks match your search." : "No tasks. Click “New task” to create one."}</div>)}
        {!isLoading && filtered.map((t) => { const overdue = isOverdue(t); const done = t.status === "completed"; return (
          <button key={t.id} onClick={() => setSelected(t)} className="group w-full grid grid-cols-12 gap-3 px-4 py-3 border-b last:border-b-0 border-white/10 text-left hover:bg-white/[0.03] transition-colors" data-testid={`row-task-${t.id}`}>
            <div className="col-span-1 flex items-center" onClick={(e) => { e.stopPropagation(); updateMutation.mutate({ id: t.id, updates: { status: done ? "in_progress" : "completed" } }); }}>{done ? <CheckCircle2 className="h-5 w-5 text-emerald-400 cursor-pointer hover:scale-110 transition-transform" /> : <Circle className="h-5 w-5 text-muted-foreground hover:text-emerald-400 cursor-pointer transition-colors" />}</div>
            <div className="col-span-12 md:col-span-5"><p className={`text-sm font-medium ${done ? "line-through text-muted-foreground" : ""}`}>{t.name}</p>{t.description && <p className="text-xs text-muted-foreground line-clamp-1">{t.description}</p>}</div>
            <div className="col-span-6 md:col-span-2 text-xs text-muted-foreground truncate"><Building2 className="h-3 w-3 inline mr-1" />{t.projectName ?? "—"}</div>
            <div className={`col-span-6 md:col-span-2 text-xs ${overdue ? "text-red-400 font-semibold" : "text-muted-foreground"}`}><Calendar className="h-3 w-3 inline mr-1" />{fmtDate(t.dueDate)}{overdue && <span className="ml-1">• Overdue</span>}</div>
            <div className={`col-span-6 md:col-span-1 text-xs font-medium capitalize ${PRIORITY_TONES[t.priority] ?? "text-muted-foreground"}`}>{t.priority}</div>
            <div className="col-span-6 md:col-span-1 flex items-center justify-end gap-1"><StatusBadge status={t.status} /><ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground hidden md:inline" /></div>
          </button>
        ); })}
      </CardContent></Card>
      <TaskDetail task={selected} onClose={() => setSelected(null)} onSave={(id, updates) => updateMutation.mutate({ id, updates })} saving={updateMutation.isPending} />
      <CreateDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreate={(t) => createMutation.mutate(t)} saving={createMutation.isPending} />
    </div>
  );
}

function TaskDetail({ task, onClose, onSave, saving }: { task: Task | null; onClose: () => void; onSave: (id: string, updates: Partial<Task>) => void; saving: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<Task>>({});
  if (!task) return null;
  const startEdit = () => { setDraft({ name: task.name, description: task.description ?? "", status: task.status, priority: task.priority, dueDate: task.dueDate ?? "" }); setEditing(true); };
  const save = () => { onSave(task.id, draft); setEditing(false); };
  const transition = (status: string) => onSave(task.id, { status });
  return (
    <Sheet open={!!task} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader><div className="flex items-center gap-2"><StatusBadge status={task.status} /></div><SheetTitle className="text-lg">{task.name}</SheetTitle><SheetDescription className="flex items-center gap-2 text-xs"><Building2 className="h-3 w-3" />{task.projectName ?? "Unknown project"}<span className="mx-1">•</span><Calendar className="h-3 w-3" />Due {fmtDate(task.dueDate)}</SheetDescription></SheetHeader>
        <div className="py-4 space-y-5">
          <div className="flex flex-wrap gap-2">
            {task.status === "not_started" && <Button size="sm" onClick={() => transition("in_progress")} disabled={saving} className="gap-2"><Play className="h-3.5 w-3.5" />Start</Button>}
            {task.status === "in_progress" && <Button size="sm" onClick={() => transition("completed")} disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Complete</Button>}
            {task.status !== "blocked" && task.status !== "completed" && <Button size="sm" variant="outline" onClick={() => transition("blocked")} disabled={saving} className="gap-2"><Ban className="h-3.5 w-3.5" />Block</Button>}
            {task.status === "blocked" && <Button size="sm" onClick={() => transition("in_progress")} disabled={saving} className="gap-2"><Play className="h-3.5 w-3.5" />Unblock</Button>}
            {!editing && <Button size="sm" variant="outline" onClick={startEdit} className="gap-2 ml-auto"><Pencil className="h-3.5 w-3.5" />Edit</Button>}
            {editing && (<><Button size="sm" onClick={save} disabled={saving} className="gap-2 ml-auto"><CheckCircle2 className="h-3.5 w-3.5" />Save</Button><Button size="sm" variant="ghost" onClick={() => setEditing(false)} className="gap-2"><X className="h-3.5 w-3.5" />Cancel</Button></>)}
          </div>
          {!editing ? (<>
            <Field label="Description">{task.description ? <p className="text-sm whitespace-pre-wrap leading-relaxed">{task.description}</p> : <p className="text-sm text-muted-foreground italic">No description.</p>}</Field>
            <div className="grid grid-cols-2 gap-4"><Field label="Priority"><Badge variant="outline" className={`capitalize ${PRIORITY_TONES[task.priority] ?? ""}`}>{task.priority}</Badge></Field><Field label="Source">{task.source ?? "—"}</Field></div>
          </>) : (<>
            <div className="grid gap-2"><Label>Name</Label><Input value={draft.name ?? ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
            <div className="grid gap-2"><Label>Description</Label><Textarea rows={4} value={draft.description ?? ""} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Priority</Label><Select value={draft.priority ?? "medium"} onValueChange={(v) => setDraft({ ...draft, priority: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent></Select></div><div className="grid gap-2"><Label>Due date</Label><Input type="date" value={(draft.dueDate ?? "").slice(0,10)} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value || null })} /></div></div>
          </>)}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return (<div className="space-y-1"><p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p><div className="text-sm">{children}</div></div>); }

function CreateDialog({ open, onClose, onCreate, saving }: { open: boolean; onClose: () => void; onCreate: (t: Partial<Task>) => void; saving: boolean }) {
  const [form, setForm] = useState<Partial<Task>>({ name: "", description: "", priority: "medium", status: "not_started" });
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (!form.name?.trim()) return; onCreate(form); setForm({ name: "", description: "", priority: "medium", status: "not_started" }); };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg"><DialogHeader><DialogTitle>New task</DialogTitle><DialogDescription>Create a new project task.</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-2"><Label>Name *</Label><Input required value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Schedule rough-in inspection" /></div>
          <div className="grid gap-2"><Label>Description</Label><Textarea rows={3} value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Priority</Label><Select value={form.priority ?? "medium"} onValueChange={(v) => setForm({ ...form, priority: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent></Select></div><div className="grid gap-2"><Label>Due date</Label><Input type="date" value={(form.dueDate ?? "").slice(0,10)} onChange={(e) => setForm({ ...form, dueDate: e.target.value || null })} /></div></div>
          <DialogFooter><Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving || !form.name?.trim()} className="gap-2"><Plus className="h-4 w-4" />{saving ? "Creating…" : "Create task"}</Button></DialogFooter>
        </form></DialogContent>
    </Dialog>
  );
}
