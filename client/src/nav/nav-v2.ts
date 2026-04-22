import {
  LayoutDashboard,
  Radar,
  Stamp,
  Bell,
  Search,
  Landmark,
  Crosshair,
  Factory,
  Building2,
  KanbanSquare,
  Zap,
  BrainCircuit,
  Target,
  FolderGit2,
  Settings,
  Plug,
  SlidersHorizontal,
  RefreshCcw,
  Gauge,
  Shield,
  Users,
  Calculator,
  Ruler,
  PencilRuler,
  HardHat,
  Ticket,
  Package,
  Calendar,
  ClipboardList,
  DollarSign,
  FileText,
  Receipt,
  ArrowLeftRight,
  ListChecks,
  FileCheck,
  FileQuestion,
  ShoppingCart,
  Bot,
  Activity,
  Workflow,
  BookOpen,
  Cog,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavV2Item = {
  id: string;
  label: string;
  icon: LucideIcon;
  routeKey: string;
  hidden?: boolean;
};

export type NavV2Group = {
  id: string;
  label: string;
  icon: LucideIcon;
  order: number;
  items: NavV2Item[];
};

export const navV2: NavV2Group[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    order: 10,
    items: [
      { id: "dashboard.overview", label: "Executive Overview", icon: Gauge, routeKey: "dashboard.overview" },
      { id: "dashboard.approvals", label: "Approvals", icon: Stamp, routeKey: "dashboard.approvals" },
      { id: "dashboard.alerts", label: "Alerts & Notifications", icon: Bell, routeKey: "dashboard.alerts" },
      { id: "dashboard.planner", label: "Planner", icon: ClipboardList, routeKey: "dashboard.planner" },
      { id: "dashboard.calendar", label: "Calendar", icon: Calendar, routeKey: "dashboard.calendar" },
    ],
  },
  {
    id: "capture",
    label: "Capture",
    icon: KanbanSquare,
    order: 20,
    items: [
      { id: "capture.opportunities", label: "Opportunities", icon: Search, routeKey: "capture.opportunities" },
      { id: "capture.pipeline", label: "Pipeline", icon: KanbanSquare, routeKey: "capture.pipeline" },
      { id: "capture.federalSearch", label: "Federal Search (SAM)", icon: Landmark, routeKey: "capture.federalSearch" },
      { id: "capture.highergov", label: "HigherGov Search", icon: Radar, routeKey: "capture.highergov" },
      { id: "capture.agencies", label: "Agencies", icon: Building2, routeKey: "capture.agencies" },
      { id: "capture.competitors", label: "Competitors", icon: Crosshair, routeKey: "capture.competitors" },
      { id: "capture.fitProfiles", label: "Fit Profiles", icon: Target, routeKey: "capture.fitProfiles" },
      { id: "capture.automation", label: "Capture Automation", icon: Zap, routeKey: "capture.automation" },
    ],
  },
  {
    id: "estimate",
    label: "Estimate",
    icon: Calculator,
    order: 30,
    items: [
      { id: "estimate.blueprints", label: "Blueprints & Drawings", icon: PencilRuler, routeKey: "estimate.blueprints" },
      { id: "estimate.takeoff", label: "Takeoff Engine", icon: Ruler, routeKey: "estimate.takeoff" },
      { id: "estimate.designSystems", label: "Building Systems", icon: Wrench, routeKey: "estimate.designSystems" },
    ],
  },
  {
    id: "execution",
    label: "Execution",
    icon: HardHat,
    order: 40,
    items: [
      { id: "execution.projects", label: "Active Projects", icon: FolderGit2, routeKey: "execution.projects" },
      { id: "execution.tasks", label: "Tasks", icon: ListChecks, routeKey: "execution.tasks" },
      { id: "execution.submittals", label: "Submittals", icon: FileCheck, routeKey: "execution.submittals" },
      { id: "execution.rfis", label: "RFIs", icon: FileQuestion, routeKey: "execution.rfis" },
      { id: "execution.purchaseOrders", label: "Purchase Orders", icon: ShoppingCart, routeKey: "execution.purchaseOrders" },
      { id: "execution.tickets", label: "Tickets & Issues", icon: Ticket, routeKey: "execution.tickets" },
      { id: "execution.inventory", label: "Inventory", icon: Package, routeKey: "execution.inventory" },
      { id: "execution.workforce", label: "Workforce", icon: HardHat, routeKey: "execution.workforce" },
      { id: "execution.vendors", label: "Vendors & Subs", icon: Factory, routeKey: "execution.vendors" },
    ],
  },
  {
    id: "financial",
    label: "Financial Control",
    icon: DollarSign,
    order: 50,
    items: [
      { id: "financial.overview", label: "Finance Overview", icon: DollarSign, routeKey: "financial.overview" },
      { id: "financial.bills", label: "Bills (AP)", icon: Receipt, routeKey: "financial.bills" },
      { id: "financial.invoices", label: "Client Invoices (AR)", icon: FileText, routeKey: "financial.invoices" },
      { id: "financial.changeOrders", label: "Change Orders", icon: ArrowLeftRight, routeKey: "financial.changeOrders" },
      { id: "financial.compliance", label: "Compliance", icon: Shield, routeKey: "financial.compliance" },
    ],
  },
  {
    id: "knowledge",
    label: "Knowledge Base",
    icon: BookOpen,
    order: 60,
    items: [
      { id: "knowledge.brain", label: "Knowledge Base", icon: BrainCircuit, routeKey: "knowledge.brain" },
      { id: "knowledge.contacts", label: "Contacts", icon: Users, routeKey: "knowledge.contacts" },
    ],
  },
  {
    id: "automation",
    label: "Automation / AI",
    icon: Bot,
    order: 70,
    items: [
      { id: "automation.herbie", label: "HERBIE Assistant", icon: Bot, routeKey: "automation.herbie" },
      { id: "automation.eventLog", label: "Event Log", icon: Activity, routeKey: "automation.eventLog" },
      { id: "automation.workflows", label: "Workflow Rules", icon: Workflow, routeKey: "automation.workflows" },
      { id: "automation.integrations", label: "Integrations", icon: Plug, routeKey: "automation.integrations" },
      { id: "automation.settings", label: "System Settings", icon: SlidersHorizontal, routeKey: "automation.settings" },
      { id: "automation.audit", label: "Audit Log", icon: FileText, routeKey: "automation.audit" },
      { id: "automation.egnyte", label: "Egnyte Sync", icon: RefreshCcw, routeKey: "automation.egnyte" },
      { id: "automation.dataHygiene", label: "Data Hygiene", icon: Shield, routeKey: "automation.dataHygiene" },
    ],
  },
];
