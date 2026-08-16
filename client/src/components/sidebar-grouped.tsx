// ============================================================================
// sidebar-grouped.tsx — Three-tier sidebar (Pinned / Daily / Reference)
// ----------------------------------------------------------------------------
// Wraps the existing 57-item navConfig.ts into three tiers based on actual
// frequency-of-use, so a new GC sees 6 items by default instead of 57.
//
// Tier definitions:
//   PINNED   — the 6 items a GC opens every morning: Home / Today / Punch
//              List / Daily Log / Drawings / Inbox
//   DAILY    — 8 next-most-frequent: Projects, Photos, RFIs, Submittals,
//              Money, Subs & Vendors, Schedule, Reports
//   REFERENCE — collapsed by default. Everything else from navConfig.
//
// User can drag/promote items between tiers (stored in localStorage as
// `sentinel-sidebar-pinned` / `sentinel-sidebar-daily`). Drag-and-drop is
// the next sprint — for v1, the three tiers are static + user can collapse
// REFERENCE.
//
// This is a VIEW LAYER on top of navConfig.ts — does NOT delete any nav
// entries. Existing consumers of navConfig keep working.
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { ChevronDown, ChevronRight, Star, Pin } from "lucide-react";

// ── Default tier configuration (curated for general contractor workflow) ────

const DEFAULT_PINNED_HREFS = [
  "/home",
  "/m-home",
  "/punch-list",
  "/m-daily-log",
  "/m-drawings",
  "/m-inbox",
];

const DEFAULT_DAILY_HREFS = [
  "/projects",
  "/m-photos",
  "/rfis",
  "/submittals",
  "/financial/overview",
  "/subs-vendors",
  "/schedule",
  "/reports",
];

const STORAGE_PINNED = "sentinel-sidebar-pinned";
const STORAGE_DAILY = "sentinel-sidebar-daily";
const STORAGE_COLLAPSED = "sentinel-sidebar-reference-collapsed";

// ── Types (matches existing navConfig shape — relaxed for tolerance) ────────

export interface NavItem {
  label: string;
  href: string;
  icon?: React.ComponentType<{ className?: string }>;
  badge?: string | number;
  children?: NavItem[];
}

export interface SidebarGroupedProps {
  /** Full nav list from navConfig.ts (flatten nested children if needed). */
  items: NavItem[];
  className?: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function flattenNav(items: NavItem[]): NavItem[] {
  const out: NavItem[] = [];
  for (const i of items) {
    out.push(i);
    if (i.children?.length) out.push(...flattenNav(i.children));
  }
  return out;
}

function loadHrefSet(key: string, fallback: string[]): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.every((s) => typeof s === "string")) {
        return new Set(arr);
      }
    }
  } catch {/* private mode */}
  return new Set(fallback);
}

function saveHrefSet(key: string, hrefs: Set<string>) {
  try { localStorage.setItem(key, JSON.stringify(Array.from(hrefs))); } catch {}
}

// ── Component ───────────────────────────────────────────────────────────────

export function SidebarGrouped({ items, className = "" }: SidebarGroupedProps) {
  const [location] = useLocation();
  const [pinnedSet, setPinnedSet] = useState<Set<string>>(new Set());
  const [dailySet, setDailySet] = useState<Set<string>>(new Set());
  const [referenceCollapsed, setReferenceCollapsed] = useState(true);

  useEffect(() => {
    setPinnedSet(loadHrefSet(STORAGE_PINNED, DEFAULT_PINNED_HREFS));
    setDailySet(loadHrefSet(STORAGE_DAILY, DEFAULT_DAILY_HREFS));
    try {
      const c = localStorage.getItem(STORAGE_COLLAPSED);
      // Default: collapsed for new users (less noise); expanded if previously expanded
      setReferenceCollapsed(c !== "0");
    } catch {/* private mode */}
  }, []);

  const flat = useMemo(() => flattenNav(items), [items]);

  const pinned = useMemo(() => flat.filter((i) => pinnedSet.has(i.href)), [flat, pinnedSet]);
  const daily = useMemo(() => flat.filter((i) => !pinnedSet.has(i.href) && dailySet.has(i.href)), [flat, pinnedSet, dailySet]);
  const reference = useMemo(
    () => flat.filter((i) => !pinnedSet.has(i.href) && !dailySet.has(i.href)),
    [flat, pinnedSet, dailySet]
  );

  const toggleReference = () => {
    const next = !referenceCollapsed;
    setReferenceCollapsed(next);
    try { localStorage.setItem(STORAGE_COLLAPSED, next ? "1" : "0"); } catch {}
  };

  const togglePin = (href: string) => {
    setPinnedSet((prev) => {
      const next = new Set(prev);
      if (next.has(href)) next.delete(href);
      else next.add(href);
      saveHrefSet(STORAGE_PINNED, next);
      return next;
    });
  };

  return (
    <nav data-testid="sidebar-grouped" className={`flex flex-col gap-1 ${className}`}>

      {/* ─── PINNED ──────────────────────────────────────────────────────── */}
      {pinned.length > 0 && (
        <div className="mb-3">
          <div className="px-3 mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            <Pin className="h-3 w-3" />
            <span>Pinned</span>
          </div>
          {pinned.map((item) => (
            <NavRow
              key={item.href}
              item={item}
              isActive={location === item.href}
              isPinned
              onTogglePin={() => togglePin(item.href)}
            />
          ))}
        </div>
      )}

      {/* ─── DAILY ───────────────────────────────────────────────────────── */}
      {daily.length > 0 && (
        <div className="mb-3">
          <div className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Daily
          </div>
          {daily.map((item) => (
            <NavRow
              key={item.href}
              item={item}
              isActive={location === item.href}
              isPinned={false}
              onTogglePin={() => togglePin(item.href)}
            />
          ))}
        </div>
      )}

      {/* ─── REFERENCE (collapsed by default) ────────────────────────────── */}
      {reference.length > 0 && (
        <div>
          <button
            type="button"
            onClick={toggleReference}
            data-testid="sidebar-reference-toggle"
            className="w-full px-3 py-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 hover:text-zinc-300 transition"
          >
            {referenceCollapsed ? (
              <ChevronRight className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
            <span>Everything else ({reference.length})</span>
          </button>
          {!referenceCollapsed && (
            <div>
              {reference.map((item) => (
                <NavRow
                  key={item.href}
                  item={item}
                  isActive={location === item.href}
                  isPinned={false}
                  onTogglePin={() => togglePin(item.href)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </nav>
  );
}

// ── NavRow ──────────────────────────────────────────────────────────────────

function NavRow({
  item,
  isActive,
  isPinned,
  onTogglePin,
}: {
  item: NavItem;
  isActive: boolean;
  isPinned: boolean;
  onTogglePin: () => void;
}) {
  const Icon = item.icon;
  return (
    <div
      data-testid={`nav-row-${item.href}`}
      data-active={isActive ? "true" : "false"}
      className={`group flex items-center gap-2 px-3 py-1.5 rounded-lg transition ${
        isActive ? "bg-violet-950/50 text-violet-200" : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60"
      }`}
    >
      <Link href={item.href} className="flex-1 flex items-center gap-2 min-w-0">
        {Icon ? <Icon className="h-4 w-4 flex-shrink-0" /> : <span className="w-4" />}
        <span className="text-sm truncate">{item.label}</span>
      </Link>
      {item.badge != null && (
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
          {item.badge}
        </span>
      )}
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onTogglePin(); }}
        className="opacity-0 group-hover:opacity-100 transition p-1 rounded hover:bg-zinc-800"
        aria-label={isPinned ? "Unpin" : "Pin"}
        data-testid={`nav-pin-${item.href}`}
      >
        <Star
          className={`h-3.5 w-3.5 ${isPinned ? "text-amber-400 fill-amber-400" : "text-zinc-600"}`}
        />
      </button>
    </div>
  );
}

export default SidebarGrouped;
