import {
  LayoutDashboard,
  Ruler,
  Calculator,
  FileText,
  CalendarDays,
  Send,
  Palette,
  ShoppingCart,
  Receipt,
  ArrowLeftRight,
  DollarSign,
  FileSpreadsheet,
  ClipboardList,
  Clock,
  ListChecks,
  FileQuestion,
  FileCheck,
  FolderOpen,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type ProjectModuleKey =
  | "overview"
  | "takeoff"
  | "estimates"
  | "proposals"
  | "schedules"
  | "bid-requests"
  | "selections"
  | "purchase-orders"
  | "bills"
  | "change-orders"
  | "budgets"
  | "client-invoices"
  | "daily-logs"
  | "timesheets"
  | "tasks"
  | "rfis"
  | "submittals"
  | "documents";

export interface ProjectModuleConfig {
  id: ProjectModuleKey;
  label: string;
  icon: LucideIcon;
  path: string;
}

export const projectWorkspaceModules: ProjectModuleConfig[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, path: "overview" },
  { id: "takeoff", label: "Takeoff", icon: Ruler, path: "takeoff" },
  { id: "estimates", label: "Estimate", icon: Calculator, path: "estimates" },
  { id: "proposals", label: "Proposal", icon: FileText, path: "proposals" },
  { id: "schedules", label: "Schedule", icon: CalendarDays, path: "schedules" },
  { id: "bid-requests", label: "Bid Requests", icon: Send, path: "bid-requests" },
  { id: "selections", label: "Selections and Allowances", icon: Palette, path: "selections" },
  { id: "purchase-orders", label: "PO and Subcontracts", icon: ShoppingCart, path: "purchase-orders" },
  { id: "bills", label: "Bills", icon: Receipt, path: "bills" },
  { id: "change-orders", label: "Change Orders", icon: ArrowLeftRight, path: "change-orders" },
  { id: "budgets", label: "Budget", icon: DollarSign, path: "budgets" },
  { id: "client-invoices", label: "Client Invoices", icon: FileSpreadsheet, path: "client-invoices" },
  { id: "daily-logs", label: "Daily Logs", icon: ClipboardList, path: "daily-logs" },
  { id: "timesheets", label: "Timesheets", icon: Clock, path: "timesheets" },
  { id: "tasks", label: "To-Dos", icon: ListChecks, path: "tasks" },
  { id: "rfis", label: "RFIs", icon: FileQuestion, path: "rfis" },
  { id: "submittals", label: "Submittals", icon: FileCheck, path: "submittals" },
  { id: "documents", label: "Documents", icon: FolderOpen, path: "documents" },
];
