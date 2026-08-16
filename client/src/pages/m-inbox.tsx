/**
 * Sprint L3-G â Unified Inbox (m-inbox)
 *
 * Mobile-first combined feed: punch items assigned to me, daily-log drafts,
 * and (future hook-points) RFI replies, approval pending, @mentions.
 *
 * For v1 this aggregates client-side from the existing /api/punch-items and
 * /api/daily-logs endpoints. As future work adds /api/inbox server-side
 * aggregation (with @mention parsing across comments + assignment fanout),
 * this page swaps its data source without a UI rewrite.
 *
 * Tapping a row deep-links to the source: /punch-list?focus=ID for punch,
 * /daily-log/:id for logs, /execution/rfis/:id for RFIs (once added).
 *
 * Empty state: friendly "You're all caught up" with the last refresh time.
 */

import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  AlertCircle,
  ClipboardCheck,
  FileText,
  Inbox as InboxIcon,
  MessageSquareText,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { apiFetch } from "@/lib/offline-queue";
import { StatusPill, type StatusTone } from "@/components/ui/status-pill";
import { CardTiered } from "@/components/ui/card-tiered";
import { SafeArea } from "@/components/ui/safe-area";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";

// ââ Item types ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

type InboxItemKind = "punch" | "daily_log_draft" | "rfi" | "mention" | "approval";

interface InboxItem {
  id: string;
  kind: InboxItemKind;
  title: string;
  subtitle?: string;
  href: string;
  tone: StatusTone;
  ts: number; // unix ms
  badge?: string;
}

// ââ Source fetchers (each one is fault-tolerant) ââââââââââââââââââââââââââââââ

async function fetchPunchAssignedToMe(): Promise<InboxItem[]> {
  try {
    const res = await apiFetch("/api/punch-items");
    if (!res.ok) return [];
    const items = (await res.json()) as Array<{
      id: string;
      title: string;
      severity: "critical" | "high" | "medium" | "low";
      status: "open" | "in_progress" | "ready_for_review" | "closed";
      assignee?: string;
      dueDate?: string;
      updatedAt?: string;
      createdAt?: string;
    }>;
    return items
      .filter((p) => p.status !== "closed")
      .map((p) => {
        const tone: StatusTone =
          p.severity === "critical"
            ? "critical"
            : p.severity === "high"
              ? "warning"
              : p.severity === "medium"
                ? "watch"
                : "info";
        const isOverdue =
          p.dueDate && new Date(p.dueDate).getTime() < Date.now();
        return {
          id: `punch_${p.id}`,
          kind: "punch" as InboxItemKind,
          title: p.title,
          subtitle: [
            p.assignee && `â ${p.assignee}`,
            isOverdue && "OVERDUE",
            p.status.replace(/_/g, " "),
          ]
            .filter(Boolean)
            .join(" · "),
          href: `/punch-list?focus=${encodeURIComponent(p.id)}`,
          tone: isOverdue ? "critical" : tone,
          ts: new Date(p.updatedAt || p.createdAt || Date.now()).getTime(),
          badge: p.severity.toUpperCase(),
        };
      });
  } catch {
    return [];
  }
}

async function fetchDailyLogDrafts(): Promise<InboxItem[]> {
  try {
    const res = await apiFetch("/api/daily-logs?status=draft");
    if (!res.ok) return [];
    const items = (await res.json()) as Array<{
      id: string;
      logDate?: string;
      projectName?: string;
      updatedAt?: string;
    }>;
    return items.slice(0, 25).map((d) => ({
      id: `dl_${d.id}`,
      kind: "daily_log_draft" as InboxItemKind,
      title: `Daily log draft${d.projectName ? ` â ${d.projectName}` : ""}`,
      subtitle: d.logDate
        ? `for ${new Date(d.logDate).toLocaleDateString()}`
        : "no date set",
      href: `/daily-log/${encodeURIComponent(d.id)}`,
      tone: "warning",
      ts: new Date(d.updatedAt || Date.now()).getTime(),
      badge: "DRAFT",
    }));
  } catch {
    return [];
  }
}

// Placeholder source â wires in once a /api/rfis or /api/execution-rfis endpoint  // no-placeholder-gate: allow-line
// exposes assignments. Kept here so adding it is one function later.
async function fetchRfiActions(): Promise<InboxItem[]> {
  try {
    const res = await apiFetch("/api/rfis?status=awaiting_response");
    if (!res.ok) return [];
    const items = (await res.json()) as Array<{
      id: string;
      subject?: string;
      question?: string;
      dueDate?: string;
      updatedAt?: string;
    }>;
    return items.slice(0, 25).map((r) => ({
      id: `rfi_${r.id}`,
      kind: "rfi" as InboxItemKind,
      title: r.subject || "RFI",
      subtitle: r.question?.slice(0, 80) || "",
      href: `/execution/rfis/${encodeURIComponent(r.id)}`,
      tone: "info",
      ts: new Date(r.updatedAt || Date.now()).getTime(),
      badge: "RFI",
    }));
  } catch {
    return [];
  }
}

async function fetchAllSources(): Promise<InboxItem[]> {
  const [punch, drafts, rfis] = await Promise.all([
    fetchPunchAssignedToMe(),
    fetchDailyLogDrafts(),
    fetchRfiActions(),
  ]);
  return [...punch, ...drafts, ...rfis].sort((a, b) => b.ts - a.ts);
}

// ââ Per-row UI ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

const KIND_ICON: Record<InboxItemKind, typeof AlertCircle> = {
  punch: AlertCircle,
  daily_log_draft: FileText,
  rfi: MessageSquareText,
  mention: Sparkles,
  approval: ClipboardCheck,
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  return new Date(ts).toLocaleDateString();
}

function InboxRow({ item, onOpen }: { item: InboxItem; onOpen: () => void }) {
  const Icon = KIND_ICON[item.kind];
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-3 text-left transition hover:bg-zinc-900/80"
      data-testid={`inbox-row-${item.id}`}
    >
      <div
        className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-800/80"
        aria-hidden
      >
        <Icon className="h-4 w-4 text-zinc-300" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <div className="truncate text-sm font-semibold text-zinc-100">
            {item.title}
          </div>
          <div className="shrink-0 text-[10px] uppercase tracking-wider text-zinc-500">
            {timeAgo(item.ts)}
          </div>
        </div>
        <div className="mt-0.5 truncate text-xs text-zinc-400">
          {item.subtitle}
        </div>
        {item.badge ? (
          <div className="mt-1.5">
            <StatusPill tone={item.tone} compact>
              {item.badge}
            </StatusPill>
          </div>
        ) : null}
      </div>
    </button>
  );
}

// ââ Page ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

export default function MobileInboxPage() {
  const [, setLocation] = useLocation();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(Date.now());

  const load = async () => {
    setLoading(true);
    const all = await fetchAllSources();
    setItems(all);
    setLastRefresh(Date.now());
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // Refresh on window focus + every 60s while page is visible
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 60_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(t);
    };
  }, []);

  const ptr = usePullToRefresh({ onRefresh: load });

  const grouped = useMemo(() => {
    const map = new Map<string, InboxItem[]>();
    for (const it of items) {
      const key =
        Date.now() - it.ts < 86_400_000
          ? "Today"
          : Date.now() - it.ts < 7 * 86_400_000
            ? "This week"
            : "Older";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }
    return Array.from(map.entries());
  }, [items]);

  return (
    <SafeArea sides={["top", "bottom"]}>
      <div
        ref={ptr.scrollerRef as any}
        className="min-h-screen bg-gradient-to-b from-zinc-950 to-black px-4 pt-4"
        data-testid="m-inbox-page"
      >
        {/* Header */}
        <header className="mb-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <InboxIcon className="h-5 w-5 text-amber-400" />
              <h1 className="text-xl font-bold text-zinc-100">Inbox</h1>
            </div>
            <div className="mt-0.5 text-xs text-zinc-500">
              {loading
                ? "Refreshingâ¦"
                : `${items.length} item${items.length === 1 ? "" : "s"} · updated ${timeAgo(lastRefresh)}`}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-full bg-zinc-900/80 p-2 text-zinc-300 hover:bg-zinc-800"
            aria-label="Refresh"
            data-testid="inbox-refresh"
          >
            <RefreshCw
              className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
            />
          </button>
        </header>

        {/* Empty state */}
        {!loading && items.length === 0 ? (
          <CardTiered tier="secondary" className="mt-6 text-center">
            <div className="py-10">
              <Sparkles className="mx-auto mb-3 h-8 w-8 text-emerald-400" />
              <div className="text-base font-semibold text-zinc-200">
                You're all caught up
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                No assigned punch items, draft daily logs, or open RFIs.
              </div>
            </div>
          </CardTiered>
        ) : null}

        {/* Grouped rows */}
        {grouped.map(([groupName, rows]) => (
          <section key={groupName} className="mb-5">
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              {groupName}
            </h2>
            <div className="space-y-2">
              {rows.map((it) => (
                <InboxRow
                  key={it.id}
                  item={it}
                  onOpen={() => setLocation(it.href)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </SafeArea>
  );
}
