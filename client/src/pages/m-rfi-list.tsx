/**
 * Sprint M6.1 — Mobile RFI list view
 *
 * Counterpart to m-rfi.tsx (the create page). Shows RFIs scoped to the
 * active project with status pills + tap-to-detail. Supports filter
 * by status (draft / open / answered / closed).
 *
 * Route: /m-rfi-list
 */

import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { FileText, ChevronLeft, Plus, Filter, AlertTriangle } from "lucide-react";
import { apiFetch } from "@/lib/offline-queue";
import { useProjectContext } from "@/nav/project-context";
import { SafeArea } from "@/components/ui/safe-area";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { useQueryClient } from "@tanstack/react-query";
import { CardTiered } from "@/components/ui/card-tiered";
import { StatusPill } from "@/components/ui/status-pill";
import MobileTabBar from "@/components/mobile/m-tab-bar";

interface Rfi {
  id: string;
  rfiNumber?: string | number | null;
  subject: string;
  question?: string;
  status?: string;
  priority?: "low" | "normal" | "high" | "urgent";
  createdAt?: string;
  draftedBy?: string;
  answeredAt?: string | null;
}

type Filter = "all" | "draft" | "open" | "answered" | "closed";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "draft", label: "Draft" },
  { id: "open", label: "Open" },
  { id: "answered", label: "Answered" },
  { id: "closed", label: "Closed" },
];

function fmtRel(iso?: string): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

export default function MobileRfiListPage() {
  const qcFw3 = useQueryClient();
  const ptrFw3 = usePullToRefresh({
    onRefresh: () => qcFw3.invalidateQueries({ queryKey: ["/api/rfi-drafts"] }),
  });
  const [, setLocation] = useLocation();
  const { selectedProjectId } = useProjectContext();
  const [filter, setFilter] = useState<Filter>("all");

  const projectId = selectedProjectId || "default";
  const { data, isLoading, error } = useQuery<Rfi[]>({
    queryKey: ["/api/projects", projectId, "rfis"],
    queryFn: async () => {
      const r = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/rfis`);
      if (!r.ok) {
        // RFI endpoint signature varies — also try /api/rfis?projectId=...
        const r2 = await apiFetch(`/api/rfis?projectId=${encodeURIComponent(projectId)}`);
        if (!r2.ok) throw new Error(`HTTP ${r2.status}`);
        const j2 = await r2.json();
        return Array.isArray(j2) ? j2 : (j2.items || []);
      }
      const j = await r.json();
      return Array.isArray(j) ? j : (j.items || []);
    },
    enabled: !!selectedProjectId,
    staleTime: 30_000,
  });

  const filtered = useMemo(() => {
    const list = data ?? [];
    if (filter === "all") return list;
    return list.filter((r) => (r.status || "").toLowerCase() === filter);
  }, [data, filter]);

  return (
    <SafeArea {...ptrFw3.bind} sides={["top", "bottom"]} className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/95 backdrop-blur px-4 py-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setLocation("/m-home")}
          aria-label="Back"
          className="rounded p-1 hover:bg-slate-800"
        >
          <ChevronLeft size={20} />
        </button>
        <FileText size={20} className="text-emerald-400" />
        <div className="flex-1">
          <h1 className="text-lg font-bold tracking-tight">RFIs</h1>
          <p className="text-xs text-slate-400">
            {filtered.length} {filter === "all" ? "total" : filter}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setLocation("/m-rfi")}
          aria-label="New RFI"
          className="rounded-lg bg-emerald-700 hover:bg-emerald-600 px-3 py-1.5 text-xs font-semibold flex items-center gap-1"
        >
          <Plus size={14} /> New
        </button>
      </header>

      {/* Filter chips */}
      <div
        data-testid="m-rfi-list-filters"
        className="px-4 py-3 flex gap-2 overflow-x-auto border-b border-slate-800/60"
      >
        <Filter size={14} className="self-center text-slate-500 shrink-0" />
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            data-testid={`m-rfi-filter-${f.id}`}
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold border ${
              filter === f.id
                ? "bg-emerald-700 border-emerald-600 text-white"
                : "bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <main className="px-4 py-4 space-y-3 max-w-3xl mx-auto pb-24">
        {!selectedProjectId && (
          <div className="rounded-lg bg-amber-950/40 border border-amber-900/60 px-3 py-2 text-xs text-amber-200 flex items-start gap-2">
            <AlertTriangle size={14} className="mt-[2px] shrink-0" />
            <span>Pick a project from the top picker to load its RFIs.</span>
          </div>
        )}

        {isLoading && (
          <div className="rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-6 text-center text-xs text-slate-400">
            Loading RFIs…
          </div>
        )}

        {error && !isLoading && (
          <div className="rounded-lg bg-rose-950/40 border border-rose-900/60 px-3 py-2 text-xs text-rose-300 flex items-start gap-2">
            <AlertTriangle size={14} className="mt-[2px] shrink-0" />
            <span>Couldn't load RFIs: {(error as Error).message}</span>
          </div>
        )}

        {!isLoading && !error && filtered.length === 0 && (
          <div className="rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-10 text-center">
            <FileText size={28} className="mx-auto text-slate-600 mb-2" />
            <p className="text-sm font-semibold text-slate-300">
              {filter === "all" ? "No RFIs yet" : `No ${filter} RFIs`}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Tap <span className="text-emerald-400">New</span> to draft one with voice.
            </p>
          </div>
        )}

        {filtered.map((r) => {
          const status = (r.status || "draft").toLowerCase();
          const tone =
            status === "answered" || status === "closed"
              ? "ok"
              : status === "open"
                ? "info"
                : status === "urgent"
                  ? "alert"
                  : "watch";
          const ref = r.rfiNumber ? `RFI-${r.rfiNumber}` : r.id.slice(0, 6);
          return (
            <CardTiered
              key={r.id}
              tier="secondary"
              data-testid={`m-rfi-row-${r.id}`}
              className="p-3 cursor-pointer hover:bg-slate-900/80"
              onClick={() => setLocation(`/rfis/${r.id}`)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] uppercase tracking-wider text-slate-500">{ref}</span>
                    {r.priority && r.priority !== "normal" && (
                      <span
                        className={`text-[10px] uppercase tracking-wider px-1.5 rounded ${
                          r.priority === "urgent"
                            ? "bg-rose-950 text-rose-300"
                            : r.priority === "high"
                              ? "bg-amber-950 text-amber-300"
                              : "bg-slate-800 text-slate-300"
                        }`}
                      >
                        {r.priority}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-slate-100 truncate">{r.subject}</p>
                  {r.question && (
                    <p className="mt-1 text-xs text-slate-400 line-clamp-2">{r.question}</p>
                  )}
                  <p className="mt-2 text-[10px] text-slate-500">
                    {r.draftedBy ? `${r.draftedBy} · ` : ""}{fmtRel(r.createdAt)}
                  </p>
                </div>
                <StatusPill status={status as never} tone={tone as never} />
              </div>
            </CardTiered>
          );
        })}
      </main>
    <MobileTabBar active="home" />
    </SafeArea>
  );
}
