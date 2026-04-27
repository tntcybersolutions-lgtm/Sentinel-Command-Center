import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, jsonb, serial, decimal, unique, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ============================================================================
// IDENTITY & ACCESS (010_identity.sql)
// ============================================================================

export const users = pgTable("users", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  emailTenantIdx: unique().on(table.tenantId, table.email),
}));

export const roles = pgTable("roles", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const permissions = pgTable("permissions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  description: text("description"),
});

export const userRoles = pgTable("user_roles", {
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  roleId: varchar("role_id", { length: 36 }).notNull().references(() => roles.id, { onDelete: "cascade" }),
}, (table) => ({
  pk: unique().on(table.userId, table.roleId),
}));

export const rolePermissions = pgTable("role_permissions", {
  roleId: varchar("role_id", { length: 36 }).notNull().references(() => roles.id, { onDelete: "cascade" }),
  permissionId: varchar("permission_id", { length: 36 }).notNull().references(() => permissions.id, { onDelete: "cascade" }),
}, (table) => ({
  pk: unique().on(table.roleId, table.permissionId),
}));

// ============================================================================
// TENANT CONFIG (020_tenant_config.sql)
// ============================================================================

export const tenants = pgTable("tenants", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  legalName: text("legal_name").notNull(),
  dbaName: text("dba_name"),
  timezone: text("timezone").notNull().default("America/New_York"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const tenantSettings = pgTable("tenant_settings", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  valueJson: jsonb("value_json"),
}, (table) => ({
  tenantKeyIdx: unique().on(table.tenantId, table.key),
}));

export const approvalPolicies = pgTable("approval_policies", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  policyKey: text("policy_key").notNull(),
  policyJson: jsonb("policy_json").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const fitProfiles = pgTable("fit_profiles", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  profileJson: jsonb("profile_json").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const scoringModels = pgTable("scoring_models", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  weightsJson: jsonb("weights_json").notNull(),
  version: integer("version").notNull().default(1),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const promptTemplates = pgTable("prompt_templates", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  version: integer("version").notNull().default(1),
  templateText: text("template_text").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const documentTemplates = pgTable("document_templates", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  version: integer("version").notNull().default(1),
  templateJson: jsonb("template_json").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// SOURCES & INGESTION (030_sources_ingestion.sql)
// ============================================================================

export const sourceSystems = pgTable("source_systems", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  configJson: jsonb("config_json"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantKeyIdx: unique().on(table.tenantId, table.key),
}));

export const sourceCredentials = pgTable("source_credentials", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  sourceSystemId: varchar("source_system_id", { length: 36 }).notNull().references(() => sourceSystems.id, { onDelete: "cascade" }),
  credentialRef: text("credential_ref").notNull(),
  rotatedAt: timestamp("rotated_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const sourceParsers = pgTable("source_parsers", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  sourceSystemId: varchar("source_system_id", { length: 36 }).notNull().references(() => sourceSystems.id, { onDelete: "cascade" }),
  parserVersion: text("parser_version").notNull(),
  checksum: text("checksum"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const sourceRuns = pgTable("source_runs", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  sourceSystemId: varchar("source_system_id", { length: 36 }).notNull().references(() => sourceSystems.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  endedAt: timestamp("ended_at"),
  status: text("status").notNull().default("running"),
  countsJson: jsonb("counts_json"),
  errorJson: jsonb("error_json"),
});

export const sourceItemsRaw = pgTable("source_items_raw", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  sourceSystemId: varchar("source_system_id", { length: 36 }).notNull().references(() => sourceSystems.id, { onDelete: "cascade" }),
  externalId: text("external_id").notNull(),
  retrievedAt: timestamp("retrieved_at").defaultNow().notNull(),
  contentHash: text("content_hash").notNull(),
  rawJson: jsonb("raw_json").notNull(),
  parserVersion: text("parser_version"),
  runId: varchar("run_id", { length: 36 }).references(() => sourceRuns.id),
}, (table) => ({
  dedupeIdx: unique().on(table.tenantId, table.sourceSystemId, table.externalId, table.contentHash),
  lookupIdx: index().on(table.tenantId, table.sourceSystemId, table.externalId),
}));

// ============================================================================
// OPPORTUNITIES (040_opportunities.sql)
// ============================================================================

export const buyers = pgTable("buyers", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type"),
  normalizedKey: text("normalized_key"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const opportunities = pgTable("opportunities", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  sourceSystemId: varchar("source_system_id", { length: 36 }).references(() => sourceSystems.id),
  externalId: text("external_id"),
  buyerId: varchar("buyer_id", { length: 36 }).references(() => buyers.id),
  title: text("title").notNull(),
  synopsis: text("synopsis"),
  description: text("description"),
  url: text("url"),
  status: text("status").notNull().default("open"),
  statusRaw: text("status_raw"),
  statusNormalized: text("status_normalized").notNull().default("prospecting"),
  probability: integer("probability"),
  closeDate: timestamp("close_date"),
  awardedDate: timestamp("awarded_date"),
  naicsCodes: text("naics_codes").array(),
  setAside: text("set_aside"),
  contractValue: decimal("contract_value", { precision: 15, scale: 2 }),
  postedAt: timestamp("posted_at"),
  dueAt: timestamp("due_at"),
  lastSeenAt: timestamp("last_seen_at").defaultNow(),
  locationJson: jsonb("location_json"),
  rawRefId: varchar("raw_ref_id", { length: 36 }).references(() => sourceItemsRaw.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  externalIdIdx: unique().on(table.tenantId, table.sourceSystemId, table.externalId),
  statusIdx: index().on(table.tenantId, table.status),
  statusNormalizedIdx: index().on(table.tenantId, table.statusNormalized),
  dueAtIdx: index().on(table.tenantId, table.dueAt),
}));

export const opportunityAmendments = pgTable("opportunity_amendments", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  opportunityId: varchar("opportunity_id", { length: 36 }).notNull().references(() => opportunities.id, { onDelete: "cascade" }),
  amendmentNo: integer("amendment_no").notNull(),
  changeSummary: text("change_summary"),
  rawRefId: varchar("raw_ref_id", { length: 36 }).references(() => sourceItemsRaw.id),
  dueAtOverride: timestamp("due_at_override"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const opportunityRequirements = pgTable("opportunity_requirements", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  opportunityId: varchar("opportunity_id", { length: 36 }).notNull().references(() => opportunities.id, { onDelete: "cascade" }),
  requirementType: text("requirement_type").notNull(),
  requirementJson: jsonb("requirement_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const opportunityWatchlist = pgTable("opportunity_watchlist", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  opportunityId: varchar("opportunity_id", { length: 36 }).notNull().references(() => opportunities.id, { onDelete: "cascade" }),
  watchReason: text("watch_reason"),
  createdByUserId: varchar("created_by_user_id", { length: 36 }).references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// SCORING (050_scoring.sql)
// ============================================================================

export const opportunityScores = pgTable("opportunity_scores", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  opportunityId: varchar("opportunity_id", { length: 36 }).notNull().references(() => opportunities.id, { onDelete: "cascade" }),
  fitProfileId: varchar("fit_profile_id", { length: 36 }).references(() => fitProfiles.id),
  scoringModelId: varchar("scoring_model_id", { length: 36 }).references(() => scoringModels.id),
  score: integer("score").notNull(),
  recommendedAction: text("recommended_action").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const scoreExplanations = pgTable("score_explanations", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  opportunityScoreId: varchar("opportunity_score_id", { length: 36 }).notNull().references(() => opportunityScores.id, { onDelete: "cascade" }),
  signalKey: text("signal_key").notNull(),
  weight: decimal("weight", { precision: 5, scale: 2 }),
  contribution: decimal("contribution", { precision: 5, scale: 2 }),
  detailsJson: jsonb("details_json"),
});

// ============================================================================
// BID PIPELINE (060_bid_pipeline.sql)
// ============================================================================

export const bidProjects = pgTable("bid_projects", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  opportunityId: varchar("opportunity_id", { length: 36 }).notNull().references(() => opportunities.id, { onDelete: "cascade" }),
  opportunityVersionRef: varchar("opportunity_version_ref", { length: 36 }),
  status: text("status").notNull().default("initiated"),
  statusRaw: text("status_raw"),
  statusNormalized: text("status_normalized").notNull().default("initiated"),
  ownerUserId: varchar("owner_user_id", { length: 36 }).references(() => users.id),
  documentationJson: jsonb("documentation_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const bidDecisions = pgTable("bid_decisions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  bidProjectId: varchar("bid_project_id", { length: 36 }).notNull().references(() => bidProjects.id, { onDelete: "cascade" }),
  decision: text("decision").notNull(),
  decidedBy: varchar("decided_by", { length: 36 }).references(() => users.id),
  decidedAt: timestamp("decided_at").defaultNow().notNull(),
  rationaleJson: jsonb("rationale_json"),
});

export const bidTasks = pgTable("bid_tasks", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  bidProjectId: varchar("bid_project_id", { length: 36 }).notNull().references(() => bidProjects.id, { onDelete: "cascade" }),
  taskType: text("task_type").notNull(),
  title: text("title").notNull(),
  assignedTo: varchar("assigned_to", { length: 36 }).references(() => users.id),
  status: text("status").notNull().default("pending"),
  dueAt: timestamp("due_at"),
  payloadJson: jsonb("payload_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const bidArtifacts = pgTable("bid_artifacts", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  bidProjectId: varchar("bid_project_id", { length: 36 }).notNull().references(() => bidProjects.id, { onDelete: "cascade" }),
  artifactType: text("artifact_type").notNull(),
  version: integer("version").notNull().default(1),
  status: text("status").notNull().default("draft"),
  content: text("content"),
  contentHash: text("content_hash"),
  storageRefId: varchar("storage_ref_id", { length: 36 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const bidSubmissions = pgTable("bid_submissions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  bidProjectId: varchar("bid_project_id", { length: 36 }).notNull().references(() => bidProjects.id, { onDelete: "cascade" }),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  method: text("method"),
  confirmationJson: jsonb("confirmation_json"),
});

export const bidOutcomes = pgTable("bid_outcomes", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  bidProjectId: varchar("bid_project_id", { length: 36 }).notNull().references(() => bidProjects.id, { onDelete: "cascade" }),
  outcome: text("outcome").notNull(),
  decidedAt: timestamp("decided_at"),
  debriefJson: jsonb("debrief_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const lessonsLearned = pgTable("lessons_learned", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  bidProjectId: varchar("bid_project_id", { length: 36 }).notNull().references(() => bidProjects.id, { onDelete: "cascade" }),
  tagsJson: jsonb("tags_json"),
  learningsJson: jsonb("learnings_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// APPROVALS (070_approvals.sql)
// ============================================================================

export const approvalRequests = pgTable("approval_requests", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  entityType: text("entity_type").notNull(),
  entityId: varchar("entity_id", { length: 36 }).notNull(),
  actionType: text("action_type").notNull(),
  requestedBy: varchar("requested_by", { length: 36 }),
  requestedFrom: varchar("requested_from", { length: 36 }).references(() => users.id),
  status: text("status").notNull().default("pending"),
  priority: text("priority").notNull().default("normal"),
  contextJson: jsonb("context_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"),
});

export const approvalActions = pgTable("approval_actions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  approvalRequestId: varchar("approval_request_id", { length: 36 }).notNull().references(() => approvalRequests.id, { onDelete: "cascade" }),
  actor: varchar("actor", { length: 36 }).references(() => users.id),
  decision: text("decision").notNull(),
  notes: text("notes"),
  decidedAt: timestamp("decided_at").defaultNow().notNull(),
});

export const policyViolations = pgTable("policy_violations", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  policyKey: text("policy_key").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: varchar("entity_id", { length: 36 }).notNull(),
  attemptedAction: text("attempted_action").notNull(),
  blockedReason: text("blocked_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// COMMS & CALENDAR (080_comms_calendar.sql)
// ============================================================================

export const emailMessages = pgTable("email_messages", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  entityType: text("entity_type"),
  entityId: varchar("entity_id", { length: 36 }),
  direction: text("direction").notNull().default("outbound"),
  subject: text("subject"),
  bodyHtml: text("body_html"),
  bodyText: text("body_text"),
  fromEmail: text("from_email"),
  toEmails: text("to_emails").array(),
  status: text("status").notNull().default("draft"),
  sentAt: timestamp("sent_at"),
  externalMessageId: text("external_message_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const emailSequences = pgTable("email_sequences", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  triggerType: text("trigger_type").notNull(),
  stepsJson: jsonb("steps_json").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const sequenceEnrollments = pgTable("sequence_enrollments", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  sequenceId: varchar("sequence_id", { length: 36 }).notNull().references(() => emailSequences.id, { onDelete: "cascade" }),
  entityType: text("entity_type").notNull(),
  entityId: varchar("entity_id", { length: 36 }).notNull(),
  currentStep: integer("current_step").notNull().default(0),
  status: text("status").notNull().default("active"),
  nextStepAt: timestamp("next_step_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const calendarEvents = pgTable("calendar_events", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  ownerUserId: varchar("owner_user_id", { length: 36 }),
  projectId: varchar("project_id", { length: 36 }),
  entityType: text("entity_type"),
  entityId: varchar("entity_id", { length: 36 }),
  title: text("title").notNull(),
  description: text("description"),
  eventType: text("event_type").notNull(),
  startAt: timestamp("start_at").notNull(),
  endAt: timestamp("end_at"),
  allDay: boolean("all_day").notNull().default(false),
  timezone: text("timezone").default("America/Chicago"),
  location: text("location"),
  attendeesJson: jsonb("attendees_json"),
  source: text("source").notNull().default("local"),
  externalEventId: text("external_event_id"),
  externalCalendarId: text("external_calendar_id"),
  status: text("status").notNull().default("confirmed"),
  responseStatus: text("response_status").notNull().default("none"),
  requiresPrep: boolean("requires_prep").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const eventAttendees = pgTable("event_attendees", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id", { length: 36 }).notNull().references(() => calendarEvents.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  name: text("name"),
  role: text("role").notNull().default("required"),
  responseStatus: text("response_status").notNull().default("none"),
});

export const calendarConnections = pgTable("calendar_connections", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).notNull(),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  accountEmail: text("account_email").notNull(),
  isSharedMailbox: boolean("is_shared_mailbox").notNull().default(false),
  sharedMailboxEmail: text("shared_mailbox_email"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at"),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const reminders = pgTable("reminders", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  text: text("text").notNull(),
  completed: boolean("completed").notNull().default(false),
  dueDate: timestamp("due_date"),
  source: text("source").notNull().default("manual"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const syncLogs = pgTable("sync_logs", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  connectionId: varchar("connection_id", { length: 36 }).notNull().references(() => calendarConnections.id, { onDelete: "cascade" }),
  direction: text("direction").notNull(),
  status: text("status").notNull(),
  eventsProcessed: integer("events_processed").default(0),
  conflicts: integer("conflicts").default(0),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const notifications = pgTable("notifications", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 36 }).references(() => users.id),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message"),
  entityType: text("entity_type"),
  entityId: varchar("entity_id", { length: 36 }),
  priority: text("priority").notNull().default("normal"),
  read: boolean("read").notNull().default(false),
  actionUrl: text("action_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// DOC CONTROL (090_doc_control.sql)
// ============================================================================

export const docWorkspaces = pgTable("doc_workspaces", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  entityType: text("entity_type").notNull(),
  entityId: varchar("entity_id", { length: 36 }).notNull(),
  name: text("name").notNull(),
  egnytePathRef: text("egnyte_path_ref"),
  sharepointPathRef: text("sharepoint_path_ref"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const docFiles = pgTable("doc_files", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  workspaceId: varchar("workspace_id", { length: 36 }).notNull().references(() => docWorkspaces.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileType: text("file_type"),
  contentHash: text("content_hash"),
  version: integer("version").notNull().default(1),
  egnyteFileId: text("egnyte_file_id"),
  sharepointFileId: text("sharepoint_file_id"),
  status: text("status").notNull().default("current"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================================================
// QUEUE & JOBS (100_queue.sql)
// ============================================================================

export const jobs = pgTable("jobs", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  jobType: text("job_type").notNull(),
  priority: integer("priority").notNull().default(0),
  payloadJson: jsonb("payload_json"),
  status: text("status").notNull().default("pending"),
  scheduledAt: timestamp("scheduled_at"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  statusIdx: index().on(table.status, table.scheduledAt),
}));

export const jobRuns = pgTable("job_runs", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id", { length: 36 }).notNull().references(() => jobs.id, { onDelete: "cascade" }),
  attempt: integer("attempt").notNull(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  endedAt: timestamp("ended_at"),
  status: text("status").notNull().default("running"),
  resultJson: jsonb("result_json"),
  errorJson: jsonb("error_json"),
});

export const idempotencyKeys = pgTable("idempotency_keys", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  responseJson: jsonb("response_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"),
});

export const distributedLocks = pgTable("distributed_locks", {
  lockKey: text("lock_key").primaryKey(),
  lockedBy: text("locked_by").notNull(),
  lockedAt: timestamp("locked_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

export const deadLetterQueue = pgTable("dead_letter_queue", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  originalJobId: varchar("original_job_id", { length: 36 }).references(() => jobs.id),
  jobType: text("job_type").notNull(),
  payloadJson: jsonb("payload_json"),
  errorJson: jsonb("error_json"),
  failedAt: timestamp("failed_at").defaultNow().notNull(),
  reviewed: boolean("reviewed").notNull().default(false),
});

// ============================================================================
// OBSERVABILITY (110_observability.sql)
// ============================================================================

export const integrationHealth = pgTable("integration_health", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  integrationKey: text("integration_key").notNull(),
  status: text("status").notNull().default("healthy"),
  lastCheckAt: timestamp("last_check_at").defaultNow().notNull(),
  lastSuccessAt: timestamp("last_success_at"),
  lastErrorAt: timestamp("last_error_at"),
  errorCount: integer("error_count").notNull().default(0),
  metaJson: jsonb("meta_json"),
});

// OAuth diagnostics table for tracking auth attempts
export const egnyteAuthAttempts = pgTable("egnyte_auth_attempts", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  attemptType: text("attempt_type").notNull(), // 'authorization_url', 'token_exchange', 'token_refresh', 'password_grant'
  endpointUrl: text("endpoint_url").notNull(),
  redirectUri: text("redirect_uri"),
  clientIdMasked: text("client_id_masked"), // first/last 4 chars
  statusCode: integer("status_code"),
  responseBody: text("response_body"), // sanitized, no secrets
  errorMessage: text("error_message"),
  success: boolean("success").notNull().default(false),
  hasRefreshToken: boolean("has_refresh_token"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type EgnyteAuthAttempt = typeof egnyteAuthAttempts.$inferSelect;
export type InsertEgnyteAuthAttempt = typeof egnyteAuthAttempts.$inferInsert;

export const incidents = pgTable("incidents", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  type: text("type").notNull(),
  severity: text("severity").notNull().default("warning"),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("open"),
  entityType: text("entity_type"),
  entityId: varchar("entity_id", { length: 36 }),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// AUDIT (120_audit.sql)
// ============================================================================

export const auditEvents = pgTable("audit_events", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  eventType: text("event_type").notNull(),
  actor: varchar("actor", { length: 36 }),
  actorType: text("actor_type").notNull().default("user"),
  entityType: text("entity_type").notNull(),
  entityId: varchar("entity_id", { length: 36 }).notNull(),
  action: text("action").notNull(),
  beforeJson: jsonb("before_json"),
  afterJson: jsonb("after_json"),
  metaJson: jsonb("meta_json"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  entityIdx: index().on(table.entityType, table.entityId),
  actorIdx: index().on(table.actor),
  createdIdx: index().on(table.createdAt),
}));

export const entitySnapshots = pgTable("entity_snapshots", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  entityType: text("entity_type").notNull(),
  entityId: varchar("entity_id", { length: 36 }).notNull(),
  version: integer("version").notNull(),
  snapshotJson: jsonb("snapshot_json").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// REPORTING (130_reporting.sql)
// ============================================================================

export const reportDefinitions = pgTable("report_definitions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  reportType: text("report_type").notNull(),
  configJson: jsonb("config_json"),
  scheduleJson: jsonb("schedule_json"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const reportRuns = pgTable("report_runs", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  reportDefinitionId: varchar("report_definition_id", { length: 36 }).notNull().references(() => reportDefinitions.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("running"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  resultJson: jsonb("result_json"),
  errorJson: jsonb("error_json"),
});

export const dailySnapshots = pgTable("daily_snapshots", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  snapshotDate: timestamp("snapshot_date").notNull(),
  metricsJson: jsonb("metrics_json").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// CRM-LITE CONTACTS
// ============================================================================

export const contacts = pgTable("contacts", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  buyerId: varchar("buyer_id", { length: 36 }).references(() => buyers.id),
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email"),
  phone: text("phone"),
  title: text("title"),
  department: text("department"),
  notesJson: jsonb("notes_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================================================
// HERBIE CONVERSATIONS
// ============================================================================

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenant_id", { length: 36 }),
  title: text("title").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// ============================================================================
// INVENTORY & MATERIALS INTELLIGENCE (140_inventory.sql)
// ============================================================================

export const warehouses = pgTable("warehouses", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").notNull().default("warehouse"),
  address: text("address"),
  gpsLat: decimal("gps_lat", { precision: 10, scale: 7 }),
  gpsLng: decimal("gps_lng", { precision: 10, scale: 7 }),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const inventoryItems = pgTable("inventory_items", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  sku: text("sku").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category"),
  unit: text("unit").notNull().default("each"),
  unitCost: decimal("unit_cost", { precision: 12, scale: 2 }),
  reorderPoint: integer("reorder_point").default(0),
  preferredVendorId: varchar("preferred_vendor_id", { length: 36 }),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  skuIdx: unique().on(table.tenantId, table.sku),
}));

export const inventoryLevels = pgTable("inventory_levels", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  itemId: varchar("item_id", { length: 36 }).notNull().references(() => inventoryItems.id, { onDelete: "cascade" }),
  warehouseId: varchar("warehouse_id", { length: 36 }).notNull().references(() => warehouses.id, { onDelete: "cascade" }),
  quantity: decimal("quantity", { precision: 12, scale: 2 }).notNull().default("0"),
  reservedQty: decimal("reserved_qty", { precision: 12, scale: 2 }).default("0"),
  lastCountedAt: timestamp("last_counted_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  itemWarehouseIdx: unique().on(table.itemId, table.warehouseId),
}));

export const inventoryTransactions = pgTable("inventory_transactions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  itemId: varchar("item_id", { length: 36 }).notNull().references(() => inventoryItems.id, { onDelete: "cascade" }),
  warehouseId: varchar("warehouse_id", { length: 36 }).notNull().references(() => warehouses.id),
  transactionType: text("transaction_type").notNull(),
  quantity: decimal("quantity", { precision: 12, scale: 2 }).notNull(),
  referenceType: text("reference_type"),
  referenceId: varchar("reference_id", { length: 36 }),
  notes: text("notes"),
  createdByUserId: varchar("created_by_user_id", { length: 36 }).references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const equipment = pgTable("equipment", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  assetTag: text("asset_tag").notNull(),
  name: text("name").notNull(),
  category: text("category"),
  make: text("make"),
  model: text("model"),
  serialNumber: text("serial_number"),
  yearAcquired: integer("year_acquired"),
  purchaseCost: decimal("purchase_cost", { precision: 12, scale: 2 }),
  currentValue: decimal("current_value", { precision: 12, scale: 2 }),
  status: text("status").notNull().default("available"),
  currentWarehouseId: varchar("current_warehouse_id", { length: 36 }).references(() => warehouses.id),
  currentProjectId: varchar("current_project_id", { length: 36 }),
  gpsTrackerId: text("gps_tracker_id"),
  lastGpsLat: decimal("last_gps_lat", { precision: 10, scale: 7 }),
  lastGpsLng: decimal("last_gps_lng", { precision: 10, scale: 7 }),
  lastGpsAt: timestamp("last_gps_at"),
  operatingHours: decimal("operating_hours", { precision: 10, scale: 2 }).default("0"),
  nextMaintenanceAt: timestamp("next_maintenance_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  assetTagIdx: unique().on(table.tenantId, table.assetTag),
}));

export const maintenanceRecords = pgTable("maintenance_records", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  equipmentId: varchar("equipment_id", { length: 36 }).notNull().references(() => equipment.id, { onDelete: "cascade" }),
  maintenanceType: text("maintenance_type").notNull(),
  description: text("description"),
  performedByUserId: varchar("performed_by_user_id", { length: 36 }).references(() => users.id),
  vendorId: varchar("vendor_id", { length: 36 }),
  cost: decimal("cost", { precision: 12, scale: 2 }),
  hoursAtMaintenance: decimal("hours_at_maintenance", { precision: 10, scale: 2 }),
  performedAt: timestamp("performed_at").defaultNow().notNull(),
  nextMaintenanceAt: timestamp("next_maintenance_at"),
  notesJson: jsonb("notes_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const purchaseOrders = pgTable("purchase_orders", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  poNumber: text("po_number").notNull(),
  vendorId: varchar("vendor_id", { length: 36 }).notNull(),
  projectId: varchar("project_id", { length: 36 }),
  status: text("status").notNull().default("draft"),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).default("0"),
  taxAmount: decimal("tax_amount", { precision: 12, scale: 2 }).default("0"),
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }).default("0"),
  orderDate: timestamp("order_date"),
  expectedDeliveryDate: timestamp("expected_delivery_date"),
  receivedDate: timestamp("received_date"),
  approvedByUserId: varchar("approved_by_user_id", { length: 36 }).references(() => users.id),
  approvedAt: timestamp("approved_at"),
  quickbooksId: text("quickbooks_id"),
  notesJson: jsonb("notes_json"),
  needsReview: boolean("needs_review").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  poNumberIdx: unique().on(table.tenantId, table.poNumber),
}));

export const purchaseOrderLines = pgTable("purchase_order_lines", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  purchaseOrderId: varchar("purchase_order_id", { length: 36 }).notNull().references(() => purchaseOrders.id, { onDelete: "cascade" }),
  itemId: varchar("item_id", { length: 36 }).references(() => inventoryItems.id),
  description: text("description").notNull(),
  quantity: decimal("quantity", { precision: 12, scale: 2 }).notNull(),
  unitCost: decimal("unit_cost", { precision: 12, scale: 2 }).notNull(),
  totalCost: decimal("total_cost", { precision: 12, scale: 2 }).notNull(),
  receivedQty: decimal("received_qty", { precision: 12, scale: 2 }).default("0"),
  costCodeId: varchar("cost_code_id", { length: 36 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const invoices = pgTable("invoices", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  invoiceNumber: text("invoice_number").notNull(),
  invoiceType: text("invoice_type").notNull().default("receivable"),
  entityType: text("entity_type"),
  entityId: varchar("entity_id", { length: 36 }),
  vendorId: varchar("vendor_id", { length: 36 }),
  clientId: varchar("client_id", { length: 36 }),
  projectId: varchar("project_id", { length: 36 }),
  status: text("status").notNull().default("draft"),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).default("0"),
  taxAmount: decimal("tax_amount", { precision: 12, scale: 2 }).default("0"),
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }).default("0"),
  paidAmount: decimal("paid_amount", { precision: 12, scale: 2 }).default("0"),
  invoiceDate: timestamp("invoice_date"),
  dueDate: timestamp("due_date"),
  paidDate: timestamp("paid_date"),
  quickbooksId: text("quickbooks_id"),
  notesJson: jsonb("notes_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  invoiceNumberIdx: unique().on(table.tenantId, table.invoiceNumber),
}));

// ============================================================================
// TICKETING & SLA CONTROL (150_ticketing.sql)
// ============================================================================

export const ticketCategories = pgTable("ticket_categories", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  parentId: varchar("parent_id", { length: 36 }),
  defaultPriority: text("default_priority").default("normal"),
  defaultSlaMinutes: integer("default_sla_minutes").default(480),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const slaRules = pgTable("sla_rules", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  priority: text("priority").notNull(),
  responseTimeMinutes: integer("response_time_minutes").notNull(),
  resolutionTimeMinutes: integer("resolution_time_minutes").notNull(),
  escalationRulesJson: jsonb("escalation_rules_json"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const tickets = pgTable("tickets", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  ticketNumber: text("ticket_number").notNull(),
  categoryId: varchar("category_id", { length: 36 }).references(() => ticketCategories.id),
  subject: text("subject").notNull(),
  description: text("description"),
  source: text("source").notNull().default("web"),
  priority: text("priority").notNull().default("normal"),
  status: text("status").notNull().default("open"),
  assignedToUserId: varchar("assigned_to_user_id", { length: 36 }).references(() => users.id),
  assignedTeam: text("assigned_team"),
  reportedByUserId: varchar("reported_by_user_id", { length: 36 }).references(() => users.id),
  reportedByEmail: text("reported_by_email"),
  reportedByPhone: text("reported_by_phone"),
  entityType: text("entity_type"),
  entityId: varchar("entity_id", { length: 36 }),
  projectId: varchar("project_id", { length: 36 }),
  slaRuleId: varchar("sla_rule_id", { length: 36 }).references(() => slaRules.id),
  responseDeadline: timestamp("response_deadline"),
  resolutionDeadline: timestamp("resolution_deadline"),
  firstResponseAt: timestamp("first_response_at"),
  resolvedAt: timestamp("resolved_at"),
  closedAt: timestamp("closed_at"),
  escalationLevel: integer("escalation_level").default(0),
  tagsJson: jsonb("tags_json"),
  customFieldsJson: jsonb("custom_fields_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  ticketNumberIdx: unique().on(table.tenantId, table.ticketNumber),
  statusIdx: index().on(table.tenantId, table.status),
}));

export const ticketComments = pgTable("ticket_comments", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  ticketId: varchar("ticket_id", { length: 36 }).notNull().references(() => tickets.id, { onDelete: "cascade" }),
  authorUserId: varchar("author_user_id", { length: 36 }).references(() => users.id),
  authorName: text("author_name"),
  content: text("content").notNull(),
  isInternal: boolean("is_internal").notNull().default(false),
  attachmentsJson: jsonb("attachments_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const ticketAttachments = pgTable("ticket_attachments", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  ticketId: varchar("ticket_id", { length: 36 }).notNull().references(() => tickets.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileType: text("file_type"),
  fileSize: integer("file_size"),
  storageUrl: text("storage_url"),
  gpsLat: decimal("gps_lat", { precision: 10, scale: 7 }),
  gpsLng: decimal("gps_lng", { precision: 10, scale: 7 }),
  capturedAt: timestamp("captured_at"),
  uploadedByUserId: varchar("uploaded_by_user_id", { length: 36 }).references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// HR, SAFETY & TRAINING (160_hr.sql)
// ============================================================================

export const employees = pgTable("employees", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 36 }).references(() => users.id),
  employeeNumber: text("employee_number").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  department: text("department"),
  jobTitle: text("job_title"),
  employmentType: text("employment_type").notNull().default("full_time"),
  status: text("status").notNull().default("active"),
  hireDate: timestamp("hire_date"),
  terminationDate: timestamp("termination_date"),
  supervisorId: varchar("supervisor_id", { length: 36 }),
  hourlyRate: decimal("hourly_rate", { precision: 10, scale: 2 }),
  salaryAmount: decimal("salary_amount", { precision: 12, scale: 2 }),
  emergencyContactJson: jsonb("emergency_contact_json"),
  addressJson: jsonb("address_json"),
  skillsJson: jsonb("skills_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  employeeNumberIdx: unique().on(table.tenantId, table.employeeNumber),
}));

export const credentials = pgTable("credentials", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  employeeId: varchar("employee_id", { length: 36 }).notNull().references(() => employees.id, { onDelete: "cascade" }),
  credentialType: text("credential_type").notNull(),
  credentialName: text("credential_name").notNull(),
  issuingAuthority: text("issuing_authority"),
  credentialNumber: text("credential_number"),
  issuedAt: timestamp("issued_at"),
  expiresAt: timestamp("expires_at"),
  status: text("status").notNull().default("active"),
  documentUrl: text("document_url"),
  notesJson: jsonb("notes_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const onboardingTasks = pgTable("onboarding_tasks", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  employeeId: varchar("employee_id", { length: 36 }).notNull().references(() => employees.id, { onDelete: "cascade" }),
  taskType: text("task_type").notNull(),
  taskName: text("task_name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("pending"),
  dueAt: timestamp("due_at"),
  completedAt: timestamp("completed_at"),
  completedByUserId: varchar("completed_by_user_id", { length: 36 }).references(() => users.id),
  documentUrl: text("document_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const trainingCourses = pgTable("training_courses", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  courseCode: text("course_code").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category"),
  durationMinutes: integer("duration_minutes"),
  isRequired: boolean("is_required").notNull().default(false),
  recertificationMonths: integer("recertification_months"),
  contentUrl: text("content_url"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  courseCodeIdx: unique().on(table.tenantId, table.courseCode),
}));

export const trainingRecords = pgTable("training_records", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  employeeId: varchar("employee_id", { length: 36 }).notNull().references(() => employees.id, { onDelete: "cascade" }),
  courseId: varchar("course_id", { length: 36 }).notNull().references(() => trainingCourses.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("not_started"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  score: integer("score"),
  passed: boolean("passed"),
  expiresAt: timestamp("expires_at"),
  certificateUrl: text("certificate_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const safetyIncidents = pgTable("safety_incidents", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  incidentNumber: text("incident_number").notNull(),
  incidentType: text("incident_type").notNull(),
  severity: text("severity").notNull().default("minor"),
  status: text("status").notNull().default("reported"),
  projectId: varchar("project_id", { length: 36 }),
  locationDescription: text("location_description"),
  gpsLat: decimal("gps_lat", { precision: 10, scale: 7 }),
  gpsLng: decimal("gps_lng", { precision: 10, scale: 7 }),
  occurredAt: timestamp("occurred_at").notNull(),
  reportedAt: timestamp("reported_at").defaultNow().notNull(),
  reportedByUserId: varchar("reported_by_user_id", { length: 36 }).references(() => users.id),
  description: text("description"),
  rootCauseJson: jsonb("root_cause_json"),
  correctiveActionsJson: jsonb("corrective_actions_json"),
  injuredEmployeesJson: jsonb("injured_employees_json"),
  witnessesJson: jsonb("witnesses_json"),
  oshaReportable: boolean("osha_reportable").default(false),
  oshaFormNumber: text("osha_form_number"),
  closedAt: timestamp("closed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  incidentNumberIdx: unique().on(table.tenantId, table.incidentNumber),
}));

export const safetyBriefings = pgTable("safety_briefings", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  projectId: varchar("project_id", { length: 36 }),
  briefingType: text("briefing_type").notNull(),
  topic: text("topic").notNull(),
  content: text("content"),
  conductedByUserId: varchar("conducted_by_user_id", { length: 36 }).references(() => users.id),
  conductedAt: timestamp("conducted_at").notNull(),
  attendeesJson: jsonb("attendees_json"),
  signatureDataJson: jsonb("signature_data_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// WORKFORCE INTELLIGENCE (170_workforce.sql)
// ============================================================================

export const timeEntries = pgTable("time_entries", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  employeeId: varchar("employee_id", { length: 36 }).notNull().references(() => employees.id, { onDelete: "cascade" }),
  projectId: varchar("project_id", { length: 36 }),
  costCodeId: varchar("cost_code_id", { length: 36 }),
  entryDate: timestamp("entry_date").notNull(),
  clockInAt: timestamp("clock_in_at"),
  clockOutAt: timestamp("clock_out_at"),
  breakMinutes: integer("break_minutes").default(0),
  regularHours: decimal("regular_hours", { precision: 5, scale: 2 }),
  overtimeHours: decimal("overtime_hours", { precision: 5, scale: 2 }),
  doubleTimeHours: decimal("double_time_hours", { precision: 5, scale: 2 }),
  clockInMethod: text("clock_in_method"),
  clockInGpsLat: decimal("clock_in_gps_lat", { precision: 10, scale: 7 }),
  clockInGpsLng: decimal("clock_in_gps_lng", { precision: 10, scale: 7 }),
  clockOutGpsLat: decimal("clock_out_gps_lat", { precision: 10, scale: 7 }),
  clockOutGpsLng: decimal("clock_out_gps_lng", { precision: 10, scale: 7 }),
  status: text("status").notNull().default("pending"),
  approvedByUserId: varchar("approved_by_user_id", { length: 36 }).references(() => users.id),
  approvedAt: timestamp("approved_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const crewAssignments = pgTable("crew_assignments", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  employeeId: varchar("employee_id", { length: 36 }).notNull().references(() => employees.id, { onDelete: "cascade" }),
  projectId: varchar("project_id", { length: 36 }).notNull(),
  assignmentDate: timestamp("assignment_date").notNull(),
  role: text("role"),
  shiftStart: timestamp("shift_start"),
  shiftEnd: timestamp("shift_end"),
  status: text("status").notNull().default("scheduled"),
  assignedByUserId: varchar("assigned_by_user_id", { length: 36 }).references(() => users.id),
  confirmedAt: timestamp("confirmed_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const gpsLocations = pgTable("gps_locations", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  entityType: text("entity_type").notNull(),
  entityId: varchar("entity_id", { length: 36 }).notNull(),
  gpsLat: decimal("gps_lat", { precision: 10, scale: 7 }).notNull(),
  gpsLng: decimal("gps_lng", { precision: 10, scale: 7 }).notNull(),
  accuracy: decimal("accuracy", { precision: 8, scale: 2 }),
  speed: decimal("speed", { precision: 8, scale: 2 }),
  heading: decimal("heading", { precision: 5, scale: 2 }),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
});

export const performanceReviews = pgTable("performance_reviews", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  employeeId: varchar("employee_id", { length: 36 }).notNull().references(() => employees.id, { onDelete: "cascade" }),
  reviewPeriodStart: timestamp("review_period_start").notNull(),
  reviewPeriodEnd: timestamp("review_period_end").notNull(),
  reviewerUserId: varchar("reviewer_user_id", { length: 36 }).references(() => users.id),
  overallRating: integer("overall_rating"),
  ratingsJson: jsonb("ratings_json"),
  strengthsJson: jsonb("strengths_json"),
  improvementsJson: jsonb("improvements_json"),
  goalsJson: jsonb("goals_json"),
  status: text("status").notNull().default("draft"),
  submittedAt: timestamp("submitted_at"),
  acknowledgedAt: timestamp("acknowledged_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================================================
// COMPLIANCE & SECURITY CONTROL TOWER (180_compliance.sql)
// ============================================================================

export const complianceFrameworks = pgTable("compliance_frameworks", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  frameworkCode: text("framework_code").notNull(),
  name: text("name").notNull(),
  version: text("version"),
  description: text("description"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  frameworkCodeIdx: unique().on(table.tenantId, table.frameworkCode),
}));

export const complianceControls = pgTable("compliance_controls", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  frameworkId: varchar("framework_id", { length: 36 }).notNull().references(() => complianceFrameworks.id, { onDelete: "cascade" }),
  controlCode: text("control_code").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category"),
  priority: text("priority").default("medium"),
  implementationStatus: text("implementation_status").notNull().default("not_implemented"),
  evidenceRequirements: text("evidence_requirements"),
  responsibleUserId: varchar("responsible_user_id", { length: 36 }).references(() => users.id),
  lastAssessedAt: timestamp("last_assessed_at"),
  nextAssessmentAt: timestamp("next_assessment_at"),
  notesJson: jsonb("notes_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const complianceEvidence = pgTable("compliance_evidence", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  controlId: varchar("control_id", { length: 36 }).notNull().references(() => complianceControls.id, { onDelete: "cascade" }),
  evidenceType: text("evidence_type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  documentUrl: text("document_url"),
  collectedAt: timestamp("collected_at").defaultNow().notNull(),
  collectedByUserId: varchar("collected_by_user_id", { length: 36 }).references(() => users.id),
  expiresAt: timestamp("expires_at"),
  status: text("status").notNull().default("valid"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const securityPosture = pgTable("security_posture", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  metric: text("metric").notNull(),
  currentValue: text("current_value"),
  targetValue: text("target_value"),
  status: text("status").notNull().default("compliant"),
  lastCheckedAt: timestamp("last_checked_at").defaultNow().notNull(),
  nextCheckAt: timestamp("next_check_at"),
  detailsJson: jsonb("details_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const securityIncidents = pgTable("security_incidents", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  incidentNumber: text("incident_number").notNull(),
  incidentType: text("incident_type").notNull(),
  severity: text("severity").notNull().default("medium"),
  status: text("status").notNull().default("open"),
  title: text("title").notNull(),
  description: text("description"),
  affectedSystemsJson: jsonb("affected_systems_json"),
  detectedAt: timestamp("detected_at").notNull(),
  reportedAt: timestamp("reported_at").defaultNow().notNull(),
  reportedByUserId: varchar("reported_by_user_id", { length: 36 }).references(() => users.id),
  assignedToUserId: varchar("assigned_to_user_id", { length: 36 }).references(() => users.id),
  containedAt: timestamp("contained_at"),
  resolvedAt: timestamp("resolved_at"),
  rootCauseJson: jsonb("root_cause_json"),
  remediationJson: jsonb("remediation_json"),
  lessonsLearnedJson: jsonb("lessons_learned_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  incidentNumberIdx: unique().on(table.tenantId, table.incidentNumber),
}));

// ============================================================================
// MARKETING & GROWTH AUTOMATION (190_marketing.sql)
// ============================================================================

export const marketingCampaigns = pgTable("marketing_campaigns", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  campaignType: text("campaign_type").notNull(),
  channel: text("channel").notNull(),
  status: text("status").notNull().default("draft"),
  targetAudienceJson: jsonb("target_audience_json"),
  contentJson: jsonb("content_json"),
  scheduledAt: timestamp("scheduled_at"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  budgetAmount: decimal("budget_amount", { precision: 12, scale: 2 }),
  spentAmount: decimal("spent_amount", { precision: 12, scale: 2 }),
  goalsJson: jsonb("goals_json"),
  resultsJson: jsonb("results_json"),
  createdByUserId: varchar("created_by_user_id", { length: 36 }).references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const campaignRecipients = pgTable("campaign_recipients", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  campaignId: varchar("campaign_id", { length: 36 }).notNull().references(() => marketingCampaigns.id, { onDelete: "cascade" }),
  contactId: varchar("contact_id", { length: 36 }).references(() => contacts.id),
  email: text("email"),
  phone: text("phone"),
  status: text("status").notNull().default("pending"),
  sentAt: timestamp("sent_at"),
  deliveredAt: timestamp("delivered_at"),
  openedAt: timestamp("opened_at"),
  clickedAt: timestamp("clicked_at"),
  respondedAt: timestamp("responded_at"),
  unsubscribedAt: timestamp("unsubscribed_at"),
  bouncedAt: timestamp("bounced_at"),
  interactionsJson: jsonb("interactions_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const capabilityStatements = pgTable("capability_statements", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  version: integer("version").notNull().default(1),
  status: text("status").notNull().default("draft"),
  contentJson: jsonb("content_json"),
  naicsCodesJson: jsonb("naics_codes_json"),
  pastPerformanceJson: jsonb("past_performance_json"),
  certificationsJson: jsonb("certifications_json"),
  differentiatorsJson: jsonb("differentiators_json"),
  documentUrl: text("document_url"),
  publishedAt: timestamp("published_at"),
  createdByUserId: varchar("created_by_user_id", { length: 36 }).references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================================================
// FIELD OPERATIONS & PROJECTS (200_field_ops.sql)
// ============================================================================

export const projects = pgTable("projects", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  projectNumber: text("project_number").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  clientId: varchar("client_id", { length: 36 }),
  opportunityId: varchar("opportunity_id", { length: 36 }).references(() => opportunities.id),
  bidProjectId: varchar("bid_project_id", { length: 36 }).references(() => bidProjects.id),
  projectManagerId: varchar("project_manager_id", { length: 36 }).references(() => users.id),
  status: text("status").notNull().default("planning"),
  type: text("type"),
  contractType: text("contract_type"),
  contractValue: decimal("contract_value", { precision: 15, scale: 2 }),
  actualCosts: decimal("actual_costs", { precision: 15, scale: 2 }),
  paidInvoices: decimal("paid_invoices", { precision: 15, scale: 2 }),
  grossProfit: decimal("gross_profit", { precision: 15, scale: 2 }),
  client: text("client"),
  projectManager: text("project_manager"),
  projectType: text("project_type"),
  normalizedName: text("normalized_name"),
  startDate: timestamp("start_date"),
  expectedEndDate: timestamp("expected_end_date"),
  actualEndDate: timestamp("actual_end_date"),
  addressJson: jsonb("address_json"),
  gpsLat: decimal("gps_lat", { precision: 10, scale: 7 }),
  gpsLng: decimal("gps_lng", { precision: 10, scale: 7 }),
  budgetJson: jsonb("budget_json"),
  completionPercentage: integer("completion_percentage").default(0),
  customFieldsJson: jsonb("custom_fields_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  projectNumberIdx: unique().on(table.tenantId, table.projectNumber),
}));

export const projectMilestones = pgTable("project_milestones", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  dueDate: timestamp("due_date"),
  completedDate: timestamp("completed_date"),
  status: text("status").notNull().default("pending"),
  paymentAmount: decimal("payment_amount", { precision: 12, scale: 2 }),
  sequenceOrder: integer("sequence_order").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const dailyLogs = pgTable("daily_logs", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id, { onDelete: "cascade" }),
  logDate: timestamp("log_date").notNull(),
  authorUserId: varchar("author_user_id", { length: 36 }).references(() => users.id),
  weatherJson: jsonb("weather_json"),
  workPerformedJson: jsonb("work_performed_json"),
  laborJson: jsonb("labor_json"),
  equipmentJson: jsonb("equipment_json"),
  materialsJson: jsonb("materials_json"),
  visitorsJson: jsonb("visitors_json"),
  issuesJson: jsonb("issues_json"),
  safetyNotesJson: jsonb("safety_notes_json"),
  photosJson: jsonb("photos_json"),
  notes: text("notes"),
  status: text("status").notNull().default("draft"),
  submittedAt: timestamp("submitted_at"),
  approvedByUserId: varchar("approved_by_user_id", { length: 36 }).references(() => users.id),
  approvedAt: timestamp("approved_at"),
  // Phase 1 Feature 4 — voice daily log capture.
  // audioDocumentId links to the uploaded audio blob (in object storage
  // or server/data). transcript holds the raw Whisper output. source
  // tracks how this log was created so UI can show a "voice" badge
  // and we can analyze voice adoption over time.
  audioDocumentId: varchar("audio_document_id", { length: 36 }),
  transcript: text("transcript"),
  source: text("source").notNull().default("manual"), // "voice" | "manual" | "photo"
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  projectDateIdx: unique().on(table.projectId, table.logDate),
}));

export const rfis = pgTable("rfis", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id, { onDelete: "cascade" }),
  rfiNumber: text("rfi_number").notNull(),
  subject: text("subject").notNull(),
  question: text("question").notNull(),
  status: text("status").notNull().default("draft"),
  priority: text("priority").default("normal"),
  submittedByUserId: varchar("submitted_by_user_id", { length: 36 }).references(() => users.id),
  submittedAt: timestamp("submitted_at"),
  assignedToUserId: varchar("assigned_to_user_id", { length: 36 }).references(() => users.id),
  dueDate: timestamp("due_date"),
  answer: text("answer"),
  answeredByUserId: varchar("answered_by_user_id", { length: 36 }).references(() => users.id),
  answeredAt: timestamp("answered_at"),
  attachmentsJson: jsonb("attachments_json"),
  distributionJson: jsonb("distribution_json"),
  draftedByHerbie: boolean("drafted_by_herbie").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  rfiNumberIdx: unique().on(table.projectId, table.rfiNumber),
}));

export const changeOrders = pgTable("change_orders", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id, { onDelete: "cascade" }),
  coNumber: text("co_number").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  changeType: text("change_type").notNull(),
  status: text("status").notNull().default("draft"),
  amount: decimal("amount", { precision: 12, scale: 2 }),
  daysImpact: integer("days_impact"),
  submittedByUserId: varchar("submitted_by_user_id", { length: 36 }).references(() => users.id),
  submittedAt: timestamp("submitted_at"),
  approvedByUserId: varchar("approved_by_user_id", { length: 36 }).references(() => users.id),
  approvedAt: timestamp("approved_at"),
  clientApprovedAt: timestamp("client_approved_at"),
  attachmentsJson: jsonb("attachments_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  coNumberIdx: unique().on(table.projectId, table.coNumber),
}));

export const submittals = pgTable("submittals", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id, { onDelete: "cascade" }),
  submittalNumber: text("submittal_number").notNull(),
  name: text("name").notNull(),
  revision: integer("revision").default(0),
  status: text("status").notNull().default("draft"),
  priority: text("priority").default("medium"),
  submittalType: text("submittal_type"),
  description: text("description"),
  managerName: text("manager_name"),
  contractorName: text("contractor_name"),
  approvers: text("approvers"),
  reference: text("reference"),
  labels: text("labels"),
  attachmentsJson: jsonb("attachments_json"),
  submittedAt: timestamp("submitted_at"),
  approvedAt: timestamp("approved_at"),
  draftedByHerbie: boolean("drafted_by_herbie").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  submittalNumberIdx: unique().on(table.projectId, table.submittalNumber),
}));

export const projectTasks = pgTable("project_tasks", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  assignees: text("assignees"),
  status: text("status").notNull().default("not_started"),
  priority: text("priority").default("medium"),
  labels: text("labels"),
  dueDate: timestamp("due_date"),
  completedAt: timestamp("completed_at"),
  attachmentsJson: jsonb("attachments_json"),
  source: text("source").default("manual"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const payApplications = pgTable("pay_applications", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id, { onDelete: "cascade" }),
  payAppNumber: integer("pay_app_number").notNull(),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  status: text("status").notNull().default("draft"),
  scheduledValues: decimal("scheduled_values", { precision: 15, scale: 2 }),
  previouslyBilled: decimal("previously_billed", { precision: 15, scale: 2 }),
  currentBilled: decimal("current_billed", { precision: 15, scale: 2 }),
  retainageHeld: decimal("retainage_held", { precision: 15, scale: 2 }),
  retainageReleased: decimal("retainage_released", { precision: 15, scale: 2 }),
  netPayable: decimal("net_payable", { precision: 15, scale: 2 }),
  submittedByUserId: varchar("submitted_by_user_id", { length: 36 }).references(() => users.id),
  submittedAt: timestamp("submitted_at"),
  approvedByUserId: varchar("approved_by_user_id", { length: 36 }).references(() => users.id),
  approvedAt: timestamp("approved_at"),
  paidAt: timestamp("paid_at"),
  paidAmount: decimal("paid_amount", { precision: 15, scale: 2 }),
  lienWaiverStatus: text("lien_waiver_status"),
  attachmentsJson: jsonb("attachments_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  payAppNumberIdx: unique().on(table.projectId, table.payAppNumber),
}));

// ============================================================================
// VENDORS & SUBCONTRACTORS (210_vendors.sql)
// ============================================================================

export const vendors = pgTable("vendors", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  vendorNumber: text("vendor_number").notNull(),
  companyName: text("company_name").notNull(),
  vendorType: text("vendor_type").notNull().default("supplier"),
  status: text("status").notNull().default("active"),
  contactName: text("contact_name"),
  email: text("email"),
  phone: text("phone"),
  addressJson: jsonb("address_json"),
  taxId: text("tax_id"),
  paymentTerms: text("payment_terms"),
  categoriesJson: jsonb("categories_json"),
  insuranceExpiresAt: timestamp("insurance_expires_at"),
  licenseExpiresAt: timestamp("license_expires_at"),
  bondingCapacity: decimal("bonding_capacity", { precision: 15, scale: 2 }),
  prequalificationStatus: text("prequalification_status"),
  performanceRating: decimal("performance_rating", { precision: 3, scale: 2 }),
  safetyRating: decimal("safety_rating", { precision: 3, scale: 2 }),
  qualityRating: decimal("quality_rating", { precision: 3, scale: 2 }),
  notesJson: jsonb("notes_json"),
  quickbooksId: text("quickbooks_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  vendorNumberIdx: unique().on(table.tenantId, table.vendorNumber),
}));

export const subcontractorBids = pgTable("subcontractor_bids", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  vendorId: varchar("vendor_id", { length: 36 }).notNull().references(() => vendors.id, { onDelete: "cascade" }),
  projectId: varchar("project_id", { length: 36 }).references(() => projects.id),
  bidProjectId: varchar("bid_project_id", { length: 36 }).references(() => bidProjects.id),
  scopeDescription: text("scope_description"),
  bidAmount: decimal("bid_amount", { precision: 15, scale: 2 }),
  status: text("status").notNull().default("pending"),
  submittedAt: timestamp("submitted_at"),
  expiresAt: timestamp("expires_at"),
  selectedAt: timestamp("selected_at"),
  rejectedAt: timestamp("rejected_at"),
  rejectionReason: text("rejection_reason"),
  notesJson: jsonb("notes_json"),
  attachmentsJson: jsonb("attachments_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const subcontracts = pgTable("subcontracts", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  subcontractNumber: text("subcontract_number").notNull(),
  vendorId: varchar("vendor_id", { length: 36 }).notNull().references(() => vendors.id, { onDelete: "cascade" }),
  projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id, { onDelete: "cascade" }),
  scopeDescription: text("scope_description"),
  contractAmount: decimal("contract_amount", { precision: 15, scale: 2 }).notNull(),
  retainagePercent: decimal("retainage_percent", { precision: 5, scale: 2 }),
  status: text("status").notNull().default("draft"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  executedAt: timestamp("executed_at"),
  completedAt: timestamp("completed_at"),
  insuranceVerifiedAt: timestamp("insurance_verified_at"),
  termsJson: jsonb("terms_json"),
  attachmentsJson: jsonb("attachments_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  subcontractNumberIdx: unique().on(table.tenantId, table.subcontractNumber),
}));

// ============================================================================
// LIEN WAIVERS (215_lien_waivers.sql)
// ============================================================================
// Construction lien waivers signed by subs/vendors to release lien rights in
// exchange for payment. Four canonical types per US convention:
//   - conditional_partial   (lien released for partial payment, contingent on
//                            payment clearing)
//   - unconditional_partial (lien released for partial payment, no contingency)
//   - conditional_final     (lien released for final payment, contingent)
//   - unconditional_final   (lien released for final payment, no contingency)
// State machine: draft → sent → signed → received → (final). Terminal: voided.
export const lienWaivers = pgTable("lien_waivers", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id, { onDelete: "cascade" }),
  vendorId: varchar("vendor_id", { length: 36 }).notNull().references(() => vendors.id, { onDelete: "cascade" }),
  subcontractId: varchar("subcontract_id", { length: 36 }).references(() => subcontracts.id, { onDelete: "set null" }),
  payAppId: varchar("pay_app_id", { length: 36 }).references(() => payApplications.id, { onDelete: "set null" }),
  waiverNumber: text("waiver_number").notNull(),
  waiverType: text("waiver_type").notNull(), // conditional_partial | unconditional_partial | conditional_final | unconditional_final
  status: text("status").notNull().default("draft"), // draft | sent | signed | received | voided
  throughDate: timestamp("through_date").notNull(),
  paymentAmount: decimal("payment_amount", { precision: 15, scale: 2 }).notNull(),
  exceptionsJson: jsonb("exceptions_json"), // [{description, amount}] for unpaid items
  signerName: text("signer_name"),
  signerTitle: text("signer_title"),
  signerEmail: text("signer_email"),
  sentAt: timestamp("sent_at"),
  signedAt: timestamp("signed_at"),
  receivedAt: timestamp("received_at"),
  voidedAt: timestamp("voided_at"),
  expiresAt: timestamp("expires_at"),
  documentId: varchar("document_id", { length: 36 }).references(() => projectDocuments.id, { onDelete: "set null" }),
  notesText: text("notes_text"),
  createdByUserId: varchar("created_by_user_id", { length: 36 }).references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  waiverNumberIdx: unique().on(table.tenantId, table.waiverNumber),
  projectStatusIdx: index("lw_project_status_idx").on(table.projectId, table.status),
  vendorIdx: index("lw_vendor_idx").on(table.vendorId),
  payAppIdx: index("lw_pay_app_idx").on(table.payAppId),
}));

export const insertLienWaiverSchema = createInsertSchema(lienWaivers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertLienWaiver = z.infer<typeof insertLienWaiverSchema>;
export type LienWaiver = typeof lienWaivers.$inferSelect;

export const lienWaiverEvents = pgTable("lien_waiver_events", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  waiverId: varchar("waiver_id", { length: 36 }).notNull().references(() => lienWaivers.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(), // created | sent | signed | received | voided | document_generated | updated
  actorUserId: varchar("actor_user_id", { length: 36 }).references(() => users.id),
  actorName: text("actor_name"),
  payloadJson: jsonb("payload_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  waiverEventIdx: index("lwe_waiver_idx").on(table.waiverId, table.createdAt),
}));

export const insertLienWaiverEventSchema = createInsertSchema(lienWaiverEvents).omit({
  id: true,
  createdAt: true,
});
export type InsertLienWaiverEvent = z.infer<typeof insertLienWaiverEventSchema>;
export type LienWaiverEvent = typeof lienWaiverEvents.$inferSelect;

// ============================================================================
// DAILY PLANNER & BRIEFINGS (220_planner.sql)
// ============================================================================

export const dailyPlans = pgTable("daily_plans", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  planDate: timestamp("plan_date").notNull(),
  status: text("status").notNull().default("pending"),
  tasksJson: jsonb("tasks_json"),
  prioritiesJson: jsonb("priorities_json"),
  meetingsJson: jsonb("meetings_json"),
  deliveriesJson: jsonb("deliveries_json"),
  weatherJson: jsonb("weather_json"),
  generatedAt: timestamp("generated_at"),
  acknowledgedAt: timestamp("acknowledged_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userDateIdx: unique().on(table.userId, table.planDate),
}));

export const executiveBriefings = pgTable("executive_briefings", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  briefingType: text("briefing_type").notNull(),
  briefingDate: timestamp("briefing_date").notNull(),
  recipientUserIds: text("recipient_user_ids").array(),
  status: text("status").notNull().default("draft"),
  summaryText: text("summary_text"),
  highlightsJson: jsonb("highlights_json"),
  risksJson: jsonb("risks_json"),
  metricsJson: jsonb("metrics_json"),
  actionItemsJson: jsonb("action_items_json"),
  generatedAt: timestamp("generated_at"),
  sentAt: timestamp("sent_at"),
  audioUrl: text("audio_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// FINANCE INTELLIGENCE (230_finance.sql)
// ============================================================================

export const cashFlowForecasts = pgTable("cash_flow_forecasts", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  forecastDate: timestamp("forecast_date").notNull(),
  periodType: text("period_type").notNull().default("weekly"),
  projectedInflows: decimal("projected_inflows", { precision: 15, scale: 2 }),
  projectedOutflows: decimal("projected_outflows", { precision: 15, scale: 2 }),
  projectedBalance: decimal("projected_balance", { precision: 15, scale: 2 }),
  inflowBreakdownJson: jsonb("inflow_breakdown_json"),
  outflowBreakdownJson: jsonb("outflow_breakdown_json"),
  assumptionsJson: jsonb("assumptions_json"),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const wipReports = pgTable("wip_reports", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id, { onDelete: "cascade" }),
  reportDate: timestamp("report_date").notNull(),
  contractValue: decimal("contract_value", { precision: 15, scale: 2 }),
  approvedChanges: decimal("approved_changes", { precision: 15, scale: 2 }),
  revisedContract: decimal("revised_contract", { precision: 15, scale: 2 }),
  costsToDate: decimal("costs_to_date", { precision: 15, scale: 2 }),
  estimatedCostToComplete: decimal("estimated_cost_to_complete", { precision: 15, scale: 2 }),
  estimatedTotalCost: decimal("estimated_total_cost", { precision: 15, scale: 2 }),
  percentComplete: decimal("percent_complete", { precision: 5, scale: 2 }),
  earnedRevenue: decimal("earned_revenue", { precision: 15, scale: 2 }),
  billedToDate: decimal("billed_to_date", { precision: 15, scale: 2 }),
  overUnderBilling: decimal("over_under_billing", { precision: 15, scale: 2 }),
  projectedProfit: decimal("projected_profit", { precision: 15, scale: 2 }),
  projectedMargin: decimal("projected_margin", { precision: 5, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  projectDateIdx: unique().on(table.projectId, table.reportDate),
}));

export const costCodes = pgTable("cost_codes", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category"),
  parentId: varchar("parent_id", { length: 36 }),
  status: text("status").notNull().default("active"),
  quickbooksAccountId: text("quickbooks_account_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  codeIdx: unique().on(table.tenantId, table.code),
}));

// ============================================================================
// RELATIONS
// ============================================================================

export const usersRelations = relations(users, ({ one, many }) => ({
  tenant: one(tenants, { fields: [users.tenantId], references: [tenants.id] }),
  userRoles: many(userRoles),
  bidProjects: many(bidProjects),
  notifications: many(notifications),
  tickets: many(tickets),
  timeEntries: many(timeEntries),
}));

export const tenantsRelations = relations(tenants, ({ many }) => ({
  users: many(users),
  settings: many(tenantSettings),
  fitProfiles: many(fitProfiles),
  scoringModels: many(scoringModels),
  opportunities: many(opportunities),
  bidProjects: many(bidProjects),
  projects: many(projects),
  tickets: many(tickets),
  employees: many(employees),
  vendors: many(vendors),
  warehouses: many(warehouses),
}));

export const opportunitiesRelations = relations(opportunities, ({ one, many }) => ({
  tenant: one(tenants, { fields: [opportunities.tenantId], references: [tenants.id] }),
  buyer: one(buyers, { fields: [opportunities.buyerId], references: [buyers.id] }),
  sourceSystem: one(sourceSystems, { fields: [opportunities.sourceSystemId], references: [sourceSystems.id] }),
  amendments: many(opportunityAmendments),
  requirements: many(opportunityRequirements),
  scores: many(opportunityScores),
  bidProjects: many(bidProjects),
  watchlist: many(opportunityWatchlist),
  projects: many(projects),
}));

export const bidProjectsRelations = relations(bidProjects, ({ one, many }) => ({
  tenant: one(tenants, { fields: [bidProjects.tenantId], references: [tenants.id] }),
  opportunity: one(opportunities, { fields: [bidProjects.opportunityId], references: [opportunities.id] }),
  owner: one(users, { fields: [bidProjects.ownerUserId], references: [users.id] }),
  decisions: many(bidDecisions),
  tasks: many(bidTasks),
  artifacts: many(bidArtifacts),
  submissions: many(bidSubmissions),
  outcomes: many(bidOutcomes),
}));

export const approvalRequestsRelations = relations(approvalRequests, ({ one, many }) => ({
  tenant: one(tenants, { fields: [approvalRequests.tenantId], references: [tenants.id] }),
  requestedFromUser: one(users, { fields: [approvalRequests.requestedFrom], references: [users.id] }),
  actions: many(approvalActions),
}));

export const conversationsRelations = relations(conversations, ({ many }) => ({
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, { fields: [messages.conversationId], references: [conversations.id] }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  tenant: one(tenants, { fields: [projects.tenantId], references: [tenants.id] }),
  opportunity: one(opportunities, { fields: [projects.opportunityId], references: [opportunities.id] }),
  bidProject: one(bidProjects, { fields: [projects.bidProjectId], references: [bidProjects.id] }),
  projectManager: one(users, { fields: [projects.projectManagerId], references: [users.id] }),
  milestones: many(projectMilestones),
  dailyLogs: many(dailyLogs),
  rfis: many(rfis),
  changeOrders: many(changeOrders),
  payApplications: many(payApplications),
}));

export const employeesRelations = relations(employees, ({ one, many }) => ({
  tenant: one(tenants, { fields: [employees.tenantId], references: [tenants.id] }),
  user: one(users, { fields: [employees.userId], references: [users.id] }),
  credentials: many(credentials),
  trainingRecords: many(trainingRecords),
  timeEntries: many(timeEntries),
  crewAssignments: many(crewAssignments),
}));

export const ticketsRelations = relations(tickets, ({ one, many }) => ({
  tenant: one(tenants, { fields: [tickets.tenantId], references: [tenants.id] }),
  category: one(ticketCategories, { fields: [tickets.categoryId], references: [ticketCategories.id] }),
  assignedTo: one(users, { fields: [tickets.assignedToUserId], references: [users.id] }),
  slaRule: one(slaRules, { fields: [tickets.slaRuleId], references: [slaRules.id] }),
  comments: many(ticketComments),
  attachments: many(ticketAttachments),
}));

export const vendorsRelations = relations(vendors, ({ one, many }) => ({
  tenant: one(tenants, { fields: [vendors.tenantId], references: [tenants.id] }),
  bids: many(subcontractorBids),
  subcontracts: many(subcontracts),
}));

export const inventoryItemsRelations = relations(inventoryItems, ({ one, many }) => ({
  tenant: one(tenants, { fields: [inventoryItems.tenantId], references: [tenants.id] }),
  levels: many(inventoryLevels),
  transactions: many(inventoryTransactions),
}));

export const equipmentRelations = relations(equipment, ({ one, many }) => ({
  tenant: one(tenants, { fields: [equipment.tenantId], references: [tenants.id] }),
  warehouse: one(warehouses, { fields: [equipment.currentWarehouseId], references: [warehouses.id] }),
  maintenanceRecords: many(maintenanceRecords),
}));

// ============================================================================
// GOVSYNC 2.0 MULTI-AGENT INTELLIGENCE
// ============================================================================

// CIO-Bot Pwin Analysis - tracks probability of win calculations
export const pwinAnalyses = pgTable("pwin_analyses", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  opportunityId: varchar("opportunity_id", { length: 36 }).notNull().references(() => opportunities.id, { onDelete: "cascade" }),
  pwinPercent: decimal("pwin_percent", { precision: 5, scale: 2 }).notNull(), // Probability of win 0-100
  roiEstimate: decimal("roi_estimate", { precision: 15, scale: 2 }), // Estimated ROI
  riskScore: integer("risk_score"), // Risk score 1-10
  competitionDensity: integer("competition_density"), // Number of expected bidders
  bidEffortHours: integer("bid_effort_hours"), // Estimated hours to prepare bid
  bidEffortCost: decimal("bid_effort_cost", { precision: 12, scale: 2 }), // Estimated cost to prepare
  analysisJson: jsonb("analysis_json"), // Detailed breakdown
  recommendedAction: text("recommended_action"), // pursue, consider, pass
  aiReasoning: text("ai_reasoning"), // AI-generated reasoning
  calculatedAt: timestamp("calculated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// LegalOps Compliance Requirements - tracks FAR/DFARS clauses per opportunity
export const complianceRequirements = pgTable("compliance_requirements", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  opportunityId: varchar("opportunity_id", { length: 36 }).notNull().references(() => opportunities.id, { onDelete: "cascade" }),
  clauseNumber: text("clause_number").notNull(), // e.g., "FAR 52.212-1"
  clauseTitle: text("clause_title"),
  clauseType: text("clause_type"), // FAR, DFARS, agency-specific
  isMandatory: boolean("is_mandatory").notNull().default(true),
  companyStatus: text("company_status"), // compliant, gap, in_progress, not_applicable
  gapDescription: text("gap_description"),
  remediationSteps: text("remediation_steps"),
  remediationDeadline: timestamp("remediation_deadline"),
  verifiedAt: timestamp("verified_at"),
  verifiedBy: varchar("verified_by", { length: 36 }).references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Company Certifications - tracks what certifications the company holds
export const companyCertifications = pgTable("company_certifications", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  certificationCode: text("certification_code").notNull(), // SDVOSB, 8A, HUBZone, etc.
  certificationName: text("certification_name").notNull(),
  issuingAgency: text("issuing_agency"),
  certificateNumber: text("certificate_number"),
  issuedAt: timestamp("issued_at"),
  expiresAt: timestamp("expires_at"),
  status: text("status").notNull().default("active"), // active, expired, pending, revoked
  documentUrl: text("document_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantCertIdx: unique().on(table.tenantId, table.certificationCode),
}));

// Foreman-Bot Award Notifications - tracks contract awards
export const awardNotifications = pgTable("award_notifications", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  opportunityId: varchar("opportunity_id", { length: 36 }).references(() => opportunities.id),
  externalAwardId: text("external_award_id"), // SAM.gov award ID
  awardType: text("award_type"), // award, amendment, modification
  awardDate: timestamp("award_date"),
  contractNumber: text("contract_number"),
  awardAmount: decimal("award_amount", { precision: 15, scale: 2 }),
  awardeeCompany: text("awardee_company"),
  isOurAward: boolean("is_our_award").notNull().default(false), // Did we win?
  sourceUrl: text("source_url"),
  rawDataJson: jsonb("raw_data_json"),
  processedAt: timestamp("processed_at"),
  workflowTriggered: boolean("workflow_triggered").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Agent Activity Logs - unified log for all bot activities
export const agentActivities = pgTable("agent_activities", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  agentName: text("agent_name").notNull(), // contract-bot, cio-bot, legalops, foreman-bot, nova
  actionType: text("action_type").notNull(), // crawl, analyze, score, verify, monitor, alert
  entityType: text("entity_type"), // opportunity, award, compliance, bid
  entityId: varchar("entity_id", { length: 36 }),
  description: text("description"),
  inputJson: jsonb("input_json"),
  outputJson: jsonb("output_json"),
  status: text("status").notNull().default("pending"), // pending, success, error, skipped
  errorMessage: text("error_message"),
  durationMs: integer("duration_ms"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  agentTimeIdx: index().on(table.tenantId, table.agentName, table.createdAt),
  entityIdx: index().on(table.entityType, table.entityId),
}));

// Material Forecasts - for award-to-execution automation
export const materialForecasts = pgTable("material_forecasts", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  projectId: varchar("project_id", { length: 36 }).references(() => projects.id),
  opportunityId: varchar("opportunity_id", { length: 36 }).references(() => opportunities.id),
  materialCategory: text("material_category").notNull(),
  itemDescription: text("item_description").notNull(),
  estimatedQuantity: decimal("estimated_quantity", { precision: 12, scale: 2 }),
  unit: text("unit"),
  estimatedUnitCost: decimal("estimated_unit_cost", { precision: 12, scale: 2 }),
  estimatedTotalCost: decimal("estimated_total_cost", { precision: 15, scale: 2 }),
  leadTimeDays: integer("lead_time_days"),
  preferredVendorId: varchar("preferred_vendor_id", { length: 36 }).references(() => vendors.id),
  neededByDate: timestamp("needed_by_date"),
  status: text("status").notNull().default("forecast"), // forecast, ordered, received
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Crew Briefing Kits - generated for project kickoff
export const crewBriefings = pgTable("crew_briefings", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id, { onDelete: "cascade" }),
  briefingType: text("briefing_type").notNull(), // kickoff, safety, daily, weekly
  title: text("title").notNull(),
  contentJson: jsonb("content_json"), // Structured briefing content
  ppeRequirements: text("ppe_requirements").array(),
  safetyChecklistJson: jsonb("safety_checklist_json"),
  drawingReferences: text("drawing_references").array(),
  sentAt: timestamp("sent_at"),
  sentToEmails: text("sent_to_emails").array(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Amendment Tracking - for Foreman-Bot modification monitoring
export const amendmentTracking = pgTable("amendment_tracking", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  opportunityId: varchar("opportunity_id", { length: 36 }).notNull().references(() => opportunities.id, { onDelete: "cascade" }),
  amendmentNumber: integer("amendment_number").notNull(),
  amendmentDate: timestamp("amendment_date"),
  changeType: text("change_type"), // deadline_extension, scope_change, clarification, cancellation
  changeSummary: text("change_summary"),
  impactLevel: text("impact_level"), // low, medium, high, critical
  affectsDeadline: boolean("affects_deadline").notNull().default(false),
  affectsScope: boolean("affects_scope").notNull().default(false),
  affectsPricing: boolean("affects_pricing").notNull().default(false),
  requiresReview: boolean("requires_review").notNull().default(false),
  reviewedBy: varchar("reviewed_by", { length: 36 }).references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  sourceUrl: text("source_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  oppAmendIdx: unique().on(table.opportunityId, table.amendmentNumber),
}));

// Win/Loss History - for Pwin calculations
export const bidHistory = pgTable("bid_history", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  opportunityId: varchar("opportunity_id", { length: 36 }).references(() => opportunities.id),
  naicsCode: text("naics_code"),
  setAsideCode: text("set_aside_code"),
  agencyName: text("agency_name"),
  contractValue: decimal("contract_value", { precision: 15, scale: 2 }),
  bidSubmittedAt: timestamp("bid_submitted_at"),
  outcome: text("outcome").notNull(), // win, loss, no_decision, withdrawn
  winnerName: text("winner_name"),
  lessonLearned: text("lesson_learned"),
  competitorCount: integer("competitor_count"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// HERBIE COMMAND DASHBOARD ENHANCEMENTS
// ============================================================================

// Knowledge Vault - Document Storage for RAG
export const knowledgeDocuments = pgTable("knowledge_documents", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  content: text("content").notNull(),
  documentType: text("document_type").notNull(), // policy, procedure, contract, proposal, capability_statement, faq
  sourceUrl: text("source_url"),
  sourceSystem: text("source_system"), // uploaded, synced, generated
  metadata: jsonb("metadata"), // tags, categories, related entities
  status: text("status").notNull().default("active"), // active, archived, draft
  version: integer("version").notNull().default(1),
  createdBy: varchar("created_by", { length: 36 }).references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Document Embeddings for RAG (pgvector-compatible, storing as text array for compatibility)
export const documentEmbeddings = pgTable("document_embeddings", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  documentId: varchar("document_id", { length: 36 }).references(() => knowledgeDocuments.id, { onDelete: "cascade" }),
  entityType: text("entity_type").notNull(), // knowledge_document, opportunity, bid_project, approval, audit_event
  entityId: varchar("entity_id", { length: 36 }).notNull(),
  chunkIndex: integer("chunk_index").notNull().default(0),
  chunkText: text("chunk_text").notNull(),
  embeddingJson: jsonb("embedding_json"), // Store embedding as JSON array (1536 floats for ada-002)
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  entityIdx: index("embedding_entity_idx").on(table.entityType, table.entityId),
}));

// Capture Stages - CRM Pipeline Stages
export const captureStages = pgTable("capture_stages", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  stageOrder: integer("stage_order").notNull(),
  color: text("color").notNull().default("#6366f1"),
  description: text("description"),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Opportunity Capture Status - Links opportunities to capture pipeline
export const opportunityCapture = pgTable("opportunity_capture", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  opportunityId: varchar("opportunity_id", { length: 36 }).notNull().references(() => opportunities.id, { onDelete: "cascade" }),
  stageId: varchar("stage_id", { length: 36 }).references(() => captureStages.id),
  ownerId: varchar("owner_id", { length: 36 }).references(() => users.id),
  pwinScore: integer("pwin_score"), // 0-100 probability of win
  nextStepDescription: text("next_step_description"),
  nextStepDueDate: timestamp("next_step_due_date"),
  captureNotes: text("capture_notes"),
  competitorIntel: jsonb("competitor_intel"), // Known competitors and intel
  decisionMakers: jsonb("decision_makers"), // Key contacts at agency
  incumbentInfo: jsonb("incumbent_info"), // Incumbent details
  captureStrategy: text("capture_strategy"),
  lastTouchDate: timestamp("last_touch_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Teaming Partners - Partner/Subcontractor Directory
export const teamingPartners = pgTable("teaming_partners", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  companyName: text("company_name").notNull(),
  duns: text("duns"),
  cage: text("cage"),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  naicsCodes: text("naics_codes").array(),
  setAsideCertifications: text("set_aside_certifications").array(), // 8a, HUBZone, SDVOSB, WOSB, etc.
  capabilities: text("capabilities"),
  pastPerformance: jsonb("past_performance"), // Array of relevant contracts
  qualificationNotes: text("qualification_notes"),
  relationshipStatus: text("relationship_status").notNull().default("prospect"), // prospect, active, preferred, inactive
  lastEngagementDate: timestamp("last_engagement_date"),
  rating: integer("rating"), // 1-5 stars
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Opportunity Teaming - Links opportunities to teaming partners
export const opportunityTeaming = pgTable("opportunity_teaming", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  opportunityId: varchar("opportunity_id", { length: 36 }).notNull().references(() => opportunities.id, { onDelete: "cascade" }),
  partnerId: varchar("partner_id", { length: 36 }).notNull().references(() => teamingPartners.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // prime, sub, jv_partner, mentor, protege
  workSharePercent: integer("work_share_percent"),
  status: text("status").notNull().default("proposed"), // proposed, confirmed, declined
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Conversation Memory - Session + Tenant Preferences
export const conversationMemory = pgTable("conversation_memory", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 36 }).references(() => users.id, { onDelete: "cascade" }),
  // Optional project context — set when the memory was captured during a
  // conversation that was scoped to a specific project (Herbie chat with the
  // project chip selected). Lets recall queries filter by project when
  // helpful and lets us audit cross-project leakage.
  projectId: varchar("project_id", { length: 36 }),
  memoryType: text("memory_type").notNull(), // session, tenant_preference, user_preference, learned_fact
  memoryKey: text("memory_key").notNull(),
  memoryValue: jsonb("memory_value").notNull(),
  context: text("context"), // Where this memory was learned
  expiresAt: timestamp("expires_at"), // null = permanent
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantKeyIdx: index("memory_tenant_key_idx").on(table.tenantId, table.memoryType, table.memoryKey),
  projectIdx: index("memory_project_idx").on(table.tenantId, table.projectId),
}));

// Connector Status - Integration Connection Tracking
export const connectorStatus = pgTable("connector_status", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  connectorType: text("connector_type").notNull(), // procore, smartbid, fpds, sam_gov, o365, egnyte, quickbooks, teams
  connectionStatus: text("connection_status").notNull().default("not_connected"), // connected, not_connected, error, syncing
  lastSyncAt: timestamp("last_sync_at"),
  lastSyncStatus: text("last_sync_status"), // success, partial, failed
  lastSyncMessage: text("last_sync_message"),
  recordsSynced: integer("records_synced"),
  configJson: jsonb("config_json"), // Connector-specific configuration
  credentialsValid: boolean("credentials_valid").notNull().default(false),
  enabled: boolean("enabled").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantConnectorIdx: unique().on(table.tenantId, table.connectorType),
}));

// Feature Flags - Control feature rollout
export const featureFlags = pgTable("feature_flags", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).references(() => tenants.id, { onDelete: "cascade" }), // null = global
  flagKey: text("flag_key").notNull(),
  enabled: boolean("enabled").notNull().default(false),
  description: text("description"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// HERBIE Actions - Live Action Feed
export const herbieActions = pgTable("herbie_actions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 36 }).references(() => users.id),
  actionType: text("action_type").notNull(), // autonomous, recommendation, approval_requested, blocked, completed
  actionCategory: text("action_category").notNull(), // opportunity_discovery, scoring, bid_creation, email_draft, meeting_schedule, compliance_check
  title: text("title").notNull(),
  description: text("description").notNull(),
  reasoning: text("reasoning"), // WHY this action was taken/recommended
  evidenceJson: jsonb("evidence_json"), // Records/sources used { recordIds: [], links: [] }
  relatedEntityType: text("related_entity_type"), // opportunity, bid_project, approval, etc.
  relatedEntityId: varchar("related_entity_id", { length: 36 }),
  status: text("status").notNull().default("pending"), // pending, approved, rejected, completed, expired
  requiresApproval: boolean("requires_approval").notNull().default(false),
  approvalRequestId: varchar("approval_request_id", { length: 36 }).references(() => approvalRequests.id),
  resultJson: jsonb("result_json"), // Outcome of the action
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Proposal Templates - For generate_proposal_outline
export const proposalTemplates = pgTable("proposal_templates", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  templateType: text("template_type").notNull(), // technical_volume, management_volume, past_performance, cost_volume
  structureJson: jsonb("structure_json").notNull(), // Sections, subsections, requirements
  farDfarsClauses: text("far_dfars_clauses").array(), // Applicable clauses
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Capture Plan Templates
export const capturePlanTemplates = pgTable("capture_plan_templates", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  stepsJson: jsonb("steps_json").notNull(), // Array of { step, owner_role, duration_days, dependencies }
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Task Templates - For create_tasks_from_template
export const taskTemplates = pgTable("task_templates", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  templateName: text("template_name").notNull(),
  templateType: text("template_type").notNull(), // bid_project, project_kickoff, compliance_review
  tasksJson: jsonb("tasks_json").notNull(), // Array of task definitions
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// ZOD SCHEMAS & TYPES
// ============================================================================

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTenantSchema = createInsertSchema(tenants).omit({ id: true, createdAt: true, updatedAt: true });
export const insertOpportunitySchema = createInsertSchema(opportunities).omit({ id: true, createdAt: true, updatedAt: true });
export const insertBidProjectSchema = createInsertSchema(bidProjects).omit({ id: true, createdAt: true, updatedAt: true });
export const insertBidSubmissionSchema = createInsertSchema(bidSubmissions).omit({ id: true, submittedAt: true });
export const insertApprovalRequestSchema = createInsertSchema(approvalRequests).omit({ id: true, createdAt: true });
export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });
export const insertAuditEventSchema = createInsertSchema(auditEvents).omit({ id: true, createdAt: true });
export const insertJobSchema = createInsertSchema(jobs).omit({ id: true, createdAt: true });
export const insertConversationSchema = createInsertSchema(conversations).omit({ id: true, createdAt: true });
export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true });
export const insertProjectSchema = createInsertSchema(projects).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTicketSchema = createInsertSchema(tickets).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEmployeeSchema = createInsertSchema(employees).omit({ id: true, createdAt: true, updatedAt: true });
export const insertVendorSchema = createInsertSchema(vendors).omit({ id: true, createdAt: true, updatedAt: true });
export const insertInventoryItemSchema = createInsertSchema(inventoryItems).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEquipmentSchema = createInsertSchema(equipment).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTimeEntrySchema = createInsertSchema(timeEntries).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSafetyIncidentSchema = createInsertSchema(safetyIncidents).omit({ id: true, createdAt: true, updatedAt: true });
export const insertRfiSchema = createInsertSchema(rfis).omit({ id: true, createdAt: true, updatedAt: true });
export const insertChangeOrderSchema = createInsertSchema(changeOrders).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSubmittalSchema = createInsertSchema(submittals).omit({ id: true, createdAt: true, updatedAt: true });
export const insertProjectTaskSchema = createInsertSchema(projectTasks).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPayApplicationSchema = createInsertSchema(payApplications).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPurchaseOrderSchema = createInsertSchema(purchaseOrders).omit({ id: true, createdAt: true, updatedAt: true });
export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true, createdAt: true, updatedAt: true });
export const insertDailyLogSchema = createInsertSchema(dailyLogs).omit({ id: true, createdAt: true, updatedAt: true });
export const insertMarketingCampaignSchema = createInsertSchema(marketingCampaigns).omit({ id: true, createdAt: true, updatedAt: true });

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type Tenant = typeof tenants.$inferSelect;
export type InsertOpportunity = z.infer<typeof insertOpportunitySchema>;
export type Opportunity = typeof opportunities.$inferSelect;
export type InsertBidProject = z.infer<typeof insertBidProjectSchema>;
export type BidProject = typeof bidProjects.$inferSelect;
export type InsertBidSubmission = z.infer<typeof insertBidSubmissionSchema>;
export type BidSubmission = typeof bidSubmissions.$inferSelect;
export type InsertApprovalRequest = z.infer<typeof insertApprovalRequestSchema>;
export type ApprovalRequest = typeof approvalRequests.$inferSelect;
export type ApprovalAction = typeof approvalActions.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type AuditEvent = typeof auditEvents.$inferSelect;
export type InsertAuditEvent = z.infer<typeof insertAuditEventSchema>;
export type Job = typeof jobs.$inferSelect;
export type InsertJob = z.infer<typeof insertJobSchema>;
export type SourceSystem = typeof sourceSystems.$inferSelect;
export type SourceRun = typeof sourceRuns.$inferSelect;
export type OpportunityScore = typeof opportunityScores.$inferSelect;
export type ScoreExplanation = typeof scoreExplanations.$inferSelect;
export type BidTask = typeof bidTasks.$inferSelect;
export type BidArtifact = typeof bidArtifacts.$inferSelect;
export type BidDecision = typeof bidDecisions.$inferSelect;
export type CalendarEvent = typeof calendarEvents.$inferSelect;
export type EventAttendee = typeof eventAttendees.$inferSelect;
export type CalendarConnection = typeof calendarConnections.$inferSelect;
export type SyncLog = typeof syncLogs.$inferSelect;
export type EmailMessage = typeof emailMessages.$inferSelect;
export type IntegrationHealth = typeof integrationHealth.$inferSelect;
export type Incident = typeof incidents.$inferSelect;
export type FitProfile = typeof fitProfiles.$inferSelect;
export type ScoringModel = typeof scoringModels.$inferSelect;
export type Buyer = typeof buyers.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type ProjectMilestone = typeof projectMilestones.$inferSelect;
export type DailyLog = typeof dailyLogs.$inferSelect;
export type InsertDailyLog = z.infer<typeof insertDailyLogSchema>;
export type Rfi = typeof rfis.$inferSelect;
export type InsertRfi = z.infer<typeof insertRfiSchema>;
export type ChangeOrder = typeof changeOrders.$inferSelect;
export type InsertChangeOrder = z.infer<typeof insertChangeOrderSchema>;
export type Submittal = typeof submittals.$inferSelect;
export type InsertSubmittal = z.infer<typeof insertSubmittalSchema>;
export type ProjectTask = typeof projectTasks.$inferSelect;
export type InsertProjectTask = z.infer<typeof insertProjectTaskSchema>;
export type PayApplication = typeof payApplications.$inferSelect;
export type InsertPayApplication = z.infer<typeof insertPayApplicationSchema>;
export type Ticket = typeof tickets.$inferSelect;
export type InsertTicket = z.infer<typeof insertTicketSchema>;
export type TicketCategory = typeof ticketCategories.$inferSelect;
export type TicketComment = typeof ticketComments.$inferSelect;
export type SlaRule = typeof slaRules.$inferSelect;
export type Employee = typeof employees.$inferSelect;
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type Credential = typeof credentials.$inferSelect;
export type TrainingCourse = typeof trainingCourses.$inferSelect;
export type TrainingRecord = typeof trainingRecords.$inferSelect;
export type SafetyIncident = typeof safetyIncidents.$inferSelect;
export type InsertSafetyIncident = z.infer<typeof insertSafetyIncidentSchema>;
export type SafetyBriefing = typeof safetyBriefings.$inferSelect;
export type TimeEntry = typeof timeEntries.$inferSelect;
export type InsertTimeEntry = z.infer<typeof insertTimeEntrySchema>;
export type CrewAssignment = typeof crewAssignments.$inferSelect;
export type GpsLocation = typeof gpsLocations.$inferSelect;
export type PerformanceReview = typeof performanceReviews.$inferSelect;
export type Vendor = typeof vendors.$inferSelect;
export type InsertVendor = z.infer<typeof insertVendorSchema>;
export type SubcontractorBid = typeof subcontractorBids.$inferSelect;
export type Subcontract = typeof subcontracts.$inferSelect;
export type Warehouse = typeof warehouses.$inferSelect;
export type InventoryItem = typeof inventoryItems.$inferSelect;
export type InsertInventoryItem = z.infer<typeof insertInventoryItemSchema>;
export type InventoryLevel = typeof inventoryLevels.$inferSelect;
export type InventoryTransaction = typeof inventoryTransactions.$inferSelect;
export type Equipment = typeof equipment.$inferSelect;
export type InsertEquipment = z.infer<typeof insertEquipmentSchema>;
export type MaintenanceRecord = typeof maintenanceRecords.$inferSelect;
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type InsertPurchaseOrder = z.infer<typeof insertPurchaseOrderSchema>;
export type PurchaseOrderLine = typeof purchaseOrderLines.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type ComplianceFramework = typeof complianceFrameworks.$inferSelect;
export type ComplianceControl = typeof complianceControls.$inferSelect;
export type ComplianceEvidence = typeof complianceEvidence.$inferSelect;
export type SecurityPosture = typeof securityPosture.$inferSelect;
export type SecurityIncident = typeof securityIncidents.$inferSelect;
export type MarketingCampaign = typeof marketingCampaigns.$inferSelect;
export type InsertMarketingCampaign = z.infer<typeof insertMarketingCampaignSchema>;
export type CampaignRecipient = typeof campaignRecipients.$inferSelect;
export type CapabilityStatement = typeof capabilityStatements.$inferSelect;
export type DailyPlan = typeof dailyPlans.$inferSelect;
export type ExecutiveBriefing = typeof executiveBriefings.$inferSelect;
export type CashFlowForecast = typeof cashFlowForecasts.$inferSelect;
export type WipReport = typeof wipReports.$inferSelect;
export type CostCode = typeof costCodes.$inferSelect;

// GovSync 2.0 Multi-Agent Intelligence Types
export type PwinAnalysis = typeof pwinAnalyses.$inferSelect;
export type ComplianceRequirement = typeof complianceRequirements.$inferSelect;
export type CompanyCertification = typeof companyCertifications.$inferSelect;
export type AwardNotification = typeof awardNotifications.$inferSelect;
export type AgentActivity = typeof agentActivities.$inferSelect;
export type MaterialForecast = typeof materialForecasts.$inferSelect;
export type CrewBriefing = typeof crewBriefings.$inferSelect;
export type AmendmentTracking = typeof amendmentTracking.$inferSelect;
export type BidHistory = typeof bidHistory.$inferSelect;

// HERBIE Command Dashboard Enhancement Types
export const insertKnowledgeDocumentSchema = createInsertSchema(knowledgeDocuments).omit({ id: true, createdAt: true, updatedAt: true });
export const insertDocumentEmbeddingSchema = createInsertSchema(documentEmbeddings).omit({ id: true, createdAt: true });
export const insertCaptureStageSchema = createInsertSchema(captureStages).omit({ id: true, createdAt: true });
export const insertOpportunityCaptureSchema = createInsertSchema(opportunityCapture).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTeamingPartnerSchema = createInsertSchema(teamingPartners).omit({ id: true, createdAt: true, updatedAt: true });
export const insertOpportunityTeamingSchema = createInsertSchema(opportunityTeaming).omit({ id: true, createdAt: true });
export const insertConversationMemorySchema = createInsertSchema(conversationMemory).omit({ id: true, createdAt: true, updatedAt: true });
export const insertConnectorStatusSchema = createInsertSchema(connectorStatus).omit({ id: true, createdAt: true, updatedAt: true });
export const insertFeatureFlagSchema = createInsertSchema(featureFlags).omit({ id: true, createdAt: true, updatedAt: true });
export const insertHerbieActionSchema = createInsertSchema(herbieActions).omit({ id: true, createdAt: true });
export const insertProposalTemplateSchema = createInsertSchema(proposalTemplates).omit({ id: true, createdAt: true });
export const insertCapturePlanTemplateSchema = createInsertSchema(capturePlanTemplates).omit({ id: true, createdAt: true });
export const insertTaskTemplateSchema = createInsertSchema(taskTemplates).omit({ id: true, createdAt: true });

export type KnowledgeDocument = typeof knowledgeDocuments.$inferSelect;
export type InsertKnowledgeDocument = z.infer<typeof insertKnowledgeDocumentSchema>;
export type DocumentEmbedding = typeof documentEmbeddings.$inferSelect;
export type InsertDocumentEmbedding = z.infer<typeof insertDocumentEmbeddingSchema>;
export type CaptureStage = typeof captureStages.$inferSelect;
export type InsertCaptureStage = z.infer<typeof insertCaptureStageSchema>;
export type OpportunityCapture = typeof opportunityCapture.$inferSelect;
export type InsertOpportunityCapture = z.infer<typeof insertOpportunityCaptureSchema>;
export type TeamingPartner = typeof teamingPartners.$inferSelect;
export type InsertTeamingPartner = z.infer<typeof insertTeamingPartnerSchema>;
export type OpportunityTeaming = typeof opportunityTeaming.$inferSelect;
export type InsertOpportunityTeaming = z.infer<typeof insertOpportunityTeamingSchema>;
export type ConversationMemory = typeof conversationMemory.$inferSelect;
export type InsertConversationMemory = z.infer<typeof insertConversationMemorySchema>;
export type ConnectorStatus = typeof connectorStatus.$inferSelect;
export type InsertConnectorStatus = z.infer<typeof insertConnectorStatusSchema>;
export type FeatureFlag = typeof featureFlags.$inferSelect;
export type InsertFeatureFlag = z.infer<typeof insertFeatureFlagSchema>;
export type HerbieAction = typeof herbieActions.$inferSelect;
export type InsertHerbieAction = z.infer<typeof insertHerbieActionSchema>;
export type ProposalTemplate = typeof proposalTemplates.$inferSelect;
export type InsertProposalTemplate = z.infer<typeof insertProposalTemplateSchema>;
export type CapturePlanTemplate = typeof capturePlanTemplates.$inferSelect;
export type InsertCapturePlanTemplate = z.infer<typeof insertCapturePlanTemplateSchema>;
export type TaskTemplate = typeof taskTemplates.$inferSelect;
export type InsertTaskTemplate = z.infer<typeof insertTaskTemplateSchema>;

// ============================================================================
// AI LEARNING SYSTEM (Adaptive Scoring & Preference Learning)
// ============================================================================

// Learning Weights - Adaptive scoring weights that improve over time
export const learningWeights = pgTable("learning_weights", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  attributeName: text("attribute_name").notNull(), // agency_match, naics_match, value_range, set_aside, etc
  attributeValue: text("attribute_value"), // specific value like "GSA", "236220", etc
  weight: decimal("weight", { precision: 5, scale: 3 }).notNull().default("1.0"),
  winCount: integer("win_count").notNull().default(0),
  lossCount: integer("loss_count").notNull().default(0),
  noBidCount: integer("no_bid_count").notNull().default(0),
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
  version: integer("version").notNull().default(1),
}, (table) => ({
  tenantAttrIdx: unique().on(table.tenantId, table.attributeName, table.attributeValue),
}));

// Preference Signals - Tracks user decisions for learning
export const preferenceSignals = pgTable("preference_signals", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  userId: varchar("user_id", { length: 36 }),
  opportunityId: varchar("opportunity_id", { length: 36 }).references(() => opportunities.id),
  signalType: text("signal_type").notNull(), // viewed, bookmarked, bid_started, no_bid, dismissed
  opportunityAttributes: jsonb("opportunity_attributes"), // snapshot of key attributes
  timeSpent: integer("time_spent"), // seconds spent on opportunity
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Win Patterns - Analyzed patterns from successful bids
export const winPatterns = pgTable("win_patterns", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  patternName: text("pattern_name").notNull(),
  patternType: text("pattern_type").notNull(), // agency, naics, value_range, set_aside, competition_level
  patternValue: text("pattern_value").notNull(),
  confidence: decimal("confidence", { precision: 5, scale: 3 }).notNull(), // 0.0 to 1.0
  supportCount: integer("support_count").notNull().default(0), // number of wins supporting this pattern
  totalBids: integer("total_bids").notNull().default(0),
  winRate: decimal("win_rate", { precision: 5, scale: 3 }), // calculated win rate
  description: text("description"),
  lastAnalyzed: timestamp("last_analyzed").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Company Profile - Core company information for bid generation
export const companyProfile = pgTable("company_profile", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().unique(),
  legalName: text("legal_name").notNull(),
  dbaName: text("dba_name"),
  cageCode: text("cage_code"),
  dunsNumber: text("duns_number"),
  ueiNumber: text("uei_number"),
  naicsCodes: text("naics_codes").array(), // primary NAICS codes
  pscCodes: text("psc_codes").array(), // product service codes
  certifications: jsonb("certifications"), // array of {type, name, expiry, number}
  bondingCapacity: jsonb("bonding_capacity"), // {single, aggregate, carrier}
  insuranceLimits: jsonb("insurance_limits"), // {general, auto, workers, umbrella}
  clearanceLevel: text("clearance_level"), // none, confidential, secret, top_secret
  employeeCount: integer("employee_count"),
  yearFounded: integer("year_founded"),
  annualRevenue: decimal("annual_revenue", { precision: 15, scale: 2 }),
  headquartersAddress: jsonb("headquarters_address"),
  serviceAreas: text("service_areas").array(),
  coreCompetencies: text("core_competencies").array(),
  differentiators: text("differentiators").array(),
  pastPerformanceHighlights: jsonb("past_performance_highlights"), // array of project summaries
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Subcontractors - Teaming partners and subs database
export const subcontractors = pgTable("subcontractors", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  companyName: text("company_name").notNull(),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  trade: text("trade").notNull(), // electrical, plumbing, steel, excavating, etc
  naicsCodes: text("naics_codes").array(),
  certifications: jsonb("certifications"), // SDB, WOSB, SDVOSB, HUBZone, etc
  bondingCapacity: decimal("bonding_capacity", { precision: 15, scale: 2 }),
  insuranceVerified: boolean("insurance_verified").default(false),
  performanceRating: decimal("performance_rating", { precision: 3, scale: 2 }), // 1.0 to 5.0
  projectsCompleted: integer("projects_completed").default(0),
  notes: text("notes"),
  documentsJson: jsonb("documents_json"), // array of uploaded document references
  status: text("status").notNull().default("active"), // active, inactive, preferred
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Labor Rates - Pricing database for quotes
export const laborRates = pgTable("labor_rates", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  laborCategory: text("labor_category").notNull(), // Project Manager, Superintendent, etc
  hourlyRate: decimal("hourly_rate", { precision: 10, scale: 2 }).notNull(),
  burdenedRate: decimal("burdened_rate", { precision: 10, scale: 2 }),
  effectiveDate: timestamp("effective_date").notNull(),
  expirationDate: timestamp("expiration_date"),
  rateType: text("rate_type").notNull().default("internal"), // internal, gsa_schedule, prevailing_wage
  wageAreaCode: text("wage_area_code"), // for prevailing wage
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Quote Templates - Reusable pricing templates
export const quoteTemplates = pgTable("quote_templates", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  projectType: text("project_type"), // commercial, federal, residential
  templateJson: jsonb("template_json").notNull(), // line items, markups, etc
  defaultMarkup: decimal("default_markup", { precision: 5, scale: 2 }).default("15.00"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================================================
// JACKET SYSTEM - Companies, Bids, Projects with Document Management
// ============================================================================

// Companies ("Company Jackets") - Client/Agency entities that own bids and projects
export const companies = pgTable("companies", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  name: text("name").notNull(),
  legalName: text("legal_name"),
  dba: text("dba"),
  type: text("type").notNull().default("client"), // client, agency, vendor, subcontractor
  ein: text("ein"),
  dunsNumber: text("duns_number"),
  cageCode: text("cage_code"),
  ueiNumber: text("uei_number"),
  // Contact info
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  country: text("country").default("USA"),
  phone: text("phone"),
  fax: text("fax"),
  website: text("website"),
  // Primary contact
  primaryContactName: text("primary_contact_name"),
  primaryContactEmail: text("primary_contact_email"),
  primaryContactPhone: text("primary_contact_phone"),
  // Compliance fields
  insuranceExpiryDate: timestamp("insurance_expiry_date"),
  w9OnFile: boolean("w9_on_file").default(false),
  bondingCapacity: decimal("bonding_capacity", { precision: 15, scale: 2 }),
  licensesJson: jsonb("licenses_json"), // array of license objects
  certificationsJson: jsonb("certifications_json"), // 8(a), SDVOSB, etc.
  // Status and metadata
  status: text("status").notNull().default("active"), // active, inactive, archived
  notes: text("notes"),
  tagsJson: jsonb("tags_json"), // array of strings for categorization
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantNameIdx: index().on(table.tenantId, table.name),
  statusIdx: index().on(table.tenantId, table.status),
}));

// Folder Sections - Standardized folder structure definitions
export const folderSections = pgTable("folder_sections", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  jacketType: text("jacket_type").notNull(), // company, bid, project
  sortOrder: integer("sort_order").notNull(),
  code: text("code").notNull(), // 01, 02, etc.
  name: text("name").notNull(), // Bid_Request, Plans_and_Specs, etc.
  displayName: text("display_name").notNull(), // "Bid Request", "Plans & Specs"
  description: text("description"),
  requiredForSubmit: boolean("required_for_submit").default(false),
  acceptedFileTypes: text("accepted_file_types").array(), // pdf, xlsx, docx, etc.
  autoFileRules: jsonb("auto_file_rules"), // rules for auto-filing documents
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  jacketTypeIdx: unique().on(table.tenantId, table.jacketType, table.code),
}));

// Jacket Folders - Actual folder instances for each company/bid/project
export const jacketFolders = pgTable("jacket_folders", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  jacketType: text("jacket_type").notNull(), // company, bid, project
  jacketId: varchar("jacket_id", { length: 36 }).notNull(), // FK to companies, bid_projects, or projects
  folderSectionId: varchar("folder_section_id", { length: 36 }).references(() => folderSections.id),
  parentFolderId: varchar("parent_folder_id", { length: 36 }), // self-reference for nested folders
  name: text("name").notNull(),
  path: text("path").notNull(), // full path like /Companies/ABC Corp/Bids/BID-001/01_Bid_Request
  sortOrder: integer("sort_order").notNull().default(0),
  documentCount: integer("document_count").default(0),
  totalSizeBytes: integer("total_size_bytes").default(0),
  isSystemFolder: boolean("is_system_folder").default(false), // true for auto-created folders
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  jacketIdx: index().on(table.tenantId, table.jacketType, table.jacketId),
  pathIdx: index().on(table.tenantId, table.path),
  uniqSort: uniqueIndex("uniq_jacket_folder_sort").on(table.tenantId, table.jacketType, table.jacketId, table.sortOrder),
  uniqName: uniqueIndex("uniq_jacket_folder_name").on(table.tenantId, table.jacketType, table.jacketId, table.name),
}));

// Jacket Documents - Documents stored in jacket folders with version history
export const jacketDocuments = pgTable("jacket_documents", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  folderId: varchar("folder_id", { length: 36 }).notNull().references(() => jacketFolders.id, { onDelete: "cascade" }),
  // Document metadata
  title: text("title").notNull(),
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull(), // pdf, docx, xlsx, jpg, etc.
  mimeType: text("mime_type"),
  fileSizeBytes: integer("file_size_bytes").notNull(),
  storageKey: text("storage_key").notNull(), // S3 key or file path
  // Versioning
  version: integer("version").notNull().default(1),
  latestVersion: boolean("latest_version").notNull().default(true),
  previousVersionId: varchar("previous_version_id", { length: 36 }),
  // Document classification
  documentType: text("document_type"), // bid_form, specification, addendum, insurance_cert, etc.
  effectiveDate: timestamp("effective_date"),
  expirationDate: timestamp("expiration_date"),
  // Tagging and search
  tagsJson: jsonb("tags_json"),
  keywords: text("keywords"),
  ocrText: text("ocr_text"), // full-text from OCR for search
  // Access control
  visibility: text("visibility").notNull().default("internal"), // internal, client, subcontractor, public
  // Source tracking
  source: text("source").notNull().default("manual"), // manual, herbie, sam_gov, email
  sourceReference: text("source_reference"), // original URL, email ID, etc.
  // HERBIE generation metadata
  generatedBy: text("generated_by"), // "herbie" for builder-created docs
  generatedType: text("generated_type"), // OpportunitySummary, SolicitationNotice, ScopeExtractRiskFlags, ComplianceChecklist, SubmissionInstructions, BidFormTemplate, etc.
  // Upload info
  uploadedBy: varchar("uploaded_by", { length: 36 }),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  // Binder generation tracking
  isGenerated: boolean("is_generated").notNull().default(false),
  binderJobId: varchar("binder_job_id", { length: 36 }),
  // Status
  status: text("status").notNull().default("active"), // active, archived, deleted
  storageMissing: boolean("storage_missing").notNull().default(false),
  storageCheckedAt: timestamp("storage_checked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  folderIdx: index().on(table.tenantId, table.folderId),
  documentTypeIdx: index().on(table.tenantId, table.documentType),
  statusIdx: index().on(table.tenantId, table.status),
}));

// Jacket Build Jobs - Persistent record of every HERBIE autopopulate run
export const jacketBuildJobs = pgTable("jacket_build_jobs", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  bidProjectId: varchar("bid_project_id", { length: 36 }).notNull().references(() => bidProjects.id, { onDelete: "cascade" }),
  mode: text("mode").notNull().default("build"),
  status: text("status").notNull().default("queued"),
  docsCreated: integer("docs_created").notNull().default(0),
  docsSkipped: integer("docs_skipped").notNull().default(0),
  docsFailed: integer("docs_failed").notNull().default(0),
  resultJson: jsonb("result_json"),
  errorSummary: text("error_summary"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

// Document Audit Trail - Immutable log of all document actions
export const documentAuditLog = pgTable("document_audit_log", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  documentId: varchar("document_id", { length: 36 }).references(() => jacketDocuments.id, { onDelete: "cascade" }), // nullable for bulk operations
  action: text("action").notNull(), // upload, download, view, share, archive, delete, version_create, bulk_download
  actorId: varchar("actor_id", { length: 36 }), // user ID
  actorName: text("actor_name"),
  actorType: text("actor_type").notNull().default("user"), // user, system, herbie
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  detailsJson: jsonb("details_json"), // additional context
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Share Links - Secure expiring links for document sharing
export const shareLinks = pgTable("share_links", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  documentId: varchar("document_id", { length: 36 }).references(() => jacketDocuments.id, { onDelete: "cascade" }),
  folderId: varchar("folder_id", { length: 36 }).references(() => jacketFolders.id, { onDelete: "cascade" }),
  shareType: text("share_type").notNull(), // document, folder, binder
  token: text("token").notNull().unique(),
  password: text("password"), // optional password protection
  expiresAt: timestamp("expires_at"),
  maxDownloads: integer("max_downloads"),
  downloadCount: integer("download_count").default(0),
  watermark: boolean("watermark").default(false),
  createdBy: varchar("created_by", { length: 36 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastAccessedAt: timestamp("last_accessed_at"),
});

// Jacket Timeline - Events for company/bid/project jackets
export const jacketTimeline = pgTable("jacket_timeline", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  jacketType: text("jacket_type").notNull(), // company, bid, project
  jacketId: varchar("jacket_id", { length: 36 }).notNull(),
  eventType: text("event_type").notNull(), // document_upload, status_change, rfi_created, addendum_added, etc.
  eventTitle: text("event_title").notNull(),
  eventDescription: text("event_description"),
  relatedEntityType: text("related_entity_type"), // document, rfi, addendum, etc.
  relatedEntityId: varchar("related_entity_id", { length: 36 }),
  actorId: varchar("actor_id", { length: 36 }),
  actorName: text("actor_name"),
  actorType: text("actor_type").default("user"), // user, system, herbie
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  jacketIdx: index().on(table.tenantId, table.jacketType, table.jacketId),
  eventTypeIdx: index().on(table.tenantId, table.eventType),
}));

// Bid RFIs - Request for Information
export const bidRfis = pgTable("bid_rfis", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  bidProjectId: varchar("bid_project_id", { length: 36 }).notNull().references(() => bidProjects.id, { onDelete: "cascade" }),
  rfiNumber: integer("rfi_number").notNull(),
  subject: text("subject").notNull(),
  question: text("question").notNull(),
  answer: text("answer"),
  status: text("status").notNull().default("pending"), // pending, answered, closed
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  dueAt: timestamp("due_at"),
  answeredAt: timestamp("answered_at"),
  answeredBy: varchar("answered_by", { length: 36 }),
  attachmentDocIds: text("attachment_doc_ids").array(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Bid Addenda - Amendments to the bid
export const bidAddenda = pgTable("bid_addenda", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  bidProjectId: varchar("bid_project_id", { length: 36 }).notNull().references(() => bidProjects.id, { onDelete: "cascade" }),
  addendumNumber: integer("addendum_number").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  issuedAt: timestamp("issued_at").defaultNow().notNull(),
  dueAtOverride: timestamp("due_at_override"), // if addendum changes deadline
  acknowledged: boolean("acknowledged").default(false),
  acknowledgedAt: timestamp("acknowledged_at"),
  acknowledgedBy: varchar("acknowledged_by", { length: 36 }),
  documentIds: text("document_ids").array(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Bid Checklists - Smart checklists for submission completeness
export const bidChecklists = pgTable("bid_checklists", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  bidProjectId: varchar("bid_project_id", { length: 36 }).notNull().references(() => bidProjects.id, { onDelete: "cascade" }),
  checklistType: text("checklist_type").notNull().default("submission"), // submission, compliance, internal
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const bidChecklistItems = pgTable("bid_checklist_items", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  checklistId: varchar("checklist_id", { length: 36 }).notNull().references(() => bidChecklists.id, { onDelete: "cascade" }),
  itemText: text("item_text").notNull(),
  isRequired: boolean("is_required").notNull().default(true),
  isCompleted: boolean("is_completed").default(false),
  completedAt: timestamp("completed_at"),
  completedBy: varchar("completed_by", { length: 36 }),
  linkedDocumentId: varchar("linked_document_id", { length: 36 }),
  sortOrder: integer("sort_order").notNull().default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Insert schemas for new tables
export const insertLearningWeightSchema = createInsertSchema(learningWeights).omit({ id: true, lastUpdated: true });
export const insertPreferenceSignalSchema = createInsertSchema(preferenceSignals).omit({ id: true, createdAt: true });
export const insertWinPatternSchema = createInsertSchema(winPatterns).omit({ id: true, createdAt: true, lastAnalyzed: true });
export const insertCompanyProfileSchema = createInsertSchema(companyProfile).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSubcontractorSchema = createInsertSchema(subcontractors).omit({ id: true, createdAt: true, updatedAt: true });
export const insertLaborRateSchema = createInsertSchema(laborRates).omit({ id: true, createdAt: true });
export const insertQuoteTemplateSchema = createInsertSchema(quoteTemplates).omit({ id: true, createdAt: true, updatedAt: true });

// Types for new tables
export type LearningWeight = typeof learningWeights.$inferSelect;
export type InsertLearningWeight = z.infer<typeof insertLearningWeightSchema>;
export type PreferenceSignal = typeof preferenceSignals.$inferSelect;
export type InsertPreferenceSignal = z.infer<typeof insertPreferenceSignalSchema>;
export type WinPattern = typeof winPatterns.$inferSelect;
export type InsertWinPattern = z.infer<typeof insertWinPatternSchema>;
export type CompanyProfileData = typeof companyProfile.$inferSelect;
export type InsertCompanyProfile = z.infer<typeof insertCompanyProfileSchema>;
export type Subcontractor = typeof subcontractors.$inferSelect;
export type InsertSubcontractor = z.infer<typeof insertSubcontractorSchema>;
export type LaborRate = typeof laborRates.$inferSelect;
export type InsertLaborRate = z.infer<typeof insertLaborRateSchema>;
export type QuoteTemplate = typeof quoteTemplates.$inferSelect;
export type InsertQuoteTemplate = z.infer<typeof insertQuoteTemplateSchema>;

// Insert schemas for Jacket system
export const insertCompanySchema = createInsertSchema(companies).omit({ id: true, createdAt: true, updatedAt: true });
export const insertFolderSectionSchema = createInsertSchema(folderSections).omit({ id: true, createdAt: true });
export const insertJacketFolderSchema = createInsertSchema(jacketFolders).omit({ id: true, createdAt: true, updatedAt: true });
export const insertJacketDocumentSchema = createInsertSchema(jacketDocuments).omit({ id: true, createdAt: true, updatedAt: true });
export const insertDocumentAuditLogSchema = createInsertSchema(documentAuditLog).omit({ id: true, createdAt: true });
export const insertShareLinkSchema = createInsertSchema(shareLinks).omit({ id: true, createdAt: true });
export const insertJacketTimelineSchema = createInsertSchema(jacketTimeline).omit({ id: true, createdAt: true });
export const insertBidRfiSchema = createInsertSchema(bidRfis).omit({ id: true, createdAt: true, updatedAt: true });
export const insertBidAddendaSchema = createInsertSchema(bidAddenda).omit({ id: true, createdAt: true });
export const insertBidChecklistSchema = createInsertSchema(bidChecklists).omit({ id: true, createdAt: true });
export const insertBidChecklistItemSchema = createInsertSchema(bidChecklistItems).omit({ id: true, createdAt: true });

// Types for Jacket system
export type Company = typeof companies.$inferSelect;
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type FolderSection = typeof folderSections.$inferSelect;
export type InsertFolderSection = z.infer<typeof insertFolderSectionSchema>;
export type JacketFolder = typeof jacketFolders.$inferSelect;
export type InsertJacketFolder = z.infer<typeof insertJacketFolderSchema>;
export type JacketDocument = typeof jacketDocuments.$inferSelect;
export type InsertJacketDocument = z.infer<typeof insertJacketDocumentSchema>;
export type DocumentAuditLog = typeof documentAuditLog.$inferSelect;
export type InsertDocumentAuditLog = z.infer<typeof insertDocumentAuditLogSchema>;
export type ShareLink = typeof shareLinks.$inferSelect;
export type InsertShareLink = z.infer<typeof insertShareLinkSchema>;
export type JacketTimelineEntry = typeof jacketTimeline.$inferSelect;
export type InsertJacketTimeline = z.infer<typeof insertJacketTimelineSchema>;
export type BidRfi = typeof bidRfis.$inferSelect;
export type InsertBidRfi = z.infer<typeof insertBidRfiSchema>;
export type BidAddendum = typeof bidAddenda.$inferSelect;
export type InsertBidAddendum = z.infer<typeof insertBidAddendaSchema>;
export type BidChecklist = typeof bidChecklists.$inferSelect;
export type InsertBidChecklist = z.infer<typeof insertBidChecklistSchema>;
export type BidChecklistItem = typeof bidChecklistItems.$inferSelect;
export type InsertBidChecklistItem = z.infer<typeof insertBidChecklistItemSchema>;

// ============================================================================
// BLUEPRINTS & TAKEOFFS
// ============================================================================

export const blueprints = pgTable("blueprints", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  bidProjectId: varchar("bid_project_id", { length: 36 }),
  projectId: varchar("project_id", { length: 36 }),
  title: text("title").notNull(),
  fileName: text("file_name").notNull(),
  storageKey: text("storage_key").notNull(),
  fileSize: integer("file_size").notNull(),
  mimeType: text("mime_type").default("application/pdf"),
  pageCount: integer("page_count").default(1),
  scale: text("scale"),
  category: text("category").notNull().default("General"),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const takeoffItems = pgTable("takeoff_items", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  blueprintId: varchar("blueprint_id", { length: 36 }).references(() => blueprints.id, { onDelete: "cascade" }),
  bidProjectId: varchar("bid_project_id", { length: 36 }),
  name: text("name").notNull(),
  quantity: decimal("quantity", { precision: 12, scale: 4 }).notNull(),
  unit: text("unit").notNull().default("Each"),
  unitCost: decimal("unit_cost", { precision: 12, scale: 2 }).notNull().default("0.00"),
  category: text("category").notNull().default("General"),
  notes: text("notes"),
  color: text("color").notNull().default("#3b82f6"),
  pageNumber: integer("page_number"),
  locationJson: jsonb("location_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const blueprintAnnotations = pgTable("blueprint_annotations", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  blueprintId: varchar("blueprint_id", { length: 36 }).notNull().references(() => blueprints.id, { onDelete: "cascade" }),
  pageNumber: integer("page_number").notNull().default(1),
  annotationType: text("annotation_type").notNull(),
  dataJson: jsonb("data_json").notNull(),
  color: text("color").notNull().default("#ef4444"),
  label: text("label"),
  createdBy: varchar("created_by", { length: 36 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertBlueprintSchema = createInsertSchema(blueprints).omit({ id: true, createdAt: true, uploadedAt: true });
export const insertTakeoffItemSchema = createInsertSchema(takeoffItems).omit({ id: true, createdAt: true });
export const insertBlueprintAnnotationSchema = createInsertSchema(blueprintAnnotations).omit({ id: true, createdAt: true });

export type Blueprint = typeof blueprints.$inferSelect;
export type InsertBlueprint = z.infer<typeof insertBlueprintSchema>;
export type TakeoffItem = typeof takeoffItems.$inferSelect;
export type InsertTakeoffItem = z.infer<typeof insertTakeoffItemSchema>;
export type BlueprintAnnotation = typeof blueprintAnnotations.$inferSelect;
export type InsertBlueprintAnnotation = z.infer<typeof insertBlueprintAnnotationSchema>;

// ============================================================================
// AUTO-FILING RULES
// ============================================================================

export const autoFilingRules = pgTable("auto_filing_rules", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  enabled: boolean("enabled").notNull().default(true),
  priority: integer("priority").notNull().default(100),
  // Pattern matching rules
  fileNamePattern: text("file_name_pattern"), // regex pattern for filename
  fileTypePattern: text("file_type_pattern"), // e.g., "pdf,doc,docx"
  contentKeywords: text("content_keywords").array(), // keywords to search for in OCR text
  senderPattern: text("sender_pattern"), // for email attachments
  // Target destination
  targetJacketType: text("target_jacket_type").notNull(), // company, bid, project
  targetFolderPath: text("target_folder_path").notNull(), // e.g., "Bonds & Insurance"
  // Auto-naming rules
  autoRename: boolean("auto_rename").default(false),
  renamePattern: text("rename_pattern"), // e.g., "{date}_{sender}_{subject}"
  // Actions
  autoTag: text("auto_tag").array(),
  notifyUsers: text("notify_users").array(), // user IDs to notify
  requiresReview: boolean("requires_review").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================================================
// NOTIFICATION PREFERENCES (uses existing notifications table)
// ============================================================================

export const notificationPreferences = pgTable("notification_preferences", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  userId: varchar("user_id", { length: 36 }).notNull(),
  notificationType: text("notification_type").notNull(), // rfi_due, addendum_issued, etc.
  inApp: boolean("in_app").default(true),
  email: boolean("email").default(true),
  emailDigest: text("email_digest").default("instant"), // instant, daily, weekly
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userTypeIdx: unique().on(table.userId, table.notificationType),
}));

// ============================================================================
// DOCUMENT OCR & SEARCH
// ============================================================================

export const documentTextContent = pgTable("document_text_content", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  documentId: varchar("document_id", { length: 36 }).notNull().references(() => jacketDocuments.id, { onDelete: "cascade" }),
  pageNumber: integer("page_number"),
  textContent: text("text_content").notNull(),
  ocrEngine: text("ocr_engine").default("tesseract"), // tesseract, google_vision, aws_textract
  ocrConfidence: decimal("ocr_confidence", { precision: 5, scale: 2 }),
  processedAt: timestamp("processed_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  documentIdx: index().on(table.tenantId, table.documentId),
}));

// ============================================================================
// RBAC - Enhanced Role-Based Access Control
// ============================================================================

export const projectPermissions = pgTable("project_permissions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  resourceType: text("resource_type").notNull(), // company, bid_project, project
  resourceId: varchar("resource_id", { length: 36 }).notNull(),
  permissionLevel: text("permission_level").notNull(), // viewer, editor, admin, owner
  grantedBy: varchar("granted_by", { length: 36 }),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userResourceIdx: unique().on(table.userId, table.resourceType, table.resourceId),
}));

// Insert schemas
export const insertAutoFilingRuleSchema = createInsertSchema(autoFilingRules).omit({ id: true, tenantId: true, createdAt: true, updatedAt: true });
export const insertNotificationPreferenceSchema = createInsertSchema(notificationPreferences).omit({ id: true, tenantId: true, createdAt: true });
export const insertDocumentTextContentSchema = createInsertSchema(documentTextContent).omit({ id: true, createdAt: true, processedAt: true });
export const insertProjectPermissionSchema = createInsertSchema(projectPermissions).omit({ id: true, tenantId: true, createdAt: true });

// Types
export type AutoFilingRule = typeof autoFilingRules.$inferSelect;
export type InsertAutoFilingRule = z.infer<typeof insertAutoFilingRuleSchema>;
export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type InsertNotificationPreference = z.infer<typeof insertNotificationPreferenceSchema>;
export type DocumentTextContent = typeof documentTextContent.$inferSelect;
export type InsertDocumentTextContent = z.infer<typeof insertDocumentTextContentSchema>;
export type ProjectPermission = typeof projectPermissions.$inferSelect;
export type InsertProjectPermission = z.infer<typeof insertProjectPermissionSchema>;

// ============================================================================
// DESIGN & SYSTEMS MODULE - Blueprint Hub, Takeoff Engine, Auto-Build, Systems Matrix
// ============================================================================

// Drawing Sheets - Individual pages within a drawing set
export const drawingSheets = pgTable("drawing_sheets", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  projectId: varchar("project_id", { length: 36 }),
  // Sheet identification
  sheetNumber: text("sheet_number").notNull(), // e.g., "A1.1", "M2.3", "E4.1"
  sheetTitle: text("sheet_title").notNull(),
  discipline: text("discipline").notNull(), // architectural, structural, civil, mep, low_voltage, fire_life_safety, rcp
  drawingType: text("drawing_type"), // plan, elevation, section, detail, schedule
  // Version control
  version: integer("version").notNull().default(1),
  isCurrentSet: boolean("is_current_set").notNull().default(true),
  previousVersionId: varchar("previous_version_id", { length: 36 }),
  // File storage
  storageKey: text("storage_key").notNull(),
  fileType: text("file_type").notNull(), // pdf, dwg, dxf, ifc, rvt
  fileSizeBytes: integer("file_size_bytes"),
  // Scale and calibration
  scale: text("scale"), // e.g., "1/4\" = 1'-0\""
  scaleFactor: decimal("scale_factor", { precision: 10, scale: 4 }), // pixels per real-world unit
  scaleUnit: text("scale_unit").default("feet"), // feet, inches, meters
  // Page info
  pageCount: integer("page_count").default(1),
  rotation: integer("rotation").default(0), // 0, 90, 180, 270
  // Layers (for DWG/DXF files)
  layers: jsonb("layers"), // array of layer names with visibility
  // Metadata
  revisionDate: timestamp("revision_date"),
  revisionNumber: text("revision_number"),
  drawnBy: text("drawn_by"),
  checkedBy: text("checked_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Drawing Set - Collection of sheets with version control
export const drawingSets = pgTable("drawing_sets", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  projectId: varchar("project_id", { length: 36 }),
  name: text("name").notNull(), // e.g., "100% CD Set", "IFC Set"
  description: text("description"),
  status: text("status").notNull().default("draft"), // draft, issued, superseded
  issuedDate: timestamp("issued_date"),
  issuedBy: varchar("issued_by", { length: 36 }),
  lockedAt: timestamp("locked_at"), // when set is locked as "Current Set"
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Takeoff Categories - Define what can be taken off from plans
export const takeoffCategories = pgTable("takeoff_categories", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  name: text("name").notNull(),
  code: text("code").notNull(), // e.g., "CONC", "FRAM", "DRYWALL"
  parentId: varchar("parent_id", { length: 36 }),
  trade: text("trade").notNull(), // concrete, framing, drywall, flooring, electrical, plumbing, hvac, lv, fire
  defaultUnit: text("default_unit").notNull(), // SF, LF, EA, CY
  color: text("color"), // for display on plans
  costCodeId: varchar("cost_code_id", { length: 36 }),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Takeoff Assemblies - Pre-defined item groups for faster takeoff
export const takeoffAssemblies = pgTable("takeoff_assemblies", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  categoryId: varchar("category_id", { length: 36 }).references(() => takeoffCategories.id),
  componentsJson: jsonb("components_json").notNull(), // array of material items with quantities
  laborHours: decimal("labor_hours", { precision: 10, scale: 2 }),
  unitCost: decimal("unit_cost", { precision: 12, scale: 2 }),
  unit: text("unit").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Takeoff Quantities - Actual measurements from plans
export const takeoffQuantities = pgTable("takeoff_quantities", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  projectId: varchar("project_id", { length: 36 }),
  sheetId: varchar("sheet_id", { length: 36 }).references(() => drawingSheets.id),
  categoryId: varchar("category_id", { length: 36 }).references(() => takeoffCategories.id),
  assemblyId: varchar("assembly_id", { length: 36 }).references(() => takeoffAssemblies.id),
  // Location
  room: text("room"),
  floor: text("floor"),
  phase: text("phase"),
  zone: text("zone"),
  // Measurement
  quantity: decimal("quantity", { precision: 12, scale: 4 }).notNull(),
  unit: text("unit").notNull(),
  // Cost calculation
  unitCost: decimal("unit_cost", { precision: 12, scale: 2 }),
  laborRate: decimal("labor_rate", { precision: 10, scale: 2 }),
  laborHours: decimal("labor_hours", { precision: 10, scale: 2 }),
  wasteFactor: decimal("waste_factor", { precision: 5, scale: 2 }).default("0"),
  extendedCost: decimal("extended_cost", { precision: 14, scale: 2 }),
  // Annotation link
  annotationId: varchar("annotation_id", { length: 36 }),
  annotationJson: jsonb("annotation_json"), // shape data for reference
  // Metadata
  notes: text("notes"),
  takenOffBy: varchar("taken_off_by", { length: 36 }),
  verifiedBy: varchar("verified_by", { length: 36 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Building Systems - Trade-by-trade system tracking
export const buildingSystems = pgTable("building_systems", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  projectId: varchar("project_id", { length: 36 }),
  // System identification
  systemType: text("system_type").notNull(), // structural, electrical, plumbing, hvac, drywall, doors, windows, lighting, lv_data, security, audio, smart_building
  systemName: text("system_name").notNull(),
  description: text("description"),
  // Scope
  scopeOfWork: text("scope_of_work"),
  specifications: jsonb("specifications"),
  // Status tracking
  status: text("status").notNull().default("not_started"), // not_started, in_progress, inspection_pending, completed, commissioned
  completionPercent: integer("completion_percent").default(0),
  // Assignments
  contractorId: varchar("contractor_id", { length: 36 }),
  foremanId: varchar("foreman_id", { length: 36 }),
  // Commissioning
  commissioningStatus: text("commissioning_status").default("pending"), // pending, scheduled, in_progress, complete, failed
  commissioningDate: timestamp("commissioning_date"),
  commissioningNotes: text("commissioning_notes"),
  // As-built status
  asBuiltStatus: text("as_built_status").default("pending"), // pending, in_progress, submitted, approved
  asBuiltDocId: varchar("as_built_doc_id", { length: 36 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// System Devices - Individual devices within a system
export const systemDevices = pgTable("system_devices", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  systemId: varchar("system_id", { length: 36 }).references(() => buildingSystems.id, { onDelete: "cascade" }),
  // Device info
  deviceType: text("device_type").notNull(), // outlet, switch, fixture, panel, camera, speaker, sensor, etc.
  manufacturer: text("manufacturer"),
  model: text("model"),
  partNumber: text("part_number"),
  // Location
  location: text("location"),
  room: text("room"),
  floor: text("floor"),
  // Installation
  quantity: integer("quantity").notNull().default(1),
  installedCount: integer("installed_count").default(0),
  testedCount: integer("tested_count").default(0),
  // Specifications
  specsJson: jsonb("specs_json"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Cable Schedules - For low voltage systems
export const cableSchedules = pgTable("cable_schedules", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  systemId: varchar("system_id", { length: 36 }).references(() => buildingSystems.id, { onDelete: "cascade" }),
  // Cable identification
  cableNumber: text("cable_number").notNull(),
  cableType: text("cable_type").notNull(), // cat6, cat6a, fiber_sm, fiber_mm, coax, speaker, control
  // Endpoints
  fromLocation: text("from_location").notNull(),
  fromDevice: text("from_device"),
  fromPort: text("from_port"),
  toLocation: text("to_location").notNull(),
  toDevice: text("to_device"),
  toPort: text("to_port"),
  // Specifications
  lengthFeet: decimal("length_feet", { precision: 8, scale: 2 }),
  color: text("color"),
  pathway: text("pathway"), // conduit, tray, j-hook
  // Status
  status: text("status").notNull().default("planned"), // planned, pulled, terminated, tested, labeled
  testResult: text("test_result"), // pass, fail, marginal
  testDate: timestamp("test_date"),
  testedBy: varchar("tested_by", { length: 36 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Rack Elevations - For data/AV racks
export const rackElevations = pgTable("rack_elevations", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  systemId: varchar("system_id", { length: 36 }).references(() => buildingSystems.id, { onDelete: "cascade" }),
  // Rack info
  rackName: text("rack_name").notNull(),
  rackLocation: text("rack_location").notNull(),
  rackHeight: integer("rack_height").notNull().default(42), // RU height
  rackWidth: integer("rack_width").default(19), // inches
  // Equipment layout
  equipmentJson: jsonb("equipment_json").notNull(), // array of {position, height, deviceId, label}
  // Power
  powerCircuit: text("power_circuit"),
  powerLoad: decimal("power_load", { precision: 8, scale: 2 }), // watts
  upsProtected: boolean("ups_protected").default(false),
  // Cooling
  coolingRequired: boolean("cooling_required").default(false),
  btuRequired: integer("btu_required"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Project Phases - Auto-generated from plans
export const projectPhases = pgTable("project_phases", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  projectId: varchar("project_id", { length: 36 }),
  // Phase info
  phaseName: text("phase_name").notNull(),
  phaseCode: text("phase_code"),
  phaseType: text("phase_type").notNull(), // framing, electrical_rough, plumbing_rough, drywall, finishes, lv, commissioning
  sortOrder: integer("sort_order").default(0),
  // Dependencies
  dependsOn: text("depends_on").array(), // array of phase IDs
  // Schedule
  plannedStart: timestamp("planned_start"),
  plannedEnd: timestamp("planned_end"),
  actualStart: timestamp("actual_start"),
  actualEnd: timestamp("actual_end"),
  // Status
  status: text("status").notNull().default("not_started"),
  completionPercent: integer("completion_percent").default(0),
  // Generated content
  tasks: jsonb("tasks"), // auto-generated tasks
  inspections: jsonb("inspections"), // required inspections
  materials: jsonb("materials"), // material list
  submittals: jsonb("submittals"), // required submittals
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Deliverables - Auto-generated documents
export const projectDeliverables = pgTable("project_deliverables", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  projectId: varchar("project_id", { length: 36 }),
  // Deliverable info
  deliverableType: text("deliverable_type").notNull(), // trade_scope, bid_package, material_list, cable_schedule, device_schedule, rack_elevation, as_built, owner_handoff, smart_building_config
  title: text("title").notNull(),
  description: text("description"),
  // Content
  contentJson: jsonb("content_json"), // structured content for generation
  storageKey: text("storage_key"), // generated file location
  // Status
  status: text("status").notNull().default("draft"), // draft, generated, reviewed, approved, issued
  generatedAt: timestamp("generated_at"),
  generatedBy: varchar("generated_by", { length: 36 }),
  approvedAt: timestamp("approved_at"),
  approvedBy: varchar("approved_by", { length: 36 }),
  // Versioning
  version: integer("version").default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Insert schemas
export const insertDrawingSheetSchema = createInsertSchema(drawingSheets).omit({ id: true, tenantId: true, createdAt: true, updatedAt: true });
export const insertDrawingSetSchema = createInsertSchema(drawingSets).omit({ id: true, tenantId: true, createdAt: true, updatedAt: true });
export const insertTakeoffCategorySchema = createInsertSchema(takeoffCategories).omit({ id: true, tenantId: true, createdAt: true });
export const insertTakeoffAssemblySchema = createInsertSchema(takeoffAssemblies).omit({ id: true, tenantId: true, createdAt: true });
export const insertTakeoffQuantitySchema = createInsertSchema(takeoffQuantities).omit({ id: true, tenantId: true, createdAt: true, updatedAt: true });
export const insertBuildingSystemSchema = createInsertSchema(buildingSystems).omit({ id: true, tenantId: true, createdAt: true, updatedAt: true });
export const insertSystemDeviceSchema = createInsertSchema(systemDevices).omit({ id: true, tenantId: true, createdAt: true });
export const insertCableScheduleSchema = createInsertSchema(cableSchedules).omit({ id: true, tenantId: true, createdAt: true });
export const insertRackElevationSchema = createInsertSchema(rackElevations).omit({ id: true, tenantId: true, createdAt: true, updatedAt: true });
export const insertProjectPhaseSchema = createInsertSchema(projectPhases).omit({ id: true, tenantId: true, createdAt: true, updatedAt: true });
export const insertProjectDeliverableSchema = createInsertSchema(projectDeliverables).omit({ id: true, tenantId: true, createdAt: true, updatedAt: true });

// Types
export type DrawingSheet = typeof drawingSheets.$inferSelect;
export type InsertDrawingSheet = z.infer<typeof insertDrawingSheetSchema>;
export type DrawingSet = typeof drawingSets.$inferSelect;
export type InsertDrawingSet = z.infer<typeof insertDrawingSetSchema>;
export type TakeoffCategory = typeof takeoffCategories.$inferSelect;
export type InsertTakeoffCategory = z.infer<typeof insertTakeoffCategorySchema>;
export type TakeoffAssembly = typeof takeoffAssemblies.$inferSelect;
export type InsertTakeoffAssembly = z.infer<typeof insertTakeoffAssemblySchema>;
export type TakeoffQuantity = typeof takeoffQuantities.$inferSelect;
export type InsertTakeoffQuantity = z.infer<typeof insertTakeoffQuantitySchema>;
export type BuildingSystem = typeof buildingSystems.$inferSelect;
export type InsertBuildingSystem = z.infer<typeof insertBuildingSystemSchema>;
export type SystemDevice = typeof systemDevices.$inferSelect;
export type InsertSystemDevice = z.infer<typeof insertSystemDeviceSchema>;
export type CableSchedule = typeof cableSchedules.$inferSelect;
export type InsertCableSchedule = z.infer<typeof insertCableScheduleSchema>;
export type RackElevation = typeof rackElevations.$inferSelect;
export type InsertRackElevation = z.infer<typeof insertRackElevationSchema>;
export type ProjectPhase = typeof projectPhases.$inferSelect;
export type InsertProjectPhase = z.infer<typeof insertProjectPhaseSchema>;
export type ProjectDeliverable = typeof projectDeliverables.$inferSelect;
export type InsertProjectDeliverable = z.infer<typeof insertProjectDeliverableSchema>;

// ============================================================================
// EGNYTE MIRROR SYSTEM
// ============================================================================

// Root paths configuration for Egnyte scanning
export const egnyteRootPaths = pgTable("egnyte_root_paths", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  path: text("path").notNull(), // e.g., /Shared/Company Jackets
  label: text("label").notNull(), // Display name
  pathType: text("path_type").notNull().default("primary"), // primary, legacy, archive
  enabled: boolean("enabled").notNull().default(true),
  lastScannedAt: timestamp("last_scanned_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Mirrored items from Egnyte (folders and files)
export const egnyteItems = pgTable("egnyte_items", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  // Egnyte identifiers
  egnyteEntryId: text("egnyte_entry_id").notNull(), // Stable Egnyte ID
  egnytePath: text("egnyte_path").notNull(), // Current path in Egnyte
  egnyteParentId: text("egnyte_parent_id"), // Parent folder's entry_id
  rootPathId: varchar("root_path_id", { length: 36 }).references(() => egnyteRootPaths.id),
  // Item metadata
  name: text("name").notNull(),
  isFolder: boolean("is_folder").notNull().default(false),
  fileType: text("file_type"), // pdf, docx, xlsx, etc.
  mimeType: text("mime_type"),
  fileSizeBytes: integer("file_size_bytes"),
  checksum: text("checksum"), // For change detection
  // Egnyte timestamps
  egnyteLastModified: timestamp("egnyte_last_modified"),
  egnyteCreatedAt: timestamp("egnyte_created_at"),
  // Local entity mapping
  mappedEntityType: text("mapped_entity_type"), // company, project, bid, document
  mappedEntityId: varchar("mapped_entity_id", { length: 36 }),
  // Folder classification
  folderType: text("folder_type"), // company_jacket, project_jacket, bids, contracts, cos, invoices, photos, emails, notes, permits, closeout
  // Sync state
  syncStatus: text("sync_status").notNull().default("pending"), // pending, synced, error, deleted
  lastSyncedAt: timestamp("last_synced_at"),
  syncError: text("sync_error"),
  // Versioning
  versionCount: integer("version_count").default(1),
  latestVersionId: text("latest_version_id"),
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  entryIdIdx: index("egnyte_items_entry_id_idx").on(table.egnyteEntryId),
  pathIdx: index("egnyte_items_path_idx").on(table.egnytePath),
  parentIdx: index("egnyte_items_parent_idx").on(table.egnyteParentId),
  mappedIdx: index("egnyte_items_mapped_idx").on(table.mappedEntityType, table.mappedEntityId),
}));

// File versions from Egnyte
export const egnyteVersions = pgTable("egnyte_versions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  itemId: varchar("item_id", { length: 36 }).notNull().references(() => egnyteItems.id, { onDelete: "cascade" }),
  // Version info
  egnyteVersionId: text("egnyte_version_id").notNull(),
  versionNumber: integer("version_number").notNull(),
  fileSizeBytes: integer("file_size_bytes"),
  checksum: text("checksum"),
  uploadedBy: text("uploaded_by"),
  uploadedAt: timestamp("uploaded_at"),
  // Local tracking
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Sync state tracking
export const egnyteSyncState = pgTable("egnyte_sync_state", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  syncType: text("sync_type").notNull(), // initial, delta, full_resync
  status: text("status").notNull().default("pending"), // pending, running, completed, failed, paused
  // Progress tracking
  totalItems: integer("total_items").default(0),
  processedItems: integer("processed_items").default(0),
  errorCount: integer("error_count").default(0),
  // Cursor for delta sync
  lastCursor: text("last_cursor"),
  lastEventTime: timestamp("last_event_time"),
  // Timing
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  lastCheckpoint: timestamp("last_checkpoint"),
  // Error details
  lastError: text("last_error"),
  errorDetails: jsonb("error_details"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Sync event queue for processing
export const egnyteSyncEvents = pgTable("egnyte_sync_events", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  eventType: text("event_type").notNull(), // create, update, delete, move, rename, version
  egnyteEntryId: text("egnyte_entry_id").notNull(),
  egnytePath: text("egnyte_path"),
  oldPath: text("old_path"), // For move/rename events
  eventData: jsonb("event_data"),
  status: text("status").notNull().default("pending"), // pending, processing, completed, failed
  retryCount: integer("retry_count").default(0),
  lastError: text("last_error"),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Unassigned items for admin review
export const egnyteUnassigned = pgTable("egnyte_unassigned", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  itemId: varchar("item_id", { length: 36 }).notNull().references(() => egnyteItems.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(), // ambiguous_structure, unknown_folder_type, missing_parent
  suggestedMapping: jsonb("suggested_mapping"), // AI-suggested entity mapping
  reviewStatus: text("review_status").notNull().default("pending"), // pending, assigned, ignored
  assignedBy: varchar("assigned_by", { length: 36 }),
  assignedAt: timestamp("assigned_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// HERBIE DOCUMENT INTELLIGENCE (AI-powered document analysis)
// ============================================================================

// Document categories for construction industry
export const documentCategories = pgTable("document_categories", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  name: text("name").notNull(), // contract, drawing, rfi, submittal, invoice, insurance, permit, photo, email, specification, proposal, change_order
  displayName: text("display_name").notNull(),
  description: text("description"),
  icon: text("icon"), // lucide icon name
  color: text("color"), // hex color for UI
  isSystem: boolean("is_system").notNull().default(false), // built-in vs custom
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// AI-extracted document metadata
export const documentAiMetadata = pgTable("document_ai_metadata", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  egnyteItemId: varchar("egnyte_item_id", { length: 36 }).notNull().references(() => egnyteItems.id, { onDelete: "cascade" }),
  // AI Classification
  categoryId: varchar("category_id", { length: 36 }).references(() => documentCategories.id),
  categoryConfidence: decimal("category_confidence", { precision: 5, scale: 4 }), // 0.0000 to 1.0000
  subcategory: text("subcategory"), // more specific type within category
  // Extracted metadata
  documentTitle: text("document_title"), // AI-extracted or parsed title
  documentDate: timestamp("document_date"), // Date found in document
  expirationDate: timestamp("expiration_date"), // For contracts, insurance, permits
  // Financial data
  contractValue: decimal("contract_value", { precision: 15, scale: 2 }),
  currency: text("currency").default("USD"),
  // Parties involved
  parties: jsonb("parties"), // [{name, role, contact}]
  // Project identification
  projectName: text("project_name"), // AI-extracted project reference
  projectNumber: text("project_number"),
  // Key dates
  keyDates: jsonb("key_dates"), // [{type: 'deadline'|'milestone', date, description}]
  // Document-specific fields
  drawingNumber: text("drawing_number"), // For drawings
  revisionNumber: text("revision_number"),
  rfiNumber: text("rfi_number"), // For RFIs
  submittalNumber: text("submittal_number"), // For submittals
  changeOrderNumber: text("change_order_number"),
  invoiceNumber: text("invoice_number"),
  permitNumber: text("permit_number"),
  policyNumber: text("policy_number"), // For insurance
  // Content analysis
  summary: text("summary"), // AI-generated summary
  keyTerms: text("key_terms").array(), // Important terms/keywords
  ocrText: text("ocr_text"), // Extracted text for scanned docs
  pageCount: integer("page_count"),
  // Entity linking
  linkedBidId: varchar("linked_bid_id", { length: 36 }).references(() => bidProjects.id),
  linkedOpportunityId: varchar("linked_opportunity_id", { length: 36 }).references(() => opportunities.id),
  linkConfidence: decimal("link_confidence", { precision: 5, scale: 4 }),
  linkMethod: text("link_method"), // folder_structure, content_match, manual
  // Processing status
  processingStatus: text("processing_status").notNull().default("pending"), // pending, processing, completed, failed, needs_review
  processedAt: timestamp("processed_at"),
  processingError: text("processing_error"),
  // Flags
  isDuplicate: boolean("is_duplicate").default(false),
  duplicateOfId: varchar("duplicate_of_id", { length: 36 }),
  needsReview: boolean("needs_review").default(false),
  reviewReason: text("review_reason"),
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  itemIdx: index("doc_ai_item_idx").on(table.egnyteItemId),
  categoryIdx: index("doc_ai_category_idx").on(table.categoryId),
  bidIdx: index("doc_ai_bid_idx").on(table.linkedBidId),
  oppIdx: index("doc_ai_opp_idx").on(table.linkedOpportunityId),
  statusIdx: index("doc_ai_status_idx").on(table.processingStatus),
}));

// Document embeddings for semantic search
export const documentAiEmbeddings = pgTable("document_ai_embeddings", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  egnyteItemId: varchar("egnyte_item_id", { length: 36 }).notNull().references(() => egnyteItems.id, { onDelete: "cascade" }),
  metadataId: varchar("metadata_id", { length: 36 }).references(() => documentAiMetadata.id, { onDelete: "cascade" }),
  // Embedding data
  chunkIndex: integer("chunk_index").notNull().default(0),
  chunkText: text("chunk_text").notNull(),
  embeddingVector: jsonb("embedding_vector"), // Float array for similarity search
  embeddingModel: text("embedding_model").default("text-embedding-ada-002"),
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  itemChunkIdx: unique().on(table.egnyteItemId, table.chunkIndex),
}));

// Document requirements per bid type
export const documentRequirements = pgTable("document_requirements", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  // Requirement definition
  name: text("name").notNull(),
  description: text("description"),
  categoryId: varchar("category_id", { length: 36 }).references(() => documentCategories.id),
  // Applicability
  bidType: text("bid_type"), // federal, state, local, private
  contractType: text("contract_type"), // construction, design-build, etc
  minContractValue: decimal("min_contract_value", { precision: 15, scale: 2 }),
  maxContractValue: decimal("max_contract_value", { precision: 15, scale: 2 }),
  // Requirement settings
  isRequired: boolean("is_required").notNull().default(true),
  dueOffsetDays: integer("due_offset_days"), // Days before/after bid due date
  reminderDays: integer("reminder_days").array(), // Days before due to send reminders
  // Status
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Track document fulfillment for bids
export const bidDocumentStatus = pgTable("bid_document_status", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  bidId: varchar("bid_id", { length: 36 }).notNull().references(() => bidProjects.id, { onDelete: "cascade" }),
  requirementId: varchar("requirement_id", { length: 36 }).notNull().references(() => documentRequirements.id),
  // Status
  status: text("status").notNull().default("missing"), // missing, pending, uploaded, approved, rejected, expired
  // Linked document
  documentId: varchar("document_id", { length: 36 }).references(() => egnyteItems.id),
  metadataId: varchar("metadata_id", { length: 36 }).references(() => documentAiMetadata.id),
  // Tracking
  dueDate: timestamp("due_date"),
  uploadedAt: timestamp("uploaded_at"),
  uploadedBy: varchar("uploaded_by", { length: 36 }),
  approvedAt: timestamp("approved_at"),
  approvedBy: varchar("approved_by", { length: 36 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  bidReqIdx: unique().on(table.bidId, table.requirementId),
}));

// HERBIE document alerts and notifications
export const documentAlerts = pgTable("document_alerts", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  // Alert type
  alertType: text("alert_type").notNull(), // new_upload, deadline_approaching, missing_required, duplicate_detected, review_needed, expiring_document
  severity: text("severity").notNull().default("info"), // info, warning, urgent, critical
  // Related entities
  egnyteItemId: varchar("egnyte_item_id", { length: 36 }).references(() => egnyteItems.id, { onDelete: "cascade" }),
  bidId: varchar("bid_id", { length: 36 }).references(() => bidProjects.id, { onDelete: "cascade" }),
  opportunityId: varchar("opportunity_id", { length: 36 }).references(() => opportunities.id, { onDelete: "cascade" }),
  // Alert content
  title: text("title").notNull(),
  message: text("message").notNull(),
  actionUrl: text("action_url"),
  actionLabel: text("action_label"),
  // Status
  status: text("status").notNull().default("active"), // active, acknowledged, dismissed, resolved
  acknowledgedAt: timestamp("acknowledged_at"),
  acknowledgedBy: varchar("acknowledged_by", { length: 36 }),
  resolvedAt: timestamp("resolved_at"),
  // Timing
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  statusIdx: index("doc_alert_status_idx").on(table.status),
  typeIdx: index("doc_alert_type_idx").on(table.alertType),
}));

// Document processing queue for background AI analysis
export const documentProcessingQueue = pgTable("document_processing_queue", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  egnyteItemId: varchar("egnyte_item_id", { length: 36 }).notNull().references(() => egnyteItems.id, { onDelete: "cascade" }),
  // Processing config
  processingType: text("processing_type").notNull(), // categorize, extract_metadata, generate_embedding, ocr, full_analysis
  priority: integer("priority").notNull().default(100), // Lower = higher priority
  // Status
  status: text("status").notNull().default("pending"), // pending, processing, completed, failed, cancelled
  attempts: integer("attempts").default(0),
  maxAttempts: integer("max_attempts").default(3),
  // Results
  result: jsonb("result"),
  error: text("error"),
  // Timing
  scheduledFor: timestamp("scheduled_for").defaultNow(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  statusPriorityIdx: index("doc_queue_status_priority_idx").on(table.status, table.priority),
  itemIdx: index("doc_queue_item_idx").on(table.egnyteItemId),
}));

// Insert schemas for Egnyte tables
export const insertEgnyteRootPathSchema = createInsertSchema(egnyteRootPaths).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEgnyteItemSchema = createInsertSchema(egnyteItems).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEgnyteVersionSchema = createInsertSchema(egnyteVersions).omit({ id: true, createdAt: true });
export const insertEgnyteSyncStateSchema = createInsertSchema(egnyteSyncState).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEgnyteSyncEventSchema = createInsertSchema(egnyteSyncEvents).omit({ id: true, createdAt: true });
export const insertEgnyteUnassignedSchema = createInsertSchema(egnyteUnassigned).omit({ id: true, createdAt: true });

// Insert schemas for Document Intelligence
export const insertDocumentCategorySchema = createInsertSchema(documentCategories).omit({ id: true, createdAt: true });
export const insertDocumentAiMetadataSchema = createInsertSchema(documentAiMetadata).omit({ id: true, createdAt: true, updatedAt: true });
export const insertDocumentAiEmbeddingSchema = createInsertSchema(documentAiEmbeddings).omit({ id: true, createdAt: true });
export const insertDocumentRequirementSchema = createInsertSchema(documentRequirements).omit({ id: true, createdAt: true });
export const insertBidDocumentStatusSchema = createInsertSchema(bidDocumentStatus).omit({ id: true, createdAt: true, updatedAt: true });
export const insertDocumentAlertSchema = createInsertSchema(documentAlerts).omit({ id: true, createdAt: true });
export const insertDocumentProcessingQueueSchema = createInsertSchema(documentProcessingQueue).omit({ id: true, createdAt: true });

// Types for Egnyte tables
export type EgnyteRootPath = typeof egnyteRootPaths.$inferSelect;
export type InsertEgnyteRootPath = z.infer<typeof insertEgnyteRootPathSchema>;
export type EgnyteItem = typeof egnyteItems.$inferSelect;
export type InsertEgnyteItem = z.infer<typeof insertEgnyteItemSchema>;
export type EgnyteVersion = typeof egnyteVersions.$inferSelect;
export type InsertEgnyteVersion = z.infer<typeof insertEgnyteVersionSchema>;
export type EgnyteSyncState = typeof egnyteSyncState.$inferSelect;
export type InsertEgnyteSyncState = z.infer<typeof insertEgnyteSyncStateSchema>;
export type EgnyteSyncEvent = typeof egnyteSyncEvents.$inferSelect;
export type InsertEgnyteSyncEvent = z.infer<typeof insertEgnyteSyncEventSchema>;
export type EgnyteUnassigned = typeof egnyteUnassigned.$inferSelect;
export type InsertEgnyteUnassigned = z.infer<typeof insertEgnyteUnassignedSchema>;

// Types for Document Intelligence
export type DocumentCategory = typeof documentCategories.$inferSelect;
export type InsertDocumentCategory = z.infer<typeof insertDocumentCategorySchema>;
export type DocumentAiMetadata = typeof documentAiMetadata.$inferSelect;
export type InsertDocumentAiMetadata = z.infer<typeof insertDocumentAiMetadataSchema>;
export type DocumentAiEmbedding = typeof documentAiEmbeddings.$inferSelect;
export type InsertDocumentAiEmbedding = z.infer<typeof insertDocumentAiEmbeddingSchema>;
export type DocumentRequirement = typeof documentRequirements.$inferSelect;
export type InsertDocumentRequirement = z.infer<typeof insertDocumentRequirementSchema>;
export type BidDocumentStatus = typeof bidDocumentStatus.$inferSelect;
export type InsertBidDocumentStatus = z.infer<typeof insertBidDocumentStatusSchema>;
export type DocumentAlert = typeof documentAlerts.$inferSelect;
export type InsertDocumentAlert = z.infer<typeof insertDocumentAlertSchema>;
export type DocumentProcessingQueueItem = typeof documentProcessingQueue.$inferSelect;
export type InsertDocumentProcessingQueueItem = z.infer<typeof insertDocumentProcessingQueueSchema>;

// ============================================================================
// HERBIE AUTONOMOUS DOCUMENT COMMAND SYSTEM
// ============================================================================

// Company Synonyms - For fuzzy matching of company/agency names
export const companySynonyms = pgTable("company_synonyms", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  companyId: varchar("company_id", { length: 36 }).notNull().references(() => companies.id, { onDelete: "cascade" }),
  synonym: text("synonym").notNull(), // Alternative name/abbreviation
  normalizedKey: text("normalized_key").notNull(), // Lowercase, stripped version for matching
  source: text("source").notNull().default("manual"), // manual, sam_gov, herbie
  confidence: decimal("confidence", { precision: 4, scale: 2 }).default("1.00"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  synonymIdx: index("company_synonym_idx").on(table.tenantId, table.normalizedKey),
}));

// Unmatched Buyers Queue - For admin review of unrecognized agencies
export const unmatchedBuyers = pgTable("unmatched_buyers", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  buyerName: text("buyer_name").notNull(),
  normalizedKey: text("normalized_key").notNull(),
  samOfficeCode: text("sam_office_code"),
  opportunityCount: integer("opportunity_count").default(1),
  suggestedCompanyId: varchar("suggested_company_id", { length: 36 }).references(() => companies.id),
  matchConfidence: decimal("match_confidence", { precision: 4, scale: 2 }),
  status: text("status").notNull().default("pending"), // pending, matched, created_new, ignored
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: varchar("resolved_by", { length: 36 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  statusIdx: index("unmatched_buyers_status_idx").on(table.tenantId, table.status),
}));

// SAM Ingest Runs - Track delta/full ingest jobs
export const samIngestRuns = pgTable("sam_ingest_runs", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  runType: text("run_type").notNull(), // delta, daily_full
  status: text("status").notNull().default("running"), // running, completed, failed
  modifiedSinceCursor: timestamp("modified_since_cursor"), // For delta runs
  opportunitiesFetched: integer("opportunities_fetched").default(0),
  opportunitiesNew: integer("opportunities_new").default(0),
  opportunitiesUpdated: integer("opportunities_updated").default(0),
  attachmentsDownloaded: integer("attachments_downloaded").default(0),
  errorsJson: jsonb("errors_json"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

// Federal Awards - USAspending.gov historical contract data
export const federalAwards = pgTable("federal_awards", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  usaspendingAwardId: text("usaspending_award_id"),
  piid: text("piid"),
  fain: text("fain"),
  awardType: text("award_type"),
  awardDescription: text("award_description"),
  totalObligatedAmount: decimal("total_obligated_amount", { precision: 15, scale: 2 }),
  totalOutlayAmount: decimal("total_outlay_amount", { precision: 15, scale: 2 }),
  awardingAgencyName: text("awarding_agency_name"),
  awardingSubAgencyName: text("awarding_sub_agency_name"),
  awardingAgencyCode: text("awarding_agency_code"),
  fundingAgencyName: text("funding_agency_name"),
  recipientName: text("recipient_name"),
  recipientUei: text("recipient_uei"),
  recipientDuns: text("recipient_duns"),
  naicsCode: text("naics_code"),
  naicsDescription: text("naics_description"),
  pscCode: text("psc_code"),
  pscDescription: text("psc_description"),
  setAsideType: text("set_aside_type"),
  setAsideDescription: text("set_aside_description"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  lastModifiedDate: timestamp("last_modified_date"),
  placeOfPerformanceCity: text("place_of_performance_city"),
  placeOfPerformanceState: text("place_of_performance_state"),
  placeOfPerformanceCountry: text("place_of_performance_country"),
  contractType: text("contract_type"),
  extentCompeted: text("extent_competed"),
  solicitationNumber: text("solicitation_number"),
  rawJson: jsonb("raw_json"),
  fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  awardIdIdx: index("federal_awards_award_id_idx").on(table.usaspendingAwardId),
  agencyIdx: index("federal_awards_agency_idx").on(table.awardingAgencyName),
  naicsIdx: index("federal_awards_naics_idx").on(table.naicsCode),
  recipientIdx: index("federal_awards_recipient_idx").on(table.recipientName),
  tenantIdx: index("federal_awards_tenant_idx").on(table.tenantId),
}));

// Binder Jobs - Async job tracking for bid binder generation
export const binderJobs = pgTable("binder_jobs", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  bidProjectId: varchar("bid_project_id", { length: 36 }).notNull().references(() => bidProjects.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("queued"),
  progress: integer("progress").notNull().default(0),
  includeMergedPdf: boolean("include_merged_pdf").notNull().default(true),
  includeZip: boolean("include_zip").notNull().default(true),
  watermark: boolean("watermark").notNull().default(false),
  includeLegacyFolders: boolean("include_legacy_folders").notNull().default(true),
  zipDocumentId: varchar("zip_document_id", { length: 36 }),
  pdfDocumentId: varchar("pdf_document_id", { length: 36 }),
  zipStorageKey: text("zip_storage_key"),
  pdfStorageKey: text("pdf_storage_key"),
  error: text("error"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdBy: varchar("created_by", { length: 36 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  bidIdx: index("binder_jobs_bid_idx").on(table.bidProjectId),
  statusIdx: index("binder_jobs_status_idx").on(table.status),
}));

// Bid Binder Versions - Track generated binder PDFs
export const bidBinderVersions = pgTable("bid_binder_versions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  bidProjectId: varchar("bid_project_id", { length: 36 }).notNull().references(() => bidProjects.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  status: text("status").notNull().default("generating"), // generating, ready, superseded, failed
  // Binder content
  storageKey: text("storage_key"), // Path to PDF in storage
  egnyteItemId: varchar("egnyte_item_id", { length: 36 }),
  egnytePath: text("egnyte_path"),
  fileSizeBytes: integer("file_size_bytes"),
  pageCount: integer("page_count"),
  // Page map - which documents are on which pages
  pageMapJson: jsonb("page_map_json"), // { sections: [{sectionName, documents: [{fileName, docId, startPage, endPage}]}] }
  tocJson: jsonb("toc_json"), // Table of contents structure
  // Trigger info
  triggerType: text("trigger_type").notNull(), // initial, amendment, attachment_update, manual
  triggerDetails: text("trigger_details"),
  // Timing
  generatedAt: timestamp("generated_at"),
  generatedBy: text("generated_by").default("herbie"), // herbie or user ID
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  bidVersionIdx: index("binder_bid_version_idx").on(table.bidProjectId, table.version),
}));

// HERBIE Extraction Evidence - Store evidence pointers for extracted fields
export const herbieExtractionEvidence = pgTable("herbie_extraction_evidence", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  bidProjectId: varchar("bid_project_id", { length: 36 }).references(() => bidProjects.id, { onDelete: "cascade" }),
  opportunityId: varchar("opportunity_id", { length: 36 }).references(() => opportunities.id, { onDelete: "cascade" }),
  // What was extracted
  fieldCategory: text("field_category").notNull(), // header, insurance, bonding, materials, submission_rules
  fieldName: text("field_name").notNull(), // e.g., "submission_due_date", "gl_limit", "bond_percentage"
  extractedValue: text("extracted_value"),
  extractedValueJson: jsonb("extracted_value_json"), // For complex values
  // Evidence source
  sourceDocumentId: varchar("source_document_id", { length: 36 }),
  egnyteItemId: varchar("egnyte_item_id", { length: 36 }).references(() => egnyteItems.id),
  pageNumber: integer("page_number"),
  snippetText: text("snippet_text"), // Text around the extracted value
  snippetHash: text("snippet_hash"), // Hash for deduplication
  boundingBoxJson: jsonb("bounding_box_json"), // For OCR locations
  // Confidence and verification
  confidence: decimal("confidence", { precision: 4, scale: 2 }).notNull(),
  extractionMethod: text("extraction_method").notNull(), // deterministic, ai, ocr
  verified: boolean("verified").default(false),
  verifiedAt: timestamp("verified_at"),
  verifiedBy: varchar("verified_by", { length: 36 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  bidFieldIdx: index("extraction_bid_field_idx").on(table.bidProjectId, table.fieldCategory),
  oppFieldIdx: index("extraction_opp_field_idx").on(table.opportunityId, table.fieldCategory),
}));

// Bid Readiness Scores - Track completeness and missing items
export const bidReadinessScores = pgTable("bid_readiness_scores", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  bidProjectId: varchar("bid_project_id", { length: 36 }).notNull().references(() => bidProjects.id, { onDelete: "cascade" }),
  // Overall score
  overallScore: integer("overall_score").notNull(), // 0-100
  status: text("status").notNull(), // critical, warning, ready, submitted
  // Category scores (weighted)
  solicitationScore: integer("solicitation_score").default(0), // Weight: 10
  formsScore: integer("forms_score").default(0), // Weight: 15
  insuranceScore: integer("insurance_score").default(0), // Weight: 20 (critical)
  bondingScore: integer("bonding_score").default(0), // Weight: 20 (critical)
  pricingScore: integer("pricing_score").default(0), // Weight: 15
  technicalScore: integer("technical_score").default(0), // Weight: 10
  pastPerformanceScore: integer("past_performance_score").default(0), // Weight: 5
  subQuotesScore: integer("sub_quotes_score").default(0), // Weight: 5
  // Missing items
  missingItemsJson: jsonb("missing_items_json"), // [{category, item, severity, description}]
  criticalMissingCount: integer("critical_missing_count").default(0),
  warningMissingCount: integer("warning_missing_count").default(0),
  // Last update
  lastCalculatedAt: timestamp("last_calculated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  bidIdx: unique("readiness_bid_idx").on(table.bidProjectId),
}));

// HERBIE Review Queue - Items needing human approval
export const herbieReviewQueue = pgTable("herbie_review_queue", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  // Related entities
  bidProjectId: varchar("bid_project_id", { length: 36 }).references(() => bidProjects.id, { onDelete: "cascade" }),
  opportunityId: varchar("opportunity_id", { length: 36 }).references(() => opportunities.id, { onDelete: "cascade" }),
  documentId: varchar("document_id", { length: 36 }),
  // Review item details
  reviewType: text("review_type").notNull(), // classification, extraction, filing, binder_inclusion, company_match
  actionProposed: text("action_proposed").notNull(), // What HERBIE wants to do
  confidence: decimal("confidence", { precision: 4, scale: 2 }).notNull(),
  reasoningText: text("reasoning_text"), // Why HERBIE made this suggestion
  alternativesJson: jsonb("alternatives_json"), // Other options
  // Status
  status: text("status").notNull().default("pending"), // pending, approved, rejected, expired
  priority: integer("priority").notNull().default(100), // Lower = higher priority
  // Resolution
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: varchar("resolved_by", { length: 36 }),
  resolutionAction: text("resolution_action"), // approved_as_is, approved_modified, rejected
  resolutionNotes: text("resolution_notes"),
  // Timing
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  statusIdx: index("review_queue_status_idx").on(table.tenantId, table.status, table.priority),
}));

export const bidProposalSections = pgTable("bid_proposal_sections", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  bidProjectId: varchar("bid_project_id", { length: 36 }).notNull().references(() => bidProjects.id, { onDelete: "cascade" }),
  approvalRequestId: varchar("approval_request_id", { length: 36 }).references(() => approvalRequests.id),
  sectionType: text("section_type").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  status: text("status").notNull().default("draft"),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const herbieOutreachLog = pgTable("herbie_outreach_log", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  bidProjectId: varchar("bid_project_id", { length: 36 }).references(() => bidProjects.id, { onDelete: "cascade" }),
  approvalRequestId: varchar("approval_request_id", { length: 36 }).references(() => approvalRequests.id),
  recipientEmail: text("recipient_email").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull().default("pending"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Retro Scan Clusters - Group discovered unorganized documents
export const retroScanClusters = pgTable("retro_scan_clusters", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  // Detected bid info
  detectedSolicitationNumber: text("detected_solicitation_number"),
  detectedAgency: text("detected_agency"),
  detectedTitle: text("detected_title"),
  detectedDueDate: timestamp("detected_due_date"),
  // Source info
  sourceCompanyId: varchar("source_company_id", { length: 36 }).references(() => companies.id),
  sourceFolderPath: text("source_folder_path"),
  documentCount: integer("document_count").default(0),
  documentIdsJson: jsonb("document_ids_json"), // Array of egnyte item IDs
  // Clustering info
  clusterConfidence: decimal("cluster_confidence", { precision: 4, scale: 2 }),
  clusteringMethodJson: jsonb("clustering_method_json"), // How docs were grouped
  // Status
  status: text("status").notNull().default("discovered"), // discovered, reviewed, applied, ignored
  // Target (if applied)
  targetBidProjectId: varchar("target_bid_project_id", { length: 36 }).references(() => bidProjects.id),
  targetFolderPath: text("target_folder_path"),
  // Timing
  discoveredAt: timestamp("discovered_at").defaultNow().notNull(),
  appliedAt: timestamp("applied_at"),
  appliedBy: varchar("applied_by", { length: 36 }),
}, (table) => ({
  statusIdx: index("retro_cluster_status_idx").on(table.tenantId, table.status),
}));

// Insert schemas for HERBIE Autonomous Document Command System
export const insertCompanySynonymSchema = createInsertSchema(companySynonyms).omit({ id: true, createdAt: true });
export const insertUnmatchedBuyerSchema = createInsertSchema(unmatchedBuyers).omit({ id: true, createdAt: true });
export const insertFederalAwardSchema = createInsertSchema(federalAwards).omit({ id: true, createdAt: true, fetchedAt: true });
export const insertSamIngestRunSchema = createInsertSchema(samIngestRuns).omit({ id: true, startedAt: true });
export const insertBinderJobSchema = createInsertSchema(binderJobs).omit({ id: true, createdAt: true });
export const insertBidBinderVersionSchema = createInsertSchema(bidBinderVersions).omit({ id: true, createdAt: true });
export const insertHerbieExtractionEvidenceSchema = createInsertSchema(herbieExtractionEvidence).omit({ id: true, createdAt: true });
export const insertBidReadinessScoreSchema = createInsertSchema(bidReadinessScores).omit({ id: true, createdAt: true, updatedAt: true });
export const insertHerbieReviewQueueSchema = createInsertSchema(herbieReviewQueue).omit({ id: true, createdAt: true });
export const insertRetroScanClusterSchema = createInsertSchema(retroScanClusters).omit({ id: true, discoveredAt: true });

// Types for HERBIE Autonomous Document Command System
export type CompanySynonym = typeof companySynonyms.$inferSelect;
export type InsertCompanySynonym = z.infer<typeof insertCompanySynonymSchema>;
export type UnmatchedBuyer = typeof unmatchedBuyers.$inferSelect;
export type InsertUnmatchedBuyer = z.infer<typeof insertUnmatchedBuyerSchema>;
export type FederalAward = typeof federalAwards.$inferSelect;
export type InsertFederalAward = z.infer<typeof insertFederalAwardSchema>;
export type SamIngestRun = typeof samIngestRuns.$inferSelect;
export type InsertSamIngestRun = z.infer<typeof insertSamIngestRunSchema>;
export type BinderJob = typeof binderJobs.$inferSelect;
export type InsertBinderJob = z.infer<typeof insertBinderJobSchema>;
export type BidBinderVersion = typeof bidBinderVersions.$inferSelect;
export type InsertBidBinderVersion = z.infer<typeof insertBidBinderVersionSchema>;
export type HerbieExtractionEvidence = typeof herbieExtractionEvidence.$inferSelect;
export type InsertHerbieExtractionEvidence = z.infer<typeof insertHerbieExtractionEvidenceSchema>;
export type BidReadinessScore = typeof bidReadinessScores.$inferSelect;
export type InsertBidReadinessScore = z.infer<typeof insertBidReadinessScoreSchema>;
export type HerbieReviewQueueItem = typeof herbieReviewQueue.$inferSelect;
export type InsertHerbieReviewQueueItem = z.infer<typeof insertHerbieReviewQueueSchema>;
export type RetroScanCluster = typeof retroScanClusters.$inferSelect;
export type InsertRetroScanCluster = z.infer<typeof insertRetroScanClusterSchema>;

// ============================================================================
// FOLDER TAXONOMY CONSTANTS
// ============================================================================

export const COMPANY_JACKET_FOLDERS = [
  { code: "00", name: "Overview" },
  { code: "01", name: "Active Bids" },
  { code: "02", name: "Active Projects" },
  { code: "03", name: "Contracts" },
  { code: "04", name: "Insurance & Compliance" },
  { code: "05", name: "Invoices & Pay Apps" },
  { code: "06", name: "Plans & Specs" },
  { code: "07", name: "Photos" },
  { code: "08", name: "Correspondence" },
  { code: "09", name: "Vendors & Subs" },
  { code: "10", name: "Safety" },
  { code: "99", name: "Archive" },
] as const;

export const BID_JACKET_FOLDERS = [
  { code: "00", sectionKey: "INTAKE",            name: "Intake",              isSystemFolder: true },
  { code: "01", sectionKey: "SOLICITATION",      name: "Solicitation",        isSystemFolder: true },
  { code: "02", sectionKey: "AMENDMENTS",        name: "Amendments",          isSystemFolder: true },
  { code: "03", sectionKey: "PRE_BID",           name: "Pre-Bid & Site Visit", isSystemFolder: true },
  { code: "04", sectionKey: "RFIS_QA",           name: "RFIs & QA",          isSystemFolder: true },
  { code: "05", sectionKey: "ESTIMATING",        name: "Estimating",          isSystemFolder: true },
  { code: "06", sectionKey: "SUB_QUOTES",        name: "Subcontractor Quotes", isSystemFolder: true },
  { code: "07", sectionKey: "INSURANCE_BONDING", name: "Insurance & Bonding", isSystemFolder: true },
  { code: "08", sectionKey: "FORMS_CERTS",       name: "Forms & Certifications", isSystemFolder: true },
  { code: "09", sectionKey: "PAST_PERFORMANCE",  name: "Past Performance",    isSystemFolder: true },
  { code: "10", sectionKey: "TECHNICAL",         name: "Technical Proposal",  isSystemFolder: true },
  { code: "11", sectionKey: "PRICING",           name: "Pricing",             isSystemFolder: true },
  { code: "12", sectionKey: "SUBMISSION",        name: "Submission",          isSystemFolder: true },
  { code: "13", sectionKey: "DEBRIEF",           name: "Debrief & Lessons",   isSystemFolder: true },
  { code: "14", sectionKey: "POST_AWARD",        name: "Post-Award",          isSystemFolder: true },
  { code: "15", sectionKey: "PHOTOS",            name: "Photos",              isSystemFolder: true },
  { code: "98", sectionKey: "HERBIE_EVIDENCE",   name: "Herbie Evidence Map", isSystemFolder: true },
  { code: "99", sectionKey: "ARCHIVE",           name: "Archive",             isSystemFolder: true },
] as const;

export type BidJacketSectionKey = typeof BID_JACKET_FOLDERS[number]["sectionKey"];

export function bidJacketFolderByKey(key: BidJacketSectionKey) {
  return BID_JACKET_FOLDERS.find(f => f.sectionKey === key)!;
}

export const BID_DOC_ROUTING: Record<string, string> = {
  solicitation: "01",
  amendment: "02",
  pre_bid: "03",
  site_visit: "03",
  rfi: "04",
  question: "04",
  estimate: "05",
  takeoff: "05",
  sub_quote: "06",
  insurance: "07",
  bonding: "07",
  form: "08",
  certification: "08",
  reps_certs: "08",
  past_performance: "09",
  cpars: "09",
  technical: "10",
  proposal: "10",
  pricing: "11",
  cost: "11",
  submission: "12",
  binder: "12",
  debrief: "13",
  lessons: "13",
  post_award: "14",
  photo: "15",
  evidence: "98",
  archive: "99",
};

export function bidJacketFolderDisplayName(code: string): string {
  const folder = BID_JACKET_FOLDERS.find(f => f.code === code);
  return folder ? `${folder.code} - ${folder.name}` : `${code} - Unknown`;
}

export function bidJacketFolderPath(code: string): string {
  const folder = BID_JACKET_FOLDERS.find(f => f.code === code);
  const safeName = folder ? folder.name.replace(/\s+/g, "_").replace(/&/g, "and") : "Unknown";
  return `${code}_${safeName}`;
}

export function validateBidJacketTaxonomy(): void {
  const seenCodes = new Set<string>();
  const seenKeys = new Set<string>();
  const seenSorts = new Set<number>();

  for (const folder of BID_JACKET_FOLDERS) {
    const sortOrder = parseInt(folder.code);

    if (seenCodes.has(folder.code))
      throw new Error(`[TAXONOMY INVARIANT] Duplicate code in BID_JACKET_FOLDERS: ${folder.code}`);
    seenCodes.add(folder.code);

    if (seenKeys.has(folder.sectionKey))
      throw new Error(`[TAXONOMY INVARIANT] Duplicate sectionKey in BID_JACKET_FOLDERS: ${folder.sectionKey}`);
    seenKeys.add(folder.sectionKey);

    if (seenSorts.has(sortOrder))
      throw new Error(`[TAXONOMY INVARIANT] Duplicate sortOrder in BID_JACKET_FOLDERS: ${sortOrder}`);
    seenSorts.add(sortOrder);

    const displayName = `${folder.code} - ${folder.name}`;
    const m = displayName.match(/^(\d+)\s*-/);
    if (!m)
      throw new Error(`[TAXONOMY INVARIANT] Folder display name must start with number + dash: ${displayName}`);
    if (Number(m[1]) !== sortOrder)
      throw new Error(`[TAXONOMY INVARIANT] Folder code ${folder.code} does not match sortOrder ${sortOrder} for ${displayName}`);
  }

  console.log(`[TAXONOMY] Bid jacket taxonomy validated: ${BID_JACKET_FOLDERS.length} folders, all codes/keys/sortOrders unique`);
}

export const PROJECT_JACKET_FOLDERS = [
  { code: "00", name: "Admin" },
  { code: "01", name: "Contract & Amendments" },
  { code: "02", name: "Schedule" },
  { code: "03", name: "RFIs" },
  { code: "04", name: "Submittals" },
  { code: "05", name: "Change Orders" },
  { code: "06", name: "Drawings & Plans" },
  { code: "07", name: "Specs & Materials" },
  { code: "08", name: "Daily Logs" },
  { code: "09", name: "Photos" },
  { code: "10", name: "Safety" },
  { code: "11", name: "Invoices & Pay Apps" },
  { code: "12", name: "Closeout" },
  { code: "99", name: "Archive" },
] as const;

export const EGNYTE_ROOT_PATH = "/Shared/Black Hawk Construction/Company Jackets" as const;

// Confidence thresholds for auto-filing
export const CONFIDENCE_THRESHOLDS = {
  HIGH: 0.92,      // Auto-classify, auto-tag, auto-place, auto-include in binder
  MEDIUM_LOW: 0.75, // Suggest in review queue, don't move originals
  // Below 0.75 = Low confidence, flag for human review
} as const;

// High-risk actions that ALWAYS require approval regardless of confidence
export const HIGH_RISK_ACTIONS = [
  "change_pricing_totals",
  "change_contractual_terms",
  "submit_bid_externally",
  "delete_source_docs",
  "move_original_docs",
  "overwrite_approved_binder",
] as const;

// ============================================================================
// BID INVITATIONS & VENDOR PORTAL (Phase 2)
// ============================================================================

export const bidInvitations = pgTable("bid_invitations", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  bidProjectId: varchar("bid_project_id", { length: 36 }).notNull().references(() => bidProjects.id, { onDelete: "cascade" }),
  vendorId: varchar("vendor_id", { length: 36 }).notNull().references(() => vendors.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  status: text("status").notNull().default("invited"), // invited | opened | intends_to_bid | declined | submitted
  dueAt: timestamp("due_at"), // snapshot from opportunity.dueAt or bidProject deadline at invite time
  sentAt: timestamp("sent_at"),
  openedAt: timestamp("opened_at"),
  respondedAt: timestamp("responded_at"),
  submittedAt: timestamp("submitted_at"),
  lastActivityAt: timestamp("last_activity_at"),
  createdByUserId: varchar("created_by_user_id", { length: 36 }).references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  bidProjectIdx: index("bid_inv_project_idx").on(table.tenantId, table.bidProjectId),
  vendorIdx: index("bid_inv_vendor_idx").on(table.tenantId, table.vendorId),
  tokenHashIdx: index("bid_inv_token_hash_idx").on(table.tokenHash),
}));

export const bidInvitationEvents = pgTable("bid_invitation_events", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  invitationId: varchar("invitation_id", { length: 36 }).notNull().references(() => bidInvitations.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(), // opened | downloaded_doc | reminder_sent | intends | declined | submitted | draft_saved
  documentId: varchar("document_id", { length: 36 }).references(() => jacketDocuments.id),
  ip: text("ip"),
  userAgent: text("user_agent"),
  detailsJson: jsonb("details_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  invitationIdx: index("bid_inv_evt_invitation_idx").on(table.invitationId),
  eventTypeIdx: index("bid_inv_evt_type_idx").on(table.invitationId, table.eventType),
}));

export const vendorBidSubmissions = pgTable("vendor_bid_submissions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  invitationId: varchar("invitation_id", { length: 36 }).notNull().references(() => bidInvitations.id, { onDelete: "cascade" }),
  baseBidAmount: decimal("base_bid_amount", { precision: 15, scale: 2 }),
  alternatesJson: jsonb("alternates_json"), // [{name, amount, description}]
  allowancesJson: jsonb("allowances_json"), // [{name, amount}]
  exclusionsText: text("exclusions_text"),
  qualificationsText: text("qualifications_text"),
  attachmentsJson: jsonb("attachments_json"), // [{fileName, storageKey, size}]
  status: text("status").notNull().default("draft"), // draft | submitted | withdrawn
  submittedAt: timestamp("submitted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  invitationIdx: index("vendor_bid_sub_invitation_idx").on(table.invitationId),
}));

// Insert schemas
export const insertBidInvitationSchema = createInsertSchema(bidInvitations).omit({ id: true, createdAt: true, updatedAt: true });
export const insertBidInvitationEventSchema = createInsertSchema(bidInvitationEvents).omit({ id: true, createdAt: true });
export const insertVendorBidSubmissionSchema = createInsertSchema(vendorBidSubmissions).omit({ id: true, createdAt: true, updatedAt: true });

// Types
export type BidInvitation = typeof bidInvitations.$inferSelect;
export type InsertBidInvitation = z.infer<typeof insertBidInvitationSchema>;
export type BidInvitationEvent = typeof bidInvitationEvents.$inferSelect;
export type InsertBidInvitationEvent = z.infer<typeof insertBidInvitationEventSchema>;
export type VendorBidSubmission = typeof vendorBidSubmissions.$inferSelect;
export type InsertVendorBidSubmission = z.infer<typeof insertVendorBidSubmissionSchema>;

// Vendor-visible folder codes (allow-list, NOT deny-list)
export const VENDOR_VISIBLE_FOLDER_CODES = [
  "01", // Bid Request / Solicitation
  "02", // Drawings / Plans
  "03", // Specifications
  "04", // Addenda
  "06", // Estimating
  "07", // Proposal
  "09", // Bonds & Insurance
  "10", // Subcontracts
  "11", // Bid Form
  "12", // Submission Instructions
  "13", // Pre-Award
] as const;

// ============================================================================
// PHASE 3: COST-CODE STRUCTURED BIDDING + LEVELING
// ============================================================================

export const bidForms = pgTable("bid_forms", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  bidProjectId: varchar("bid_project_id", { length: 36 }).notNull().references(() => bidProjects.id, { onDelete: "cascade" }),
  version: integer("version").notNull().default(1),
  status: text("status").notNull().default("draft"), // draft | published | closed
  instructions: text("instructions"),
  allowUnitPricing: boolean("allow_unit_pricing").notNull().default(false),
  publishedAt: timestamp("published_at"),
  closedAt: timestamp("closed_at"),
  createdByUserId: varchar("created_by_user_id", { length: 36 }).references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  bidProjectIdx: index("bid_forms_project_idx").on(table.tenantId, table.bidProjectId),
}));

export const bidFormSections = pgTable("bid_form_sections", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  bidFormId: varchar("bid_form_id", { length: 36 }).notNull().references(() => bidForms.id, { onDelete: "cascade" }),
  sectionType: text("section_type").notNull().default("base"), // base | alternate | allowance | unit_price | other
  title: text("title").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isRequired: boolean("is_required").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  formIdx: index("bid_form_sections_form_idx").on(table.bidFormId),
}));

export const bidFormLineItems = pgTable("bid_form_line_items", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  bidFormSectionId: varchar("bid_form_section_id", { length: 36 }).notNull().references(() => bidFormSections.id, { onDelete: "cascade" }),
  costCodeId: varchar("cost_code_id", { length: 36 }).references(() => costCodes.id),
  itemCode: text("item_code"),
  description: text("description").notNull(),
  uom: text("uom"),
  qty: decimal("qty", { precision: 15, scale: 4 }),
  sortOrder: integer("sort_order").notNull().default(0),
  isRequired: boolean("is_required").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  sectionIdx: index("bid_form_items_section_idx").on(table.bidFormSectionId),
}));

export const bidResponses = pgTable("bid_responses", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  bidProjectId: varchar("bid_project_id", { length: 36 }).notNull().references(() => bidProjects.id, { onDelete: "cascade" }),
  bidFormId: varchar("bid_form_id", { length: 36 }).notNull().references(() => bidForms.id, { onDelete: "cascade" }),
  invitationId: varchar("invitation_id", { length: 36 }).notNull().references(() => bidInvitations.id, { onDelete: "cascade" }),
  vendorId: varchar("vendor_id", { length: 36 }).notNull().references(() => vendors.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("draft"), // draft | submitted | withdrawn
  submittedAt: timestamp("submitted_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  projectIdx: index("bid_responses_project_idx").on(table.tenantId, table.bidProjectId),
  invitationIdx: index("bid_responses_invitation_idx").on(table.invitationId),
}));

export const bidResponseLineItems = pgTable("bid_response_line_items", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  bidResponseId: varchar("bid_response_id", { length: 36 }).notNull().references(() => bidResponses.id, { onDelete: "cascade" }),
  bidFormLineItemId: varchar("bid_form_line_item_id", { length: 36 }).notNull().references(() => bidFormLineItems.id, { onDelete: "cascade" }),
  unitPrice: decimal("unit_price", { precision: 15, scale: 2 }),
  totalPrice: decimal("total_price", { precision: 15, scale: 2 }),
  included: boolean("included").notNull().default(true),
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  responseIdx: index("bid_resp_items_response_idx").on(table.bidResponseId),
  lineItemIdx: index("bid_resp_items_lineitem_idx").on(table.bidFormLineItemId),
}));

// Phase 4: Award → Contract
export const awardDecisions = pgTable("award_decisions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  bidProjectId: varchar("bid_project_id", { length: 36 }).notNull().references(() => bidProjects.id, { onDelete: "cascade" }),
  winningBidResponseId: varchar("winning_bid_response_id", { length: 36 }).notNull().references(() => bidResponses.id, { onDelete: "cascade" }),
  selectedAlternateIds: jsonb("selected_alternate_ids").notNull().default([]),
  awardSnapshotJson: jsonb("award_snapshot_json").notNull(),
  status: text("status").notNull().default("awarded"),
  notes: text("notes"),
  awardedAt: timestamp("awarded_at").defaultNow().notNull(),
  rescindedAt: timestamp("rescinded_at"),
  rescindReason: text("rescind_reason"),
  createdByUserId: varchar("created_by_user_id", { length: 36 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  projectIdx: index("award_decisions_project_idx").on(table.tenantId, table.bidProjectId),
  statusIdx: index("award_decisions_status_idx").on(table.tenantId, table.status),
}));

export const contractPackets = pgTable("contract_packets", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  awardDecisionId: varchar("award_decision_id", { length: 36 }).notNull().references(() => awardDecisions.id, { onDelete: "cascade" }),
  version: integer("version").notNull().default(1),
  storageKey: text("storage_key"),
  packetJson: jsonb("packet_json"),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  awardIdx: index("contract_packets_award_idx").on(table.awardDecisionId),
}));

// Insert schemas (Phase 3)
export const insertBidFormSchema = createInsertSchema(bidForms).omit({ id: true, createdAt: true, updatedAt: true });
export const insertBidFormSectionSchema = createInsertSchema(bidFormSections).omit({ id: true, createdAt: true });
export const insertBidFormLineItemSchema = createInsertSchema(bidFormLineItems).omit({ id: true, createdAt: true });
export const insertBidResponseSchema = createInsertSchema(bidResponses).omit({ id: true, createdAt: true, updatedAt: true });
export const insertBidResponseLineItemSchema = createInsertSchema(bidResponseLineItems).omit({ id: true, createdAt: true });

// Insert schemas (Phase 4)
export const insertAwardDecisionSchema = createInsertSchema(awardDecisions).omit({ id: true, createdAt: true, updatedAt: true });
export const insertContractPacketSchema = createInsertSchema(contractPackets).omit({ id: true, createdAt: true });

// Types (Phase 3)
export type BidForm = typeof bidForms.$inferSelect;
export type InsertBidForm = z.infer<typeof insertBidFormSchema>;
export type BidFormSection = typeof bidFormSections.$inferSelect;
export type InsertBidFormSection = z.infer<typeof insertBidFormSectionSchema>;
export type BidFormLineItem = typeof bidFormLineItems.$inferSelect;
export type InsertBidFormLineItem = z.infer<typeof insertBidFormLineItemSchema>;
export type BidResponse = typeof bidResponses.$inferSelect;
export type InsertBidResponse = z.infer<typeof insertBidResponseSchema>;
export type BidResponseLineItem = typeof bidResponseLineItems.$inferSelect;
export type InsertBidResponseLineItem = z.infer<typeof insertBidResponseLineItemSchema>;

// Types (Phase 4)
export type AwardDecision = typeof awardDecisions.$inferSelect;
export type InsertAwardDecision = z.infer<typeof insertAwardDecisionSchema>;
export type ContractPacket = typeof contractPackets.$inferSelect;
export type InsertContractPacket = z.infer<typeof insertContractPacketSchema>;

// ══════════════════════════════════════════════════════════════
// WORK PACKAGES — Enterprise-grade workflow engine
// ══════════════════════════════════════════════════════════════

export const workPackages = pgTable("work_packages", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  projectId: varchar("project_id", { length: 36 }),
  approvalRequestId: varchar("approval_request_id", { length: 36 }).references(() => approvalRequests.id),
  packageType: text("package_type").notNull(),
  status: text("status").notNull().default("pending"),
  priority: text("priority").notNull().default("normal"),
  summaryJson: jsonb("summary_json"),
  routingJson: jsonb("routing_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const workPackageTasks = pgTable("work_package_tasks", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  workPackageId: varchar("work_package_id", { length: 36 }).notNull().references(() => workPackages.id, { onDelete: "cascade" }),
  taskType: text("task_type").notNull(),
  status: text("status").notNull().default("ready"),
  ownerRole: text("owner_role").notNull().default("system"),
  blockedBy: jsonb("blocked_by").default([]),
  artifactsJson: jsonb("artifacts_json").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const workPackagesRelations = relations(workPackages, ({ one, many }) => ({
  tenant: one(tenants, { fields: [workPackages.tenantId], references: [tenants.id] }),
  approvalRequest: one(approvalRequests, { fields: [workPackages.approvalRequestId], references: [approvalRequests.id] }),
  tasks: many(workPackageTasks),
}));

export const workPackageTasksRelations = relations(workPackageTasks, ({ one }) => ({
  workPackage: one(workPackages, { fields: [workPackageTasks.workPackageId], references: [workPackages.id] }),
}));

export const insertWorkPackageSchema = createInsertSchema(workPackages).omit({ id: true, createdAt: true, updatedAt: true });
export const insertWorkPackageTaskSchema = createInsertSchema(workPackageTasks).omit({ id: true, createdAt: true, updatedAt: true });

export type WorkPackage = typeof workPackages.$inferSelect;
export type InsertWorkPackage = z.infer<typeof insertWorkPackageSchema>;
export type WorkPackageTask = typeof workPackageTasks.$inferSelect;
export type InsertWorkPackageTask = z.infer<typeof insertWorkPackageTaskSchema>;

export type WorkPackageStatus = "pending" | "in_progress" | "blocked" | "approved" | "rejected" | "done";
export type WorkPackageTaskStatus = "ready" | "blocked" | "in_progress" | "done" | "failed";
export type WorkPackagePriority = "normal" | "high" | "urgent";

export interface WorkPackageProject {
  id: string;
  name: string;
  client: string | null;
  naicsCode: string | null;
  setAside: string | null;
  stage: string | null;
  dueDate: string | null;
  estimatedValue: number | null;
}

export interface WorkPackageRisk {
  level: "low" | "medium" | "high" | "critical";
  score: number;
  flags: string[];
}

export interface WorkPackageImpact {
  financialDelta: number;
  scheduleImpactDays: number;
  downstreamWorkflows: string[];
}

export interface WorkPackageSummary {
  headline: string;
  why: string;
  risk: WorkPackageRisk;
  impact: WorkPackageImpact;
}

export interface WorkPackageArtifact {
  kind: "folder" | "document" | "classification" | "binder" | "form" | "compliance";
  name?: string;
  sortOrder?: number;
  required: boolean;
  docType?: string;
  section?: string;
}

export interface WorkPackageTaskData {
  taskId: string;
  taskType: string;
  status: WorkPackageTaskStatus;
  ownerRole: string;
  blockedBy: string[];
  artifacts: WorkPackageArtifact[];
}

export interface WorkPackageRouting {
  reviewUrl: string;
  projectUrl: string;
  batchKey: string;
}

export interface WorkPackageAudit {
  requestedBy: string;
  requestedAt: string;
}

export interface EnsureCanonicalResult {
  bidProjectId: string;
  expectedFolders: number;
  totalFolders: number;
  createdFolders: number;
  renamedFolders: number;
  missingSortOrders: number[];
  isHealthy: boolean;
  details: {
    created: string[];
    renamed: { from: string; to: string; sortOrder: number }[];
  };
}

export interface DecisionPacket {
  id: string;
  status: WorkPackageStatus;
  priority: WorkPackagePriority;
  category: string;
  actionType: string;
  entityType: string;
  entityId: string;
  project: WorkPackageProject;
  summary: WorkPackageSummary;
  tasks: WorkPackageTaskData[];
  missingArtifacts: string[];
  routing: WorkPackageRouting;
  audit: WorkPackageAudit;
}

// ============================================================================
// DASHBOARD LAYOUT PREFERENCES
// ============================================================================

export const userDashboardWidgets = pgTable("user_dashboard_widgets", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  userId: varchar("user_id", { length: 36 }).notNull(),
  widgetKey: text("widget_key").notNull(),
  isVisible: boolean("is_visible").default(true).notNull(),
  orderIndex: integer("order_index").notNull(),
  size: text("size").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  uniqUserWidget: uniqueIndex("uniq_user_widget").on(table.tenantId, table.userId, table.widgetKey),
}));

export const insertUserDashboardWidgetSchema = createInsertSchema(userDashboardWidgets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUserDashboardWidget = z.infer<typeof insertUserDashboardWidgetSchema>;
export type UserDashboardWidget = typeof userDashboardWidgets.$inferSelect;

// ============================================================================
// METRIC SNAPSHOTS (state-based KPI trend tracking)
// ============================================================================

export const metricSnapshots = pgTable("metric_snapshots", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  metricKey: text("metric_key").notNull(),
  metricValue: decimal("metric_value", { precision: 15, scale: 2 }).notNull().default("0"),
  isSeeded: boolean("is_seeded").default(false).notNull(),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  uniqSnapshot: uniqueIndex("uniq_metric_snapshot").on(table.tenantId, table.metricKey, table.periodStart, table.periodEnd),
  metricKeyIdx: index().on(table.tenantId, table.metricKey),
}));

export const insertMetricSnapshotSchema = createInsertSchema(metricSnapshots).omit({
  id: true,
  createdAt: true,
});

export type InsertMetricSnapshot = z.infer<typeof insertMetricSnapshotSchema>;
export type MetricSnapshot = typeof metricSnapshots.$inferSelect;

// ============================================================================
// COMPETITOR INTELLIGENCE
// ============================================================================

export const competitors = pgTable("competitors", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  name: text("name").notNull(),
  dunsNumber: text("duns_number"),
  cageCode: text("cage_code"),
  website: text("website"),
  notes: text("notes"),
  naicsCodes: text("naics_codes").array(),
  setAsideTypes: text("set_aside_types").array(),
  primaryAgencies: text("primary_agencies").array(),
  headquartersState: text("headquarters_state"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const competitorAwards = pgTable("competitor_awards", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  competitorId: varchar("competitor_id", { length: 36 }).notNull().references(() => competitors.id),
  contractNumber: text("contract_number"),
  agency: text("agency").notNull(),
  naicsCode: text("naics_code"),
  setAside: text("set_aside"),
  awardValue: decimal("award_value", { precision: 14, scale: 2 }),
  awardedAt: timestamp("awarded_at"),
  placeOfPerformance: text("place_of_performance"),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCompetitorSchema = createInsertSchema(competitors).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCompetitor = z.infer<typeof insertCompetitorSchema>;
export type Competitor = typeof competitors.$inferSelect;

export const insertCompetitorAwardSchema = createInsertSchema(competitorAwards).omit({ id: true, createdAt: true });
export type InsertCompetitorAward = z.infer<typeof insertCompetitorAwardSchema>;
export type CompetitorAward = typeof competitorAwards.$inferSelect;

// ============================================================================
// COMPLIANCE INTELLIGENCE
// ============================================================================

export const complianceItems = pgTable("compliance_items", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  bidProjectId: varchar("bid_project_id", { length: 36 }).notNull(),
  title: text("title").notNull(),
  clauseRef: text("clause_ref"),
  severity: text("severity").notNull(),
  status: text("status").notNull().default("missing"),
  folderSortOrder: integer("folder_sort_order"),
  ownerRole: text("owner_role"),
  dueAt: timestamp("due_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertComplianceItemSchema = createInsertSchema(complianceItems).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertComplianceItem = z.infer<typeof insertComplianceItemSchema>;
export type ComplianceItem = typeof complianceItems.$inferSelect;

// ============================================================================
// STRATEGIC PRICING INTELLIGENCE
// ============================================================================

export const bidPricingSnapshots = pgTable("bid_pricing_snapshots", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  bidProjectId: varchar("bid_project_id", { length: 36 }).notNull(),
  estimatedValue: decimal("estimated_value", { precision: 14, scale: 2 }),
  costBreakdown: jsonb("cost_breakdown"),
  marginPercent: decimal("margin_percent", { precision: 5, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const pricingHistory = pgTable("pricing_history", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  naicsCode: text("naics_code"),
  agency: text("agency"),
  region: text("region"),
  awardValue: decimal("award_value", { precision: 14, scale: 2 }),
  bidValue: decimal("bid_value", { precision: 14, scale: 2 }),
  outcome: text("outcome"),
  awardedAt: timestamp("awarded_at"),
  projectDescription: text("project_description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertBidPricingSnapshotSchema = createInsertSchema(bidPricingSnapshots).omit({ id: true, createdAt: true });
export type InsertBidPricingSnapshot = z.infer<typeof insertBidPricingSnapshotSchema>;
export type BidPricingSnapshot = typeof bidPricingSnapshots.$inferSelect;

export const insertPricingHistorySchema = createInsertSchema(pricingHistory).omit({ id: true, createdAt: true });
export type InsertPricingHistory = z.infer<typeof insertPricingHistorySchema>;
export type PricingHistory = typeof pricingHistory.$inferSelect;

// ============================================================================
// POST-AWARD TRANSITION
// ============================================================================

export const postAwardTransitions = pgTable("post_award_transitions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  bidProjectId: varchar("bid_project_id", { length: 36 }).notNull(),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  finalizedAt: timestamp("finalized_at"),
  notes: text("notes"),
});

export const transitionTasks = pgTable("transition_tasks", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  transitionId: varchar("transition_id", { length: 36 }).notNull().references(() => postAwardTransitions.id),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("pending"),
  assignedRole: text("assigned_role"),
  dueAt: timestamp("due_at"),
  completedAt: timestamp("completed_at"),
  orderIndex: integer("order_index").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPostAwardTransitionSchema = createInsertSchema(postAwardTransitions).omit({ id: true, createdAt: true });
export type InsertPostAwardTransition = z.infer<typeof insertPostAwardTransitionSchema>;
export type PostAwardTransition = typeof postAwardTransitions.$inferSelect;

export const insertTransitionTaskSchema = createInsertSchema(transitionTasks).omit({ id: true, createdAt: true });
export type InsertTransitionTask = z.infer<typeof insertTransitionTaskSchema>;
export type TransitionTask = typeof transitionTasks.$inferSelect;

// ============================================================================
// CAPTURE ENGINE (HigherGov Integration)
// ============================================================================

export const highergovRawArchive = pgTable("highergov_raw_archive", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  sourceType: text("source_type").notNull(),
  externalId: text("external_id").notNull(),
  hashSignature: text("hash_signature").notNull(),
  rawPayload: jsonb("raw_payload").notNull(),
  sourceUrl: text("source_url"),
  firstSeenAt: timestamp("first_seen_at").defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantSourceExternalIdx: unique().on(table.tenantId, table.sourceType, table.externalId),
}));

export const pipelineItems = pgTable("pipeline_items", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  entityType: text("entity_type").notNull(),
  entityId: varchar("entity_id", { length: 36 }).notNull(),
  stage: text("stage").notNull().default("new"),
  ownerUserId: varchar("owner_user_id", { length: 36 }).references(() => users.id),
  priority: text("priority").notNull().default("medium"),
  aiScore: integer("ai_score"),
  aiScoreLabel: text("ai_score_label"),
  aiRationale: text("ai_rationale"),
  aiSummary: text("ai_summary"),
  tags: text("tags").array(),
  nextActionAt: timestamp("next_action_at"),
  nextActionDescription: text("next_action_description"),
  lastActivityAt: timestamp("last_activity_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantStageIdx: index().on(table.tenantId, table.stage),
  tenantEntityIdx: unique().on(table.tenantId, table.entityType, table.entityId),
}));

export const capturePlans = pgTable("capture_plans", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  pipelineItemId: varchar("pipeline_item_id", { length: 36 }).notNull().references(() => pipelineItems.id, { onDelete: "cascade" }),
  winThemes: jsonb("win_themes"),
  risks: jsonb("risks"),
  teamingTargets: jsonb("teaming_targets"),
  timelineJson: jsonb("timeline_json"),
  competitorAnalysis: jsonb("competitor_analysis"),
  captureStrategy: text("capture_strategy"),
  notes: text("notes"),
  aiGenerated: boolean("ai_generated").default(false),
  evidenceLinks: jsonb("evidence_links"),
  confidenceScore: integer("confidence_score"),
  promptVersion: text("prompt_version"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const captureTasks = pgTable("capture_tasks", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  capturePlanId: varchar("capture_plan_id", { length: 36 }).notNull().references(() => capturePlans.id, { onDelete: "cascade" }),
  pipelineItemId: varchar("pipeline_item_id", { length: 36 }).notNull().references(() => pipelineItems.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  dueDate: timestamp("due_date"),
  ownerUserId: varchar("owner_user_id", { length: 36 }).references(() => users.id),
  status: text("status").notNull().default("pending"),
  aiGenerated: boolean("ai_generated").default(false),
  orderIndex: integer("order_index").default(0),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const outreachDrafts = pgTable("outreach_drafts", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  pipelineItemId: varchar("pipeline_item_id", { length: 36 }).notNull().references(() => pipelineItems.id, { onDelete: "cascade" }),
  draftType: text("draft_type").notNull(),
  audience: text("audience").notNull(),
  subject: text("subject"),
  body: text("body").notNull(),
  tone: text("tone").default("professional"),
  editableByUser: boolean("editable_by_user").default(true),
  aiGenerated: boolean("ai_generated").default(true),
  evidenceLinks: jsonb("evidence_links"),
  confidenceScore: integer("confidence_score"),
  promptVersion: text("prompt_version"),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const captureActivityLog = pgTable("capture_activity_log", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  entityType: text("entity_type").notNull(),
  entityId: varchar("entity_id", { length: 36 }).notNull(),
  actionType: text("action_type").notNull(),
  actorUserId: varchar("actor_user_id", { length: 36 }),
  actorType: text("actor_type").default("user"),
  detailsJson: jsonb("details_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantEntityIdx: index().on(table.tenantId, table.entityType, table.entityId),
}));

export const captureChangeEvents = pgTable("capture_change_events", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  sourceType: text("source_type").notNull(),
  externalId: text("external_id").notNull(),
  entityId: varchar("entity_id", { length: 36 }),
  changeType: text("change_type").notNull(),
  changeSummary: text("change_summary"),
  previousHash: text("previous_hash"),
  newHash: text("new_hash"),
  diffJson: jsonb("diff_json"),
  processed: boolean("processed").default(false),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantProcessedIdx: index().on(table.tenantId, table.processed),
}));

export const insertHighergovRawArchiveSchema = createInsertSchema(highergovRawArchive).omit({ id: true, createdAt: true });
export type InsertHighergovRawArchive = z.infer<typeof insertHighergovRawArchiveSchema>;
export type HighergovRawArchive = typeof highergovRawArchive.$inferSelect;

export const insertPipelineItemSchema = createInsertSchema(pipelineItems).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPipelineItem = z.infer<typeof insertPipelineItemSchema>;
export type PipelineItem = typeof pipelineItems.$inferSelect;

export const insertCapturePlanSchema = createInsertSchema(capturePlans).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCapturePlan = z.infer<typeof insertCapturePlanSchema>;
export type CapturePlan = typeof capturePlans.$inferSelect;

export const insertCaptureTaskSchema = createInsertSchema(captureTasks).omit({ id: true, createdAt: true });
export type InsertCaptureTask = z.infer<typeof insertCaptureTaskSchema>;
export type CaptureTask = typeof captureTasks.$inferSelect;

export const insertOutreachDraftSchema = createInsertSchema(outreachDrafts).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOutreachDraft = z.infer<typeof insertOutreachDraftSchema>;
export type OutreachDraft = typeof outreachDrafts.$inferSelect;

export const insertCaptureActivityLogSchema = createInsertSchema(captureActivityLog).omit({ id: true, createdAt: true });
export type InsertCaptureActivityLog = z.infer<typeof insertCaptureActivityLogSchema>;
export type CaptureActivityLog = typeof captureActivityLog.$inferSelect;

export const insertCaptureChangeEventSchema = createInsertSchema(captureChangeEvents).omit({ id: true, createdAt: true });
export type InsertCaptureChangeEvent = z.infer<typeof insertCaptureChangeEventSchema>;
export type CaptureChangeEvent = typeof captureChangeEvents.$inferSelect;

// ============================================================================
// AI ARTIFACT STORE
// ============================================================================

export const aiArtifacts = pgTable("ai_artifacts", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  entityType: text("entity_type").notNull(),
  entityId: varchar("entity_id", { length: 36 }).notNull(),
  artifactType: text("artifact_type").notNull(),
  payloadJson: jsonb("payload_json").notNull(),
  evidenceJson: jsonb("evidence_json"),
  confidence: integer("confidence"),
  modelVersion: text("model_version"),
  promptVersion: text("prompt_version"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantEntityArtifactIdx: index().on(table.tenantId, table.entityType, table.entityId, table.artifactType),
}));

export const insertAiArtifactSchema = createInsertSchema(aiArtifacts).omit({ id: true, createdAt: true });
export type InsertAiArtifact = z.infer<typeof insertAiArtifactSchema>;
export type AiArtifact = typeof aiArtifacts.$inferSelect;

// ============================================================================
// ENTITY EMBEDDINGS (for similarity search)
// ============================================================================

export const entityEmbeddings = pgTable("entity_embeddings", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  entityType: text("entity_type").notNull(),
  entityId: varchar("entity_id", { length: 36 }).notNull(),
  embeddingText: text("embedding_text").notNull(),
  embeddingVector: jsonb("embedding_vector"),
  modelVersion: text("model_version"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantEntityIdx: unique().on(table.tenantId, table.entityType, table.entityId),
}));

export const insertEntityEmbeddingSchema = createInsertSchema(entityEmbeddings).omit({ id: true, createdAt: true });
export type InsertEntityEmbedding = z.infer<typeof insertEntityEmbeddingSchema>;
export type EntityEmbedding = typeof entityEmbeddings.$inferSelect;

// ============================================================================
// PARTNER RECOMMENDATIONS & SHORTLIST
// ============================================================================

export const partnerRecommendations = pgTable("partner_recommendations", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  opportunityId: varchar("opportunity_id", { length: 36 }).notNull(),
  partnerName: text("partner_name").notNull(),
  partnerType: text("partner_type").notNull(),
  capabilities: text("capabilities").array(),
  relevanceScore: integer("relevance_score"),
  rationale: text("rationale"),
  contactInfo: jsonb("contact_info"),
  aiGenerated: boolean("ai_generated").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantOppIdx: index().on(table.tenantId, table.opportunityId),
}));

export const insertPartnerRecommendationSchema = createInsertSchema(partnerRecommendations).omit({ id: true, createdAt: true });
export type InsertPartnerRecommendation = z.infer<typeof insertPartnerRecommendationSchema>;
export type PartnerRecommendation = typeof partnerRecommendations.$inferSelect;

export const partnerShortlist = pgTable("partner_shortlist", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  opportunityId: varchar("opportunity_id", { length: 36 }).notNull(),
  recommendationId: varchar("recommendation_id", { length: 36 }).references(() => partnerRecommendations.id, { onDelete: "cascade" }),
  partnerName: text("partner_name").notNull(),
  status: text("status").notNull().default("shortlisted"),
  notes: text("notes"),
  outreachDraftId: varchar("outreach_draft_id", { length: 36 }),
  addedAt: timestamp("added_at").defaultNow().notNull(),
}, (table) => ({
  tenantOppPartnerIdx: unique().on(table.tenantId, table.opportunityId, table.partnerName),
}));

export const insertPartnerShortlistSchema = createInsertSchema(partnerShortlist).omit({ id: true, addedAt: true });
export type InsertPartnerShortlist = z.infer<typeof insertPartnerShortlistSchema>;
export type PartnerShortlist = typeof partnerShortlist.$inferSelect;

// ============================================================================
// AGENCY BUYING PROFILES
// ============================================================================

export const agencyProfiles = pgTable("agency_profiles", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  agencyName: text("agency_name").notNull(),
  agencySlug: text("agency_slug").notNull(),
  profileJson: jsonb("profile_json").notNull(),
  topNaics: text("top_naics").array(),
  topPsc: text("top_psc").array(),
  topVendors: jsonb("top_vendors"),
  spendingTrends: jsonb("spending_trends"),
  aiGenerated: boolean("ai_generated").default(true),
  lastRefreshedAt: timestamp("last_refreshed_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantAgencySlugIdx: unique().on(table.tenantId, table.agencySlug),
}));

export const insertAgencyProfileSchema = createInsertSchema(agencyProfiles).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAgencyProfile = z.infer<typeof insertAgencyProfileSchema>;
export type AgencyProfile = typeof agencyProfiles.$inferSelect;

// ============================================================================
// COMPETITOR PRESSURE INDEX
// ============================================================================

export const competitorPressure = pgTable("competitor_pressure", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  opportunityId: varchar("opportunity_id", { length: 36 }).notNull(),
  pressureLevel: text("pressure_level").notNull(),
  pressureScore: integer("pressure_score").notNull(),
  competitorCount: integer("competitor_count"),
  topCompetitors: jsonb("top_competitors"),
  analysisJson: jsonb("analysis_json"),
  rationale: text("rationale"),
  aiGenerated: boolean("ai_generated").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantOppIdx: unique().on(table.tenantId, table.opportunityId),
}));

export const insertCompetitorPressureSchema = createInsertSchema(competitorPressure).omit({ id: true, createdAt: true });
export type InsertCompetitorPressure = z.infer<typeof insertCompetitorPressureSchema>;
export type CompetitorPressure = typeof competitorPressure.$inferSelect;

// ============================================================================
// WIN PROBABILITY & NEXT BEST ACTIONS
// ============================================================================

export const winProbability = pgTable("win_probability", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  pipelineItemId: varchar("pipeline_item_id", { length: 36 }).notNull().references(() => pipelineItems.id, { onDelete: "cascade" }),
  opportunityId: varchar("opportunity_id", { length: 36 }).notNull(),
  probability: decimal("probability", { precision: 5, scale: 4 }).notNull(),
  confidenceLevel: text("confidence_level"),
  factors: jsonb("factors"),
  nextActions: jsonb("next_actions"),
  expectedLift: jsonb("expected_lift"),
  modelVersion: text("model_version"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantPipelineIdx: index().on(table.tenantId, table.pipelineItemId),
}));

export const insertWinProbabilitySchema = createInsertSchema(winProbability).omit({ id: true, createdAt: true });
export type InsertWinProbability = z.infer<typeof insertWinProbabilitySchema>;
export type WinProbability = typeof winProbability.$inferSelect;

// ============================================================================
// AUTOMATION RULES ENGINE
// ============================================================================

export const automationRules = pgTable("automation_rules", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  triggerType: text("trigger_type").notNull(),
  triggerConfig: jsonb("trigger_config"),
  actionType: text("action_type").notNull(),
  actionConfig: jsonb("action_config"),
  enabled: boolean("enabled").notNull().default(true),
  runCount: integer("run_count").notNull().default(0),
  lastRunAt: timestamp("last_run_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantTriggerIdx: index().on(table.tenantId, table.triggerType),
}));

export const insertAutomationRuleSchema = createInsertSchema(automationRules).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAutomationRule = z.infer<typeof insertAutomationRuleSchema>;
export type AutomationRule = typeof automationRules.$inferSelect;

export const automationRuns = pgTable("automation_runs", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  ruleId: varchar("rule_id", { length: 36 }).notNull().references(() => automationRules.id, { onDelete: "cascade" }),
  triggerEntityType: text("trigger_entity_type"),
  triggerEntityId: varchar("trigger_entity_id", { length: 36 }),
  status: text("status").notNull().default("running"),
  resultJson: jsonb("result_json"),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
}, (table) => ({
  tenantRuleIdx: index().on(table.tenantId, table.ruleId),
}));

export const insertAutomationRunSchema = createInsertSchema(automationRuns).omit({ id: true, startedAt: true });
export type InsertAutomationRun = z.infer<typeof insertAutomationRunSchema>;
export type AutomationRun = typeof automationRuns.$inferSelect;

// ============================================================================
// V4 CAPTURE OS TABLES
// ============================================================================

export const opportunitySources = pgTable("opportunity_sources", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  opportunityId: varchar("opportunity_id", { length: 36 }).notNull().references(() => opportunities.id),
  source: text("source").notNull(),
  externalId: text("external_id").notNull(),
  sourceUrl: text("source_url"),
  sourceHashSignature: text("source_hash_signature"),
  solicitationNumber: text("solicitation_number"),
  noticeType: text("notice_type"),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantSourceExternalIdx: unique().on(table.tenantId, table.source, table.externalId),
}));

export const insertOpportunitySourceSchema = createInsertSchema(opportunitySources).omit({ id: true, createdAt: true });
export type InsertOpportunitySource = z.infer<typeof insertOpportunitySourceSchema>;
export type OpportunitySource = typeof opportunitySources.$inferSelect;

// ============================================================================
// OPPORTUNITY DECISIONS
// ============================================================================

export const opportunityDecisions = pgTable("opportunity_decisions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  opportunityId: varchar("opportunity_id", { length: 36 }).notNull().references(() => opportunities.id, { onDelete: "cascade" }),
  decision: text("decision").notNull(),
  fitScore: integer("fit_score").default(0),
  riskLevel: text("risk_level").default("medium"),
  leadDays: integer("lead_days"),
  explanation: text("explanation"),
  factorBreakdown: jsonb("factor_breakdown"),
  aiConfidence: integer("ai_confidence"),
  decidedBy: text("decided_by").default("herbie"),
  decidedAt: timestamp("decided_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantOppIdx: unique().on(table.tenantId, table.opportunityId),
}));

export const insertOpportunityDecisionSchema = createInsertSchema(opportunityDecisions).omit({ id: true, createdAt: true });
export type InsertOpportunityDecision = z.infer<typeof insertOpportunityDecisionSchema>;
export type OpportunityDecision = typeof opportunityDecisions.$inferSelect;

// ============================================================================
// V4 BIDS
// ============================================================================

export const v4Bids = pgTable("v4_bids", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  bidCode: text("bid_code").notNull(),
  name: text("name").notNull(),
  opportunityId: varchar("opportunity_id", { length: 36 }).references(() => opportunities.id),
  source: text("source").default("manual"),
  agencyName: text("agency_name"),
  dueDate: timestamp("due_date"),
  stage: text("stage").default("intake"),
  readiness: text("readiness").default("blocked"),
  ownerUserId: text("owner_user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantBidCodeIdx: unique().on(table.tenantId, table.bidCode),
  tenantStageIdx: index().on(table.tenantId, table.stage),
  tenantDueDateIdx: index().on(table.tenantId, table.dueDate),
}));

export const insertV4BidSchema = createInsertSchema(v4Bids).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertV4Bid = z.infer<typeof insertV4BidSchema>;
export type V4Bid = typeof v4Bids.$inferSelect;

// ============================================================================
// BID READINESS SNAPSHOTS
// ============================================================================

export const bidReadinessSnapshots = pgTable("bid_readiness_snapshots", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  bidId: varchar("bid_id", { length: 36 }).notNull().references(() => v4Bids.id, { onDelete: "cascade" }),
  readiness: text("readiness"),
  readinessScore: integer("readiness_score").default(0),
  missingItems: text("missing_items").array(),
  missingDocs: text("missing_docs").array(),
  incompleteTasksCount: integer("incomplete_tasks_count").default(0),
  lastComputedAt: timestamp("last_computed_at"),
}, (table) => ({
  tenantBidIdx: unique().on(table.tenantId, table.bidId),
}));

export const insertBidReadinessSnapshotSchema = createInsertSchema(bidReadinessSnapshots).omit({ id: true });
export type InsertBidReadinessSnapshot = z.infer<typeof insertBidReadinessSnapshotSchema>;
export type BidReadinessSnapshot = typeof bidReadinessSnapshots.$inferSelect;

// ============================================================================
// V4 BID DOCUMENTS
// ============================================================================

export const v4BidDocuments = pgTable("v4_bid_documents", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  bidId: varchar("bid_id", { length: 36 }).notNull().references(() => v4Bids.id, { onDelete: "cascade" }),
  docType: text("doc_type").default("other"),
  title: text("title"),
  folderPath: text("folder_path"),
  sourceUrl: text("source_url"),
  source: text("source").default("manual"),
  externalId: text("external_id"),
  storageProvider: text("storage_provider").default("db"),
  storageKey: text("storage_key"),
  sha256: text("sha256"),
  fileSize: integer("file_size"),
  mimeType: text("mime_type"),
  extractedJson: jsonb("extracted_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantBidIdx: index().on(table.tenantId, table.bidId),
}));

export const insertV4BidDocumentSchema = createInsertSchema(v4BidDocuments).omit({ id: true, createdAt: true });
export type InsertV4BidDocument = z.infer<typeof insertV4BidDocumentSchema>;
export type V4BidDocument = typeof v4BidDocuments.$inferSelect;

// ============================================================================
// V4 BID TASKS
// ============================================================================

export const v4BidTasks = pgTable("v4_bid_tasks", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  bidId: varchar("bid_id", { length: 36 }).notNull().references(() => v4Bids.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").default("todo"),
  isBlocker: boolean("is_blocker").default(false),
  ownerUserId: text("owner_user_id"),
  dueDate: timestamp("due_date"),
  source: text("source").default("manual"),
  tags: text("tags").array(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantBidStatusIdx: index().on(table.tenantId, table.bidId, table.status),
}));

export const insertV4BidTaskSchema = createInsertSchema(v4BidTasks).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertV4BidTask = z.infer<typeof insertV4BidTaskSchema>;
export type V4BidTask = typeof v4BidTasks.$inferSelect;

// ============================================================================
// PARTNERS
// ============================================================================

export const partners = pgTable("partners", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  name: text("name").notNull(),
  capabilities: text("capabilities"),
  naics: text("naics").array(),
  trades: text("trades").array(),
  regions: text("regions").array(),
  contactJson: jsonb("contact_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPartnerSchema = createInsertSchema(partners).omit({ id: true, createdAt: true });
export type InsertPartner = z.infer<typeof insertPartnerSchema>;
export type Partner = typeof partners.$inferSelect;

// ============================================================================
// BID PARTNERS
// ============================================================================

export const bidPartners = pgTable("bid_partners", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  bidId: varchar("bid_id", { length: 36 }).notNull().references(() => v4Bids.id, { onDelete: "cascade" }),
  partnerId: varchar("partner_id", { length: 36 }).notNull().references(() => partners.id, { onDelete: "cascade" }),
  role: text("role"),
  fitScore: integer("fit_score").default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantBidPartnerIdx: unique().on(table.tenantId, table.bidId, table.partnerId),
}));

export const insertBidPartnerSchema = createInsertSchema(bidPartners).omit({ id: true, createdAt: true });
export type InsertBidPartner = z.infer<typeof insertBidPartnerSchema>;
export type BidPartner = typeof bidPartners.$inferSelect;

// ============================================================================
// V4 BID OUTREACH DRAFTS
// ============================================================================

export const v4BidOutreachDrafts = pgTable("v4_bid_outreach_drafts", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  bidId: varchar("bid_id", { length: 36 }).notNull().references(() => v4Bids.id, { onDelete: "cascade" }),
  draftType: text("draft_type"),
  subject: text("subject"),
  body: text("body"),
  targetJson: jsonb("target_json"),
  createdBy: text("created_by").default("herbie"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertV4BidOutreachDraftSchema = createInsertSchema(v4BidOutreachDrafts).omit({ id: true, createdAt: true });
export type InsertV4BidOutreachDraft = z.infer<typeof insertV4BidOutreachDraftSchema>;
export type V4BidOutreachDraft = typeof v4BidOutreachDrafts.$inferSelect;

// ============================================================================
// V4 BID SUBMISSIONS
// ============================================================================

export const v4BidSubmissions = pgTable("v4_bid_submissions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  bidId: varchar("bid_id", { length: 36 }).notNull().references(() => v4Bids.id, { onDelete: "cascade" }),
  status: text("status").default("not_started"),
  submittedAt: timestamp("submitted_at"),
  method: text("method"),
  confirmationId: text("confirmation_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertV4BidSubmissionSchema = createInsertSchema(v4BidSubmissions).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertV4BidSubmission = z.infer<typeof insertV4BidSubmissionSchema>;
export type V4BidSubmission = typeof v4BidSubmissions.$inferSelect;

// ============================================================================
// FIT PROFILES V4
// ============================================================================

export const fitProfilesV4 = pgTable("fit_profiles_v4", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  name: text("name").notNull(),
  isActive: boolean("is_active").default(true),
  minLeadDays: integer("min_lead_days").default(30),
  pursueThreshold: integer("pursue_threshold").default(85),
  maybeThreshold: integer("maybe_threshold").default(65),
  allowedStates: text("allowed_states").array(),
  excludedKeywords: text("excluded_keywords").array(),
  includedKeywords: text("included_keywords").array(),
  includeNaics: text("include_naics").array(),
  excludeNaics: text("exclude_naics").array(),
  includePsc: text("include_psc").array(),
  excludePsc: text("exclude_psc").array(),
  preferredAgencies: text("preferred_agencies").array(),
  excludedAgencies: text("excluded_agencies").array(),
  setAsidePreferences: text("set_aside_preferences").array(),
  vehicleConstraints: text("vehicle_constraints").array(),
  scoringWeights: jsonb("scoring_weights"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertFitProfileV4Schema = createInsertSchema(fitProfilesV4).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFitProfileV4 = z.infer<typeof insertFitProfileV4Schema>;
export type FitProfileV4 = typeof fitProfilesV4.$inferSelect;

// ============================================================================
// ORG MEMORY (T2-A) — ORGANIZATIONAL KNOWLEDGE BASE
// ============================================================================

export const orgMemoryItems = pgTable(
  "org_memory_items",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    body: text("body").notNull().default(""),
    category: text("category").notNull().default("general"),
    sensitivity: text("sensitivity").notNull().default("internal"),
    status: text("status").notNull().default("draft"),
    requiresApproval: boolean("requires_approval").notNull().default(true),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: varchar("approved_by", { length: 36 }),
    tagsJson: jsonb("tags_json").notNull().default([]),
    metaJson: jsonb("meta_json").notNull().default({}),
    searchText: text("search_text").notNull().default(""),
    createdBy: varchar("created_by", { length: 36 }),
    updatedBy: varchar("updated_by", { length: 36 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("org_memory_items_tenant_idx").on(t.tenantId),
    statusIdx: index("org_memory_items_status_idx").on(t.status),
    categoryIdx: index("org_memory_items_category_idx").on(t.category),
  })
);

export const insertOrgMemoryItemSchema = createInsertSchema(orgMemoryItems).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrgMemoryItem = z.infer<typeof insertOrgMemoryItemSchema>;
export type OrgMemoryItem = typeof orgMemoryItems.$inferSelect;

export const orgMemoryEntityLinks = pgTable(
  "org_memory_entity_links",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    memoryItemId: varchar("memory_item_id", { length: 36 }).notNull(),
    entityType: text("entity_type").notNull(),
    entityId: varchar("entity_id", { length: 36 }).notNull(),
    role: text("role").notNull().default("reference"),
    createdBy: varchar("created_by", { length: 36 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniq: uniqueIndex("org_memory_entity_links_uniq").on(
      t.tenantId, t.memoryItemId, t.entityType, t.entityId, t.role
    ),
    tenantEntityIdx: index("org_memory_entity_links_tenant_entity_idx").on(
      t.tenantId, t.entityType, t.entityId
    ),
    tenantMemIdx: index("org_memory_entity_links_tenant_mem_idx").on(t.tenantId, t.memoryItemId),
  })
);

export const insertOrgMemoryEntityLinkSchema = createInsertSchema(orgMemoryEntityLinks).omit({ id: true, createdAt: true });
export type InsertOrgMemoryEntityLink = z.infer<typeof insertOrgMemoryEntityLinkSchema>;
export type OrgMemoryEntityLink = typeof orgMemoryEntityLinks.$inferSelect;

export const orgMemoryApprovals = pgTable(
  "org_memory_approvals",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    memoryItemId: varchar("memory_item_id", { length: 36 }).notNull(),
    proposedTitle: text("proposed_title").notNull(),
    proposedSummary: text("proposed_summary").notNull().default(""),
    proposedBody: text("proposed_body").notNull().default(""),
    proposedCategory: text("proposed_category").notNull().default("general"),
    proposedSensitivity: text("proposed_sensitivity").notNull().default("internal"),
    proposedTagsJson: jsonb("proposed_tags_json").notNull().default([]),
    proposedMetaJson: jsonb("proposed_meta_json").notNull().default({}),
    status: text("status").notNull().default("pending"),
    reviewerNote: text("reviewer_note"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: varchar("reviewed_by", { length: 36 }),
    createdBy: varchar("created_by", { length: 36 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("org_memory_approvals_tenant_idx").on(t.tenantId),
    memIdx: index("org_memory_approvals_mem_idx").on(t.memoryItemId),
    statusIdx: index("org_memory_approvals_status_idx").on(t.status),
  })
);

export const insertOrgMemoryApprovalSchema = createInsertSchema(orgMemoryApprovals).omit({ id: true, createdAt: true });
export type InsertOrgMemoryApproval = z.infer<typeof insertOrgMemoryApprovalSchema>;
export type OrgMemoryApproval = typeof orgMemoryApprovals.$inferSelect;

// ============================================================================
// UNIFIED OPS CORE: Entity Graph + Event Bus + Autofill Engine
// ============================================================================

export const entityLinks = pgTable(
  "entity_links",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: varchar("source_id", { length: 36 }).notNull(),
    targetType: text("target_type").notNull(),
    targetId: varchar("target_id", { length: 36 }).notNull(),
    relationLabel: text("relation_label").notNull().default("related"),
    metadata: jsonb("metadata").default({}),
    createdBy: varchar("created_by", { length: 36 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("entity_links_tenant_idx").on(t.tenantId),
    sourceIdx: index("entity_links_source_idx").on(t.tenantId, t.sourceType, t.sourceId),
    targetIdx: index("entity_links_target_idx").on(t.tenantId, t.targetType, t.targetId),
    uniq: uniqueIndex("entity_links_uniq").on(t.tenantId, t.sourceType, t.sourceId, t.targetType, t.targetId, t.relationLabel),
  })
);

export const insertEntityLinkSchema = createInsertSchema(entityLinks).omit({ id: true, createdAt: true });
export type InsertEntityLink = z.infer<typeof insertEntityLinkSchema>;
export type EntityLink = typeof entityLinks.$inferSelect;

export const ENTITY_TYPES = [
  "opportunity", "bid_project", "project", "company", "vendor", "subcontractor",
  "contact", "document", "purchase_order", "invoice", "change_order",
  "work_package", "takeoff_item", "blueprint", "compliance_item", "ticket",
  "org_memory_item", "task", "rfi",
] as const;
export type EntityType = typeof ENTITY_TYPES[number];

export const events = pgTable(
  "events",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    eventType: text("event_type").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: varchar("entity_id", { length: 36 }).notNull(),
    payload: jsonb("payload").notNull().default({}),
    triggeredBy: varchar("triggered_by", { length: 36 }),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("events_tenant_idx").on(t.tenantId),
    typeIdx: index("events_type_idx").on(t.tenantId, t.eventType),
    entityIdx: index("events_entity_idx").on(t.tenantId, t.entityType, t.entityId),
    createdIdx: index("events_created_idx").on(t.createdAt),
  })
);

export const insertEventSchema = createInsertSchema(events).omit({ id: true, createdAt: true, processedAt: true });
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type OpsEvent = typeof events.$inferSelect;

export const EVENT_TYPES = [
  "OpportunityCreated", "OpportunityScored", "OpportunityWon", "OpportunityLost",
  "BidCreated", "BidSubmitted", "BidAwarded",
  "SolicitationParsed", "ComplianceMatrixGenerated",
  "TakeoffCreated", "TakeoffUpdated", "TakeoffDelta", "TakeoffFinalized",
  "ProjectCreated", "ProjectKickoff", "ProjectCompleted",
  "POCreated", "POApproved", "POIssued",
  "InvoiceCreated", "InvoiceSent", "InvoiceApproved",
  "ChangeOrderDrafted", "ChangeOrderApproved", "ChangeOrderRejected",
  "DocumentUploaded", "DocumentCategorized",
  "RFICreated", "RFIAnswered", "RFIOverdue",
  "TaskCreated", "TaskCompleted", "TaskOverdue",
  "AutofillExecuted", "WorkflowTriggered",
] as const;
export type EventType = typeof EVENT_TYPES[number];

export const eventOutbox = pgTable(
  "event_outbox",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    eventId: varchar("event_id", { length: 36 }).notNull(),
    handlerName: text("handler_name").notNull(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index("event_outbox_status_idx").on(t.status),
    eventIdx: index("event_outbox_event_idx").on(t.eventId),
  })
);

export const insertEventOutboxSchema = createInsertSchema(eventOutbox).omit({ id: true, createdAt: true, processedAt: true });
export type InsertEventOutbox = z.infer<typeof insertEventOutboxSchema>;
export type EventOutboxEntry = typeof eventOutbox.$inferSelect;

export const autofillRules = pgTable(
  "autofill_rules",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    name: text("name").notNull(),
    description: text("description"),
    ruleType: text("rule_type").notNull().default("deterministic"),
    sourceEntityType: text("source_entity_type").notNull(),
    targetEntityType: text("target_entity_type").notNull(),
    fieldMappings: jsonb("field_mappings").notNull().default([]),
    conditions: jsonb("conditions").default({}),
    priority: integer("priority").notNull().default(100),
    isActive: boolean("is_active").notNull().default(true),
    requiresConfirmation: boolean("requires_confirmation").notNull().default(false),
    createdBy: varchar("created_by", { length: 36 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("autofill_rules_tenant_idx").on(t.tenantId),
    typeIdx: index("autofill_rules_type_idx").on(t.tenantId, t.sourceEntityType, t.targetEntityType),
  })
);

export const insertAutofillRuleSchema = createInsertSchema(autofillRules).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAutofillRule = z.infer<typeof insertAutofillRuleSchema>;
export type AutofillRule = typeof autofillRules.$inferSelect;

export const AUTOFILL_RULE_TYPES = ["deterministic", "rule_based", "ai_suggested"] as const;
export type AutofillRuleType = typeof AUTOFILL_RULE_TYPES[number];

export const autofillRuns = pgTable(
  "autofill_runs",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    ruleId: varchar("rule_id", { length: 36 }).references(() => autofillRules.id),
    eventId: varchar("event_id", { length: 36 }).references(() => events.id),
    sourceEntityType: text("source_entity_type").notNull(),
    sourceEntityId: varchar("source_entity_id", { length: 36 }).notNull(),
    targetEntityType: text("target_entity_type").notNull(),
    targetEntityId: varchar("target_entity_id", { length: 36 }).notNull(),
    fieldsApplied: jsonb("fields_applied").notNull().default({}),
    status: text("status").notNull().default("applied"),
    confirmedBy: varchar("confirmed_by", { length: 36 }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("autofill_runs_tenant_idx").on(t.tenantId),
    sourceIdx: index("autofill_runs_source_idx").on(t.tenantId, t.sourceEntityType, t.sourceEntityId),
    targetIdx: index("autofill_runs_target_idx").on(t.tenantId, t.targetEntityType, t.targetEntityId),
    eventIdx: index("autofill_runs_event_idx").on(t.eventId),
  })
);

export const insertAutofillRunSchema = createInsertSchema(autofillRuns).omit({ id: true, createdAt: true });
export type InsertAutofillRun = z.infer<typeof insertAutofillRunSchema>;
export type AutofillRun = typeof autofillRuns.$inferSelect;

// ============================================================================
// ENTITY WATCHERS
// ============================================================================

export const entityWatchers = pgTable(
  "entity_watchers",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().default("blackhawk-default"),
    entityType: text("entity_type").notNull(),
    entityId: varchar("entity_id", { length: 36 }).notNull(),
    userId: varchar("user_id", { length: 36 }).notNull(),
    name: text("name"),
    email: text("email"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    entityIdx: index("entity_watchers_entity_idx").on(t.tenantId, t.entityType, t.entityId),
    uniqueWatcher: unique("entity_watchers_unique").on(t.tenantId, t.entityType, t.entityId, t.userId),
  })
);

export const insertEntityWatcherSchema = createInsertSchema(entityWatchers).omit({ id: true, createdAt: true });
export type InsertEntityWatcher = z.infer<typeof insertEntityWatcherSchema>;
export type EntityWatcher = typeof entityWatchers.$inferSelect;

// ============================================================================
// ENTITY ATTACHMENTS
// ============================================================================

export const entityAttachments = pgTable(
  "entity_attachments",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().default("blackhawk-default"),
    entityType: text("entity_type").notNull(),
    entityId: varchar("entity_id", { length: 36 }).notNull(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type"),
    size: integer("size"),
    storagePath: text("storage_path"),
    note: text("note"),
    uploadedBy: varchar("uploaded_by", { length: 36 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    entityIdx: index("entity_attachments_entity_idx").on(t.tenantId, t.entityType, t.entityId),
  })
);

export const insertEntityAttachmentSchema = createInsertSchema(entityAttachments).omit({ id: true, createdAt: true });
export type InsertEntityAttachment = z.infer<typeof insertEntityAttachmentSchema>;

export const projectImportLogs = pgTable("project_import_logs", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  fileName: text("file_name").notNull(),
  importedAt: timestamp("imported_at").defaultNow().notNull(),
  totalRows: integer("total_rows").notNull().default(0),
  insertedCount: integer("inserted_count").notNull().default(0),
  updatedCount: integer("updated_count").notNull().default(0),
  skippedCount: integer("skipped_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  errorSummary: text("error_summary"),
});

export const projectImportLogRows = pgTable("project_import_log_rows", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  importLogId: varchar("import_log_id", { length: 36 }).notNull().references(() => projectImportLogs.id, { onDelete: "cascade" }),
  rowNumber: integer("row_number").notNull(),
  projectKey: text("project_key").notNull(),
  action: text("action").notNull(),
  error: text("error"),
});
export type EntityAttachment = typeof entityAttachments.$inferSelect;

// ── Project Checklist System ─────────────────────────────────
export const checklistTemplates = pgTable("checklist_templates", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const checklistTemplateItems = pgTable("checklist_template_items", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  templateId: varchar("template_id", { length: 36 }).notNull().references(() => checklistTemplates.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  defaultOrder: integer("default_order").notNull().default(0),
  defaultRole: text("default_role"),
  defaultDueOffsetDays: integer("default_due_offset_days"),
});

export const projectChecklists = pgTable("project_checklists", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  projectId: varchar("project_id", { length: 36 }).notNull(),
  templateId: varchar("template_id", { length: 36 }).references(() => checklistTemplates.id),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const projectChecklistItems = pgTable("project_checklist_items", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  checklistId: varchar("checklist_id", { length: 36 }).notNull().references(() => projectChecklists.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("not_started"),
  ownerUserId: varchar("owner_user_id", { length: 36 }),
  dueDate: timestamp("due_date"),
  completedAt: timestamp("completed_at"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const insertChecklistTemplateSchema = createInsertSchema(checklistTemplates).omit({ id: true, createdAt: true });
export const insertChecklistTemplateItemSchema = createInsertSchema(checklistTemplateItems).omit({ id: true });
export const insertProjectChecklistSchema = createInsertSchema(projectChecklists).omit({ id: true, createdAt: true });
export const insertProjectChecklistItemSchema = createInsertSchema(projectChecklistItems).omit({ id: true });

export type ChecklistTemplate = typeof checklistTemplates.$inferSelect;
export type ChecklistTemplateItem = typeof checklistTemplateItems.$inferSelect;
export type ProjectChecklist = typeof projectChecklists.$inferSelect;
export type ProjectChecklistItem = typeof projectChecklistItems.$inferSelect;

// ── HigherGov Persistent Sync ────────────────────────────────
export const highergovOpportunities = pgTable("highergov_opportunities", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  source: text("source").notNull().default("highergov"),
  noticeId: text("notice_id").notNull(),
  solicitationNumber: text("solicitation_number"),
  title: text("title").notNull(),
  agency: text("agency"),
  subAgency: text("sub_agency"),
  postedAt: timestamp("posted_at"),
  dueAt: timestamp("due_at"),
  url: text("url"),
  naicsCode: text("naics_code"),
  setAside: text("set_aside"),
  estimatedValue: decimal("estimated_value", { precision: 14, scale: 2 }),
  placeOfPerformance: text("place_of_performance"),
  status: text("status").notNull().default("new"),
  score: integer("score").notNull().default(0),
  rawPayloadJson: jsonb("raw_payload_json").notNull().default(sql`'{}'::jsonb`),
  convertedToOpportunityId: varchar("converted_to_opportunity_id", { length: 36 }),
  bidProjectId: varchar("bid_project_id", { length: 36 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  noticeIdx: unique().on(table.tenantId, table.source, table.noticeId),
  dueIdx: index("hg_opps_due_idx").on(table.dueAt),
  statusIdx: index("hg_opps_status_idx").on(table.status),
  scoreIdx: index("hg_opps_score_idx").on(table.score),
}));

export const highergovSyncRuns = pgTable("highergov_sync_runs", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  source: text("source").notNull().default("highergov"),
  mode: text("mode").notNull().default("nightly"),
  status: text("status").notNull().default("running"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  finishedAt: timestamp("finished_at"),
  fetchedCount: integer("fetched_count").notNull().default(0),
  insertedCount: integer("inserted_count").notNull().default(0),
  updatedCount: integer("updated_count").notNull().default(0),
  errorCount: integer("error_count").notNull().default(0),
  errorsJson: jsonb("errors_json").notNull().default(sql`'[]'::jsonb`),
  lastCursor: text("last_cursor"),
  errorLogText: text("error_log_text"),
});

export const highergovWatchProfiles = pgTable("highergov_watch_profiles", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  naicsCsv: text("naics_csv").notNull().default(""),
  keywordsCsv: text("keywords_csv").notNull().default(""),
  agenciesCsv: text("agencies_csv").notNull().default(""),
  statesCsv: text("states_csv").notNull().default(""),
  minValue: decimal("min_value", { precision: 14, scale: 2 }).notNull().default("0.00"),
  maxValue: decimal("max_value", { precision: 14, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("hg_watch_profiles_tenant_idx").on(table.tenantId),
}));

export const insertHighergovOpportunitySchema = createInsertSchema(highergovOpportunities).omit({ id: true, createdAt: true, updatedAt: true });
export const insertHighergovSyncRunSchema = createInsertSchema(highergovSyncRuns).omit({ id: true });
export const insertHighergovWatchProfileSchema = createInsertSchema(highergovWatchProfiles).omit({ id: true, createdAt: true, updatedAt: true });

export type HighergovOpportunity = typeof highergovOpportunities.$inferSelect;
export type HighergovSyncRun = typeof highergovSyncRuns.$inferSelect;
export type HighergovWatchProfile = typeof highergovWatchProfiles.$inferSelect;
export type InsertHighergovWatchProfile = z.infer<typeof insertHighergovWatchProfileSchema>;

// ============================================================================
// MY DAY — SCORING & INTELLIGENCE ENGINE
// ============================================================================

export const myDayScoringRules = pgTable("my_day_scoring_rules", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  name: text("name").notNull(),
  weightsJson: jsonb("weights_json").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantNameIdx: unique("my_day_scoring_rules_tenant_name").on(table.tenantId, table.name),
}));

export const myDayItemScores = pgTable("my_day_item_scores", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  itemId: varchar("item_id", { length: 36 }).notNull(),
  itemType: text("item_type").notNull(),
  userId: varchar("user_id", { length: 36 }),
  score: integer("score").notNull(),
  band: text("band").notNull(),
  componentsJson: jsonb("components_json").notNull(),
  computedAt: timestamp("computed_at").defaultNow().notNull(),
}, (table) => ({
  itemIdx: unique("my_day_item_scores_item").on(table.tenantId, table.itemId, table.itemType),
}));

export const myDayActivityLog = pgTable("my_day_activity_log", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  userId: varchar("user_id", { length: 36 }),
  itemId: varchar("item_id", { length: 36 }),
  itemType: text("item_type"),
  action: text("action").notNull(),
  metaJson: jsonb("meta_json"),
  ts: timestamp("ts").defaultNow().notNull(),
});

export type MyDayScoringRule = typeof myDayScoringRules.$inferSelect;
export type MyDayItemScore = typeof myDayItemScores.$inferSelect;
export type MyDayActivityLogEntry = typeof myDayActivityLog.$inferSelect;

// ── Bid Jacket Artifact Templates ────────────────────────────
export const artifactTemplates = pgTable("artifact_templates", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  phase: text("phase").notNull(),
  required: boolean("required").notNull().default(false),
  defaultFormat: text("default_format").notNull().default("pdf"),
  promptMd: text("prompt_md"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertArtifactTemplateSchema = createInsertSchema(artifactTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertArtifactTemplate = z.infer<typeof insertArtifactTemplateSchema>;
export type ArtifactTemplate = typeof artifactTemplates.$inferSelect;

// ── Bid Jacket Artifacts (per bid project) ───────────────────
export const bidJacketArtifacts = pgTable("bid_jacket_artifacts", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  bidProjectId: varchar("bid_project_id", { length: 36 }).notNull().references(() => bidProjects.id, { onDelete: "cascade" }),
  templateCode: text("template_code"),
  title: text("title").notNull(),
  sourceType: text("source_type").notNull().default("upload"),
  sourceUrl: text("source_url"),
  storageKey: text("storage_key"),
  status: text("status").notNull().default("missing"),
  ownerUserId: varchar("owner_user_id", { length: 36 }),
  dueAt: timestamp("due_at"),
  metadataJson: jsonb("metadata_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  dedup: unique("bja_dedup").on(table.bidProjectId, table.templateCode, table.sourceUrl),
  bjaUrlUniq: uniqueIndex("bja_bidproject_sourceurl_uniq")
    .on(table.bidProjectId, table.sourceUrl)
    .where(sql`source_url is not null`),
  bjaBidProjectStatusIdx: index("bja_bidproject_status_idx").on(table.bidProjectId, table.status),
  bjaBidProjectUpdatedIdx: index("bja_bidproject_updated_idx").on(table.bidProjectId, table.updatedAt),
}));

export const insertBidJacketArtifactSchema = createInsertSchema(bidJacketArtifacts).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBidJacketArtifact = z.infer<typeof insertBidJacketArtifactSchema>;
export type BidJacketArtifact = typeof bidJacketArtifacts.$inferSelect;

// ── Bid Jacket Checklist Templates ───────────────────────────
export const bidJacketChecklistTemplates = pgTable("bid_jacket_checklist_templates", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  title: text("title").notNull(),
  phase: text("phase").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  priority: text("priority").notNull().default("p1"),
  requiredArtifactCodes: jsonb("required_artifact_codes").default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertBidJacketChecklistTemplateSchema = createInsertSchema(bidJacketChecklistTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBidJacketChecklistTemplate = z.infer<typeof insertBidJacketChecklistTemplateSchema>;
export type BidJacketChecklistTemplate = typeof bidJacketChecklistTemplates.$inferSelect;

// ── Bid Jacket Checklist Items (per bid project) ─────────────
export const bidJacketChecklistItems = pgTable("bid_jacket_checklist_items", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  bidProjectId: varchar("bid_project_id", { length: 36 }).notNull(),
  templateItemId: varchar("template_item_id", { length: 36 }),
  templateCode: text("template_code"),
  title: text("title").notNull(),
  phase: text("phase").notNull(),
  status: text("status").notNull().default("todo"),
  priority: text("priority").notNull().default("p1"),
  requiredArtifactCodes: jsonb("required_artifact_codes").default([]),
  ownerUserId: varchar("owner_user_id", { length: 36 }),
  dueAt: timestamp("due_at"),
  blockedReason: text("blocked_reason"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantBidIdx: index("bjci_tenant_bid_idx").on(table.tenantId, table.bidProjectId),
  bidStatusIdx: index("bjci_bid_status_idx").on(table.bidProjectId, table.status),
}));

export const insertBidJacketChecklistItemSchema = createInsertSchema(bidJacketChecklistItems).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBidJacketChecklistItem = z.infer<typeof insertBidJacketChecklistItemSchema>;
export type BidJacketChecklistItem = typeof bidJacketChecklistItems.$inferSelect;

// ============================================================================
// PROJECT WORKSPACE MODULES (Buildern-style)
// ============================================================================

export const projectFolders = pgTable("project_folders", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 64 }).notNull(),
  projectId: varchar("project_id", { length: 36 }).notNull(),
  parentFolderId: varchar("parent_folder_id", { length: 36 }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertProjectFolderSchema = createInsertSchema(projectFolders).omit({ id: true, createdAt: true });
export type InsertProjectFolder = z.infer<typeof insertProjectFolderSchema>;
export type ProjectFolder = typeof projectFolders.$inferSelect;

export const projectDocuments = pgTable("project_documents", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 64 }).notNull(),
  projectId: varchar("project_id", { length: 36 }).notNull(),
  folderId: varchar("folder_id", { length: 36 }),
  title: text("title").notNull(),
  sourceType: text("source_type").notNull().default("upload"),
  sourceUrl: text("source_url"),
  storageKey: text("storage_key"),
  fileName: text("file_name"),
  mimeType: text("mime_type"),
  linkedEntityType: text("linked_entity_type"),
  linkedEntityId: varchar("linked_entity_id", { length: 36 }),
  sourceArtifactId: varchar("source_artifact_id", { length: 36 }),
  tagsJson: jsonb("tags_json").default([]),
  metadataJson: jsonb("metadata_json").default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  pdProjectFolderIdx: index("pd_project_folder_idx").on(table.projectId, table.folderId),
  pdProjectCreatedIdx: index("pd_project_created_idx").on(table.projectId, table.createdAt),
  pdSourceArtifactIdx: index("pd_source_artifact_idx").on(table.sourceArtifactId),
}));

export const insertProjectDocumentSchema = createInsertSchema(projectDocuments).omit({ id: true, createdAt: true });
export type InsertProjectDocument = z.infer<typeof insertProjectDocumentSchema>;
export type ProjectDocument = typeof projectDocuments.$inferSelect;

export const projectEstimates = pgTable("project_estimates", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 64 }).notNull(),
  projectId: varchar("project_id", { length: 36 }).notNull(),
  title: text("title").notNull(),
  status: text("status").notNull().default("draft"),
  total: decimal("total", { precision: 14, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertProjectEstimateSchema = createInsertSchema(projectEstimates).omit({ id: true, createdAt: true });
export type InsertProjectEstimate = z.infer<typeof insertProjectEstimateSchema>;
export type ProjectEstimate = typeof projectEstimates.$inferSelect;

export const projectProposals = pgTable("project_proposals", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 64 }).notNull(),
  projectId: varchar("project_id", { length: 36 }).notNull(),
  title: text("title").notNull(),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertProjectProposalSchema = createInsertSchema(projectProposals).omit({ id: true, createdAt: true });
export type InsertProjectProposal = z.infer<typeof insertProjectProposalSchema>;
export type ProjectProposal = typeof projectProposals.$inferSelect;

export const projectSchedules = pgTable("project_schedules", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 64 }).notNull(),
  projectId: varchar("project_id", { length: 36 }).notNull(),
  title: text("title").notNull(),
  status: text("status").notNull().default("not_started"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertProjectScheduleSchema = createInsertSchema(projectSchedules).omit({ id: true, createdAt: true });
export type InsertProjectSchedule = z.infer<typeof insertProjectScheduleSchema>;
export type ProjectSchedule = typeof projectSchedules.$inferSelect;

export const projectBidRequests = pgTable("project_bid_requests", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 64 }).notNull(),
  projectId: varchar("project_id", { length: 36 }).notNull(),
  title: text("title").notNull(),
  trade: text("trade"),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertProjectBidRequestSchema = createInsertSchema(projectBidRequests).omit({ id: true, createdAt: true });
export type InsertProjectBidRequest = z.infer<typeof insertProjectBidRequestSchema>;
export type ProjectBidRequest = typeof projectBidRequests.$inferSelect;

export const projectSelections = pgTable("project_selections", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 64 }).notNull(),
  projectId: varchar("project_id", { length: 36 }).notNull(),
  title: text("title").notNull(),
  category: text("category").notNull().default("selection"),
  status: text("status").notNull().default("open"),
  allowanceAmount: decimal("allowance_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertProjectSelectionSchema = createInsertSchema(projectSelections).omit({ id: true, createdAt: true });
export type InsertProjectSelection = z.infer<typeof insertProjectSelectionSchema>;
export type ProjectSelection = typeof projectSelections.$inferSelect;

export const projectBudgets = pgTable("project_budgets", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 64 }).notNull(),
  projectId: varchar("project_id", { length: 36 }).notNull(),
  title: text("title").notNull(),
  originalBudget: decimal("original_budget", { precision: 14, scale: 2 }).notNull().default("0"),
  revisedBudget: decimal("revised_budget", { precision: 14, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertProjectBudgetSchema = createInsertSchema(projectBudgets).omit({ id: true, createdAt: true });
export type InsertProjectBudget = z.infer<typeof insertProjectBudgetSchema>;
export type ProjectBudget = typeof projectBudgets.$inferSelect;

export const projectDailyLogs = pgTable("project_daily_logs", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 64 }).notNull(),
  projectId: varchar("project_id", { length: 36 }).notNull(),
  title: text("title").notNull(),
  logDate: timestamp("log_date").notNull().defaultNow(),
  weather: text("weather"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertProjectDailyLogSchema = createInsertSchema(projectDailyLogs).omit({ id: true, createdAt: true });
export type InsertProjectDailyLog = z.infer<typeof insertProjectDailyLogSchema>;
export type ProjectDailyLog = typeof projectDailyLogs.$inferSelect;

export const projectTimesheets = pgTable("project_timesheets", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 64 }).notNull(),
  projectId: varchar("project_id", { length: 36 }).notNull(),
  title: text("title").notNull(),
  workDate: timestamp("work_date").notNull().defaultNow(),
  hours: decimal("hours", { precision: 6, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertProjectTimesheetSchema = createInsertSchema(projectTimesheets).omit({ id: true, createdAt: true });
export type InsertProjectTimesheet = z.infer<typeof insertProjectTimesheetSchema>;
export type ProjectTimesheet = typeof projectTimesheets.$inferSelect;

export const ingestionEvents = pgTable("ingestion_events", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  projectId: varchar("project_id", { length: 36 }),
  bidProjectId: varchar("bid_project_id", { length: 36 }),
  runId: varchar("run_id", { length: 36 }),
  eventType: text("event_type").notNull(),
  entityType: text("entity_type"),
  entityId: varchar("entity_id", { length: 36 }),
  message: text("message"),
  detailsJson: jsonb("details_json"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  ieProjectIdx: index("ie_project_idx").on(table.projectId, table.createdAt),
  ieBidProjectIdx: index("ie_bidproject_idx").on(table.bidProjectId, table.createdAt),
  ieRunIdx: index("ie_run_idx").on(table.runId, table.createdAt),
  ieTenantCreatedIdx: index("ie_tenant_created_idx").on(table.tenantId, table.createdAt),
}));

export type IngestionEvent = typeof ingestionEvents.$inferSelect;

// ============================================================================
// AI COMMAND CENTER — Dashboard Tasks
// ============================================================================

export const dashboardTasks = pgTable("dashboard_tasks", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  priority: text("priority").notNull().default("medium"),
  status: text("status").notNull().default("pending"),
  dueAt: timestamp("due_at"),
  snoozeUntil: timestamp("snooze_until"),
  position: integer("position").notNull().default(0),
  source: text("source").notNull().default("system"),
  sourceEntityType: text("source_entity_type"),
  sourceEntityId: varchar("source_entity_id", { length: 36 }),
  actionType: text("action_type"),
  actionPayload: jsonb("action_payload"),
  completedAt: timestamp("completed_at"),
  completedBy: varchar("completed_by", { length: 36 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  dtTenantStatusIdx: index("dt_tenant_status_idx").on(table.tenantId, table.status),
  dtTenantPriorityIdx: index("dt_tenant_priority_idx").on(table.tenantId, table.priority),
  dtTenantPositionIdx: index("dt_tenant_position_idx").on(table.tenantId, table.position),
  dtSourceEntityIdx: index("dt_source_entity_idx").on(table.sourceEntityType, table.sourceEntityId),
}));

export const insertDashboardTaskSchema = createInsertSchema(dashboardTasks).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDashboardTask = z.infer<typeof insertDashboardTaskSchema>;
export type DashboardTask = typeof dashboardTasks.$inferSelect;

export const sourceRunTouches = pgTable(
  "source_run_touches",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    sourceRunId: varchar("source_run_id", { length: 36 }).notNull(),
    sourceSystemId: varchar("source_system_id", { length: 36 }).notNull(),
    entityType: text("entity_type").notNull(),
    entityId: varchar("entity_id", { length: 36 }).notNull(),
    action: text("action").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    srtTenantRunEntityUniq: unique("srt_tenant_run_entity_uniq").on(t.tenantId, t.sourceRunId, t.entityType, t.entityId),
    srtTenantRunIdx: index("srt_tenant_run_idx").on(t.tenantId, t.sourceRunId),
    srtTenantEntityIdx: index("srt_tenant_entity_idx").on(t.tenantId, t.entityType, t.entityId),
  })
);

export type SourceRunTouch = typeof sourceRunTouches.$inferSelect;

export const jobLocks = pgTable(
  "job_locks",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    jobName: text("job_name").notNull(),
    lockedUntil: timestamp("locked_until").notNull(),
    lockedBy: text("locked_by"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    jlTenantJobUniq: unique("jl_tenant_job_uniq").on(t.tenantId, t.jobName),
    jlTenantJobIdx: index("jl_tenant_job_idx").on(t.tenantId, t.jobName),
  })
);

export type JobLock = typeof jobLocks.$inferSelect;

export const artifactIngestionJobs = pgTable(
  "artifact_ingestion_jobs",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    entityType: text("entity_type").notNull(),
    entityId: varchar("entity_id", { length: 36 }).notNull(),
    sourceType: text("source_type").notNull(),
    sourceUrl: text("source_url"),
    status: text("status").notNull().default("queued"),
    priority: text("priority").notNull().default("normal"),
    attempts: integer("attempts").notNull().default(0),
    lastAttemptAt: timestamp("last_attempt_at"),
    nextAttemptAt: timestamp("next_attempt_at").defaultNow().notNull(),
    errorJson: jsonb("error_json"),
    lockedAt: timestamp("locked_at"),
    lockedBy: text("locked_by"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    aijTenantEntitySourceUniq: unique("aij_tenant_entity_source_uniq").on(t.tenantId, t.entityType, t.entityId, t.sourceType, t.sourceUrl),
    aijQueueIdx: index("aij_queue_idx").on(t.tenantId, t.status, t.nextAttemptAt),
    aijTenantEntityIdx: index("aij_tenant_entity_idx").on(t.tenantId, t.entityType, t.entityId),
  })
);

export const insertArtifactIngestionJobSchema = createInsertSchema(artifactIngestionJobs).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertArtifactIngestionJob = z.infer<typeof insertArtifactIngestionJobSchema>;
export type ArtifactIngestionJob = typeof artifactIngestionJobs.$inferSelect;

// ============================================================================
// HERBIE THREE-LAYER MEMORY (Phase 1, Roadmap Feature 8)
// ----------------------------------------------------------------------------
// HERBIE.md prescribes three long-term memory layers: facts, decisions, and
// relationships. These are the structured "project memory" layer that sits
// between the identity prompt (HERBIE.md) and the vector recall backed by
// `conversation_memory`. See HERBIE.md for read/write rules. `recordFact`
// with confidence < 0.7 routes to `herbie_review_queue` instead of persisting
// here.
// ============================================================================

export const herbieFacts = pgTable("herbie_facts", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  projectId: varchar("project_id", { length: 36 }),
  // Subject of the fact — what entity this is about.
  subjectType: text("subject_type").notNull(), // e.g. "vendor", "project", "coi", "submittal"
  subjectId: varchar("subject_id", { length: 36 }),
  // Predicate-object form: "X has Y = Z".
  predicate: text("predicate").notNull(), // e.g. "coi_expires_at", "gc_name", "concrete_spec"
  object: text("object"),                   // plain scalar value
  objectJson: jsonb("object_json"),         // structured value
  // Provenance.
  sourceType: text("source_type").notNull(), // "document" | "message" | "user" | "herbie_extraction"
  sourceId: varchar("source_id", { length: 36 }),
  confidence: decimal("confidence", { precision: 4, scale: 2 }).notNull(),
  extractedAt: timestamp("extracted_at").defaultNow().notNull(),
  // Supersession chain — a new fact with a conflicting object sets
  // the prior fact's supersededById; the prior fact is never deleted.
  supersededById: varchar("superseded_by_id", { length: 36 }),
  supersededAt: timestamp("superseded_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  hfSubjectIdx: index("hf_subject_idx").on(t.tenantId, t.subjectType, t.subjectId),
  hfProjectIdx: index("hf_project_idx").on(t.tenantId, t.projectId),
  hfCurrentIdx: index("hf_current_idx").on(t.tenantId, t.supersededById),
  hfPredicateIdx: index("hf_predicate_idx").on(t.tenantId, t.subjectType, t.subjectId, t.predicate),
}));

export const insertHerbieFactSchema = createInsertSchema(herbieFacts).omit({
  id: true,
  createdAt: true,
  supersededAt: true,
  supersededById: true,
});
export type InsertHerbieFact = z.infer<typeof insertHerbieFactSchema>;
export type HerbieFact = typeof herbieFacts.$inferSelect;

export const herbieDecisions = pgTable("herbie_decisions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  projectId: varchar("project_id", { length: 36 }),
  summary: text("summary").notNull(),    // "approved CO-07 for $4,200"
  rationale: text("rationale"),          // why
  decidedBy: text("decided_by").notNull(), // user_id or literal "herbie"
  decidedAt: timestamp("decided_at").defaultNow().notNull(),
  relatedEntityType: text("related_entity_type"),
  relatedEntityId: varchar("related_entity_id", { length: 36 }),
  metadataJson: jsonb("metadata_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  hdProjectIdx: index("hd_project_idx").on(t.tenantId, t.projectId, t.decidedAt),
  hdEntityIdx: index("hd_entity_idx").on(t.tenantId, t.relatedEntityType, t.relatedEntityId),
}));

export const insertHerbieDecisionSchema = createInsertSchema(herbieDecisions).omit({
  id: true,
  createdAt: true,
});
export type InsertHerbieDecision = z.infer<typeof insertHerbieDecisionSchema>;
export type HerbieDecision = typeof herbieDecisions.$inferSelect;

export const herbieRelationships = pgTable("herbie_relationships", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  projectId: varchar("project_id", { length: 36 }), // nullable for cross-project people
  // One of the target ids is populated per row — we keep them separate
  // rather than polymorphic so FKs and the upsert uniqueness below
  // stay legible.
  contactId: varchar("contact_id", { length: 36 }),
  vendorId: varchar("vendor_id", { length: 36 }),
  companyId: varchar("company_id", { length: 36 }),
  role: text("role").notNull(), // "pm" | "super" | "foreman" | "sub" | "client" | "architect" | "ahj" | ...
  status: text("status").notNull().default("active"), // "active" | "inactive"
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  hrProjectIdx: index("hr_project_idx").on(t.tenantId, t.projectId),
  hrRoleIdx: index("hr_role_idx").on(t.tenantId, t.role, t.status),
}));

export const insertHerbieRelationshipSchema = createInsertSchema(herbieRelationships).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertHerbieRelationship = z.infer<typeof insertHerbieRelationshipSchema>;
export type HerbieRelationship = typeof herbieRelationships.$inferSelect;

// ============================================================================
// COI TRACKER (Phase 1, Roadmap Feature 3)
// ----------------------------------------------------------------------------
// Certificates of Insurance for vendors/subs and the GC itself. Expiry is
// the primary signal the proactive monitor (Feature 9) uses to prompt
// Herbie to draft a renewal email (Feature 10 approval queue).
// ============================================================================

export const coiCertificates = pgTable("coi_certificates", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  // project_id nullable — company-level COIs (the GC's own master policy)
  // are tenant-scoped but not project-scoped.
  projectId: varchar("project_id", { length: 36 }),
  // vendor_id nullable — GC-owned COIs (e.g. the GC's own GL) aren't
  // attributable to a vendor row.
  vendorId: varchar("vendor_id", { length: 36 }),
  policyType: text("policy_type").notNull(), // "gl" | "wc" | "auto" | "umbrella" | "professional" | "pollution" | "builders_risk"
  carrier: text("carrier"),
  policyNumber: text("policy_number"),
  // limits_json: flexible per policy type — e.g. { each_occurrence: 1000000,
  // aggregate: 2000000, waiver_of_subrogation: true }.
  limitsJson: jsonb("limits_json"),
  effectiveDate: timestamp("effective_date"),
  expiryDate: timestamp("expiry_date").notNull(),
  documentId: varchar("document_id", { length: 36 }), // link to the actual uploaded cert
  status: text("status").notNull().default("active"), // "active" | "expired" | "pending_renewal" | "cancelled"
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  coiTenantVendorIdx: index("coi_tenant_vendor_idx").on(t.tenantId, t.vendorId),
  coiTenantProjectIdx: index("coi_tenant_project_idx").on(t.tenantId, t.projectId),
  coiTenantExpiryIdx: index("coi_tenant_expiry_idx").on(t.tenantId, t.expiryDate),
  coiUpsertKey: unique("coi_upsert_key").on(t.tenantId, t.projectId, t.vendorId, t.policyType),
}));

export const insertCoiCertificateSchema = createInsertSchema(coiCertificates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCoiCertificate = z.infer<typeof insertCoiCertificateSchema>;
export type CoiCertificate = typeof coiCertificates.$inferSelect;

// Phase D — Per-user "Mark Resolved" dismissals for Herbie digest items.
// Items are computed live from underlying entities (COIs, approvals, RFIs)
// so we record a dismissal that hides the item until either the underlying
// entity changes or the dismissal TTL elapses.
export const herbieDigestDismissals = pgTable("herbie_digest_dismissals", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  entityType: text("entity_type").notNull(),
  entityId: varchar("entity_id", { length: 36 }).notNull(),
  dismissedUntil: timestamp("dismissed_until").notNull(),
  dismissedBy: varchar("dismissed_by", { length: 36 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  hddTenantEntityIdx: index("hdd_tenant_entity_idx").on(t.tenantId, t.entityType, t.entityId),
  hddTenantUntilIdx: index("hdd_tenant_until_idx").on(t.tenantId, t.dismissedUntil),
}));

export type HerbieDigestDismissal = typeof herbieDigestDismissals.$inferSelect;

export type HomeBucketKey = "urgent" | "needsAttention" | "highValue" | "approvals";
export type HomePriority = "critical" | "high" | "medium" | "low";

export type HomeItem = {
  id: string;
  sourceType: "approval" | "opportunity" | "task" | "jacket";
  title: string;
  subtitle?: string;
  route?: string;
  dueAt?: string | null;
  ageDays?: number | null;
  dollarValue?: number | null;
  agency?: string | null;
  setAside?: string | null;
  priorityScore: number;
  priority: HomePriority;
  reasons: string[];
  primaryAction: {
    label: string;
    type: "open" | "review_approval" | "create_bid_project" | "run_ingestion" | "request_missing_docs";
    route?: string;
    payload?: Record<string, unknown>;
  };
};

export type HomeExecutiveKpis = {
  deadlines72h: number;
  approvalsOverdue: number;
  stalledAiTasks: number;
  revenueAtRisk: number;
  missingArtifacts: number;
  pendingApprovals: number;
};

export type HomePipelineStage = {
  stage: string;
  count: number;
  totalValue: number;
};

export type HomeProjectHealth = {
  id: string;
  name: string;
  completionPct: number;
  contractValue: number;
  actualCosts: number;
  grossProfit: number;
  healthScore: number;
  route: string;
};

export type HomeIntelligence = {
  pipeline: {
    stages: HomePipelineStage[];
    totalValue: number;
    totalCount: number;
    conversionRate: number;
  };
  projectHealth: {
    projects: HomeProjectHealth[];
    avgHealthScore: number;
    totalContractValue: number;
    totalActualCosts: number;
  };
  subPerformance: {
    topSubs: Array<{
      id: string;
      name: string;
      trade: string | null;
      performanceRating: number | null;
      projectsCompleted: number;
      status: string;
    }>;
    avgRating: number;
    totalSubs: number;
    atRiskCount: number;
  };
  financialPulse: {
    projectedProfit: number;
    projectedMargin: number;
    cashFlowBalance: number;
    changeOrderExposure: number;
    vendorRiskCount: number;
  };
};

export type HomeDashboardResponse = {
  now: string;
  executiveBrief: {
    greeting: string;
    summary: string;
    kpis: HomeExecutiveKpis;
    recommended: HomeItem[];
  };
  intelligence: HomeIntelligence;
  timeline: {
    connections: { microsoft: boolean; google: boolean };
    today: Array<{
      id: string;
      title: string;
      subtitle: string;
      type: "event" | "deadline" | "approval" | "task";
      time: string | null;
      allDay: boolean;
      route: string;
      priority?: string;
    }>;
    missed: Array<{
      id: string;
      title: string;
      subtitle: string;
      type: "event" | "deadline" | "approval" | "task";
      time: string | null;
      allDay: boolean;
      route: string;
      priority?: string;
    }>;
    suggestedFocus?: {
      startLocal: string;
      endLocal: string;
      reason: string;
    };
  };
  buckets: Record<HomeBucketKey, HomeItem[]>;
};

export type HerbieUnblockStep = {
  step: string;
  why: string;
  ownerRoleSuggestion: string;
  targetTimeframe: string;
};

export type HerbieRevenueProtection = {
  callout: string;
  numbers: string;
  action: string;
};

export type HerbieComplianceAlert = {
  issue: string;
  whoOrWhat: string;
  deadlineOrWindow: string;
  fix: string;
};

export type HerbieWorkflowImprovement = {
  improvement: string;
  why: string;
  automationCandidate: boolean;
  impact: string;
};

export type HerbieMissingInfoQuestion = {
  question: string;
  basedOnItemId: string | null;
  why: string;
};

export type HerbieBriefResponse = {
  greeting: string;
  summary: string;
  highlights: string[];
  risks: string[];
  unblockOrder: HerbieUnblockStep[];
  revenueProtection: HerbieRevenueProtection[];
  complianceAlerts: HerbieComplianceAlert[];
  workflowImprovements: HerbieWorkflowImprovement[];
  teamCoachingNotes: string[];
  missingInfoQuestions: HerbieMissingInfoQuestion[];
  suggestedFocusBlockReason: string;
};

export type HerbieDraftFollowupResponse = {
  subject: string;
  body: string;
};

// ============================================================================
// PORTAL SHARES (Phase 1, Roadmap Feature 11)
// ----------------------------------------------------------------------------
// Token-gated, read-only share links a PM creates from a project cockpit so
// a client (or sub) can view a curated slice of project documents without
// needing a Sentinel login. Each share is scoped to a project, an audience
// ("client" | "sub" | "internal"), an opaque list of allowed document
// categories (e.g. ["bid_set", "submittals"]), and an expiry. The token is
// the public URL key — keep it long, random, and never re-emit revoked
// tokens. `revokedAt` lets us hard-deny access without losing the audit row.
// ============================================================================
export const portalShares = pgTable("portal_shares", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id, { onDelete: "cascade" }),
  token: text("token").notNull(),
  audience: text("audience").notNull(), // "client" | "sub" | "internal"
  // Allowed document categories. We store as text[] (Postgres array) so the
  // GET handler can index/filter without JSON unpacking. Empty array =
  // share all categories.
  allowedCategories: text("allowed_categories").array().notNull().default(sql`'{}'::text[]`),
  expiresAt: timestamp("expires_at"),
  createdByUserId: varchar("created_by_user_id", { length: 36 }).references(() => users.id),
  revokedAt: timestamp("revoked_at"),
  revokedByUserId: varchar("revoked_by_user_id", { length: 36 }).references(() => users.id),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  portalSharesTokenIdx: unique("portal_shares_token_uidx").on(t.token),
  portalSharesProjectIdx: index("portal_shares_project_idx").on(t.tenantId, t.projectId, t.revokedAt),
}));

export const insertPortalShareSchema = createInsertSchema(portalShares).omit({
  id: true,
  createdAt: true,
  revokedAt: true,
  revokedByUserId: true,
});
export type InsertPortalShare = z.infer<typeof insertPortalShareSchema>;
export type PortalShare = typeof portalShares.$inferSelect;

// ============================================================================
// MONITOR EVENTS (Phase 1, Roadmap Feature 12)
// ----------------------------------------------------------------------------
// Idempotency ledger for the daily monitor jobs (coi_expiry, submittal_overdue,
// daily_log_missing, change_order_stale, invoice_overdue). Each row marks
// "monitor X already fired for entity Y on date Z", so a re-run of the same
// scheduler tick (manual or recovery) does not double-notify.
// `windowDate` is stored as ISO date string ('YYYY-MM-DD') for trivial joins.
// ============================================================================
export const monitorEvents = pgTable("monitor_events", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  monitorId: text("monitor_id").notNull(), // e.g. "coi_expiry", "submittal_overdue"
  entityId: varchar("entity_id", { length: 36 }), // null for tenant-level fires
  windowDate: text("window_date").notNull(), // 'YYYY-MM-DD'
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  monitorEventsUidx: unique("monitor_events_uidx").on(t.monitorId, t.entityId, t.windowDate),
  monitorEventsTenantIdx: index("monitor_events_tenant_idx").on(t.tenantId, t.monitorId, t.windowDate),
}));

export const insertMonitorEventSchema = createInsertSchema(monitorEvents).omit({
  id: true,
  createdAt: true,
});
export type InsertMonitorEvent = z.infer<typeof insertMonitorEventSchema>;
export type MonitorEvent = typeof monitorEvents.$inferSelect;

export type HerbieToolAction = "tree" | "file" | "search" | "patch" | "run";

export type HerbieChangeSet = {
  id: string;
  title: string;
  plan: string;
  diffsApplied: Array<{ path: string; before: string; after: string }>;
  createdBy: string;
  createdAt: string;
  status: "proposed" | "applied" | "rolled_back";
};

export type HerbieAgentIteration = {
  step: number;
  diff: string;
  applied: boolean;
  typecheck: { exitCode: number; output: string };
  notes: string;
};

export type HerbieAgentResult = {
  plan: string;
  iterations: HerbieAgentIteration[];
  done: boolean;
  changeSetId?: string;
};
