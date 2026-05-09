/**
 * shared/schema-federal.ts
 *
 * Federal pursuit + compliance schema (Herbie v2.1 Federal).
 * Re-exported from shared/schema.ts. All additive; safe to deploy.
 */

import { pgTable, varchar, text, timestamp, jsonb, integer, decimal, index, uniqueIndex, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tenants } from "./schema";

// ============================================================================
// 1. Set-aside certifications (per tenant)
// ============================================================================

export const setAsideCertifications = pgTable("set_aside_certifications", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  certifyingBody: text("certifying_body"),
  certNumber: text("cert_number"),
  effectiveDate: timestamp("effective_date").notNull(),
  expiryDate: timestamp("expiry_date"),
  status: text("status").notNull().default("active"),
  documentsJson: jsonb("documents_json"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantStatusIdx: index("idx_set_aside_certs_tenant").on(table.tenantId, table.status),
}));

// ============================================================================
// 2. Past performance records
// ============================================================================

export const pastPerformanceRecords = pgTable("past_performance_records", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  contractNumber: text("contract_number").notNull(),
  agency: text("agency"),
  contractType: text("contract_type"),
  awardDate: timestamp("award_date"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  initialValue: decimal("initial_value", { precision: 15, scale: 2 }),
  currentValue: decimal("current_value", { precision: 15, scale: 2 }),
  modCount: integer("mod_count").default(0),
  scopeSummary: text("scope_summary"),
  complexityFactors: jsonb("complexity_factors"),
  naicsCode: text("naics_code"),
  setAsideCategory: text("set_aside_category"),
  performanceMetrics: jsonb("performance_metrics"),
  cparsRatings: jsonb("cpars_ratings"),
  customerReference: jsonb("customer_reference"),
  lessonsLearned: text("lessons_learned"),
  relevanceKeywords: jsonb("relevance_keywords"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("idx_pp_records_tenant").on(table.tenantId),
  naicsIdx: index("idx_pp_records_naics").on(table.naicsCode),
}));

// ============================================================================
// 3. Wage Determinations (Davis-Bacon)
// ============================================================================

export const wageDeterminations = pgTable("wage_determinations", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  wdNumber: text("wd_number").notNull(),
  modificationNumber: integer("modification_number").default(0),
  effectiveDate: timestamp("effective_date").notNull(),
  supersededDate: timestamp("superseded_date"),
  state: text("state").notNull(),
  county: text("county"),
  constructionType: text("construction_type").notNull(),
  classificationRates: jsonb("classification_rates").notNull(),
  sourceUrl: text("source_url"),
  rawPayload: jsonb("raw_payload"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  wdNumberModIdx: uniqueIndex("idx_wd_number_mod").on(table.wdNumber, table.modificationNumber),
}));

// ============================================================================
// 4. Certified Payroll Submissions (WH-347)
// ============================================================================

export const certifiedPayrollSubmissions = pgTable("certified_payroll_submissions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  bidProjectId: varchar("bid_project_id", { length: 36 }).notNull(),
  wageDeterminationId: varchar("wage_determination_id", { length: 36 }).references(() => wageDeterminations.id),
  weekEnding: timestamp("week_ending").notNull(),
  payrollNumber: integer("payroll_number").notNull(),
  entries: jsonb("entries").notNull(),
  signedBy: text("signed_by"),
  signedAt: timestamp("signed_at"),
  submittedToAgencyAt: timestamp("submitted_to_agency_at"),
  agencyAcknowledgedAt: timestamp("agency_acknowledged_at"),
  validationResult: jsonb("validation_result"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================================================
// 5. Proposal drafts
// ============================================================================

export const proposalDrafts = pgTable("proposal_drafts", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  opportunityId: varchar("opportunity_id", { length: 36 }),
  artifactType: text("artifact_type").notNull(),
  title: text("title"),
  body: text("body"),
  metadata: jsonb("metadata"),
  status: text("status").notNull().default("draft"),
  approvalRequestId: varchar("approval_request_id", { length: 36 }),
  createdByHerbie: boolean("created_by_herbie").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================================================
// 6. Opportunity scoring history
// ============================================================================

export const opportunityScores = pgTable("opportunity_scores", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  opportunityId: varchar("opportunity_id", { length: 36 }).notNull(),
  overallScore: decimal("overall_score", { precision: 5, scale: 4 }).notNull(),
  pWin: decimal("p_win", { precision: 5, scale: 4 }).notNull(),
  recommendedAction: text("recommended_action").notNull(),
  dimensions: jsonb("dimensions").notNull(),
  dealKillers: jsonb("deal_killers"),
  rationale: text("rationale"),
  weightsUsed: jsonb("weights_used"),
  scoredAt: timestamp("scored_at").defaultNow().notNull(),
});

// ============================================================================
// 7. Teaming partners (per tenant Rolodex)
// ============================================================================

export const teamingPartners = pgTable("teaming_partners", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  partnerName: text("partner_name").notNull(),
  partnerUei: text("partner_uei"),
  partnerCage: text("partner_cage"),
  capabilities: jsonb("capabilities"),
  setAsideStatus: jsonb("set_aside_status"),
  geographies: jsonb("geographies"),
  priorTeamingCount: integer("prior_teaming_count").default(0),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================================================
// 8. Subcontracting plan goals (FAR 52.219-9)
// ============================================================================

export const subcontractingPlans = pgTable("subcontracting_plans", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  bidProjectId: varchar("bid_project_id", { length: 36 }).notNull(),
  planType: text("plan_type").notNull(),
  goalsPct: jsonb("goals_pct").notNull(),
  actualPctToDate: jsonb("actual_pct_to_date"),
  reportingPeriods: jsonb("reporting_periods"),
  effectiveDate: timestamp("effective_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
