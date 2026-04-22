export const routeAlias: Record<string, string> = {
  "dashboard.overview": "/dashboard",
  "dashboard.approvals": "/approvals",
  "dashboard.alerts": "/notifications",
  "dashboard.planner": "/planner",
  "dashboard.calendar": "/calendar",

  "capture.opportunities": "/capture/opportunities",
  "capture.pipeline": "/capture/pipeline",
  "capture.agencies": "/capture/agencies",
  "capture.competitors": "/capture/competitors",
  "capture.federalSearch": "/capture/federal-search",
  "capture.highergov": "/capture/highergov",
  "capture.automation": "/capture/automation",
  "capture.fitProfiles": "/capture/fit-profiles",

  "estimate.blueprints": "/estimate/blueprints",
  "estimate.takeoff": "/estimate/takeoff",
  "estimate.designSystems": "/estimate/design-systems",

  "execution.projects": "/projects/active",
  "execution.tasks": "/execution/tasks",
  "execution.submittals": "/execution/submittals",
  "execution.rfis": "/execution/rfis",
  "execution.purchaseOrders": "/execution/purchase-orders",
  "execution.tickets": "/execution/tickets",
  "execution.inventory": "/execution/inventory",
  "execution.workforce": "/execution/workforce",
  "execution.vendors": "/execution/vendors",

  "financial.overview": "/financial/overview",
  "financial.bills": "/financial/bills",
  "financial.invoices": "/financial/invoices",
  "financial.changeOrders": "/financial/change-orders",
  "financial.compliance": "/financial/compliance",

  "knowledge.brain": "/knowledge/base",
  "knowledge.contacts": "/knowledge/contacts",

  "automation.herbie": "/automation/herbie",
  "automation.eventLog": "/automation/events",
  "automation.workflows": "/automation/workflows",
  "automation.integrations": "/automation/integrations",
  "automation.settings": "/automation/settings",
  "automation.audit": "/automation/audit",
  "automation.egnyte": "/automation/egnyte-sync",
  "automation.dataHygiene": "/automation/data-hygiene",
};

export const nonNavigableIds = new Set<string>([
  "proposals.bidJacket",
]);

export const dynamicRoutePatterns = [
  "/capture/pursuits/",
  "/projects/",
];
