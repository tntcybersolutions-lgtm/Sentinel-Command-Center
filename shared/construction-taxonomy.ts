/**
 * shared/construction-taxonomy.ts
 *
 * Construction industry taxonomy: roles (across functional groups), trades,
 * and project sectors. The Herbie domain composer uses these IDs as keys for
 * the role x trade x sector module loader.
 *
 * IDs are namespaced (role.<group>.<role>, trade.<trade>, sector.<sector>) so
 * the audience axis can be inferred from the prefix, and humanized labels can
 * be derived by `id.split(".").pop()` (matching the stub-factory convention).
 *
 * Adding a new role/trade/sector:
 *   1. Add the ID to the appropriate ALL_*_IDS array below.
 *   2. (For roles) place it under a ROLE_GROUPS entry in ROLES_BY_GROUP.
 *   3. (Optional) author a dedicated module file at
 *      server/services/herbie-domains/construction/{roles|trades|sectors}/<slug>.ts
 *      and register a loader in the composer (./index.ts).
 *      If no dedicated module exists, the composer falls back to a stub.
 */

// ============================================================================
// Role groups
// ============================================================================

export const ROLE_GROUPS = [
  "executive",
  "operations",
  "field-management",
  "estimating-preconstruction",
  "safety-compliance",
  "financial-administrative",
  "support",
  "bid-pursuit",
] as const;
export type RoleGroup = (typeof ROLE_GROUPS)[number];

// ============================================================================
// Roles (70 IDs across 8 groups)
// ============================================================================

export const ALL_ROLE_IDS = [
  // executive (4)
  "role.executive.owner",
  "role.executive.president",
  "role.executive.ceo",
  "role.executive.coo",

  // operations (8)
  "role.operations.vp-operations",
  "role.operations.operations-manager",
  "role.operations.area-manager",
  "role.operations.regional-manager",
  "role.operations.division-manager",
  "role.operations.project-executive",
  "role.operations.senior-project-manager",
  "role.operations.business-unit-leader",

  // field-management (10)
  "role.field-management.project-manager",
  "role.field-management.assistant-project-manager",
  "role.field-management.project-engineer",
  "role.field-management.superintendent",
  "role.field-management.general-superintendent",
  "role.field-management.assistant-superintendent",
  "role.field-management.field-engineer",
  "role.field-management.foreman",
  "role.field-management.area-foreman",
  "role.field-management.qc-manager",

  // estimating-preconstruction (8)
  "role.estimating-preconstruction.chief-estimator",
  "role.estimating-preconstruction.senior-estimator",
  "role.estimating-preconstruction.estimator",
  "role.estimating-preconstruction.estimating-coordinator",
  "role.estimating-preconstruction.takeoff-specialist",
  "role.estimating-preconstruction.preconstruction-manager",
  "role.estimating-preconstruction.vdc-manager",
  "role.estimating-preconstruction.scheduler",

  // safety-compliance (5)
  "role.safety-compliance.safety-director",
  "role.safety-compliance.safety-manager",
  "role.safety-compliance.safety-coordinator",
  "role.safety-compliance.environmental-manager",
  "role.safety-compliance.qaqc-inspector",

  // financial-administrative (8)
  "role.financial-administrative.cfo",
  "role.financial-administrative.controller",
  "role.financial-administrative.accounting-manager",
  "role.financial-administrative.ap-clerk",
  "role.financial-administrative.payroll-specialist",
  "role.financial-administrative.contract-administrator",
  "role.financial-administrative.project-accountant",
  "role.financial-administrative.billing-coordinator",

  // support (17)
  "role.support.hr-manager",
  "role.support.recruiter",
  "role.support.marketing-manager",
  "role.support.fleet-manager",
  "role.support.equipment-manager",
  "role.support.warehouse-manager",
  "role.support.it-manager",
  "role.support.dispatcher",
  "role.support.training-coordinator",
  "role.support.hr-coordinator",
  "role.support.benefits-coordinator",
  "role.support.office-manager",
  "role.support.executive-assistant",
  "role.support.document-controller",
  "role.support.mailroom-clerk",
  "role.support.receptionist",
  "role.support.admin-assistant",

  // bid-pursuit (10) - NEW for federal lighthouse
  "role.bid-pursuit.capture-manager",
  "role.bid-pursuit.proposal-writer",
  "role.bid-pursuit.bd-federal",
  "role.bid-pursuit.capture-coordinator",
  "role.bid-pursuit.past-performance-manager",
  "role.bid-pursuit.contracts-compliance",
  "role.bid-pursuit.pricing-strategist",
  "role.bid-pursuit.teaming-coordinator",
  "role.bid-pursuit.small-business-liaison",
  "role.bid-pursuit.graphics-coordinator",
] as const;
export type RoleId = (typeof ALL_ROLE_IDS)[number];

/** Membership table for filtering / UI grouping. */
export const ROLES_BY_GROUP: Record<RoleGroup, readonly RoleId[]> = {
  executive: ALL_ROLE_IDS.filter((id) => id.startsWith("role.executive.")),
  operations: ALL_ROLE_IDS.filter((id) => id.startsWith("role.operations.")),
  "field-management": ALL_ROLE_IDS.filter((id) =>
    id.startsWith("role.field-management."),
  ),
  "estimating-preconstruction": ALL_ROLE_IDS.filter((id) =>
    id.startsWith("role.estimating-preconstruction."),
  ),
  "safety-compliance": ALL_ROLE_IDS.filter((id) =>
    id.startsWith("role.safety-compliance."),
  ),
  "financial-administrative": ALL_ROLE_IDS.filter((id) =>
    id.startsWith("role.financial-administrative."),
  ),
  support: ALL_ROLE_IDS.filter((id) => id.startsWith("role.support.")),
  "bid-pursuit": ALL_ROLE_IDS.filter((id) => id.startsWith("role.bid-pursuit.")),
} as const;

// ============================================================================
// Trades (14)
// ============================================================================

export const ALL_TRADE_IDS = [
  "trade.general-construction",
  "trade.electrical",
  "trade.mechanical-hvac",
  "trade.plumbing",
  "trade.structural-steel",
  "trade.civil-sitework",
  "trade.concrete",
  "trade.masonry",
  "trade.carpentry",
  "trade.roofing",
  "trade.drywall-finishes",
  "trade.painting-coatings",
  "trade.flooring",
  "trade.glazing-curtainwall",
] as const;
export type TradeId = (typeof ALL_TRADE_IDS)[number];

// ============================================================================
// Sectors (9)
// ============================================================================

export const ALL_SECTOR_IDS = [
  "sector.govt-public-works",
  "sector.commercial-tenant-improvement",
  "sector.healthcare",
  "sector.education-k12",
  "sector.higher-ed",
  "sector.industrial",
  "sector.residential-multifamily",
  "sector.data-center-mission-critical",
  "sector.transportation-infrastructure",
] as const;
export type SectorId = (typeof ALL_SECTOR_IDS)[number];

// ============================================================================
// Type guards (used by the composer to validate request inputs)
// ============================================================================

const ROLE_ID_SET: ReadonlySet<string> = new Set(ALL_ROLE_IDS);
const TRADE_ID_SET: ReadonlySet<string> = new Set(ALL_TRADE_IDS);
const SECTOR_ID_SET: ReadonlySet<string> = new Set(ALL_SECTOR_IDS);

export function isRoleId(x: unknown): x is RoleId {
  return typeof x === "string" && ROLE_ID_SET.has(x);
}

export function isTradeId(x: unknown): x is TradeId {
  return typeof x === "string" && TRADE_ID_SET.has(x);
}

export function isSectorId(x: unknown): x is SectorId {
  return typeof x === "string" && SECTOR_ID_SET.has(x);
}

// ============================================================================
// Helpers for UI / display
// ============================================================================

/** Turn `"role.bid-pursuit.capture-manager"` into `"Capture Manager"`. */
export function humanizeId(id: string): string {
  const slug = id.split(".").pop() ?? id;
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Extract the role group from a role ID, or null for non-role IDs. */
export function roleGroupOf(id: RoleId): RoleGroup {
  const parts = id.split(".");
  // role.<group>.<role-slug>
  return parts[1] as RoleGroup;
}
