export type WidgetSize = "sm" | "md" | "lg";

export interface DashboardWidgetDefinition {
  widgetKey: string;
  name: string;
  description: string;
  defaultVisible: boolean;
  defaultSize: WidgetSize;
  allowedSizes: WidgetSize[];
  defaultOrderIndex: number;
  priorityLevel?: "critical" | "high" | "normal" | "low";
  dataSourceEndpoint?: string;
  category:
    | "Overview"
    | "Opportunities"
    | "Approvals"
    | "AI"
    | "Documents"
    | "Health"
    | "Competitive"
    | "Compliance";
}

export const DASHBOARD_WIDGETS: DashboardWidgetDefinition[] = [
  {
    widgetKey: "statsRow",
    name: "Key Metrics",
    description: "High-level totals and trends for opportunities, bids, approvals, and activity.",
    defaultVisible: true,
    defaultSize: "lg",
    allowedSizes: ["lg"],
    defaultOrderIndex: 1,
    priorityLevel: "critical",
    dataSourceEndpoint: "/api/dashboard/stats",
    category: "Overview",
  },
  {
    widgetKey: "pendingApprovals",
    name: "Approvals & Reviews",
    description: "Items requiring action with clear titles, due dates, and priority.",
    defaultVisible: true,
    defaultSize: "md",
    allowedSizes: ["sm", "md", "lg"],
    defaultOrderIndex: 2,
    priorityLevel: "critical",
    dataSourceEndpoint: "/api/approvals",
    category: "Approvals",
  },
  {
    widgetKey: "highFitOpportunities",
    name: "High-Fit Opportunities",
    description: "Best-fit opportunities based on NAICS alignment, set-aside, and team capacity.",
    defaultVisible: true,
    defaultSize: "md",
    allowedSizes: ["sm", "md", "lg"],
    defaultOrderIndex: 3,
    priorityLevel: "high",
    dataSourceEndpoint: "/api/dashboard/recent-opportunities",
    category: "Opportunities",
  },
  {
    widgetKey: "pipelineOverview",
    name: "Bid Pipeline",
    description: "Pipeline status by stage with upcoming deadlines and estimated value.",
    defaultVisible: true,
    defaultSize: "md",
    allowedSizes: ["sm", "md", "lg"],
    defaultOrderIndex: 4,
    priorityLevel: "high",
    dataSourceEndpoint: "/api/bid-projects",
    category: "Overview",
  },
  {
    widgetKey: "complianceStatus",
    name: "Compliance Status",
    description: "Compliance checklist progress across active bids with risk flags and due dates.",
    defaultVisible: true,
    defaultSize: "md",
    allowedSizes: ["sm", "md", "lg"],
    defaultOrderIndex: 5,
    priorityLevel: "high",
    dataSourceEndpoint: "/api/compliance/summary",
    category: "Compliance",
  },
  {
    widgetKey: "recentDocuments",
    name: "Recent Documents",
    description: "Recently added or updated documents across bid jackets and projects.",
    defaultVisible: true,
    defaultSize: "md",
    allowedSizes: ["sm", "md", "lg"],
    defaultOrderIndex: 6,
    priorityLevel: "normal",
    dataSourceEndpoint: "/api/documents",
    category: "Documents",
  },
  {
    widgetKey: "competitorAlerts",
    name: "Competitor Alerts",
    description: "Recent competitor wins, agency activity, and signals relevant to your pipeline.",
    defaultVisible: true,
    defaultSize: "sm",
    allowedSizes: ["sm", "md"],
    defaultOrderIndex: 7,
    priorityLevel: "normal",
    dataSourceEndpoint: "/api/competitors",
    category: "Competitive",
  },
  {
    widgetKey: "documentIntelligence",
    name: "Document Intelligence",
    description: "RFP parsing status, extracted requirements, and filing recommendations.",
    defaultVisible: true,
    defaultSize: "sm",
    allowedSizes: ["sm", "md"],
    defaultOrderIndex: 8,
    priorityLevel: "normal",
    dataSourceEndpoint: "/api/documents/intelligence/stats",
    category: "AI",
  },
  {
    widgetKey: "herbieAssistant",
    name: "HERBIE Assistant",
    description: "Command prompts, recommendations, and fast actions for today's work.",
    defaultVisible: true,
    defaultSize: "sm",
    allowedSizes: ["sm", "md"],
    defaultOrderIndex: 9,
    priorityLevel: "normal",
    dataSourceEndpoint: "/api/herbie/activity",
    category: "AI",
  },
  {
    widgetKey: "activityFeed",
    name: "Activity Feed",
    description: "A clean, chronological log of meaningful events with timestamps.",
    defaultVisible: false,
    defaultSize: "md",
    allowedSizes: ["sm", "md", "lg"],
    defaultOrderIndex: 10,
    priorityLevel: "low",
    dataSourceEndpoint: "/api/audit/events",
    category: "Overview",
  },
  {
    widgetKey: "systemHealth",
    name: "System Health",
    description: "Service and integration status with last check time and actionable alerts.",
    defaultVisible: false,
    defaultSize: "sm",
    allowedSizes: ["sm", "md"],
    defaultOrderIndex: 11,
    priorityLevel: "low",
    dataSourceEndpoint: "/api/health",
    category: "Health",
  },
  {
    widgetKey: "expiringSoon",
    name: "Expiring Soon",
    description: "Opportunities with response deadlines within the next 14 days requiring immediate attention.",
    defaultVisible: true,
    defaultSize: "md",
    allowedSizes: ["sm", "md"],
    defaultOrderIndex: 12,
    priorityLevel: "high",
    dataSourceEndpoint: "/api/dashboard/expiring-soon",
    category: "Opportunities",
  },
  {
    widgetKey: "topScored",
    name: "Top Scored",
    description: "Highest-scoring opportunities from HERBIE autonomous analysis, ranked by fit.",
    defaultVisible: true,
    defaultSize: "md",
    allowedSizes: ["sm", "md"],
    defaultOrderIndex: 13,
    priorityLevel: "high",
    dataSourceEndpoint: "/api/dashboard/top-scored",
    category: "Opportunities",
  },
  {
    widgetKey: "recentAwards",
    name: "Recent Awards",
    description: "Latest federal contract awards from USAspending.gov relevant to your NAICS profile.",
    defaultVisible: true,
    defaultSize: "md",
    allowedSizes: ["sm", "md"],
    defaultOrderIndex: 14,
    priorityLevel: "normal",
    dataSourceEndpoint: "/api/dashboard/recent-awards",
    category: "Competitive",
  },
  {
    widgetKey: "portfolioOverview",
    name: "Portfolio Overview",
    description: "Executive financial snapshot across all projects: budget, costs, profit, project health, and outstanding items.",
    defaultVisible: true,
    defaultSize: "lg",
    allowedSizes: ["md", "lg"],
    defaultOrderIndex: 2,
    priorityLevel: "critical",
    dataSourceEndpoint: "/api/dashboard/portfolio",
    category: "Overview",
  },
];

export const WIDGET_REGISTRY_BY_KEY: Record<string, DashboardWidgetDefinition> =
  Object.fromEntries(DASHBOARD_WIDGETS.map((w) => [w.widgetKey, w]));

export const DEFAULT_LAYOUT = DASHBOARD_WIDGETS.map((w) => ({
  widgetKey: w.widgetKey,
  isVisible: w.defaultVisible,
  size: w.defaultSize,
  orderIndex: w.defaultOrderIndex,
  allowedSizes: w.allowedSizes,
  name: w.name,
  description: w.description,
  category: w.category,
  priorityLevel: w.priorityLevel,
  dataSourceEndpoint: w.dataSourceEndpoint,
}));

export type DashboardPresetKey = "executive" | "estimating" | "operations";

export interface DashboardPreset {
  key: DashboardPresetKey;
  name: string;
  description: string;
  updates: Array<{
    widgetKey: string;
    isVisible?: boolean;
    size?: WidgetSize;
    orderIndex?: number;
  }>;
}

export const DASHBOARD_PRESETS: DashboardPreset[] = [
  {
    key: "executive",
    name: "Executive Overview",
    description: "Clean command view focused on pipeline, approvals, and risk.",
    updates: [
      { widgetKey: "statsRow", isVisible: true, size: "lg", orderIndex: 1 },
      { widgetKey: "portfolioOverview", isVisible: true, size: "lg", orderIndex: 2 },
      { widgetKey: "pipelineOverview", isVisible: true, size: "lg", orderIndex: 3 },
      { widgetKey: "pendingApprovals", isVisible: true, size: "md", orderIndex: 4 },
      { widgetKey: "highFitOpportunities", isVisible: true, size: "md", orderIndex: 5 },
      { widgetKey: "complianceStatus", isVisible: true, size: "md", orderIndex: 6 },
      { widgetKey: "competitorAlerts", isVisible: true, size: "sm", orderIndex: 7 },
      { widgetKey: "recentDocuments", isVisible: true, size: "md", orderIndex: 8 },
      { widgetKey: "documentIntelligence", isVisible: true, size: "sm", orderIndex: 9 },
      { widgetKey: "herbieAssistant", isVisible: true, size: "sm", orderIndex: 10 },
      { widgetKey: "activityFeed", isVisible: false, orderIndex: 11 },
      { widgetKey: "systemHealth", isVisible: false, orderIndex: 12 },
      { widgetKey: "expiringSoon", isVisible: true, size: "md", orderIndex: 13 },
      { widgetKey: "topScored", isVisible: true, size: "md", orderIndex: 14 },
      { widgetKey: "recentAwards", isVisible: true, size: "md", orderIndex: 15 },
    ],
  },
  {
    key: "estimating",
    name: "Estimating Focus",
    description: "Fast path to documents, compliance, requirements, and estimating readiness.",
    updates: [
      { widgetKey: "statsRow", isVisible: true, size: "lg", orderIndex: 1 },
      { widgetKey: "pendingApprovals", isVisible: true, size: "md", orderIndex: 2 },
      { widgetKey: "documentIntelligence", isVisible: true, size: "md", orderIndex: 3 },
      { widgetKey: "complianceStatus", isVisible: true, size: "md", orderIndex: 4 },
      { widgetKey: "recentDocuments", isVisible: true, size: "lg", orderIndex: 5 },
      { widgetKey: "highFitOpportunities", isVisible: true, size: "md", orderIndex: 6 },
      { widgetKey: "pipelineOverview", isVisible: true, size: "md", orderIndex: 7 },
      { widgetKey: "competitorAlerts", isVisible: true, size: "sm", orderIndex: 8 },
      { widgetKey: "herbieAssistant", isVisible: true, size: "sm", orderIndex: 9 },
      { widgetKey: "activityFeed", isVisible: false, orderIndex: 10 },
      { widgetKey: "systemHealth", isVisible: false, orderIndex: 11 },
      { widgetKey: "expiringSoon", isVisible: true, size: "md", orderIndex: 12 },
      { widgetKey: "topScored", isVisible: true, size: "md", orderIndex: 13 },
      { widgetKey: "recentAwards", isVisible: false, orderIndex: 14 },
    ],
  },
  {
    key: "operations",
    name: "Operations Command",
    description: "Activity-first view for field coordination, compliance tracking, and daily execution.",
    updates: [
      { widgetKey: "statsRow", isVisible: true, size: "lg", orderIndex: 1 },
      { widgetKey: "activityFeed", isVisible: true, size: "lg", orderIndex: 2 },
      { widgetKey: "pendingApprovals", isVisible: true, size: "md", orderIndex: 3 },
      { widgetKey: "complianceStatus", isVisible: true, size: "md", orderIndex: 4 },
      { widgetKey: "pipelineOverview", isVisible: true, size: "md", orderIndex: 5 },
      { widgetKey: "recentDocuments", isVisible: true, size: "md", orderIndex: 6 },
      { widgetKey: "herbieAssistant", isVisible: true, size: "sm", orderIndex: 7 },
      { widgetKey: "systemHealth", isVisible: true, size: "sm", orderIndex: 8 },
      { widgetKey: "highFitOpportunities", isVisible: false, orderIndex: 9 },
      { widgetKey: "competitorAlerts", isVisible: false, orderIndex: 10 },
      { widgetKey: "documentIntelligence", isVisible: false, orderIndex: 11 },
      { widgetKey: "expiringSoon", isVisible: true, size: "md", orderIndex: 12 },
      { widgetKey: "topScored", isVisible: false, orderIndex: 13 },
      { widgetKey: "recentAwards", isVisible: true, size: "md", orderIndex: 14 },
    ],
  },
];

export function getWidgetDefinition(widgetKey: string): DashboardWidgetDefinition | null {
  return WIDGET_REGISTRY_BY_KEY[widgetKey] ?? null;
}

export function isValidWidgetKey(widgetKey: string): boolean {
  return Boolean(WIDGET_REGISTRY_BY_KEY[widgetKey]);
}

export function isAllowedSize(widgetKey: string, size: WidgetSize): boolean {
  const def = getWidgetDefinition(widgetKey);
  return def ? def.allowedSizes.includes(size) : false;
}

export function getPreset(presetKey: DashboardPresetKey): DashboardPreset | null {
  return DASHBOARD_PRESETS.find((p) => p.key === presetKey) ?? null;
}

export function getWidgetsByCategory(): Record<string, DashboardWidgetDefinition[]> {
  const grouped: Record<string, DashboardWidgetDefinition[]> = {};
  for (const w of DASHBOARD_WIDGETS) {
    if (!grouped[w.category]) grouped[w.category] = [];
    grouped[w.category].push(w);
  }
  return grouped;
}
