import {
  LayoutDashboard,
  Stamp,
  Bell,
  Sun,
  Search,
  KanbanSquare,
  Landmark,
  Radar,
  Crosshair,
  Target,
  Zap,
  PencilRuler,
  Ruler,
  Wrench,
  HardHat,
  FolderGit2,
  ListChecks,
  FileCheck,
  FileQuestion,
  DollarSign,
  ShoppingCart,
  ArrowLeftRight,
  FileText,
  Receipt,
  Shield,
  Users,
  Factory,
  Building2,
  BookOpen,
  BrainCircuit,
  RefreshCcw,
  Bot, Brain,
  Sparkles,
  SlidersHorizontal,
  Plug,
  Settings,
  ArrowDownToLine,
  Mic,
  TrendingUp,
  ClipboardCheck,
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

export interface NavItemConfig {
  id: string;
  label: string;
  icon: LucideIcon;
  route: string;
  badgeKey?: NavBadgeKey;
  portfolioOnly?: boolean;
  projectOnly?: boolean;
}

export interface NavGroupConfig {
  id: string;
  label: string;
  icon: LucideIcon;
  order: number;
  items: NavItemConfig[];
}

export const navConfig: NavGroupConfig[] = [
  {
    id: "home",
    label: "Home",
    icon: LayoutDashboard,
    order: 10,
    items: [
      { id: "home.myday", label: "Home", icon: Sun, route: "/home" },
      { id: "home.approvals", label: "Approvals", icon: Stamp, route: "/approvals", badgeKey: "approvalsNeededCount" },
      { id: "home.alerts", label: "Notifications", icon: Bell, route: "/notifications" },
    ],
  },
  {
    id: "preconstruction",
    label: "Pre-Construction",
    icon: KanbanSquare,
    order: 20,
    items: [
      { id: "precon.opportunities", label: "Opportunities", icon: Search, route: "/capture/opportunities", portfolioOnly: true },
      { id: "precon.pipeline", label: "Pipeline", icon: KanbanSquare, route: "/capture/pipeline", portfolioOnly: true },
      { id: "precon.federalSearch", label: "Federal Search (SAM)", icon: Landmark, route: "/capture/federal-search", portfolioOnly: true },
      { id: "precon.highergov", label: "HigherGov Search", icon: Radar, route: "/capture/highergov", portfolioOnly: true },
      { id: "precon.competitors", label: "Competitors", icon: Crosshair, route: "/capture/competitors", portfolioOnly: true },
      { id: "precon.fitProfiles", label: "Fit Profiles", icon: Target, route: "/capture/fit-profiles", portfolioOnly: true },
      { id: "precon.automation", label: "Capture Automation", icon: Zap, route: "/capture/automation", portfolioOnly: true },
      { id: "precon.blueprints", label: "Blueprints & Drawings", icon: PencilRuler, route: "/estimate/blueprints" },
      { id: "precon.takeoff", label: "Takeoff Engine", icon: Ruler, route: "/estimate/takeoff" },
      { id: "precon.buildingSystems", label: "Building Systems", icon: Wrench, route: "/estimate/design-systems" },
            { id: "ai.proactive", label: "Proactive Intelligence", icon: Brain, route: "/proactive-intelligence" },
      { id: "precon.bidReadiness", label: "Bid Readiness", icon: FileCheck, route: "/bid-readiness" },
    ],
  },
  {
    id: "project-mgmt",
    label: "Project Management",
    icon: HardHat,
    order: 30,
    items: [
      { id: "pm.projects", label: "Active Projects", icon: FolderGit2, route: "/projects/active", portfolioOnly: true },
      { id: "pm.tasks", label: "Tasks", icon: ListChecks, route: "/execution/tasks", badgeKey: "overdueTaskCount" },
      { id: "pm.rfis", label: "RFIs", icon: FileQuestion, route: "/execution/rfis", badgeKey: "openRfiCount" },
      { id: "pm.voiceLog", label: "Voice Daily Log", icon: Mic, route: "/voice-daily-log", projectOnly: true },
      { id: "pm.submittals", label: "Submittals", icon: FileCheck, route: "/execution/submittals", badgeKey: "pendingSubmittalCount" },
    ],
  },
  {
    id: "financials",
    label: "Financials",
    icon: DollarSign,
    order: 40,
    items: [
      { id: "fin.overview", label: "Finance Overview", icon: DollarSign, route: "/financial/overview" },
      { id: "fin.purchaseOrders", label: "Purchase Orders", icon: ShoppingCart, route: "/execution/purchase-orders", badgeKey: "orphanPurchaseOrderCount" },
      { id: "fin.changeOrders", label: "Change Orders", icon: ArrowLeftRight, route: "/financial/change-orders" },
      { id: "fin.invoices", label: "Invoices (AR)", icon: FileText, route: "/financial/invoices", badgeKey: "unpaidInvoiceCount" },
      { id: "fin.bills", label: "Bills (AP)", icon: Receipt, route: "/financial/bills" },
      { id: "fin.compliance", label: "Compliance", icon: Shield, route: "/financial/compliance" },
      { id: "fin.lienWaivers", label: "Lien Waivers", icon: FileCheck, route: "/lien-waivers" },
    ],
  },
  {
    id: "directory",
    label: "Directory",
    icon: Users,
    order: 50,
    items: [
      { id: "dir.contacts", label: "Contacts", icon: Users, route: "/knowledge/contacts" },
      { id: "dir.vendors", label: "Vendors & Subs", icon: Factory, route: "/execution/vendors" },
        { id: "dir.coi", label: "COI Tracker", icon: Shield, route: "/coi" },
      { id: "dir.workforce", label: "Workforce", icon: HardHat, route: "/execution/workforce" },
      { id: "dir.agencies", label: "Agencies", icon: Building2, route: "/capture/agencies" },
    ],
  },
  {
    id: "documents",
    label: "Documents & Knowledge",
    icon: BookOpen,
    order: 60,
    items: [
      { id: "docs.knowledgeBase", label: "Knowledge Base", icon: BrainCircuit, route: "/knowledge/base" },
      { id: "docs.ingestion", label: "Document Ingestion", icon: ArrowDownToLine, route: "/projects/:projectId/ingestion", projectOnly: true },
      { id: "docs.egnyteSync", label: "Egnyte Sync", icon: RefreshCcw, route: "/automation/egnyte-sync" },
    ],
  },
  {
    id: "herbie",
    label: "HERBIE AI",
    icon: Bot,
    order: 70,
    items: [
      { id: "co.approvals", label: "CO Approvals", icon: ClipboardCheck, route: "/change-order-approvals" },
    { id: "vendor.confidence", label: "Vendor Confidence", icon: Building2, route: "/vendor-confidence" },
    { id: "herbie.digest", label: "Digest", icon: TrendingUp, route: "/herbie-digest" },
        { id: "herbie.chat", label: "Chat Assistant", icon: Bot, route: "/automation/herbie" },
        { id: "herbie.autonomous", label: "Autonomous", icon: Zap, route: "/herbie-autonomous" },
        { id: "herbie.memory", label: "Memory Inspector", icon: Brain, route: "/herbie-memory" },
      { id: "herbie.reviewQueue", label: "AI Review Queue", icon: Sparkles, route: "/automation/workflows" },
    ],
  },
  {
    id: "admin",
    label: "Admin",
    icon: Settings,
    order: 80,
    items: [
      { id: "admin.settings", label: "System Settings", icon: SlidersHorizontal, route: "/automation/settings" },
      { id: "admin.integrations", label: "Integrations", icon: Plug, route: "/automation/integrations" },
      { id: "admin.auditLog", label: "Audit Log", icon: FileText, route: "/automation/audit" },
    ],
  },
];

export function getNavItemsForMode(
  mode: "portfolio" | "project",
  groups: NavGroupConfig[] = navConfig,
): NavGroupConfig[] {
  return groups.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (mode === "project" && item.portfolioOnly) return false;
      if (mode === "portfolio" && item.projectOnly) return false;
      return true;
    }),
  })).filter((group) => group.items.length > 0);
}
