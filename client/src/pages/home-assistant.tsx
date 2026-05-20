// ============================================================================
// home-assistant.tsx — GC Home (v2)
// ----------------------------------------------------------------------------
// Drop-in replacement for client/src/pages/home-assistant.tsx.
//
// What changed vs. v1:
//   • Herbie one-line brief banner at the very top (always visible if there's
//     anything worth saying) — replaces the generic activity feed as the anchor.
//   • New "Money This Week" row — Pay Apps Due / Lien Waivers Outstanding /
//     Invoices Overdue / Bills Due. The single biggest "switch from Buildertrend"
//     lever for a GC.
//   • Project Health Board (cards, not a table). Each card shows risk score,
//     status, top issue, contract value, completion. Reuses the same risk-band
//     palette as the existing Sentinel risk-score component (red/amber/yellow/green).
//   • This Week calendar strip (7-day lookahead across all projects).
//   • Recent Activity feed demoted to a collapsed section at the bottom (default
//     closed). Power users can expand; GCs can ignore it forever.
//
// Endpoint fallbacks: any new endpoint that doesn't exist yet (e.g.
// /api/home/money-this-week) is fetched gracefully — the component renders
// "--" placeholders instead of crashing. You can land the UI today and wire
// the aggregation endpoints when ready.
//
// Pure additive change. No props, no context changes, no route changes.
// ============================================================================

import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Stamp,
  FileQuestion,
  ListChecks,
  FileCheck,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  FolderGit2,
  Clock,
  Plus,
  Sparkles,
  DollarSign,
  Receipt,
  FileText,
  ShieldAlert,
  Calendar as CalendarIcon,
  Bot,
  AlertTriangle,
  Briefcase,
} from "lucide-react";
import type { NavCounts } from "@/nav/navConfig";
import { StatusPill } from "@/components/ui/status-pill";
import { CardTiered } from "@/components/ui/card-tiered";
import { useCountUp } from "@/hooks/use-count-up";
import { SafeArea } from "@/components/ui/safe-area";

// ── Helpers (unchanged from v1) ──────────────────────────────────────────────

function greetingText() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function formatDate() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatCurrency(v: number | null | undefined, compact = false) {
  if (v == null) return "--";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
    notation: compact ? "compact" : "standard",
  }).format(v);
}

function statusColor(s: string | null | undefined): string {
  if (!s) return "text-zinc-500";
  const low = s.toLowerCase();
  if (low === "active" || low === "in_progress") return "text-emerald-400";
  if (low === "on_hold" || low === "paused") return "text-amber-400";
  if (low === "completed" || low === "closed") return "text-sky-400";
  return "text-zinc-400";
}

function relativeTime(d: string | null | undefined) {
  if (!d) return "";
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// Map a 0–100 risk score to a band (matches the existing Sentinel risk palette).
function riskBand(score: number | null | undefined) {
  if (score == null) return { label: "Unscored", color: "text-zinc-500", bg: "bg-zinc-900/40", border: "border-zinc-700" };
  if (score >= 80) return { label: "Critical",       color: "text-red-300",     bg: "bg-red-950/30",     border: "border-red-900/60" };
  if (score >= 60) return { label: "High Attention", color: "text-amber-300",   bg: "bg-amber-950/30",   border: "border-amber-900/60" };
  if (score >= 40) return { label: "Watch",          color: "text-yellow-300",  bg: "bg-yellow-950/30",  border: "border-yellow-900/60" };
  return            { label: "Stable",               color: "text-emerald-300", bg: "bg-emerald-950/30", border: "border-emerald-900/60" };
}

// ── Section header (light, consistent across sections) ───────────────────────

function SectionHeader({ icon: Icon, title, action }: { icon: any; title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Icon className="h-5 w-5 text-zinc-400" />
        {title}
      </h2>
      {action}
    </div>
  );
}

// ── Action Required ──────────────────────────────────────────────────────────

type ActionBox = {
  label: string;
  countKey: keyof NavCounts;
  icon: typeof Stamp;
  route: string;
  accentClass: string;
};

const ACTION_BOXES: ActionBox[] = [
  { label: "Approvals Needed",  countKey: "approvalsNeededCount",  icon: Stamp,         route: "/approvals",            accentClass: "border-l-amber-500" },
  { label: "Open RFIs",         countKey: "openRfiCount",          icon: FileQuestion,  route: "/execution/rfis",       accentClass: "border-l-sky-500" },
  { label: "Overdue Tasks",     countKey: "overdueTaskCount",      icon: ListChecks,    route: "/execution/tasks",      accentClass: "border-l-red-500" },
  { label: "Pending Submittals",countKey: "pendingSubmittalCount", icon: FileCheck,     route: "/execution/submittals", accentClass: "border-l-violet-500" },
];

// ── Money This Week (NEW) ────────────────────────────────────────────────────
// Calls /api/home/money-this-week. If the endpoint doesn't exist yet, all four
// cards render with "--" — they won't crash the page.

interface MoneyThisWeekData {
  payAppsDueCount?: number;
  payAppsDueTotal?: number;          // dollars
  lienWaiversOutstandingCount?: number;
  lienWaiversOutstandingOldestDays?: number;
  invoicesOverdueCount?: number;
  invoicesOverdueTotal?: number;     // dollars
  billsDueWeekCount?: number;
  billsDueWeekTotal?: number;        // dollars
}

function MoneyThisWeek() {
  const [, setLocation] = useLocation();
  const { data, isLoading } = useQuery<MoneyThisWeekData>({
    queryKey: ["/api/home/money-this-week"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/home/money-this-week");
        if (!res.ok) return {};
        return res.json();
      } catch {
        return {};
      }
    },
    staleTime: 60_000,
  });

  const d = data ?? {};

  const cards = [
    {
      label: "Pay Apps Due",
      primary: d.payAppsDueCount != null ? String(d.payAppsDueCount) : "--",
      subtitle: d.payAppsDueTotal != null ? formatCurrency(d.payAppsDueTotal, true) : "this week",
      icon: FileText,
      accent: "border-l-emerald-500",
      route: "/financial/invoices",
    },
    {
      label: "Lien Waivers Outstanding",
      primary: d.lienWaiversOutstandingCount != null ? String(d.lienWaiversOutstandingCount) : "--",
      subtitle:
        d.lienWaiversOutstandingOldestDays != null
          ? `oldest ${d.lienWaiversOutstandingOldestDays}d`
          : "outstanding",
      icon: ShieldAlert,
      accent: "border-l-amber-500",
      route: "/lien-waivers",
    },
    {
      label: "Invoices Overdue",
      primary: d.invoicesOverdueCount != null ? String(d.invoicesOverdueCount) : "--",
      subtitle: d.invoicesOverdueTotal != null ? formatCurrency(d.invoicesOverdueTotal, true) : "AR",
      icon: Receipt,
      accent: "border-l-red-500",
      route: "/financial/invoices",
    },
    {
      label: "Bills Due This Week",
      primary: d.billsDueWeekCount != null ? String(d.billsDueWeekCount) : "--",
      subtitle: d.billsDueWeekTotal != null ? formatCurrency(d.billsDueWeekTotal, true) : "AP",
      icon: DollarSign,
      accent: "border-l-sky-500",
      route: "/financial/bills",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="money-this-week">
      {cards.map((c) => (
        <MoneyCard key={c.label} card={c} isLoading={isLoading} onClick={() => setLocation(c.route)} />
      ))}
    </div>
  );
}

// Per-card sub-component so useCountUp can run per primary number.
function MoneyCard({
  card,
  isLoading,
  onClick,
}: {
  card: { label: string; primary: string; subtitle: string; icon: typeof FileText; accent: string; route: string };
  isLoading: boolean;
  onClick: () => void;
}) {
  const Icon = card.icon;
  const asNumber = /^-?\d+(\.\d+)?$/.test(card.primary) ? Number(card.primary) : null;
  const animated = useCountUp(asNumber, { duration: 700 });
  const displayPrimary = isLoading
    ? "--"
    : asNumber != null
    ? Math.round(animated).toLocaleString()
    : card.primary;
  return (
    <button
      onClick={onClick}
      className={`text-left border border-white/10 bg-black/20 border-l-4 ${card.accent} p-4 hover:bg-white/5 transition-colors`}
      data-testid={`money-card-${card.label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 text-zinc-400" />
        <span className="text-xs text-zinc-400 uppercase tracking-wider">{card.label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-mono font-bold">{displayPrimary}</span>
        <span className="text-xs text-zinc-500">{card.subtitle}</span>
      </div>
    </button>
  );
}

// ── Herbie One-Line Brief (NEW) ──────────────────────────────────────────────
// Calls /api/herbie/brief for the canonical summary. Falls back to building a
// brief from /api/herbie/digest totals if the brief endpoint doesn't exist.

interface HerbieBriefData {
  summary?: string;       // server-built one-liner
  href?: string;          // where to send the user on click; default /herbie-digest
  severity?: "critical" | "high" | "medium" | "low" | "info";
}

interface DigestTotals { critical: number; high: number; medium: number; low: number; }
interface TinyDigest { totals: DigestTotals; }

// ── Bid Opportunities Hero (TOP-OF-FOLD for GCs) ────────────────────────────
// Calls /api/opportunities. Shows total count + Top 5 most urgent (sorted by
// due date asc, red <7d). Front and center so a GC opening /home immediately
// sees what SAM.gov surfaced overnight. Click any row to open the bid jacket.

interface OppRow {
  id: string;
  title: string;
  agency?: string | null;
  setAside?: string | null;
  status?: string | null;
  dueAt?: string | null;
  postedAt?: string | null;
  value?: number | null;
  score?: number | null;
}

function BidOpportunitiesHero() {
  const [, setLocation] = useLocation();
  const { data, isLoading } = useQuery<OppRow[]>({
    queryKey: ["/api/opportunities"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/opportunities");
        if (!res.ok) return [];
        const j = await res.json();
        return Array.isArray(j) ? j : (j?.opportunities ?? []);
      } catch {
        return [];
      }
    },
    staleTime: 60_000,
  });

  const ops: OppRow[] = data ?? [];
  const now = Date.now();
  const dueDays = (s?: string | null) => {
    if (!s) return null;
    const ms = new Date(s).getTime() - now;
    return Math.ceil(ms / 86400000);
  };
  const total = ops.length;
  const needsTriage = ops.filter(o => !o.status || ["", "open", "undecided"].includes(String(o.status).toLowerCase())).length;
  const dueThisWeek = ops.filter(o => {
    const d = dueDays(o.dueAt);
    return d != null && d >= 0 && d <= 7;
  }).length;
  const topFit = ops.reduce<number>((m, o) => Math.max(m, Number(o.score ?? 0)), 0);
  const urgent = [...ops]
    .filter(o => o.dueAt && (dueDays(o.dueAt) ?? -1) >= 0)
    .sort((a, b) => new Date(a.dueAt!).getTime() - new Date(b.dueAt!).getTime())
    .slice(0, 5);

  const kpis = [
    { label: "Active Opps",      value: total,        accent: "text-sky-300",     bg: "bg-sky-500/10",     border: "border-sky-500/40" },
    { label: "Need Triage",      value: needsTriage,  accent: "text-amber-300",   bg: "bg-amber-500/10",   border: "border-amber-500/40" },
    { label: "Due This Week",    value: dueThisWeek,  accent: "text-red-300",     bg: "bg-red-500/10",     border: "border-red-500/40" },
    { label: "Top Fit",          value: topFit || "--", accent: "text-emerald-300", bg: "bg-emerald-500/10", border: "border-emerald-500/40" },
  ];

  return (
    <div
      className="rounded-lg border-2 border-sky-500/40 bg-gradient-to-br from-sky-950/40 via-indigo-950/30 to-violet-950/30 p-5 space-y-4 shadow-lg shadow-sky-900/20"
      data-testid="bid-opportunities-hero"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Briefcase className="h-6 w-6 text-sky-400" />
          Bid Opportunities
          <span className="text-xs font-normal text-zinc-400 ml-1">live from SAM.gov</span>
        </h2>
        <button
          onClick={() => setLocation("/capture/opportunities")}
          className="text-sm text-sky-300 hover:text-white flex items-center gap-1 transition-colors px-3 py-1.5 rounded border border-sky-500/30 hover:border-sky-400 hover:bg-sky-500/10"
          data-testid="link-open-pipeline"
        >
          Open Pipeline <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="bid-opps-kpis">
        {kpis.map(k => (
          <div
            key={k.label}
            className={`rounded border ${k.border} ${k.bg} p-3`}
            data-testid={`bid-opps-kpi-${k.label.toLowerCase().replace(/\s+/g, "-")}`}
          >
            <div className="text-[10px] uppercase tracking-wider text-zinc-400 mb-1">{k.label}</div>
            <div className={`text-3xl font-mono font-bold ${k.accent}`}>
              {isLoading ? "--" : k.value}
            </div>
          </div>
        ))}
      </div>

      {/* Urgent list */}
      <div className="space-y-1" data-testid="bid-opps-urgent-list">
        {isLoading && (
          <div className="text-sm text-zinc-500 px-3 py-4">Loading opportunities…</div>
        )}
        {!isLoading && urgent.length === 0 && (
          <div className="text-sm text-zinc-500 px-3 py-4">
            No opportunities with upcoming deadlines.{" "}
            <button onClick={() => setLocation("/capture/opportunities")} className="text-sky-300 hover:underline">
              Browse all {total} opportunities →
            </button>
          </div>
        )}
        {!isLoading && urgent.map(o => {
          const d = dueDays(o.dueAt);
          const dueClass = d != null && d <= 7 ? "text-red-300 font-semibold" : "text-zinc-300";
          return (
            <button
              key={o.id}
              onClick={() => setLocation(`/capture/opportunity/${o.id}`)}
              className="w-full text-left px-3 py-2.5 hover:bg-white/5 rounded transition-colors flex items-center gap-3 border border-transparent hover:border-white/10"
              data-testid={`bid-opp-row-${o.id}`}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate text-white">{o.title || "(no title)"}</div>
                <div className="text-xs text-zinc-500 truncate mt-0.5">
                  {o.agency || "Unknown agency"}
                  {o.value ? ` · ${formatCurrency(o.value, true)}` : ""}
                </div>
              </div>
              {o.setAside && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-medium uppercase tracking-wider whitespace-nowrap">
                  {o.setAside}
                </span>
              )}
              <div className={`text-sm font-mono ${dueClass} whitespace-nowrap min-w-[60px] text-right`}>
                {d == null ? "--" : d < 0 ? "overdue" : d === 0 ? "today" : `${d}d`}
              </div>
              <ChevronRight className="h-4 w-4 text-zinc-600" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function HerbieBriefBanner() {
  // First try the brief endpoint
  const brief = useQuery<HerbieBriefData>({
    queryKey: ["/api/herbie/brief"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/herbie/brief");
        if (!res.ok) return {};
        return res.json();
      } catch {
        return {};
      }
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fall back to digest totals to build a client-side brief if needed
  const digest = useQuery<TinyDigest>({
    queryKey: ["/api/herbie/digest"],
    queryFn: () =>
      fetch("/api/herbie/digest")
        .then((r) => r.json())
        .catch(() => ({ totals: { critical: 0, high: 0, medium: 0, low: 0 } })),
    enabled: !brief.data?.summary,
    staleTime: 5 * 60 * 1000,
  });

  // Choose summary + href
  let summary = brief.data?.summary;
  const href = brief.data?.href ?? "/herbie-digest";
  let urgent = 0;
  if (!summary && digest.data) {
    const { critical = 0, high = 0 } = digest.data.totals ?? ({} as DigestTotals);
    urgent = critical + high;
    if (urgent > 0) {
      const bits: string[] = [];
      if (critical > 0) bits.push(`${critical} critical`);
      if (high > 0)     bits.push(`${high} high-priority`);
      summary = `Herbie flagged ${urgent} urgent item${urgent !== 1 ? "s" : ""} — ${bits.join(", ")}.`;
    } else {
      summary = "Everything's current. No urgent items flagged.";
    }
  }

  if (!summary) return null;
  const severity = brief.data?.severity ?? (urgent > 0 ? "high" : "info");
  const palette =
    severity === "critical" || severity === "high"
      ? "border-red-900/60 bg-red-950/20 text-red-200"
      : severity === "medium"
      ? "border-amber-900/60 bg-amber-950/20 text-amber-200"
      : "border-zinc-700 bg-zinc-900/30 text-zinc-200";

  return (
    <a
      href={href}
      className={`flex items-center gap-3 rounded-lg border ${palette} px-4 py-3 text-sm hover:brightness-110 transition`}
      data-testid="herbie-brief-banner"
    >
      <Bot className="h-5 w-5 shrink-0" />
      <span className="flex-1">{summary}</span>
      <span className="text-xs opacity-70 whitespace-nowrap flex items-center gap-1">
        Full digest <ChevronRight className="h-3 w-3" />
      </span>
    </a>
  );
}

// ── Project Health Board (NEW — replaces the projects table) ─────────────────

interface ProjectCardData {
  id: string;
  name?: string;
  projectName?: string;
  projectNumber?: string;
  status?: string;
  contractValue?: number;
  completionPercentage?: number;
  riskScore?: number;             // 0–100; if absent we render "Unscored"
  topIssue?: string;              // optional one-line "biggest problem" summary
  nextDeadlineLabel?: string;     // optional "Pay App #6 in 4 days"
}

function ProjectHealthBoard() {
  const [, setLocation] = useLocation();
  const { data: projects, isLoading } = useQuery<ProjectCardData[]>({
    queryKey: ["/api/home/project-health"],
  });
  const items = (projects ?? []).slice(0, 9);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-44 rounded-lg border border-white/10 bg-black/20 animate-pulse" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="border border-white/10 bg-black/20 rounded-lg py-12 px-6 flex flex-col items-center gap-3 text-zinc-500">
        <FolderGit2 className="h-8 w-8 text-zinc-700" />
        <div className="text-sm">No active projects yet</div>
        <button
          onClick={() => setLocation("/projects/active")}
          className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors"
          data-testid="empty-projects-cta"
        >
          <Plus className="h-3.5 w-3.5" />
          Add your first project
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="project-health-board">
      {items.map((p) => {
        const band = riskBand(p.riskScore);
        const name = p.name || p.projectName || "Untitled project";
        return (
          <button
            key={p.id}
            onClick={() => setLocation(`/projects/${encodeURIComponent(String(p.id))}/cockpit`)}
            className={`text-left rounded-lg border ${band.border} ${band.bg} p-4 hover:brightness-110 transition`}
            data-testid={`project-card-${p.id}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold truncate" title={name}>{name}</div>
                {p.projectNumber && (
                  <div className="text-[11px] text-zinc-500 font-mono">{p.projectNumber}</div>
                )}
              </div>
              <StatusPill.FromRiskScore score={p.riskScore} size="sm" />
            </div>

            <div className="mt-3 flex items-baseline gap-3">
              <div className="font-mono text-2xl font-bold">
                {p.riskScore != null ? p.riskScore : "--"}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">Risk score</div>
            </div>

            {p.topIssue && (
              <div className="mt-2 flex items-start gap-1.5 text-xs text-zinc-300" data-testid={`project-issue-${p.id}`}>
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 text-amber-400 shrink-0" />
                <span>{p.topIssue}</span>
              </div>
            )}

            <div className="mt-3 flex items-center justify-between text-[11px] text-zinc-500">
              <StatusPill status={p.status} size="sm" />
              <span className="font-mono">{formatCurrency(p.contractValue, true)}</span>
              <span className="font-mono">{p.completionPercentage != null ? `${p.completionPercentage}%` : "--%"}</span>
            </div>

            {p.nextDeadlineLabel && (
              <div className="mt-2 pt-2 border-t border-white/10 text-[11px] text-zinc-400">
                <CalendarIcon className="inline h-3 w-3 mr-1" />
                {p.nextDeadlineLabel}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── This Week (NEW) ──────────────────────────────────────────────────────────
// Calls /api/calendar/this-week. Renders 7 day cells; each cell lists up to 3
// items. Empty days are dimmed, not hidden.

interface DayEvent {
  id?: string;
  label: string;
  amount?: number;      // dollars, if money-related
  projectName?: string;
  type?: string;        // "pay_app" | "submittal" | "milestone" | etc.
}
interface ThisWeekDay { date: string; weekday: string; day: number; events: DayEvent[]; }

function ThisWeekStrip() {
  const { data: days, isLoading } = useQuery<ThisWeekDay[]>({
    queryKey: ["/api/calendar/this-week"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/calendar/this-week");
        if (!res.ok) return [];
        return res.json();
      } catch {
        return [];
      }
    },
    staleTime: 60_000,
  });

  // Fallback skeleton: build a 7-day empty strip starting today
  const skeleton: ThisWeekDay[] =
    days && days.length > 0
      ? days
      : Array.from({ length: 7 }).map((_, i) => {
          const d = new Date();
          d.setDate(d.getDate() + i);
          return {
            date: d.toISOString().slice(0, 10),
            weekday: d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase(),
            day: d.getDate(),
            events: [],
          };
        });

  return (
    <div className="grid grid-cols-7 gap-2" data-testid="this-week-strip">
      {skeleton.map((day) => (
        <div
          key={day.date}
          className="rounded-md border border-white/10 bg-black/20 p-2 min-h-[80px]"
          data-testid={`week-day-${day.date}`}
        >
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono">
            {day.weekday} {day.day}
          </div>
          <div className="mt-1 space-y-1">
            {isLoading ? (
              <div className="h-2.5 w-full bg-zinc-800 animate-pulse rounded" />
            ) : day.events.length === 0 ? (
              <div className="text-[10px] text-zinc-700">—</div>
            ) : (
              day.events.slice(0, 3).map((ev, i) => (
                <div key={ev.id ?? i} className="text-[11px] text-zinc-300 leading-tight truncate" title={ev.label}>
                  {ev.label}
                  {ev.amount != null && (
                    <span className="text-zinc-500 ml-1 font-mono">{formatCurrency(ev.amount, true)}</span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Recent Activity (collapsed by default, default closed) ───────────────────

function RecentActivity() {
  const [open, setOpen] = useState(false);
  const { data: activity, isLoading } = useQuery<any[]>({
    queryKey: ["/api/audit-events?limit=10"],
    enabled: open,
  });
  const events = (activity ?? []).slice(0, 10);

  return (
    <div data-testid="activity-section">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition"
        data-testid="toggle-recent-activity"
        aria-expanded={open}
      >
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        <Clock className="h-4 w-4" />
        <span>Recent Activity</span>
      </button>

      {open && (
        <div className="mt-3 border border-white/10 bg-black/20 divide-y divide-white/5 rounded">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="py-3 px-4 flex items-center gap-3">
                <div className="h-3 w-16 bg-zinc-800 animate-pulse" />
                <div className="h-3 w-64 bg-zinc-800 animate-pulse" />
              </div>
            ))
          ) : events.length === 0 ? (
            <div className="py-12 px-6 flex flex-col items-center gap-3 text-zinc-500">
              <Sparkles className="h-8 w-8 text-zinc-700" />
              <div className="text-sm">No recent activity yet</div>
            </div>
          ) : (
            events.map((ev: any, i: number) => (
              <div key={ev.id ?? i} className="py-2.5 px-4 flex items-start gap-3 text-sm" data-testid={`activity-row-${i}`}>
                <span className="text-zinc-600 font-mono text-xs whitespace-nowrap pt-0.5">
                  {relativeTime(ev.createdAt ?? ev.timestamp)}
                </span>
                <span className="text-zinc-300">
                  <span className="text-zinc-500">{ev.actor || ev.performedBy || "system"}</span>{" "}
                  {ev.eventType || ev.action || "activity"}
                  {ev.entityType ? ` on ${ev.entityType}` : ""}
                  {ev.details || ev.description ? ` — ${ev.details || ev.description}` : ""}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── PAGE ─────────────────────────────────────────────────────────────────────

export default function HomeAssistant() {
  const [, setLocation] = useLocation();

  const countsQuery = useQuery<NavCounts>({ queryKey: ["/api/nav-counts"] });
  const counts = countsQuery.data;

  return (
    <SafeArea sides={["top", "bottom"]} className="min-h-screen bg-black text-white" data-testid="home-page-safe">
    <div className="p-6 space-y-8" data-testid="home-page">
      {/* Greeting */}
      <div className="flex items-baseline justify-between" data-testid="greeting-bar">
        <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-greeting">
          {greetingText()}
        </h1>
        <span className="text-sm text-zinc-500 font-mono" data-testid="text-date">
          {formatDate()}
        </span>
      </div>

      {/* Bid Opportunities (top-of-fold for GCs) */}
      <BidOpportunitiesHero />

      {/* Herbie's one-line brief */}
      <HerbieBriefBanner />

      {/* Action Required Today */}
      <div>
        <SectionHeader icon={ListChecks} title="Action Required Today" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="action-strip">
          {ACTION_BOXES.map((box) => {
            const Icon = box.icon;
            const count = counts?.[box.countKey] ?? 0;
            return (
              <button
                key={box.countKey}
                onClick={() => setLocation(box.route)}
                className={`text-left border border-white/10 bg-black/20 border-l-4 ${box.accentClass} p-4 hover:bg-white/5 transition-colors`}
                data-testid={`action-box-${box.countKey}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Icon className="h-4 w-4 text-zinc-400" />
                  <span className="text-xs text-zinc-400 uppercase tracking-wider">{box.label}</span>
                </div>
                <span className="text-3xl font-mono font-bold" data-testid={`count-${box.countKey}`}>
                  {countsQuery.isLoading ? "--" : count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Money This Week */}
      <div>
        <SectionHeader icon={DollarSign} title="Money This Week" />
        <MoneyThisWeek />
      </div>

      {/* Project Health Board */}
      <div>
        <SectionHeader
          icon={FolderGit2}
          title="Project Health"
          action={
            <button
              onClick={() => setLocation("/projects/active")}
              className="text-xs text-zinc-400 hover:text-white flex items-center gap-1 transition-colors"
              data-testid="link-view-all-projects"
            >
              View All <ChevronRight className="h-3 w-3" />
            </button>
          }
        />
        <ProjectHealthBoard />
      </div>

      {/* This Week */}
      <div>
        <SectionHeader icon={CalendarIcon} title="This Week" />
        <ThisWeekStrip />
      </div>

      {/* Recent Activity — collapsed, default closed */}
      <RecentActivity />
    </div>
    </SafeArea>
  );
}
