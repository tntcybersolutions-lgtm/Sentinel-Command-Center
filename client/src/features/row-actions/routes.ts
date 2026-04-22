import type { EntityType } from "./types";

export const routes: Record<EntityType, string> = {
  task: "/api/tasks",
  submittal: "/api/submittals",
  rfi: "/api/rfis",
  purchaseOrder: "/api/purchase-orders",
  changeOrder: "/api/change-orders",
  invoice: "/api/invoices",
  bidProject: "/api/bid-projects",
  project: "/api/projects",
} as const;

export const listQueryKeys: Record<EntityType, string> = {
  task: "/api/tasks",
  submittal: "/api/submittals",
  rfi: "/api/rfis",
  purchaseOrder: "/api/purchase-orders",
  changeOrder: "/api/change-orders",
  invoice: "/api/invoices",
  bidProject: "/api/bid-projects",
  project: "/api/projects",
} as const;
