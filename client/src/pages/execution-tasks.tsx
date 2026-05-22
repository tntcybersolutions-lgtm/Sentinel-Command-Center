import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { CheckSquare, Plus, Search, Building2, Calendar, User, ChevronRight, CheckCircle2, Circle, X, Pencil, ListChecks, Link2, AlertCircle, RefreshCw, PlayCircle, PauseCircle, Ban } from "lucide-react";

interface Subtask { id: string; text: string; done: boolean; }
interface LinkedRfi { id: string; rfiNumber: string; subject?: string; }
interface Task {
  id: string; name: string; description?: string; projectId: string; projectName?: string;
  assignees?: string; status: string; priority: string; labels?: string;
  dueDate?: string | null; completedAt?: string | null; source?: string;
  subtasks?: Subtask[]; linkedRfis?: LinkedRfi[];
  createdAt: string; updatedAt?: string;
}
interface Project { id: string; name: string; }
interface Rfi { id: string; rfiNumber: string; subject: string; projectId: string; }

const STATUS_TONES: Record<string,string> = { not_started:"bg-slate-500/15 text-slate-300 border-slate-500/30", in_progress:"bg-blue-500/15 text-blue-300 border-blue-500/30", completed:"bg-emerald-500/15 text-emerald-300 border-emerald-500/30", blocked:"bg-red-500/15 text-red-300 border-red-500/30", cancelled:"bg-slate-600/20 text-slate-400 border-slate-600/30" };
const PRIORITY_TONES: Record<string,string> = { low:"bg-slate-500/15 text-slate-300 border-slate-500/30", medium:"bg-blue-500/15 text-blue-300 border-blue-500/30", high:"bg-amber-500/15 text-amber-300 border-amber-500/30", urgent:"bg-red-500/15 text-red-300 border-red-500/30" };
function StatusBadge({ status }: { status: string }) { const cls = STATUS_TONES[status] ?? STATUS_TONES.not_started; return <Badge variant="outline" className={`${cls} capitalize text-[10px]`}>{status.replace(/_/g," ")}</Badge>; }
const fmtDate = (d?: string | null) => { if (!d) return "—"; const dt = new Date(d); return isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); };
const isOverdue = (t: Task) => { if (!t.dueDate || t.status === "completed" || t.status === "cancelled") return false; const d = new Date(t.dueDate); return !isNaN(d.getTime()) && d < new Date(); };
const parseAssignees = (a?: string): string[] => { if (!a) return []; try { const j = JSON.parse(a); return Array.isArray(j) ? j : [a]; } catch { return a.split(",").map(s => s.trim()).filter(Boolean); } };

export default function ExecutionTasks() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Task | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const { data: projects = [] } = useQuery<Project[]>({ queryKey: ["/api/projects"], queryFn: async () => { const r = await fetch("/api/projects"); if (!r.ok) return []; return r.json(); }, staleTime: 60_000 });
  const { data: rfis = [] } = useQuery<Rfi[]>({ queryKey: ["/api/rfis"], queryFn: async () => { const r = await fetch("/api/rfis"); if (!r.ok) return []; return r.json(); }, staleTime: 60_000 });
  const { data: tasks = [], isLoading, isError, refetch } = useQuery<Task[]>({ queryKey: ["/api/project-tasks"], queryFn: async () => { const r = await fetch("/api/project-tasks"); if (!r.ok) throw new Error("Failed to load tasks"); return r.json(); }, staleTime: 30_000 });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Task> }) => apiRequest("PATCH", `/api/project-tasks/${id}`, updates),
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/project-tasks"] });
      const prev = queryClient.getQueryData<Task[]>(["/api/project-tasks"]);
      queryClient.setQueryData<Task[]>(["/api/project-tasks"], (old = []) => old.map(t => t.id === id ? { ...t, ...updates } : t));
      return { prev };
    },
    onError: (e: any, _v, ctx: any) => { if (ctx?.prev) queryClient.setQueryData(["/api/project-tasks"], ctx.prev); toast({ title: "Update failed", description: e?.message, variant: "destructive" }); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/project-tasks"] }); queryClient.invalidateQueries({ queryKey: ["/api/nav-counts"] }); },
  });
  const createMutation = useMutation({
    mutationFn: async (t: Partial<Task>) => apiRequest("POST", "/api/project-tasks", t),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/project-tasks"] }); queryClient.invalidateQueries({ queryKey: ["/api/nav-counts"] }); toast({ title: "Task created" }); setCreateOpen(false); },
    onError: (e: any) => toast({ title: "Create failed", description: e?.message ?? "Server rejected the request", variant: "destructive" }),
  });

  const toggleComplete = (t: Task) => { const newStatus = t.status === "completed" ? "in_progress" : "completed"; updateMutation.mutate({ id: t.id, updates: { status: newStatus, completedAt: newStatus === "completed" ? new Date().toISOString() : null } as any }); };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter(t => {
      if (projectFilter !== "all" && t.projectId !== projectFilter) return false;
      if (statusFilter === "active") { if (t.status === "completed" || t.status === "cancelled") return false; }
      else if (statusFilter === "overdue") { if (!isOverdue(t)) return false; }
      else if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (q && !`${t.name} ${t.description ?? ""} ${t.assignees ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tasks, search, statusFilter, projectFilter]);

  const counts = useMemo(() => {
    const scope = projectFilter === "all" ? tasks : tasks.filter(t => t.projectId === projectFilter);
    const c: Record<string, number> = { all: scope.length, active: scope.filter(t => t.status !== "completed" && t.status !== "cancelled").length, overdue: scope.filter(isOverdue).length };
    for (const t of scope) c[t.status] = (c[t.status] ?? 0) + 1;
    return c;
  }, [tasks, projectFilter]);

  return (
    <div className="space-y-4 p-4 md:p-6" data-testid="page-execution-tasks">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-bold flex items-center gap-2"><CheckSquare className="h-6 w-6 text-blue-400" />Tasks{counts.overdue > 0 && <Badge variant="outline" className="bg-red-500/15 text-red-300 border-red-500/30 ml-2">{counts.overdue} overdue</Badge>}</h1><p className="text-sm text-muted-foreground">Field tasks, punch items, and follow-ups across all active projects</p></div>
        <div className="flex items-center gap-2"><Button variant="ghost" size="sm" onClick={() => refetch()} className="gap-2" data-testid="button-refresh"><RefreshCw className="h-4 w-4" /></Button><Button onClick={() => setCreateOpen(true)} className="gap-2" data-testid="button-new-task"><Plus className="h-4 w-4" />New Task</Button></div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px]"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Search by name, description, assignee…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" data-testid="input-search" /></div>
        <Select value={projectFilter} onValueChange={setProjectFilter}><SelectTrigger className="w-[220px]" data-testid="select-project-filter"><Building2 className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" /><SelectValue placeholder="All projects" /></SelectTrigger><SelectContent><SelectItem value="all">All projects ({tasks.length})</SelectItem>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap text-xs">
        {[{ k: "active", l: "Active" },{ k: "all", l: "All" },{ k: "not_started", l: "Not started" },{ k: "in_progress", l: "In progress" },{ k: "completed", l: "Completed" },{ k: "blocked", l: "Blocked" },{ k: "overdue", l: "Overdue" }].map(f => (
          <button key={f.k} onClick={() => setStatusFilter(f.k)} data-testid={`chip-${f.k}`} className={`px-2.5 py-1 rounded-full border transition-colors ${statusFilter === f.k ? "bg-blue-500/15 text-blue-300 border-blue-500/40" : "bg-white/[0.02] text-muted-foreground border-white/10 hover:border-white/20"}`}>{f.l}{counts[f.k] != null && <span className="ml-1.5 text-[10px] opacity-70">{counts[f.k]}</span>}</button>
        ))}
      </div>
      <Card><CardHeader className="py-2 px-4 border-b border-white/10"><CardTitle className="text-xs font-medium text-muted-foreground grid grid-cols-12 gap-3"><span className="col-span-1"></span><span className="col-span-5">Task</span><span className="col-span-2">Assignee</span><span className="col-span-2">Due</span><span className="col-span-1">Sub/RFI</span><span className="col-span-1 text-right">Status</span></CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading && <div className="px-6 py-12 text-center text-sm text-muted-foreground">Loading tasks…</div>}
          {isError && <div className="px-6 py-12 text-center text-sm"><p className="text-red-400 mb-2">Couldn't load tasks</p><Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button></div>}
          {!isLoading && !isError && filtered.length === 0 && <div className="px-6 py-12 text-center text-sm text-muted-foreground">{search ? "No tasks match your search." : "No tasks here. Click “New Task” to create one."}</div>}
          {!isLoading && filtered.map((t) => { const overdue = isOverdue(t); const done = t.status === "completed"; const subs = t.subtasks ?? []; const subDone = subs.filter(s => s.done).length; const linked = t.linkedRfis ?? []; const assignees = parseAssignees(t.assignees); return (
            <div key={t.id} className="group w-full grid grid-cols-12 gap-3 px-4 py-3 border-b last:border-b-0 border-white/10 text-left hover:bg-white/[0.03] transition-colors items-center" data-testid={`row-task-${t.id}`}>
              <button onClick={(e) => { e.stopPropagation(); toggleComplete(t); }} className="col-span-1 flex items-center justify-center" data-testid={`button-complete-${t.id}`}>{done ? <CheckCircle2 className="h-5 w-5 text-emerald-400" /> : <Circle className="h-5 w-5 text-muted-foreground hover:text-foreground transition-colors" />}</button>
              <button onClick={() => setSelected(t)} className="col-span-12 md:col-span-5 text-left"><p className={`text-sm font-medium truncate ${done ? "line-through text-muted-foreground" : ""}`}>{t.name}</p>{t.description && <p className="text-xs text-muted-foreground line-clamp-1">{t.description}</p>}{t.projectName && projectFilter === "all" && <p className="text-[10px] text-muted-foreground mt-0.5"><Building2 className="h-2.5 w-2.5 inline mr-0.5" />{t.projectName}</p>}</button>
              <button onClick={() => setSelected(t)} className="col-span-6 md:col-span-2 text-xs text-left">{assignees.length > 0 ? <span className="flex items-center gap-1"><User className="h-3 w-3" />{assignees.slice(0,2).join(", ")}{assignees.length > 2 && <span className="text-muted-foreground"> +{assignees.length - 2}</span>}</span> : <span className="text-muted-foreground italic">Unassigned</span>}</button>
              <button onClick={() => setSelected(t)} className={`col-span-6 md:col-span-2 text-xs text-left ${overdue ? "text-red-400 font-semibold" : "text-muted-foreground"}`}><Calendar className="h-3 w-3 inline mr-1" />{fmtDate(t.dueDate)}{overdue && <span className="ml-1">• Overdue</span>}</button>
              <button onClick={() => setSelected(t)} className="col-span-6 md:col-span-1 text-xs text-left text-muted-foreground space-x-2">{subs.length > 0 && <span><ListChecks className="h-3 w-3 inline" /> {subDone}/{subs.length}</span>}{linked.length > 0 && <span><Link2 className="h-3 w-3 inline" /> {linked.length}</span>}</button>
              <button onClick={() => setSelected(t)} className="col-span-6 md:col-span-1 flex items-center justify-end gap-1"><StatusBadge status={t.status} /><ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground hidden md:inline" /></button>
            </div>
          ); })}
        </CardContent></Card>
      <TaskSheet task={selected} onClose={() => setSelected(null)} onSave={(id, updates) => updateMutation.mutate({ id, updates })} saving={updateMutation.isPending} rfis={rfis} />
      <CreateTaskDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreate={(t) => createMutation.mutate(t)} saving={createMutation.isPending} projects={projects} rfis={rfis} defaultProjectId={projectFilter !== "all" ? projectFilter : undefined} />
    </div>
  );
}

function Field({ icon: Icon, label, children }: { icon: any; label: string; children: any }) {
  return <div className="space-y-1"><div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground"><Icon className="h-3 w-3" />{label}</div><div>{children}</div></div>;
}

function TaskSheet({ task, onClose, onSave, saving, rfis }: { task: Task | null; onClose: () => void; onSave: (id: string, updates: Partial<Task>) => void; saving: boolean; rfis: Rfi[] }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<Task>>({});
  const [newSubtask, setNewSubtask] = useState("");
  const [linkRfiOpen, setLinkRfiOpen] = useState(false);
  useEffect(() => { setEditing(false); }, [task?.id]);
  if (!task) return null;
  const startEdit = () => { setDraft({ name: task.name, description: task.description ?? "", priority: task.priority, dueDate: task.dueDate ?? "", assignees: task.assignees ?? "" }); setEditing(true); };
  const save = () => { onSave(task.id, draft); setEditing(false); };
  const subtasks = task.subtasks ?? [];
  const toggleSubtask = (id: string) => { const next = subtasks.map(s => s.id === id ? { ...s, done: !s.done } : s); onSave(task.id, { subtasks: next } as any); };
  const addSubtask = () => { if (!newSubtask.trim()) return; const next = [...subtasks, { id: `sub-${Date.now()}`, text: newSubtask.trim(), done: false }]; onSave(task.id, { subtasks: next } as any); setNewSubtask(""); };
  const removeSubtask = (id: string) => { onSave(task.id, { subtasks: subtasks.filter(s => s.id !== id) } as any); };
  const linkedRfis = task.linkedRfis ?? [];
  const linkRfi = (rfi: Rfi) => { if (linkedRfis.some(l => l.id === rfi.id)) return; onSave(task.id, { linkedRfis: [...linkedRfis, { id: rfi.id, rfiNumber: rfi.rfiNumber, subject: rfi.subject }] } as any); setLinkRfiOpen(false); };
  const unlinkRfi = (id: string) => { onSave(task.id, { linkedRfis: linkedRfis.filter(l => l.id !== id) } as any); };
  const projectRfis = rfis.filter(r => r.projectId === task.projectId);
  return (
    <Sheet open={!!task} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader><div className="flex items-center gap-2 flex-wrap"><StatusBadge status={task.status} /><Badge variant="outline" className={`capitalize text-[10px] ${PRIORITY_TONES[task.priority] ?? ""}`}>{task.priority}</Badge>{task.source && task.source !== "manual" && <Badge variant="outline" className="text-[10px]">via {task.source}</Badge>}</div><SheetTitle className="text-lg">{task.name}</SheetTitle><SheetDescription className="flex items-center gap-2 text-xs flex-wrap"><Building2 className="h-3 w-3" />{task.projectName ?? "Unknown project"}<span className="mx-1">•</span><Calendar className="h-3 w-3" />Due {fmtDate(task.dueDate)}</SheetDescription></SheetHeader>
        <div className="py-4 space-y-5">
          <div className="flex flex-wrap gap-2">
            {task.status !== "completed" && <Button size="sm" onClick={() => onSave(task.id, { status: "completed", completedAt: new Date().toISOString() } as any)} disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Mark complete</Button>}
            {task.status === "completed" && <Button size="sm" variant="outline" onClick={() => onSave(task.id, { status: "in_progress", completedAt: null } as any)} disabled={saving} className="gap-2"><Circle className="h-3.5 w-3.5" />Re-open</Button>}
            {task.status === "not_started" && <Button size="sm" variant="outline" onClick={() => onSave(task.id, { status: "in_progress" })} disabled={saving} className="gap-2"><PlayCircle className="h-3.5 w-3.5" />Start</Button>}
            {task.status === "in_progress" && <Button size="sm" variant="outline" onClick={() => onSave(task.id, { status: "blocked" })} disabled={saving} className="gap-2 text-amber-300"><PauseCircle className="h-3.5 w-3.5" />Block</Button>}
            {task.status === "blocked" && <Button size="sm" variant="outline" onClick={() => onSave(task.id, { status: "in_progress" })} disabled={saving} className="gap-2"><PlayCircle className="h-3.5 w-3.5" />Unblock</Button>}
            {task.status !== "cancelled" && task.status !== "completed" && <Button size="sm" variant="ghost" onClick={() => onSave(task.id, { status: "cancelled" })} disabled={saving} className="gap-2 text-muted-foreground"><Ban className="h-3.5 w-3.5" />Cancel</Button>}
            {!editing && <Button size="sm" variant="outline" onClick={startEdit} className="gap-2 ml-auto"><Pencil className="h-3.5 w-3.5" />Edit</Button>}
            {editing && (<><Button size="sm" onClick={save} disabled={saving} className="gap-2 ml-auto"><CheckCircle2 className="h-3.5 w-3.5" />Save</Button><Button size="sm" variant="ghost" onClick={() => setEditing(false)}><X className="h-3.5 w-3.5" /></Button></>)}
          </div>
          {!editing ? (<>
            {task.description && <Field icon={ListChecks} label="Description"><p className="text-sm whitespace-pre-wrap leading-relaxed">{task.description}</p></Field>}
            <div className="grid grid-cols-2 gap-4"><Field icon={User} label="Assignees"><div className="flex flex-wrap gap-1">{parseAssignees(task.assignees).map((a, i) => <Badge key={i} variant="outline" className="text-[10px]"><User className="h-2.5 w-2.5 mr-1" />{a}</Badge>) || <span className="text-muted-foreground">—</span>}</div></Field><Field icon={AlertCircle} label="Priority"><Badge variant="outline" className={`capitalize ${PRIORITY_TONES[task.priority] ?? ""}`}>{task.priority}</Badge></Field><Field icon={Calendar} label="Due">{fmtDate(task.dueDate)}</Field>{task.completedAt && <Field icon={CheckCircle2} label="Completed">{fmtDate(task.completedAt)}</Field>}</div>
            <Field icon={ListChecks} label={`Subtasks (${subtasks.filter(s=>s.done).length}/${subtasks.length})`}>
              <ul className="space-y-1.5">{subtasks.map(s => <li key={s.id} className="flex items-center gap-2 py-1 px-2 rounded bg-white/[0.02] hover:bg-white/[0.04] group/sub"><Checkbox checked={s.done} onCheckedChange={() => toggleSubtask(s.id)} data-testid={`subtask-checkbox-${s.id}`} /><span className={`text-sm flex-1 ${s.done ? "line-through text-muted-foreground" : ""}`}>{s.text}</span><button onClick={() => removeSubtask(s.id)} className="opacity-0 group-hover/sub:opacity-100 transition-opacity"><X className="h-3 w-3 text-muted-foreground hover:text-red-400" /></button></li>)}</ul>
              <div className="flex items-center gap-2 mt-2"><Input placeholder="Add a subtask…" value={newSubtask} onChange={(e) => setNewSubtask(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSubtask())} className="h-8 text-sm" data-testid="input-new-subtask" /><Button size="sm" variant="outline" onClick={addSubtask} disabled={!newSubtask.trim() || saving} className="h-8 gap-1"><Plus className="h-3 w-3" />Add</Button></div>
            </Field>
            <Field icon={Link2} label={`Linked RFIs (${linkedRfis.length})`}>
              <div className="space-y-1.5">{linkedRfis.map(l => <div key={l.id} className="flex items-center gap-2 py-1.5 px-2 rounded bg-white/[0.02] border border-white/5 group/link"><Badge variant="outline" className="font-mono text-[10px] text-amber-300">{l.rfiNumber}</Badge><span className="text-sm flex-1 truncate">{l.subject ?? ""}</span><button onClick={() => unlinkRfi(l.id)} className="opacity-0 group-hover/link:opacity-100 transition-opacity"><X className="h-3 w-3 text-muted-foreground hover:text-red-400" /></button></div>)}</div>
              {!linkRfiOpen ? <Button size="sm" variant="outline" onClick={() => setLinkRfiOpen(true)} className="gap-1 mt-2 h-8"><Link2 className="h-3 w-3" />Link an RFI</Button> : (
                <div className="mt-2 p-2 rounded border border-white/10 bg-white/[0.02] max-h-60 overflow-y-auto"><div className="text-[11px] text-muted-foreground mb-1.5">Pick an RFI from this project ({projectRfis.length} available)</div>{projectRfis.length === 0 ? <p className="text-xs text-muted-foreground italic py-2">No RFIs in this project yet.</p> : projectRfis.filter(r => !linkedRfis.some(l => l.id === r.id)).map(r => <button key={r.id} onClick={() => linkRfi(r)} className="w-full text-left flex items-center gap-2 py-1.5 px-2 rounded hover:bg-white/[0.04]"><Badge variant="outline" className="font-mono text-[10px] text-amber-300">{r.rfiNumber}</Badge><span className="text-sm flex-1 truncate">{r.subject}</span></button>)}<Button size="sm" variant="ghost" onClick={() => setLinkRfiOpen(false)} className="mt-1">Cancel</Button></div>
              )}
            </Field>
          </>) : (<>
            <div className="grid gap-2"><Label>Name</Label><Input value={draft.name ?? ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
            <div className="grid gap-2"><Label>Description</Label><Textarea rows={4} value={draft.description ?? ""} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Assignees (comma-separated)</Label><Input placeholder="e.g. Jose, Marta" value={draft.assignees ?? ""} onChange={(e) => setDraft({ ...draft, assignees: e.target.value })} /></div>
              <div className="grid gap-2"><Label>Priority</Label><Select value={draft.priority ?? "medium"} onValueChange={(v) => setDraft({ ...draft, priority: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent></Select></div>
              <div className="grid gap-2"><Label>Due date</Label><Input type="date" value={(draft.dueDate ?? "").toString().slice(0,10)} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value || null })} /></div>
            </div>
          </>)}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function CreateTaskDialog({ open, onClose, onCreate, saving, projects, rfis, defaultProjectId }: { open: boolean; onClose: () => void; onCreate: (t: Partial<Task>) => void; saving: boolean; projects: Project[]; rfis: Rfi[]; defaultProjectId?: string }) {
  const [form, setForm] = useState<Partial<Task>>({ name: "", description: "", priority: "medium", projectId: defaultProjectId, assignees: "" });
  const [linkedRfiIds, setLinkedRfiIds] = useState<string[]>([]);
  useEffect(() => { if (open) { setForm({ name: "", description: "", priority: "medium", projectId: defaultProjectId, assignees: "", dueDate: "" }); setLinkedRfiIds([]); } }, [open, defaultProjectId]);
  const projectRfis = rfis.filter(r => r.projectId === form.projectId);
  const canSubmit = !!(form.projectId && form.name && form.name.trim());
  const handleCreate = () => { const linkedRfis = projectRfis.filter(r => linkedRfiIds.includes(r.id)).map(r => ({ id: r.id, rfiNumber: r.rfiNumber, subject: r.subject })); onCreate({ ...form, linkedRfis } as any); };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg" data-testid="dialog-new-task">
        <DialogHeader><DialogTitle>New Task</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-2"><Label>Project <span className="text-red-400">*</span></Label><Select value={form.projectId ?? ""} onValueChange={(v) => setForm({ ...form, projectId: v })}><SelectTrigger data-testid="select-project"><Building2 className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" /><SelectValue placeholder="Pick a project (required)" /></SelectTrigger><SelectContent>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select>{!form.projectId && <p className="text-[11px] text-amber-400">Required — prevents orphaned tasks.</p>}</div>
          <div className="grid gap-2"><Label>Name <span className="text-red-400">*</span></Label><Input placeholder="e.g. Install north-wall sheetrock" value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="input-name" /></div>
          <div className="grid gap-2"><Label>Description</Label><Textarea rows={3} value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2"><Label>Assignees (comma-sep)</Label><Input placeholder="Jose, Marta" value={form.assignees ?? ""} onChange={(e) => setForm({ ...form, assignees: e.target.value })} /></div>
            <div className="grid gap-2"><Label>Priority</Label><Select value={form.priority ?? "medium"} onValueChange={(v) => setForm({ ...form, priority: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent></Select></div>
            <div className="grid gap-2 col-span-2"><Label>Due date</Label><Input type="date" value={(form.dueDate ?? "").toString().slice(0,10)} onChange={(e) => setForm({ ...form, dueDate: e.target.value || null })} /></div>
          </div>
          {form.projectId && projectRfis.length > 0 && (
            <div className="grid gap-2"><Label className="flex items-center gap-1"><Link2 className="h-3 w-3" />Link RFIs ({linkedRfiIds.length} selected)</Label><div className="max-h-32 overflow-y-auto rounded border border-white/10 bg-white/[0.02] p-1">{projectRfis.map(r => <label key={r.id} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-white/[0.04] cursor-pointer"><Checkbox checked={linkedRfiIds.includes(r.id)} onCheckedChange={(v) => setLinkedRfiIds(v ? [...linkedRfiIds, r.id] : linkedRfiIds.filter(id => id !== r.id))} /><Badge variant="outline" className="font-mono text-[10px] text-amber-300">{r.rfiNumber}</Badge><span className="text-xs flex-1 truncate">{r.subject}</span></label>)}</div></div>
          )}
        </div>
        <DialogFooter><Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button><Button onClick={handleCreate} disabled={!canSubmit || saving} data-testid="button-create-task" className="gap-2">{saving ? "Creating…" : <><Plus className="h-4 w-4" />Create</>}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
