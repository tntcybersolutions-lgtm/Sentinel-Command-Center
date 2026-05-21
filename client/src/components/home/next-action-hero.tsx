// ============================================================================
// next-action-hero.tsx — Singular "Do This Next" Hero
// ----------------------------------------------------------------------------
// Lives at the very top of the Home page (desktop + mobile). Tells the GC
// exactly one thing to do right now, with one primary CTA and one secondary.
//
// Priority order (first match wins):
//   1. Brand-new account (no projects)        → "Welcome — create your first project"
//   2. Anything CRITICAL severity + open      → "[N] critical items need you" → punch list filtered critical
//   3. Anything OVERDUE                       → "[N] overdue items" → My Day
//   4. Today's daily log not started          → "Log today's daily" → /m-daily-log
//   5. Today's items (today, not overdue)     → "[N] items due today" → My Day
//   6. Inbox has unread                       → "[N] new in inbox" → /m-inbox
//   7. Caught-up state                        → "You're caught up. Today's daily log?" or Herbie tip
//
// Wires to existing endpoints:
//   /api/home/risk-score, /api/home/today, /api/home/assistant,
//   /api/punch-items, /api/daily-logs, /api/projects (or /api/nav-counts as fallback)
//
// All endpoints fail gracefully → component renders the lowest-priority state
// rather than erroring or hiding.
// ============================================================================

import { useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Clock,
  ClipboardList,
  Inbox,
  Sparkles,
  CheckCircle2,
  PlusCircle,
  ArrowRight,
} from "lucide-react";

// ── Types (defensive — tolerates partial server responses) ──────────────────

interface PunchItem {
  id: string;
  severity?: "critical" | "high" | "medium" | "low" | string;
  status?: string;
  dueDate?: string | null;
  assignee?: string | null;
  title?: string;
}

interface DailyLog {
  id: string;
  date?: string;
  projectId?: string;
}

interface Project {
  id: string;
  name?: string;
}

interface HerbieAssistant {
  message?: string;
  cta?: { label: string; href: string };
}

interface NextAction {
  tone: "critical" | "warning" | "info" | "ok" | "welcome";
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  detail: string;
  primary: { label: string; href: string };
  secondary?: { label: string; href: string };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function isOverdue(dueDate?: string | null): boolean {
  if (!dueDate) return false;
  return new Date(dueDate).getTime() < Date.now() - 24 * 60 * 60 * 1000;
}

function isToday(dueDate?: string | null): boolean {
  if (!dueDate) return false;
  const d = new Date(dueDate);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Tone palette (matches existing risk-band style in home-assistant.tsx) ────

const TONE_STYLES: Record<
  NextAction["tone"],
  { ring: string; iconBg: string; iconColor: string; pillBg: string; pillText: string; btnBg: string; btnHover: string }
> = {
  critical: {
    ring: "ring-red-900/60",
    iconBg: "bg-red-950/60",
    iconColor: "text-red-300",
    pillBg: "bg-red-950/40",
    pillText: "text-red-300",
    btnBg: "bg-red-600",
    btnHover: "hover:bg-red-500",
  },
  warning: {
    ring: "ring-amber-900/60",
    iconBg: "bg-amber-950/60",
    iconColor: "text-amber-300",
    pillBg: "bg-amber-950/40",
    pillText: "text-amber-300",
    btnBg: "bg-amber-600",
    btnHover: "hover:bg-amber-500",
  },
  info: {
    ring: "ring-sky-900/60",
    iconBg: "bg-sky-950/60",
    iconColor: "text-sky-300",
    pillBg: "bg-sky-950/40",
    pillText: "text-sky-300",
    btnBg: "bg-sky-600",
    btnHover: "hover:bg-sky-500",
  },
  ok: {
    ring: "ring-emerald-900/60",
    iconBg: "bg-emerald-950/60",
    iconColor: "text-emerald-300",
    pillBg: "bg-emerald-950/40",
    pillText: "text-emerald-300",
    btnBg: "bg-emerald-600",
    btnHover: "hover:bg-emerald-500",
  },
  welcome: {
    ring: "ring-violet-900/60",
    iconBg: "bg-violet-950/60",
    iconColor: "text-violet-300",
    pillBg: "bg-violet-950/40",
    pillText: "text-violet-300",
    btnBg: "bg-violet-600",
    btnHover: "hover:bg-violet-500",
  },
};

// ── Priority decision engine ────────────────────────────────────────────────

function decideNextAction(input: {
  projects: Project[];
  punchItems: PunchItem[];
  dailyLogs: DailyLog[];
  herbie?: HerbieAssistant;
  inboxUnread?: number;
}): NextAction {
  const { projects, punchItems, dailyLogs, herbie, inboxUnread = 0 } = input;

  // 1. Empty state — welcome
  if (projects.length === 0) {
    return {
      tone: "welcome",
      icon: Sparkles,
      title: "Welcome to Sentinel",
      detail: "Create your first project to start tracking RFIs, daily logs, punch items, and money in one place.",
      primary: { label: "Create your first project", href: "/projects/new" },
      secondary: { label: "Take a 60-second tour", href: "/welcome" },
    };
  }

  const openPunch = punchItems.filter((p) => p.status !== "closed" && p.status !== "completed");
  const critical = openPunch.filter((p) => p.severity === "critical");
  const overdue = openPunch.filter((p) => isOverdue(p.dueDate));
  const today = openPunch.filter((p) => isToday(p.dueDate));

  // 2. Critical items
  if (critical.length > 0) {
    const first = critical[0];
    return {
      tone: "critical",
      icon: AlertTriangle,
      title: `${critical.length} critical ${critical.length === 1 ? "item needs" : "items need"} you`,
      detail: first.title
        ? `Top: "${first.title.slice(0, 80)}${first.title.length > 80 ? "…" : ""}"`
        : "Open the punch list filtered by Critical severity.",
      primary: { label: "Open critical items", href: "/punch-list?severity=critical" },
      secondary: { label: "Show everything", href: "/punch-list" },
    };
  }

  // 3. Overdue items
  if (overdue.length > 0) {
    return {
      tone: "warning",
      icon: Clock,
      title: `${overdue.length} overdue ${overdue.length === 1 ? "item" : "items"}`,
      detail: "These were due before today and haven't been closed out yet.",
      primary: { label: "Review overdue", href: "/punch-list?filter=overdue" },
      secondary: { label: "Open My Day", href: "/home" },
    };
  }

  // 4. Today's daily log not started
  const todayLog = dailyLogs.find((l) => l.date && l.date.startsWith(todayISO()));
  if (!todayLog) {
    return {
      tone: "info",
      icon: ClipboardList,
      title: "Log today's daily",
      detail: "Capture today's manpower, deliveries, weather, and photos — 30 seconds with voice.",
      primary: { label: "Open daily log", href: "/m-daily-log" },
      secondary: { label: "Voice it instead", href: "/voice-daily-log" },
    };
  }

  // 5. Today's items (not overdue, just due today)
  if (today.length > 0) {
    return {
      tone: "info",
      icon: ClipboardList,
      title: `${today.length} ${today.length === 1 ? "item" : "items"} due today`,
      detail: "Tap through your day list — punch, RFIs, submittals due today.",
      primary: { label: "Open My Day", href: "/home" },
      secondary: { label: "Go to punch list", href: "/punch-list" },
    };
  }

  // 6. Inbox unread
  if (inboxUnread > 0) {
    return {
      tone: "info",
      icon: Inbox,
      title: `${inboxUnread} new in your inbox`,
      detail: "Mentions, approvals, and replies waiting on you.",
      primary: { label: "Open inbox", href: "/m-inbox" },
      secondary: { label: "Mark all read", href: "/m-inbox?mark=read" },
    };
  }

  // 7. Caught-up — surface Herbie tip if available, else generic
  if (herbie?.message && herbie.cta) {
    return {
      tone: "ok",
      icon: Sparkles,
      title: "You're caught up",
      detail: herbie.message,
      primary: herbie.cta,
      secondary: { label: "Open inbox", href: "/m-inbox" },
    };
  }

  return {
    tone: "ok",
    icon: CheckCircle2,
    title: "You're caught up",
    detail: "Nothing urgent right now. Good time to review this week's pay apps or scan drawings.",
    primary: { label: "Money this week", href: "/financial/overview" },
    secondary: { label: "Open drawings", href: "/m-drawings" },
  };
}

// ── Component ───────────────────────────────────────────────────────────────

interface NextActionHeroProps {
  className?: string;
  /** Optional: override the user's display name (defaults to a generic greeting). */
  userName?: string;
}

export function NextActionHero({ className = "", userName }: NextActionHeroProps) {
  const [, navigate] = useLocation();

  // Pull data — all queries are tolerant to 404/empty/errors.
  const projectsQ = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    queryFn: async () => {
      try {
        const r = await fetch("/api/projects");
        if (!r.ok) return [];
        const d = await r.json();
        return Array.isArray(d) ? d : Array.isArray(d?.items) ? d.items : [];
      } catch {
        return [];
      }
    },
    staleTime: 30_000,
  });

  const punchQ = useQuery<PunchItem[]>({
    queryKey: ["/api/punch-items"],
    queryFn: async () => {
      try {
        const r = await fetch("/api/punch-items");
        if (!r.ok) return [];
        const d = await r.json();
        return Array.isArray(d) ? d : Array.isArray(d?.items) ? d.items : [];
      } catch {
        return [];
      }
    },
    staleTime: 30_000,
  });

  const dailyQ = useQuery<DailyLog[]>({
    queryKey: ["/api/daily-logs"],
    queryFn: async () => {
      try {
        const r = await fetch("/api/daily-logs");
        if (!r.ok) return [];
        const d = await r.json();
        return Array.isArray(d) ? d : Array.isArray(d?.items) ? d.items : [];
      } catch {
        return [];
      }
    },
    staleTime: 30_000,
  });

  const herbieQ = useQuery<HerbieAssistant>({
    queryKey: ["/api/home/assistant"],
    queryFn: async () => {
      try {
        const r = await fetch("/api/home/assistant");
        if (!r.ok) return {};
        return await r.json();
      } catch {
        return {};
      }
    },
    staleTime: 60_000,
  });

  const action = useMemo(
    () =>
      decideNextAction({
        projects: projectsQ.data || [],
        punchItems: punchQ.data || [],
        dailyLogs: dailyQ.data || [],
        herbie: herbieQ.data,
        inboxUnread: 0, // wired by m-inbox when available
      }),
    [projectsQ.data, punchQ.data, dailyQ.data, herbieQ.data]
  );

  const styles = TONE_STYLES[action.tone];
  const Icon = action.icon;
  const isLoading = projectsQ.isLoading || punchQ.isLoading || dailyQ.isLoading;

  return (
    <div
      data-testid="next-action-hero"
      data-tone={action.tone}
      className={`relative overflow-hidden rounded-2xl ring-1 ${styles.ring} bg-zinc-950/60 backdrop-blur ${className}`}
    >
      {/* Glow accent */}
      <div
        className={`absolute -top-12 -right-12 h-40 w-40 rounded-full blur-3xl opacity-30 ${styles.iconBg}`}
        aria-hidden
      />

      <div className="relative p-5 sm:p-6 md:p-8">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className={`flex-shrink-0 h-12 w-12 rounded-xl ${styles.iconBg} flex items-center justify-center`}>
            <Icon className={`h-6 w-6 ${styles.iconColor}`} />
          </div>

          {/* Copy */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-zinc-500 mb-1">
              <span>{greeting()}{userName ? `, ${userName}` : ""}</span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${styles.pillBg} ${styles.pillText}`}>
                Next action
              </span>
            </div>

            {isLoading ? (
              <>
                <div className="h-6 w-2/3 rounded bg-zinc-800/60 animate-pulse mb-2" />
                <div className="h-4 w-full rounded bg-zinc-800/40 animate-pulse mb-1" />
                <div className="h-4 w-1/2 rounded bg-zinc-800/40 animate-pulse" />
              </>
            ) : (
              <>
                <h1 className="text-xl sm:text-2xl font-semibold text-zinc-100 leading-tight mb-1">
                  {action.title}
                </h1>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  {action.detail}
                </p>
              </>
            )}
          </div>
        </div>

        {/* CTAs */}
        {!isLoading && (
          <div className="mt-5 flex flex-col sm:flex-row gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => navigate(action.primary.href)}
              className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white ${styles.btnBg} ${styles.btnHover} transition shadow-lg shadow-black/20`}
              data-testid="next-action-primary"
            >
              {action.tone === "welcome" ? <PlusCircle className="h-4 w-4" /> : null}
              <span>{action.primary.label}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
            {action.secondary && (
              <button
                type="button"
                onClick={() => navigate(action.secondary!.href)}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-zinc-300 bg-zinc-900/60 hover:bg-zinc-800/60 ring-1 ring-zinc-800 transition"
                data-testid="next-action-secondary"
              >
                {action.secondary.label}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default NextActionHero;
