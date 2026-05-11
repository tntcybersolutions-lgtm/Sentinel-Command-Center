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
    id: "capture",
    label: "Capture",
    icon: Search,
    order: 20,
    items: [
      { id: "capture.opportunities", label: "Opportunities", icon: Search, route: "/capture/opportunities", portfolioOnly: true },
      { id: "capture.pipeline", label: "Pipeline", icon: KanbanSquare, route: "/capture/pipeline", portfolioOnly: true },
      { id: "capture.federalSearch", label: "Federal Search (SAM)", icon: Landmark, route: "/capture/federal-search", portfolioOnly: true },
      { id: "capture.highergov", label: "HigherGov Search", icon: Radar, route: "/capture/highergov", portfolioOnly: true },
      { id: "capture.competitors", label: "Competitors", icon: Crosshair, route: "/capture/competitors", portfolioOnly: true },
    ],
  },
  {
    id: "estimate",
    label: "Estimate",
    icon: PencilRuler,
    order: 30,
    items: [
      { id: "estimate.blueprints", label: "Blueprints & Drawings", icon: PencilRuler, route: "/estimate/blueprints" },
      { id: "estimate.takeoff", label: "Takeoff Engine", icon: Ruler, route: "/estimate/takeoff" },
      { id: "estimate.buildingSystems", label: "Building Systems", icon: Wrench, route: "/estimate/design-systems" },
      { id: "estimate.bidReadiness", label: "Bid Readiness", icon: FileCheck, route: "/bid-readiness" },
      { id: "estimate.fitProfiles", label: "Fit Profiles", icon: Target, route: "/capture/fit-profiles", portfolioOnly: true },
      { id: "estimate.proactive", label: "Proactive Intelligence", icon: Brain, route: "/proactive-intelligence" },
    ],
  },
  {
    id: "projects",
    label: "Projects",
    icon: HardHat,
    order: 40,
    items: [
      { id: "projects.active", label: "Active Projects", icon: FolderGit2, route: "/projects/active", portfolioOnly: true },
      { id: "projects.tasks", label: "Tasks", icon: ListChecks, route: "/execution/tasks", badgeKey: "overdueTaskCount" },
      { id: "projects.rfis", label: "RFIs", icon: FileQuestion, route: "/execution/rfis", badgeKey: "openRfiCount" },
      { id: "projects.submittals", label: "Submittals", icon: FileCheck, route: "/execution/submittals", badgeKey: "pendingSubmittalCount" },
      { id: "projects.coApprovals", label: "Change Orders", icon: ClipboardCheck, route: "/change-order-approvals" },
      { id: "projects.voiceLog", label: "Voice Daily Log", icon: Mic, route: "/voice-daily-log", projectOnly: true },
    ],
  },
  {
    id: "financials",
    label: "Financials",
    icon: DollarSign,
    order: 50,
    items: [
      { id: "fin.overview", label: "Finance Overview", icon: DollarSign, route: "/financial/overview" },
      { id: "fin.purchaseOrders", label: "Purchase Orders", icon: ShoppingCart, route: "/execution/purchase-orders", badgeKey: "orphanPurchaseOrderCount" },
      { id: "fin.changeOrders", label: "Change Orders", icon: ArrowLeftRight, route: "/financial/change-orders" },
      { id: "fin.invoices", label: "Invoices (AR)", icon: FileText, route: "/financial/invoices", badgeKey: "unpaidInvoiceCount" },
      { id: "fin.bills", label: "Bills (AP)", icon: Receipt, route: "/financial/bills" },
      { id: "fin.compliance", label: "Compliance", icon: Shield, route: "/financial/compliance" },
    ],
  },
  {
    id: "people",
    label: "People & Vendors",
    icon: Users,
    order: 60,
    items: [
      { id: "people.contacts", label: "Contacts", icon: Users, route: "/knowledge/contacts" },
      { id: "people.vendors", label: "Vendors & Subs", icon: Factory, route: "/execution/vendors" },
      { id: "people.vendorConfidence", label: "Vendor Confidence", icon: Building2, route: "/vendor-confidence" },
      { id: "people.coi", label: "COI Tracker", icon: Shield, route: "/coi" },
      { id: "people.workforce", label: "Workforce", icon: HardHat, route: "/execution/workforce" },
      { id: "people.agencies", label: "Agencies", icon: Building2, route: "/capture/agencies" },
    ],
  },
  {
    id: "knowledge",
    label: "Documents & Knowledge",
    icon: BookOpen,
    order: 70,
    items: [
      { id: "knowledge.base", label: "Knowledge Base", icon: BrainCircuit, route: "/knowledge/base" },
      { id: "knowledge.ingestion", label: "Document Ingestion", icon: ArrowDownToLine, route: "/projects/:projectId/ingestion", projectOnly: true },
      { id: "knowledge.egnyte", label: "Egnyte Sync", icon: RefreshCcw, route: "/automation/egnyte-sync" },
    ],
  },
  {
    id: "assistant",
    label: "AI Assistant",
    icon: Bot,
    order: 80,
    items: [
      { id: "ai.digest", label: "Daily Digest", icon: TrendingUp, route: "/herbie-digest" },
      { id: "ai.chat", label: "Chat Assistant", icon: Bot, route: "/automation/herbie" },
      { id: "ai.autonomous", label: "Autonomous Mode", icon: Sparkles, route: "/herbie-autonomous" },
    ],
  },
  {
    id: "admin",
    label: "Admin",
    icon: Settings,
    order: 90,
    items: [
      { id: "admin.settings", label: "System Settings", icon: SlidersHorizontal, route: "/automation/settings" },
      { id: "admin.integrations", label: "Integrations", icon: Plug, route: "/automation/integrations" },
      { id: "admin.captureAutomation", label: "Capture Automation", icon: Zap, route: "/capture/automation", portfolioOnly: true },
      { id: "admin.aiReviewQueue", label: "AI Review Queue", icon: Sparkles, route: "/automation/workflows" },
      { id: "admin.memoryInspector", label: "HERBIE Memory", icon: Brain, route: "/herbie-memory" },
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
