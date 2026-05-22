import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Kanban, Brain, Loader2, DollarSign, Clock, GripVertical, Inbox, CalendarDays,
  AlertTriangle, Table2, LayoutGrid, Search, Building2, ArrowUpDown, ChevronRight,
  CheckCircle2, X, Sparkles, ExternalLink, ListChecks, Target, MapPin,
} from "lucide-react";

const STAGES = [
  { key: "new", label: "New" },
  { key: "capture", label: "Capture" },
  { key: "submitted", label: "Submitted" },
  { key: "awarded", label: "Awarded" },
  { key: "closed", label: "Closed" },
] as const;

interface PipelineItem {
  id: string | null;
  tenantId: string;
  entityType: string;
  entityId: string;
  stage: string;
  ownerUserId: string | null;
  priority: string | null;
  aiScore: number | null;
  aiScoreLabel: string | null;
  aiRationale: string | null;
  aiSummary: string | null;
  tags: string[] | null;
  nextActionAt: string | null;
  nextActionDescription: string | null;
  lastActivityAt: string | null;
  createdAt: string;
  updatedAt: string;
  opportunity: {
    id: string;
    title: string;
    synopsis: string | null;
    setAside: string | null;
    contractValue: string | number | null;
    dueAt: string | null;
    naicsCodes: string[] | null;
    locationJson: Record<string, unknown> | null;
    status: string | null;
    agency?: string | null;
  } | null;
}

function itemKey(item: PipelineItem): string {
  return item.id || `fallback-${item.entityId}`;
}

function formatCurrency(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num) || num === 0) return "—";
  if (num >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(1)}B`;
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(0)}K`;
  return `$${num.toFixed(0)}`;
}

function getDaysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function dueLabel(dateStr: string | null | undefined): string {
  const d = getDaysUntil(dateStr);
  if (d === null) return "—";
  if (d < 0) return `${Math.abs(d)}d overdue`;
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d < 30) return `${d}d`;
  return new Date(dateStr!).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const STAGE_TONES: Record<string, string> = {
  new: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  capture: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  submitted: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  awarded: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  closed: "bg-slate-500/15 text-slate-300 border-slate-500/30",
};
function StageBadge({ stage }: { stage: string }) {
  return <Badge variant="outline" className={`${STAGE_TONES[stage] ?? STAGE_TONES.new} text-[10px] capitalize`}>{stage}</Badge>;
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs text-muted-foreground">—</span>;
  const tone = score >= 70 ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
            : score >= 50 ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
            : "bg-red-500/15 text-red-300 border-red-500/30";
  return <Badge variant="outline" className={`${tone} font-mono text-[10px]`}>{score}</Badge>;
}

type SortKey = "title" | "agency" | "setAside" | "value" | "due" | "score" | "stage";
type SortDir = "asc" | "desc";

export default function CapturePipeline() {
  const { toast } = useToast();
  const [view, setView] = useState<"table" | "board">("table");
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [setAsideFilter, setSetAsideFilter] = useState<string>("all");
  const [scoreFilter, setScoreFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("due");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dragItemId, setDragItemId] = useState<string | null>(null);

  const { data: items = [], isLoading, error, refetch } = useQuery<PipelineItem[]>({
    queryKey: ["/api/capture/pipeline"],
  });

  const updateStageMutation = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: string }) => {
      const res = await apiRequest("PATCH", `/api/capture/pipeline/${id}`, { stage });
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/capture/pipeline"] }); toast({ title: "Stage updated" }); },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const scoreMutation = useMutation({
    mutationFn: async (entityIds: string[]) => {
      const results: any[] = [];
      for (const id of entityIds) {
        try { const r = await apiRequest("POST", `/api/capture/ai/score/${id}`); results.push(await r.json()); } catch {}
      }
      return results;
    },
    onSuccess: (d) => { queryClient.invalidateQueries({ queryKey: ["/api/capture/pipeline"] }); toast({ title: `Scored ${d.length} opp${d.length === 1 ? "" : "s"}` }); },
  });

  // Derive set-aside options
  const setAsideOptions = useMemo(() => {
    const s = new Set<string>();
    for (const i of items) if (i.opportunity?.setAside) s.add(i.opportunity.setAside);
    return Array.from(s).sort();
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      const o = i.opportunity;
      if (stageFilter !== "all" && i.stage !== stageFilter) return false;
      if (setAsideFilter !== "all" && o?.setAside !== setAsideFilter) return false;
      if (scoreFilter !== "all") {
        const s = i.aiScore;
        if (scoreFilter === "unscored" ? s !== null
          : scoreFilter === "hot" ? !(s !== null && s >= 70)
          : scoreFilter === "warm" ? !(s !== null && s >= 50 && s < 70)
          : scoreFilter === "cold" ? !(s !== null && s < 50) : false) return false;
      }
      if (q) {
        const hay = `${o?.title ?? ""} ${o?.agency ?? ""} ${o?.synopsis ?? ""} ${(o?.naicsCodes ?? []).join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, search, stageFilter, setAsideFilter, scoreFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    const getter: Record<SortKey, (i: PipelineItem) => any> = {
      title: (i) => (i.opportunity?.title || "").toLowerCase(),
      agency: (i) => (i.opportunity?.agency || "").toLowerCase(),
      setAside: (i) => (i.opportunity?.setAside || "").toLowerCase(),
      value: (i) => { const v = i.opportunity?.contractValue; return v == null ? -Infinity : Number(v); },
      due: (i) => { const d = i.opportunity?.dueAt ? new Date(i.opportunity.dueAt).getTime() : Number.MAX_SAFE_INTEGER; return d; },
      score: (i) => i.aiScore ?? -1,
      stage: (i) => i.stage,
    };
    const g = getter[sortKey];
    arr.sort((a, b) => { const av = g(a), bv = g(b); if (av < bv) return -1 * dir; if (av > bv) return 1 * dir; return 0; });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length, unscored: 0, hot: 0, warm: 0, cold: 0, overdue: 0 };
    for (const i of items) {
      for (const s of STAGES) if (i.stage === s.key) c[s.key] = (c[s.key] ?? 0) + 1;
      if (i.aiScore === null) c.unscored++;
      else if (i.aiScore >= 70) c.hot++;
      else if (i.aiScore >= 50) c.warm++;
      else c.cold++;
      const d = getDaysUntil(i.opportunity?.dueAt);
      if (d !== null && d < 0) c.overdue++;
    }
    return c;
  }, [items]);

  const toggleSort = (k: SortKey) => { if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc"); else { setSortKey(k); setSortDir("asc"); } };
  const toggleSelect = (k: string) => { const s = new Set(selected); if (s.has(k)) s.delete(k); else s.add(k); setSelected(s); };
  const toggleSelectAll = () => { if (selected.size === sorted.length) setSelected(new Set()); else setSelected(new Set(sorted.map(itemKey))); };

  const bulkMoveStage = (stage: string) => {
    const toMove = sorted.filter(i => selected.has(itemKey(i)) && i.id && i.stage !== stage);
    if (toMove.length === 0) return;
    Promise.all(toMove.map(i => updateStageMutation.mutateAsync({ id: i.id!, stage }))).then(() => setSelected(new Set()));
  };
  const bulkScore = () => {
    const ids = sorted.filter(i => selected.has(itemKey(i)) && i.aiScore === null).map(i => i.entityId);
    if (ids.length === 0) { toast({ title: "Nothing to score", description: "Selected items already have AI scores." }); return; }
    scoreMutation.mutate(ids);
    setSelected(new Set());
  };

  if (isLoading) {
    return <div className="flex-1 overflow-auto p-4 md:p-6 space-y-3"><Skeleton className="h-8 w-48" /><Skeleton className="h-10 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }
  if (error) {
    return <div className="flex-1 overflow-auto p-4 md:p-6"><Card><CardContent className="py-10 text-center"><AlertTriangle className="h-8 w-8 text-red-400 mx-auto mb-2" /><p className="text-sm text-red-400 mb-2">Failed to load pipeline</p><Button size="sm" onClick={() => refetch()}>Retry</Button></CardContent></Card></div>;
  }

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6 space-y-3" data-testid="page-capture-pipeline">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <Kanban className="h-6 w-6 text-blue-400" />
          <div>
            <h1 className="text-xl font-bold leading-tight">Capture Pipeline</h1>
            <p className="text-xs text-muted-foreground">{counts.all} opportunities {counts.overdue > 0 && <span className="text-red-400">• {counts.overdue} overdue</span>}{counts.unscored > 0 && <span className="text-amber-400"> • {counts.unscored} unscored</span>}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border border-border bg-card p-0.5">
            <Button size="sm" variant={view === "table" ? "default" : "ghost"} onClick={() => setView("table")} className="h-7 gap-1 px-2" data-testid="btn-view-table"><Table2 className="h-3.5 w-3.5" />Table</Button>
            <Button size="sm" variant={view === "board" ? "default" : "ghost"} onClick={() => setView("board")} className="h-7 gap-1 px-2" data-testid="btn-view-board"><LayoutGrid className="h-3.5 w-3.5" />Board</Button>
          </div>
          {counts.unscored > 0 && <Button size="sm" variant="outline" onClick={() => scoreMutation.mutate((items.filter(i => i.aiScore === null && i.entityId).slice(0, 10).map(i => i.entityId)))} disabled={scoreMutation.isPending} className="gap-1.5"><Brain className="h-3.5 w-3.5" />{scoreMutation.isPending ? "Scoring…" : `Score next ${Math.min(10, counts.unscored)}`}</Button>}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search title, agency, NAICS…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" data-testid="input-search" />
        </div>
        <Select value={stageFilter} onValueChange={setStageFilter}><SelectTrigger className="w-[150px] h-9" data-testid="filter-stage"><SelectValue placeholder="Stage" /></SelectTrigger><SelectContent><SelectItem value="all">All stages ({counts.all})</SelectItem>{STAGES.map(s => <SelectItem key={s.key} value={s.key}>{s.label} ({counts[s.key] ?? 0})</SelectItem>)}</SelectContent></Select>
        <Select value={setAsideFilter} onValueChange={setSetAsideFilter}><SelectTrigger className="w-[160px] h-9" data-testid="filter-setaside"><SelectValue placeholder="Set-aside" /></SelectTrigger><SelectContent><SelectItem value="all">All set-asides</SelectItem>{setAsideOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
        <Select value={scoreFilter} onValueChange={setScoreFilter}><SelectTrigger className="w-[140px] h-9" data-testid="filter-score"><SelectValue placeholder="AI Score" /></SelectTrigger><SelectContent><SelectItem value="all">All scores</SelectItem><SelectItem value="hot">Hot ({counts.hot})</SelectItem><SelectItem value="warm">Warm ({counts.warm})</SelectItem><SelectItem value="cold">Cold ({counts.cold})</SelectItem><SelectItem value="unscored">Unscored ({counts.unscored})</SelectItem></SelectContent></Select>
      </div>

      {/* Bulk action bar — only when selection is non-empty */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 flex-wrap py-1.5 px-3 rounded-md bg-blue-500/10 border border-blue-500/30" data-testid="bulk-action-bar">
          <span className="text-sm font-medium text-blue-200">{selected.size} selected</span>
          <span className="text-xs text-muted-foreground hidden sm:inline">— move to:</span>
          {STAGES.map(s => <Button key={s.key} size="sm" variant="outline" onClick={() => bulkMoveStage(s.key)} className="h-7 px-2 text-xs">{s.label}</Button>)}
          <Button size="sm" variant="outline" onClick={bulkScore} disabled={scoreMutation.isPending} className="h-7 px-2 gap-1 text-xs"><Brain className="h-3 w-3" />Score</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} className="h-7 ml-auto"><X className="h-3.5 w-3.5" /></Button>
        </div>
      )}

      {view === "table" ? (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-pipeline">
              <thead className="bg-muted/30 border-b border-border">
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="w-8 p-2"><Checkbox checked={selected.size > 0 && selected.size === sorted.length} onCheckedChange={toggleSelectAll} aria-label="Select all" data-testid="checkbox-select-all" /></th>
                  <SortableTh col="title" label="Opportunity" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortableTh col="agency" label="Agency" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortableTh col="setAside" label="Set-aside" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortableTh col="value" label="Value" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                  <SortableTh col="due" label="Due" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortableTh col="score" label="Score" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="center" />
                  <SortableTh col="stage" label="Stage" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <th className="p-2 text-right text-[10px] uppercase">Action</th>
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 && <tr><td colSpan={9} className="py-12 text-center text-sm text-muted-foreground">{items.length === 0 ? "No opportunities in pipeline yet." : "No matches — try widening your filters."}</td></tr>}
                {sorted.map((it) => {
                  const o = it.opportunity;
                  const k = itemKey(it);
                  const days = getDaysUntil(o?.dueAt);
                  const overdue = days !== null && days < 0;
                  return (
                    <tr key={k} className={`border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors ${selected.has(k) ? "bg-blue-500/5" : ""}`} data-testid={`row-pipeline-${k}`}>
                      <td className="p-2"><Checkbox checked={selected.has(k)} onCheckedChange={() => toggleSelect(k)} aria-label="Select row" /></td>
                      <td className="p-2 max-w-[24rem]">
                        <Link href={`/capture/opportunity/${it.entityId}`} className="block group">
                          <p className="font-medium text-sm leading-tight truncate text-foreground group-hover:text-blue-300 transition-colors">{o?.title ?? "(no title)"}</p>
                          {o?.naicsCodes?.length ? <p className="text-[10px] text-muted-foreground font-mono mt-0.5">NAICS {o.naicsCodes.slice(0,2).join(", ")}</p> : null}
                        </Link>
                      </td>
                      <td className="p-2 text-xs text-muted-foreground"><span className="flex items-center gap-1"><Building2 className="h-3 w-3 shrink-0" /><span className="truncate max-w-[10rem]" title={o?.agency || ""}>{o?.agency || "—"}</span></span></td>
                      <td className="p-2"><span className="text-xs">{o?.setAside || "—"}</span></td>
                      <td className="p-2 text-right font-mono text-xs">{formatCurrency(o?.contractValue)}</td>
                      <td className="p-2 text-xs"><span className={`inline-flex items-center gap-1 ${overdue ? "text-red-400 font-medium" : days != null && days < 7 ? "text-amber-300" : "text-muted-foreground"}`}><CalendarDays className="h-3 w-3" />{dueLabel(o?.dueAt)}</span></td>
                      <td className="p-2 text-center"><ScoreBadge score={it.aiScore} /></td>
                      <td className="p-2"><StageBadge stage={it.stage} /></td>
                      <td className="p-2 text-right"><Link href={`/capture/opportunity/${it.entityId}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ChevronRight className="h-4 w-4" /></Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {sorted.length > 0 && <div className="px-3 py-2 text-[11px] text-muted-foreground border-t border-border bg-muted/20 flex items-center justify-between"><span>Showing {sorted.length} of {items.length} opportunities</span><span className="flex items-center gap-3"><span><Sparkles className="h-3 w-3 inline mr-1 text-emerald-400" />{counts.hot} hot</span><span><Target className="h-3 w-3 inline mr-1 text-amber-400" />{counts.warm} warm</span><span><Clock className="h-3 w-3 inline mr-1 text-red-400" />{counts.overdue} overdue</span></span></div>}
        </Card>
      ) : (
        <BoardView items={sorted} updateStage={(id, stage) => updateStageMutation.mutate({ id, stage })} dragItemId={dragItemId} setDragItemId={setDragItemId} />
      )}
    </div>
  );
}

function SortableTh({ col, label, sortKey, sortDir, onSort, align }: { col: SortKey; label: string; sortKey: SortKey; sortDir: SortDir; onSort: (k: SortKey) => void; align?: "right" | "center" }) {
  const isActive = sortKey === col;
  return (
    <th className={`p-2 ${align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"}`}>
      <button onClick={() => onSort(col)} className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider transition-colors ${isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`} data-testid={`sort-${col}`}>
        {label}
        <ArrowUpDown className={`h-3 w-3 ${isActive ? "opacity-100" : "opacity-30"}`} />
        {isActive && <span className="text-[8px]">{sortDir === "asc" ? "↑" : "↓"}</span>}
      </button>
    </th>
  );
}

function BoardView({ items, updateStage, dragItemId, setDragItemId }: { items: PipelineItem[]; updateStage: (id: string, stage: string) => void; dragItemId: string | null; setDragItemId: (id: string | null) => void }) {
  const getStageItems = (stage: string) => items.filter((i) => i.stage === stage);
  return (
    <div className="flex gap-3 overflow-x-auto pb-3" data-testid="board-view">
      {STAGES.map((s) => {
        const stageItems = getStageItems(s.key);
        return (
          <div key={s.key} className="min-w-[260px] w-[260px] shrink-0" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData("text/plain") || dragItemId; const it = items.find(x => itemKey(x) === id); if (it?.id && it.stage !== s.key) updateStage(it.id, s.key); setDragItemId(null); }}>
            <div className="sticky top-0 z-10 flex items-center justify-between p-2 mb-2 rounded-md bg-card border border-border"><span className="text-xs font-semibold uppercase tracking-wider">{s.label}</span><Badge variant="outline" className="text-[10px]">{stageItems.length}</Badge></div>
            <div className="space-y-2">
              {stageItems.length === 0 && <div className="text-center py-6 text-xs text-muted-foreground border border-dashed border-border rounded-md"><Inbox className="h-4 w-4 mx-auto mb-1 opacity-50" />No items</div>}
              {stageItems.map((it) => {
                const o = it.opportunity;
                const k = itemKey(it);
                const days = getDaysUntil(o?.dueAt);
                const overdue = days !== null && days < 0;
                return (
                  <Link key={k} href={`/capture/opportunity/${it.entityId}`} className="block">
                    <Card draggable={!!it.id} onDragStart={(e) => { setDragItemId(k); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", k); }} className="cursor-pointer hover:border-blue-500/40 transition-colors">
                      <CardContent className="p-2.5 space-y-1.5">
                        <div className="flex items-start gap-1.5">
                          <GripVertical className="h-3 w-3 text-muted-foreground/50 shrink-0 mt-0.5" />
                          <p className="text-xs font-medium leading-tight line-clamp-2 flex-1">{o?.title ?? "(no title)"}</p>
                        </div>
                        <div className="flex items-center justify-between gap-1.5 pl-4">
                          {o?.setAside && <Badge variant="outline" className="text-[9px] py-0 h-4 px-1.5">{o.setAside}</Badge>}
                          <ScoreBadge score={it.aiScore} />
                        </div>
                        <div className="flex items-center justify-between text-[10px] pl-4 text-muted-foreground">
                          <span className="font-mono">{formatCurrency(o?.contractValue)}</span>
                          <span className={overdue ? "text-red-400 font-medium" : days != null && days < 7 ? "text-amber-300" : ""}>{dueLabel(o?.dueAt)}</span>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
