// ============================================================================
// quick-actions-strip.tsx — 4 Big Tap Targets Under the Next-Action Hero
// ----------------------------------------------------------------------------
// The four highest-frequency GC actions: Daily Log / New Punch / Drawings /
// Inbox. Big enough for a gloved hand on a phone, light enough not to fight
// the hero card above.
//
// Each tile shows: icon + label + a live count badge (e.g. "4 open"). Counts
// pull from the same nav-counts endpoint the sidebar uses, so no extra
// queries — and tile shows just the label if counts unavailable.
//
// Layout: 2x2 grid on phone, 1x4 on tablet+, 1x4 with bigger padding on
// desktop. Each tile is a full-width tap target — no tiny icons.
// ============================================================================

import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ClipboardList,
  ListChecks,
  FileText,
  Inbox,
  Mic,
  Camera,
  ArrowUpRight,
} from "lucide-react";

interface NavCounts {
  punchOpen?: number;
  dailyLogsToday?: number;
  inboxUnread?: number;
  drawingsRecent?: number;
  [key: string]: number | undefined;
}

interface QuickAction {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  badgeCount?: number;
  badgeLabel?: string;
  accent: "sky" | "amber" | "violet" | "emerald";
}

const ACCENT_STYLES: Record<
  QuickAction["accent"],
  { bg: string; iconBg: string; iconColor: string; ring: string; badgeBg: string; badgeText: string }
> = {
  sky:     { bg: "bg-sky-950/30",     iconBg: "bg-sky-950/60",     iconColor: "text-sky-300",     ring: "ring-sky-900/40",     badgeBg: "bg-sky-900/60",     badgeText: "text-sky-200" },
  amber:   { bg: "bg-amber-950/30",   iconBg: "bg-amber-950/60",   iconColor: "text-amber-300",   ring: "ring-amber-900/40",   badgeBg: "bg-amber-900/60",   badgeText: "text-amber-200" },
  violet:  { bg: "bg-violet-950/30",  iconBg: "bg-violet-950/60",  iconColor: "text-violet-300",  ring: "ring-violet-900/40",  badgeBg: "bg-violet-900/60",  badgeText: "text-violet-200" },
  emerald: { bg: "bg-emerald-950/30", iconBg: "bg-emerald-950/60", iconColor: "text-emerald-300", ring: "ring-emerald-900/40", badgeBg: "bg-emerald-900/60", badgeText: "text-emerald-200" },
};

export interface QuickActionsStripProps {
  className?: string;
  /** If false, the 4 default actions are hidden in favor of custom `actions`. */
  showDefaults?: boolean;
  /** Optionally inject extra actions before the defaults. */
  prependActions?: QuickAction[];
  /** Optionally replace defaults entirely. */
  actions?: QuickAction[];
}

export function QuickActionsStrip({
  className = "",
  showDefaults = true,
  prependActions = [],
  actions: customActions,
}: QuickActionsStripProps) {
  const [, navigate] = useLocation();

  const countsQ = useQuery<NavCounts>({
    queryKey: ["/api/nav-counts"],
    queryFn: async () => {
      try {
        const r = await fetch("/api/nav-counts");
        if (!r.ok) return {};
        return await r.json();
      } catch {
        return {};
      }
    },
    staleTime: 30_000,
  });

  const counts = countsQ.data || {};

  const defaultActions: QuickAction[] = [
    {
      id: "daily-log",
      label: "Daily Log",
      icon: ClipboardList,
      href: "/m-daily-log",
      badgeCount: counts.dailyLogsToday,
      badgeLabel: counts.dailyLogsToday ? "today" : undefined,
      accent: "sky",
    },
    {
      id: "new-punch",
      label: "New Punch",
      icon: ListChecks,
      href: "/punch-list?new=1",
      badgeCount: counts.punchOpen,
      badgeLabel: counts.punchOpen ? "open" : undefined,
      accent: "amber",
    },
    {
      id: "drawings",
      label: "Drawings",
      icon: FileText,
      href: "/m-drawings",
      accent: "violet",
    },
    {
      id: "inbox",
      label: "Inbox",
      icon: Inbox,
      href: "/m-inbox",
      badgeCount: counts.inboxUnread,
      badgeLabel: counts.inboxUnread ? "new" : undefined,
      accent: "emerald",
    },
  ];

  const list = customActions ?? [...prependActions, ...(showDefaults ? defaultActions : [])];

  return (
    <div
      data-testid="quick-actions-strip"
      className={`grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 ${className}`}
    >
      {list.map((a) => {
        const styles = ACCENT_STYLES[a.accent];
        const Icon = a.icon;
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => navigate(a.href)}
            data-testid={`quick-action-${a.id}`}
            className={`group relative flex items-center gap-3 p-3 sm:p-4 rounded-2xl ${styles.bg} ring-1 ${styles.ring} hover:bg-opacity-50 hover:ring-2 transition text-left`}
          >
            <div className={`flex-shrink-0 h-10 w-10 sm:h-11 sm:w-11 rounded-xl ${styles.iconBg} flex items-center justify-center`}>
              <Icon className={`h-5 w-5 ${styles.iconColor}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm sm:text-base font-medium text-zinc-100 truncate">{a.label}</span>
                <ArrowUpRight className="h-3.5 w-3.5 text-zinc-600 opacity-0 group-hover:opacity-100 transition" />
              </div>
              {a.badgeCount != null && a.badgeCount > 0 && (
                <div className="mt-0.5 inline-flex items-center gap-1">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${styles.badgeBg} ${styles.badgeText}`}>
                    {a.badgeCount}{a.badgeLabel ? ` ${a.badgeLabel}` : ""}
                  </span>
                </div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// Also export the icon set so consumers can build their own action objects
// without re-importing lucide-react.
export const QuickActionIcons = {
  ClipboardList,
  ListChecks,
  FileText,
  Inbox,
  Mic,
  Camera,
};

export default QuickActionsStrip;
