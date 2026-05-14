import { useMemo, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { GanttChartSquare, ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";

interface Milestone {
  id: string;
  name: string;
  status: string;
  startDate?: string | null;
  targetDate?: string | null;
  completedDate?: string | null;
  sortOrder?: number;
}
interface Dep { id: string; predecessorId: string; successorId: string; type: string; lagDays: number; }
interface Schedule { milestones: Milestone[]; dependencies: Dep[]; }

const DAY_MS = 86_400_000;
const ROW_H = 36;
const BAR_PAD = 6;

export default function ProjectSchedulePage() {
  const [, params] = useRoute("/projects/:id/schedule");
  const [, setLocation] = useLocation();
  const projectId = params?.id || "";
  const [weekOffset, setWeekOffset] = useState(0);

  const { data, isLoading } = useQuery<Schedule>({
    queryKey: [`/api/projects/${projectId}/schedule`],
    enabled: !!projectId,
  });

  const milestones = data?.milestones ?? [];
  const deps = data?.dependencies ?? [];

  // 12-week window centered on today + offset.
  const window = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startMs = today.getTime() - DAY_MS * 7 * 2 + weekOffset * DAY_MS * 7;
    const endMs = startMs + DAY_MS * 7 * 12;
    return { startMs, endMs };
  }, [weekOffset]);

  const days = useMemo(() => {
    const arr: number[] = [];
    for (let t = window.startMs; t < window.endMs; t += DAY_MS) arr.push(t);
    return arr;
  }, [window]);

  const pxPerDay = 24; // chart cell width
  const chartWidth = days.length * pxPerDay;

  function dateToPx(ts: number): number {
    return Math.round(((ts - window.startMs) / DAY_MS) * pxPerDay);
  }

  function barFor(m: Milestone): { x: number; w: number } | null {
    const startStr = m.startDate || m.targetDate;
    const endStr = m.completedDate || m.targetDate;
    if (!startStr && !endStr) return null;
    const s = new Date(startStr || endStr || "").getTime();
    const e = new Date(endStr || startStr || "").getTime();
    if (!Number.isFinite(s) || !Number.isFinite(e)) return null;
    const xStart = Math.max(0, dateToPx(s));
    const xEnd = Math.min(chartWidth, dateToPx(e + DAY_MS)); // +1 day so 1-day bars render
    const w = Math.max(8, xEnd - xStart);
    return { x: xStart, w };
  }

  function colorFor(status: string): string {
    if (status === "completed") return "fill-emerald-500/70 stroke-emerald-400";
    if (status === "in_progress") return "fill-blue-500/70 stroke-blue-400";
    if (status === "at_risk") return "fill-amber-500/70 stroke-amber-400";
    if (status === "delayed") return "fill-red-500/70 stroke-red-400";
    return "fill-zinc-600/60 stroke-zinc-500";
  }

  // Index milestones by id for dependency arrow drawing.
  const sorted = [...milestones].sort((a, b) =>
    (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
    new Date(a.targetDate || a.startDate || 0).getTime() - new Date(b.targetDate || b.startDate || 0).getTime()
  );
  const rowIndex: Record<string, number> = {};
  sorted.forEach((m, i) => (rowIndex[m.id] = i));

  const headerLabels = days.filter((_, i) => i % 7 === 0);

  return (
    <div className="min-h-screen p-4 md:p-6 bg-black/95 text-zinc-100">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
          <button
            onClick={() => setLocation(`/projects/${projectId}/cockpit`)}
            className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200"
            data-testid="schedule-back"
          >
            <ArrowLeft className="h-4 w-4" /> Back to project
          </button>
          <h1 className="text-lg md:text-xl font-bold flex items-center gap-2">
            <GanttChartSquare className="h-5 w-5" /> Schedule
          </h1>
          <div className="flex items-center gap-1">
            <button onClick={() => setWeekOffset(w => w - 4)} className="p-1.5 rounded-md border border-white/10 hover:bg-white/5" data-testid="schedule-prev"><ChevronLeft className="h-4 w-4" /></button>
            <button onClick={() => setWeekOffset(0)} className="px-2 py-1 text-xs rounded-md border border-white/10 hover:bg-white/5" data-testid="schedule-today">Today</button>
            <button onClick={() => setWeekOffset(w => w + 4)} className="p-1.5 rounded-md border border-white/10 hover:bg-white/5" data-testid="schedule-next"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>

        {isLoading ? (
          <div className="border border-white/10 rounded-lg bg-black/40 h-96 animate-pulse" />
        ) : milestones.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="border border-white/10 rounded-lg overflow-hidden bg-black/40">
            <div className="flex">
              {/* Left names column */}
              <div className="w-56 shrink-0 border-r border-white/10">
                <div className="h-10 border-b border-white/10 bg-black/60 px-3 text-[11px] uppercase tracking-wider text-zinc-500 flex items-center">
                  Milestone
                </div>
                {sorted.map((m) => (
                  <div key={m.id} style={{ height: ROW_H }} className="px-3 text-sm truncate border-b border-white/5 flex items-center" title={m.name} data-testid={`milestone-name-${m.id}`}>
                    {m.name}
                  </div>
                ))}
              </div>

              {/* Right gantt column */}
              <div className="flex-1 overflow-x-auto">
                <svg width={chartWidth} height={40 + sorted.length * ROW_H} className="block">
                  {/* Header: week labels */}
                  {headerLabels.map((t) => (
                    <text
                      key={t}
                      x={dateToPx(t) + 4}
                      y={26}
                      fontSize={11}
                      className="fill-zinc-500"
                    >
                      {new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </text>
                  ))}
                  {/* Day gridlines */}
                  {days.map((t, i) => (
                    <line key={t} x1={dateToPx(t)} x2={dateToPx(t)} y1={40} y2={40 + sorted.length * ROW_H} className={i % 7 === 0 ? "stroke-white/10" : "stroke-white/[0.03]"} strokeWidth={1} />
                  ))}
                  {/* Today line */}
                  {(() => {
                    const todayPx = dateToPx(Date.now());
                    if (todayPx < 0 || todayPx > chartWidth) return null;
                    return <line x1={todayPx} x2={todayPx} y1={32} y2={40 + sorted.length * ROW_H} className="stroke-amber-400" strokeWidth={1.5} strokeDasharray="3,3" />;
                  })()}
                  {/* Dependency arrows */}
                  {deps.map((d) => {
                    const pre = milestones.find(m => m.id === d.predecessorId);
                    const suc = milestones.find(m => m.id === d.successorId);
                    if (!pre || !suc) return null;
                    const preBar = barFor(pre); const sucBar = barFor(suc);
                    if (!preBar || !sucBar) return null;
                    const y1 = 40 + (rowIndex[pre.id] ?? 0) * ROW_H + ROW_H / 2;
                    const y2 = 40 + (rowIndex[suc.id] ?? 0) * ROW_H + ROW_H / 2;
                    const x1 = preBar.x + preBar.w;
                    const x2 = sucBar.x;
                    return (
                      <g key={d.id} className="stroke-zinc-500/70" strokeWidth={1} fill="none">
                        <path d={`M${x1},${y1} L${x1 + 8},${y1} L${x1 + 8},${y2} L${x2 - 4},${y2}`} />
                        <polygon points={`${x2 - 4},${y2 - 3} ${x2},${y2} ${x2 - 4},${y2 + 3}`} className="fill-zinc-500/70" />
                      </g>
                    );
                  })}
                  {/* Bars */}
                  {sorted.map((m, i) => {
                    const bar = barFor(m);
                    if (!bar) return null;
                    return (
                      <g key={m.id} data-testid={`gantt-bar-${m.id}`}>
                        <rect
                          x={bar.x}
                          y={40 + i * ROW_H + BAR_PAD}
                          width={bar.w}
                          height={ROW_H - BAR_PAD * 2}
                          rx={4}
                          className={colorFor(m.status)}
                          strokeWidth={1}
                        />
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>
          </div>
        )}

        <p className="mt-3 text-[11px] text-zinc-500">
          v1 Gantt — Finish-to-Start dependencies, 12-week window, day-grid. P6/.xer import and full CPM forward/backward pass coming in v2.
        </p>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="border border-white/10 bg-black/40 rounded-lg py-12 px-6 flex flex-col items-center gap-3 text-zinc-400">
      <GanttChartSquare className="h-10 w-10 text-zinc-700" />
      <div className="text-sm">No milestones on this project yet</div>
      <div className="text-xs text-zinc-500">Add milestones from the project cockpit to see them here.</div>
    </div>
  );
}

