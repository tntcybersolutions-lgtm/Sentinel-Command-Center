// ============================================================================
// navConfig.ts — Sentinel for BlackHawk (v3, GC-mode aware)
// ----------------------------------------------------------------------------
// Two nav modes from one config:
//
//   • GC mode      — what a typical commercial-GC customer sees.
//                    5 groups, ~22 items. No GovCon, no admin clutter.
//
//   • Internal mode — what BlackHawk (Bradley + team) sees.
//                     7 groups, all ~50 items. Federal Search, capture stack,
//                     Herbie internals, admin tools. The full power-user view.
//
// Every item has a `gcVisible` flag. Default is true (visible in GC mode).
// Items marked gcVisible: false are hidden from GC customers but stay in
// internal mode. Groups that empty out under filtering disappear automatically.
//
// All routes preserved 1-for-1 from the previous navConfig — nothing breaks.
// Badge keys, portfolioOnly, and projectOnly flags all preserved.
//
// To switch app default, change the `userType` arg to getNavItemsForMode().
// To run side-by-side, gate on user role / org type from your auth layer.
// ============================================================================

import {
  // Home
  LayoutDashboard, Sun, Stamp, Bell,
  // Pursuit
  Search, KanbanSquare, Landmark, Radar, Crosshair, Target, Building2,
  // Estimate
  PencilRuler, Ruler, Wrench, FileCheck, Brain,
  // Projects
  HardHat, FolderGit2, ListChecks, FileQuestion, ClipboardCheck, Mic, ArrowLeftRight, Camera, GanttChartSquare, Share2,
  // Financials
  DollarSign, ShoppingCart, FileText, Receipt, Shield,
  // Subs & Vendors
  Users, Factory,
  // Herbie / Admin
  Bot, Sparkles, TrendingUp, BrainCircuit, RefreshCcw,
  Plug, SlidersHorizontal, Zap, ArrowDownToLine,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavBadgeKey =
  | "overdueTaskCount"
  | "openRfiCount"
  | "pendingSubmittalCount"
  | "orphanPurchaseOrderCount"
  | "unpaidInvoiceCount"
  | "approvalsNeededCount"
  | "missingArtifactsCount"
  | "checklistTodoCount";

export type NavCounts = Record<NavBadgeKey, number>;

export type UserType = "gc" | "internal";

export interface NavItemConfig {
  id: string;
  label: string;
  icon: LucideIcon;
  route: string;
  badgeKey?: NavBadgeKey;
  portfolioOnly?: boolean;
  projectOnly?: boolean;
  /** GovCon / internal items: set false to hide from typical GC customers. Default true. */
  gcVisible?: boolean;
}

export interface NavGroupConfig {
  id: string;
  label: string;
  icon: LucideIcon;
  order: number;
  items: NavItemConfig[];
  /** Hide entire group from GC mode. Default true. */
  gcVisible?: boolean;
}

export const navConfig: NavGroupConfig[] = [
  // ── 1. HOME ──────────────────────────────────────────────────────────────
  {
    id: "home",
    label: "Home",
    icon: LayoutDashboard,
    order: 10,
    items: [
      { id: "home.today",     label: "Today",         icon: Sun,   route: "/home" },
      { id: "home.approvals", label: "Approvals",     icon: Stamp, route: "/approvals", badgeKey: "approvalsNeededCount" },
      { id: "home.alerts",    label: "Notifications", icon: Bell,  route: "/notifications" },
    ],
  },

  // ── 2. PURSUIT (renamed to "Bids" effectively for GC mode — only Pipeline shows) ─
  // For internal: full SAM.gov capture stack visible.
  // For GC: only the Pipeline (bid kanban) shows — everything else is GovCon flavor.
  {
    id: "pursuit",
    label: "Pursuit",
    icon: Search,
    order: 20,
    items: [
      { id: "pursuit.pipeline",      label: "Pipeline",             icon: KanbanSquare, route: "/capture/pipeline",       portfolioOnly: true },
      { id: "pursuit.federalSearch", label: "Federal Search (SAM)", icon: Landmark,     route: "/capture/federal-search", portfolioOnly: true, gcVisible: false },
      { id: "pursuit.highergov",     label: "HigherGov Search",     icon: Radar,        route: "/capture/highergov",      portfolioOnly: true, gcVisible: false },
      { id: "pursuit.opportunities", label: "Opportunities",        icon: Search,       route: "/capture/opportunities",  portfolioOnly: true, gcVisible: false },
      { id: "pursuit.fitProfiles",   label: "Fit Profiles",         icon: Target,       route: "/capture/fit-profiles",   portfolioOnly: true, gcVisible: false },
      { id: "pursuit.competitors",   label: "Competitors",          icon: Crosshair,    route: "/capture/competitors",    portfolioOnly: true, gcVisible: false },
      { id: "pursuit.agencies",      label: "Agencies",             icon: Building2,    route: "/capture/agencies",       portfolioOnly: true, gcVisible: false },
    ],
  },

  // ── 3. ESTIMATE ──────────────────────────────────────────────────────────
  {
    id: "estimate",
    label: "Estimate",
    icon: PencilRuler,
    order: 30,
    items: [
      { id: "estimate.bidReadiness",    label: "Bid Readiness",          icon: FileCheck,   route: "/bid-readiness" },
      { id: "estimate.blueprints",      label: "Blueprints & Drawings",  icon: PencilRuler, route: "/estimate/blueprints" },
      { id: "estimate.takeoff",         label: "Takeoff Engine",         icon: Ruler,       route: "/estimate/takeoff" },
      { id: "estimate.buildingSystems", label: "Building Systems",       icon: Wrench,      route: "/estimate/design-systems" },
      { id: "estimate.proactive",       label: "Proactive Intelligence", icon: Brain,       route: "/proactive-intelligence", gcVisible: false },
    ],
  },

  // ── 4. PROJECTS ──────────────────────────────────────────────────────────
  {
    id: "projects",
    label: "Projects",
    icon: HardHat,
    order: 40,
    items: [
      { id: "projects.active",       label: "Active Projects", icon: FolderGit2,     route: "/projects/active",      portfolioOnly: true },
      { id: "projects.tasks",        label: "Tasks",           icon: ListChecks,     route: "/execution/tasks",      badgeKey: "overdueTaskCount" },
      { id: "projects.punch",        label: "Punch List",      icon: ClipboardCheck, route: "/punch-list" },
      { id: "projects.rfis",         label: "RFIs",            icon: FileQuestion,   route: "/execution/rfis",       badgeKey: "openRfiCount" },
      { id: "projects.submittals",   label: "Submittals",      icon: FileCheck,      route: "/execution/submittals", badgeKey: "pendingSubmittalCount" },
      { id: "projects.changeOrders", label: "Change Orders",   icon: ClipboardCheck, route: "/change-order-approvals" },
      { id: "projects.voiceLog",     label: "Voice Daily Log", icon: Mic,            route: "/voice-daily-log",      projectOnly: true },
      { id: "projects.photos",       label: "Photos",          icon: Camera,            route: "/projects/:projectId/photos",   projectOnly: true },
      { id: "projects.schedule",     label: "Schedule",        icon: GanttChartSquare,  route: "/projects/:projectId/schedule", projectOnly: true },
      { id: "projects.ownerPortal",  label: "Owner Portal",    icon: Share2,            route: "/projects/:projectId/cockpit",  projectOnly: true },
    ],
  },

  // ── 5. FINANCIALS ────────────────────────────────────────────────────────
  {
    id: "financials",
    label: "Financials",
    icon: DollarSign,
    order: 50,
    items: [
      { id: "fin.overview",       label: "Overview",        icon: DollarSign,    route: "/financial/overview" },
      { id: "fin.purchaseOrders", label: "Purchase Orders", icon: ShoppingCart,  route: "/execution/purchase-orders", badgeKey: "orphanPurchaseOrderCount" },
      { id: "fin.changeOrders",   label: "Change Orders",   icon: ArrowLeftRight,route: "/financial/change-orders" },
      { id: "fin.invoices",       label: "Invoices (AR)",   icon: FileText,      route: "/financial/invoices",        badgeKey: "unpaidInvoiceCount" },
      { id: "fin.bills",          label: "Bills (AP)",      icon: Receipt,       route: "/financial/bills" },
      { id: "fin.compliance",     label: "Compliance",      icon: Shield,        route: "/financial/compliance" },
    ],
  },

  // ── 6. SUBS & VENDORS ────────────────────────────────────────────────────
  {
    id: "subs",
    label: "Subs & Vendors",
    icon: Users,
    order: 60,
    items: [
      { id: "subs.vendors",          label: "Vendors & Subs",    icon: Factory,   route: "/execution/vendors" },
      { id: "subs.coi",              label: "COI Tracker",       icon: Shield,    route: "/coi" },
      { id: "subs.contacts",         label: "Contacts",          icon: Users,     route: "/knowledge/contacts" },
      { id: "subs.workforce",        label: "Workforce",         icon: HardHat,   route: "/execution/workforce" },
      { id: "subs.vendorConfidence", label: "Vendor Confidence", icon: Building2, route: "/vendor-confidence", gcVisible: false },
    ],
  },

  // ── 7. HERBIE ────────────────────────────────────────────────────────────
  // GC sees only: Daily Digest + Chat Assistant. Everything else is internal.
  {
    id: "herbie",
    label: "Herbie",
    icon: Bot,
    order: 70,
    items: [
      { id: "herbie.digest",            label: "Daily Digest",       icon: TrendingUp,        route: "/herbie-digest" },
      { id: "herbie.chat",              label: "Chat Assistant",     icon: Bot,               route: "/automation/herbie" },
      { id: "herbie.autonomous",        label: "Autonomous Mode",    icon: Sparkles,          route: "/herbie-autonomous",                       gcVisible: false },
      { id: "herbie.memory",            label: "HERBIE Memory",      icon: Brain,             route: "/herbie-memory",                           gcVisible: false },
      { id: "herbie.knowledge",         label: "Knowledge Base",     icon: BrainCircuit,      route: "/knowledge/base",                          gcVisible: false },
      { id: "herbie.docIngestion",      label: "Document Ingestion", icon: ArrowDownToLine,   route: "/projects/:projectId/ingestion", projectOnly: true, gcVisible: false },
      { id: "herbie.egnyte",            label: "Egnyte Sync",        icon: RefreshCcw,        route: "/automation/egnyte-sync",                  gcVisible: false },
      { id: "herbie.integrations",      label: "Integrations",       icon: Plug,              route: "/automation/integrations",                 gcVisible: false },
      { id: "herbie.captureAutomation", label: "Capture Automation", icon: Zap,               route: "/capture/automation", portfolioOnly: true, gcVisible: false },
      { id: "herbie.reviewQueue",       label: "AI Review Queue",    icon: Sparkles,          route: "/automation/workflows",                    gcVisible: false },
      { id: "herbie.auditLog",          label: "Audit Log",          icon: FileText,          route: "/automation/audit",                        gcVisible: false },
      { id: "herbie.settings",          label: "Settings",           icon: SlidersHorizontal, route: "/automation/settings",                     gcVisible: false },
    ],
  },
];

// ----------------------------------------------------------------------------
// Filter helper.
// - userType "gc"       → hides anything with gcVisible: false (default visible)
// - userType "internal" → shows everything (BlackHawk team default)
// - mode "portfolio" / "project" → existing portfolioOnly / projectOnly filtering
// ----------------------------------------------------------------------------
export function getNavItemsForMode(
  mode: "portfolio" | "project",
  userType: UserType = "gc",
  groups: NavGroupConfig[] = navConfig,
): NavGroupConfig[] {
  return groups
    .filter((group) => userType === "internal" || group.gcVisible !== false)
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (mode === "project"   && item.portfolioOnly) return false;
        if (mode === "portfolio" && item.projectOnly)   return false;
        if (userType === "gc"    && item.gcVisible === false) return false;
        return true;
      }),
    }))
    .filter((group) => group.items.length > 0);
}
