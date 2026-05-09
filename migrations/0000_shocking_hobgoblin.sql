CREATE TABLE "agency_profiles" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"agency_name" text NOT NULL,
	"agency_slug" text NOT NULL,
	"profile_json" jsonb NOT NULL,
	"top_naics" text[],
	"top_psc" text[],
	"top_vendors" jsonb,
	"spending_trends" jsonb,
	"ai_generated" boolean DEFAULT true,
	"last_refreshed_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agency_profiles_tenant_id_agency_slug_unique" UNIQUE("tenant_id","agency_slug")
);
--> statement-breakpoint
CREATE TABLE "agent_activities" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"agent_name" text NOT NULL,
	"action_type" text NOT NULL,
	"entity_type" text,
	"entity_id" varchar(36),
	"description" text,
	"input_json" jsonb,
	"output_json" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"duration_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_artifacts" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" varchar(36) NOT NULL,
	"artifact_type" text NOT NULL,
	"payload_json" jsonb NOT NULL,
	"evidence_json" jsonb,
	"confidence" integer,
	"model_version" text,
	"prompt_version" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "amendment_tracking" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"opportunity_id" varchar(36) NOT NULL,
	"amendment_number" integer NOT NULL,
	"amendment_date" timestamp,
	"change_type" text,
	"change_summary" text,
	"impact_level" text,
	"affects_deadline" boolean DEFAULT false NOT NULL,
	"affects_scope" boolean DEFAULT false NOT NULL,
	"affects_pricing" boolean DEFAULT false NOT NULL,
	"requires_review" boolean DEFAULT false NOT NULL,
	"reviewed_by" varchar(36),
	"reviewed_at" timestamp,
	"source_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "amendment_tracking_opportunity_id_amendment_number_unique" UNIQUE("opportunity_id","amendment_number")
);
--> statement-breakpoint
CREATE TABLE "approval_actions" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"approval_request_id" varchar(36) NOT NULL,
	"actor" varchar(36),
	"decision" text NOT NULL,
	"notes" text,
	"decided_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_policies" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"policy_key" text NOT NULL,
	"policy_json" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_requests" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" varchar(36) NOT NULL,
	"action_type" text NOT NULL,
	"requested_by" varchar(36),
	"requested_from" varchar(36),
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"context_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "artifact_ingestion_jobs" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" varchar(36) NOT NULL,
	"source_type" text NOT NULL,
	"source_url" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp,
	"next_attempt_at" timestamp DEFAULT now() NOT NULL,
	"error_json" jsonb,
	"locked_at" timestamp,
	"locked_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "aij_tenant_entity_source_uniq" UNIQUE("tenant_id","entity_type","entity_id","source_type","source_url")
);
--> statement-breakpoint
CREATE TABLE "artifact_templates" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"phase" text NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"default_format" text DEFAULT 'pdf' NOT NULL,
	"prompt_md" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "artifact_templates_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"event_type" text NOT NULL,
	"actor" varchar(36),
	"actor_type" text DEFAULT 'user' NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" varchar(36) NOT NULL,
	"action" text NOT NULL,
	"before_json" jsonb,
	"after_json" jsonb,
	"meta_json" jsonb,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auto_filing_rules" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"file_name_pattern" text,
	"file_type_pattern" text,
	"content_keywords" text[],
	"sender_pattern" text,
	"target_jacket_type" text NOT NULL,
	"target_folder_path" text NOT NULL,
	"auto_rename" boolean DEFAULT false,
	"rename_pattern" text,
	"auto_tag" text[],
	"notify_users" text[],
	"requires_review" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "autofill_rules" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"rule_type" text DEFAULT 'deterministic' NOT NULL,
	"source_entity_type" text NOT NULL,
	"target_entity_type" text NOT NULL,
	"field_mappings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"conditions" jsonb DEFAULT '{}'::jsonb,
	"priority" integer DEFAULT 100 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"requires_confirmation" boolean DEFAULT false NOT NULL,
	"created_by" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "autofill_runs" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"rule_id" varchar(36),
	"event_id" varchar(36),
	"source_entity_type" text NOT NULL,
	"source_entity_id" varchar(36) NOT NULL,
	"target_entity_type" text NOT NULL,
	"target_entity_id" varchar(36) NOT NULL,
	"fields_applied" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'applied' NOT NULL,
	"confirmed_by" varchar(36),
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_rules" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"trigger_type" text NOT NULL,
	"trigger_config" jsonb,
	"action_type" text NOT NULL,
	"action_config" jsonb,
	"enabled" boolean DEFAULT true NOT NULL,
	"run_count" integer DEFAULT 0 NOT NULL,
	"last_run_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_runs" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"rule_id" varchar(36) NOT NULL,
	"trigger_entity_type" text,
	"trigger_entity_id" varchar(36),
	"status" text DEFAULT 'running' NOT NULL,
	"result_json" jsonb,
	"error_message" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "award_decisions" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"bid_project_id" varchar(36) NOT NULL,
	"winning_bid_response_id" varchar(36) NOT NULL,
	"selected_alternate_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"award_snapshot_json" jsonb NOT NULL,
	"status" text DEFAULT 'awarded' NOT NULL,
	"notes" text,
	"awarded_at" timestamp DEFAULT now() NOT NULL,
	"rescinded_at" timestamp,
	"rescind_reason" text,
	"created_by_user_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "award_notifications" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"opportunity_id" varchar(36),
	"external_award_id" text,
	"award_type" text,
	"award_date" timestamp,
	"contract_number" text,
	"award_amount" numeric(15, 2),
	"awardee_company" text,
	"is_our_award" boolean DEFAULT false NOT NULL,
	"source_url" text,
	"raw_data_json" jsonb,
	"processed_at" timestamp,
	"workflow_triggered" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bid_addenda" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"bid_project_id" varchar(36) NOT NULL,
	"addendum_number" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"issued_at" timestamp DEFAULT now() NOT NULL,
	"due_at_override" timestamp,
	"acknowledged" boolean DEFAULT false,
	"acknowledged_at" timestamp,
	"acknowledged_by" varchar(36),
	"document_ids" text[],
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bid_artifacts" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"bid_project_id" varchar(36) NOT NULL,
	"artifact_type" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"content" text,
	"content_hash" text,
	"storage_ref_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bid_binder_versions" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"bid_project_id" varchar(36) NOT NULL,
	"version" integer NOT NULL,
	"status" text DEFAULT 'generating' NOT NULL,
	"storage_key" text,
	"egnyte_item_id" varchar(36),
	"egnyte_path" text,
	"file_size_bytes" integer,
	"page_count" integer,
	"page_map_json" jsonb,
	"toc_json" jsonb,
	"trigger_type" text NOT NULL,
	"trigger_details" text,
	"generated_at" timestamp,
	"generated_by" text DEFAULT 'herbie',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bid_checklist_items" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"checklist_id" varchar(36) NOT NULL,
	"item_text" text NOT NULL,
	"is_required" boolean DEFAULT true NOT NULL,
	"is_completed" boolean DEFAULT false,
	"completed_at" timestamp,
	"completed_by" varchar(36),
	"linked_document_id" varchar(36),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bid_checklists" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"bid_project_id" varchar(36) NOT NULL,
	"checklist_type" text DEFAULT 'submission' NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bid_decisions" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"bid_project_id" varchar(36) NOT NULL,
	"decision" text NOT NULL,
	"decided_by" varchar(36),
	"decided_at" timestamp DEFAULT now() NOT NULL,
	"rationale_json" jsonb
);
--> statement-breakpoint
CREATE TABLE "bid_document_status" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"bid_id" varchar(36) NOT NULL,
	"requirement_id" varchar(36) NOT NULL,
	"status" text DEFAULT 'missing' NOT NULL,
	"document_id" varchar(36),
	"metadata_id" varchar(36),
	"due_date" timestamp,
	"uploaded_at" timestamp,
	"uploaded_by" varchar(36),
	"approved_at" timestamp,
	"approved_by" varchar(36),
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bid_document_status_bid_id_requirement_id_unique" UNIQUE("bid_id","requirement_id")
);
--> statement-breakpoint
CREATE TABLE "bid_form_line_items" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"bid_form_section_id" varchar(36) NOT NULL,
	"cost_code_id" varchar(36),
	"item_code" text,
	"description" text NOT NULL,
	"uom" text,
	"qty" numeric(15, 4),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_required" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bid_form_sections" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"bid_form_id" varchar(36) NOT NULL,
	"section_type" text DEFAULT 'base' NOT NULL,
	"title" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_required" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bid_forms" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"bid_project_id" varchar(36) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"instructions" text,
	"allow_unit_pricing" boolean DEFAULT false NOT NULL,
	"published_at" timestamp,
	"closed_at" timestamp,
	"created_by_user_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bid_history" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"opportunity_id" varchar(36),
	"naics_code" text,
	"set_aside_code" text,
	"agency_name" text,
	"contract_value" numeric(15, 2),
	"bid_submitted_at" timestamp,
	"outcome" text NOT NULL,
	"winner_name" text,
	"lesson_learned" text,
	"competitor_count" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bid_invitation_events" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invitation_id" varchar(36) NOT NULL,
	"event_type" text NOT NULL,
	"document_id" varchar(36),
	"ip" text,
	"user_agent" text,
	"details_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bid_invitations" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"bid_project_id" varchar(36) NOT NULL,
	"vendor_id" varchar(36) NOT NULL,
	"token_hash" text NOT NULL,
	"status" text DEFAULT 'invited' NOT NULL,
	"due_at" timestamp,
	"sent_at" timestamp,
	"opened_at" timestamp,
	"responded_at" timestamp,
	"submitted_at" timestamp,
	"last_activity_at" timestamp,
	"created_by_user_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bid_invitations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "bid_jacket_artifacts" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"bid_project_id" varchar(36) NOT NULL,
	"template_code" text,
	"title" text NOT NULL,
	"source_type" text DEFAULT 'upload' NOT NULL,
	"source_url" text,
	"storage_key" text,
	"status" text DEFAULT 'missing' NOT NULL,
	"owner_user_id" varchar(36),
	"due_at" timestamp,
	"metadata_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bja_dedup" UNIQUE("bid_project_id","template_code","source_url")
);
--> statement-breakpoint
CREATE TABLE "bid_jacket_checklist_items" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"bid_project_id" varchar(36) NOT NULL,
	"template_item_id" varchar(36),
	"template_code" text,
	"title" text NOT NULL,
	"phase" text NOT NULL,
	"status" text DEFAULT 'todo' NOT NULL,
	"priority" text DEFAULT 'p1' NOT NULL,
	"required_artifact_codes" jsonb DEFAULT '[]'::jsonb,
	"owner_user_id" varchar(36),
	"due_at" timestamp,
	"blocked_reason" text,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bid_jacket_checklist_templates" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"phase" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"priority" text DEFAULT 'p1' NOT NULL,
	"required_artifact_codes" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bid_jacket_checklist_templates_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "bid_outcomes" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"bid_project_id" varchar(36) NOT NULL,
	"outcome" text NOT NULL,
	"decided_at" timestamp,
	"debrief_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bid_partners" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"bid_id" varchar(36) NOT NULL,
	"partner_id" varchar(36) NOT NULL,
	"role" text,
	"fit_score" integer DEFAULT 0,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bid_partners_tenant_id_bid_id_partner_id_unique" UNIQUE("tenant_id","bid_id","partner_id")
);
--> statement-breakpoint
CREATE TABLE "bid_pricing_snapshots" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"bid_project_id" varchar(36) NOT NULL,
	"estimated_value" numeric(14, 2),
	"cost_breakdown" jsonb,
	"margin_percent" numeric(5, 2),
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bid_projects" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"opportunity_id" varchar(36) NOT NULL,
	"opportunity_version_ref" varchar(36),
	"status" text DEFAULT 'initiated' NOT NULL,
	"status_raw" text,
	"status_normalized" text DEFAULT 'initiated' NOT NULL,
	"owner_user_id" varchar(36),
	"documentation_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bid_proposal_sections" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"bid_project_id" varchar(36) NOT NULL,
	"approval_request_id" varchar(36),
	"section_type" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bid_readiness_scores" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"bid_project_id" varchar(36) NOT NULL,
	"overall_score" integer NOT NULL,
	"status" text NOT NULL,
	"solicitation_score" integer DEFAULT 0,
	"forms_score" integer DEFAULT 0,
	"insurance_score" integer DEFAULT 0,
	"bonding_score" integer DEFAULT 0,
	"pricing_score" integer DEFAULT 0,
	"technical_score" integer DEFAULT 0,
	"past_performance_score" integer DEFAULT 0,
	"sub_quotes_score" integer DEFAULT 0,
	"missing_items_json" jsonb,
	"critical_missing_count" integer DEFAULT 0,
	"warning_missing_count" integer DEFAULT 0,
	"last_calculated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "readiness_bid_idx" UNIQUE("bid_project_id")
);
--> statement-breakpoint
CREATE TABLE "bid_readiness_snapshots" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"bid_id" varchar(36) NOT NULL,
	"readiness" text,
	"readiness_score" integer DEFAULT 0,
	"missing_items" text[],
	"missing_docs" text[],
	"incomplete_tasks_count" integer DEFAULT 0,
	"last_computed_at" timestamp,
	CONSTRAINT "bid_readiness_snapshots_tenant_id_bid_id_unique" UNIQUE("tenant_id","bid_id")
);
--> statement-breakpoint
CREATE TABLE "bid_response_line_items" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"bid_response_id" varchar(36) NOT NULL,
	"bid_form_line_item_id" varchar(36) NOT NULL,
	"unit_price" numeric(15, 2),
	"total_price" numeric(15, 2),
	"included" boolean DEFAULT true NOT NULL,
	"comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bid_responses" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"bid_project_id" varchar(36) NOT NULL,
	"bid_form_id" varchar(36) NOT NULL,
	"invitation_id" varchar(36) NOT NULL,
	"vendor_id" varchar(36) NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"submitted_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bid_rfis" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"bid_project_id" varchar(36) NOT NULL,
	"rfi_number" integer NOT NULL,
	"subject" text NOT NULL,
	"question" text NOT NULL,
	"answer" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"due_at" timestamp,
	"answered_at" timestamp,
	"answered_by" varchar(36),
	"attachment_doc_ids" text[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bid_submissions" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"bid_project_id" varchar(36) NOT NULL,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"method" text,
	"confirmation_json" jsonb
);
--> statement-breakpoint
CREATE TABLE "bid_tasks" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"bid_project_id" varchar(36) NOT NULL,
	"task_type" text NOT NULL,
	"title" text NOT NULL,
	"assigned_to" varchar(36),
	"status" text DEFAULT 'pending' NOT NULL,
	"due_at" timestamp,
	"payload_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "binder_jobs" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"bid_project_id" varchar(36) NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"include_merged_pdf" boolean DEFAULT true NOT NULL,
	"include_zip" boolean DEFAULT true NOT NULL,
	"watermark" boolean DEFAULT false NOT NULL,
	"include_legacy_folders" boolean DEFAULT true NOT NULL,
	"zip_document_id" varchar(36),
	"pdf_document_id" varchar(36),
	"zip_storage_key" text,
	"pdf_storage_key" text,
	"error" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_by" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blueprint_annotations" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"blueprint_id" varchar(36) NOT NULL,
	"page_number" integer DEFAULT 1 NOT NULL,
	"annotation_type" text NOT NULL,
	"data_json" jsonb NOT NULL,
	"color" text DEFAULT '#ef4444' NOT NULL,
	"label" text,
	"created_by" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blueprints" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"bid_project_id" varchar(36),
	"project_id" varchar(36),
	"title" text NOT NULL,
	"file_name" text NOT NULL,
	"storage_key" text NOT NULL,
	"file_size" integer NOT NULL,
	"mime_type" text DEFAULT 'application/pdf',
	"page_count" integer DEFAULT 1,
	"scale" text,
	"category" text DEFAULT 'General' NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "building_systems" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36),
	"system_type" text NOT NULL,
	"system_name" text NOT NULL,
	"description" text,
	"scope_of_work" text,
	"specifications" jsonb,
	"status" text DEFAULT 'not_started' NOT NULL,
	"completion_percent" integer DEFAULT 0,
	"contractor_id" varchar(36),
	"foreman_id" varchar(36),
	"commissioning_status" text DEFAULT 'pending',
	"commissioning_date" timestamp,
	"commissioning_notes" text,
	"as_built_status" text DEFAULT 'pending',
	"as_built_doc_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "buyers" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"name" text NOT NULL,
	"type" text,
	"normalized_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cable_schedules" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"system_id" varchar(36),
	"cable_number" text NOT NULL,
	"cable_type" text NOT NULL,
	"from_location" text NOT NULL,
	"from_device" text,
	"from_port" text,
	"to_location" text NOT NULL,
	"to_device" text,
	"to_port" text,
	"length_feet" numeric(8, 2),
	"color" text,
	"pathway" text,
	"status" text DEFAULT 'planned' NOT NULL,
	"test_result" text,
	"test_date" timestamp,
	"tested_by" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_connections" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"provider" text NOT NULL,
	"account_email" text NOT NULL,
	"is_shared_mailbox" boolean DEFAULT false NOT NULL,
	"shared_mailbox_email" text,
	"access_token" text,
	"refresh_token" text,
	"token_expires_at" timestamp,
	"last_sync_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_events" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"owner_user_id" varchar(36),
	"project_id" varchar(36),
	"entity_type" text,
	"entity_id" varchar(36),
	"title" text NOT NULL,
	"description" text,
	"event_type" text NOT NULL,
	"start_at" timestamp NOT NULL,
	"end_at" timestamp,
	"all_day" boolean DEFAULT false NOT NULL,
	"timezone" text DEFAULT 'America/Chicago',
	"location" text,
	"attendees_json" jsonb,
	"source" text DEFAULT 'local' NOT NULL,
	"external_event_id" text,
	"external_calendar_id" text,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"response_status" text DEFAULT 'none' NOT NULL,
	"requires_prep" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_recipients" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"campaign_id" varchar(36) NOT NULL,
	"contact_id" varchar(36),
	"email" text,
	"phone" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp,
	"delivered_at" timestamp,
	"opened_at" timestamp,
	"clicked_at" timestamp,
	"responded_at" timestamp,
	"unsubscribed_at" timestamp,
	"bounced_at" timestamp,
	"interactions_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capability_statements" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"name" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"content_json" jsonb,
	"naics_codes_json" jsonb,
	"past_performance_json" jsonb,
	"certifications_json" jsonb,
	"differentiators_json" jsonb,
	"document_url" text,
	"published_at" timestamp,
	"created_by_user_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capture_activity_log" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" varchar(36) NOT NULL,
	"action_type" text NOT NULL,
	"actor_user_id" varchar(36),
	"actor_type" text DEFAULT 'user',
	"details_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capture_change_events" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"source_type" text NOT NULL,
	"external_id" text NOT NULL,
	"entity_id" varchar(36),
	"change_type" text NOT NULL,
	"change_summary" text,
	"previous_hash" text,
	"new_hash" text,
	"diff_json" jsonb,
	"processed" boolean DEFAULT false,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capture_plan_templates" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"name" text NOT NULL,
	"steps_json" jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capture_plans" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"pipeline_item_id" varchar(36) NOT NULL,
	"win_themes" jsonb,
	"risks" jsonb,
	"teaming_targets" jsonb,
	"timeline_json" jsonb,
	"competitor_analysis" jsonb,
	"capture_strategy" text,
	"notes" text,
	"ai_generated" boolean DEFAULT false,
	"evidence_links" jsonb,
	"confidence_score" integer,
	"prompt_version" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capture_stages" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"name" text NOT NULL,
	"stage_order" integer NOT NULL,
	"color" text DEFAULT '#6366f1' NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capture_tasks" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"capture_plan_id" varchar(36) NOT NULL,
	"pipeline_item_id" varchar(36) NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"due_date" timestamp,
	"owner_user_id" varchar(36),
	"status" text DEFAULT 'pending' NOT NULL,
	"ai_generated" boolean DEFAULT false,
	"order_index" integer DEFAULT 0,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_flow_forecasts" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"forecast_date" timestamp NOT NULL,
	"period_type" text DEFAULT 'weekly' NOT NULL,
	"projected_inflows" numeric(15, 2),
	"projected_outflows" numeric(15, 2),
	"projected_balance" numeric(15, 2),
	"inflow_breakdown_json" jsonb,
	"outflow_breakdown_json" jsonb,
	"assumptions_json" jsonb,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "change_orders" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"co_number" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"change_type" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"amount" numeric(12, 2),
	"days_impact" integer,
	"submitted_by_user_id" varchar(36),
	"submitted_at" timestamp,
	"approved_by_user_id" varchar(36),
	"approved_at" timestamp,
	"client_approved_at" timestamp,
	"attachments_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "change_orders_project_id_co_number_unique" UNIQUE("project_id","co_number")
);
--> statement-breakpoint
CREATE TABLE "checklist_template_items" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" varchar(36) NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"default_order" integer DEFAULT 0 NOT NULL,
	"default_role" text,
	"default_due_offset_days" integer
);
--> statement-breakpoint
CREATE TABLE "checklist_templates" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coi_certificates" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36),
	"vendor_id" varchar(36),
	"policy_type" text NOT NULL,
	"carrier" text,
	"policy_number" text,
	"limits_json" jsonb,
	"effective_date" timestamp,
	"expiry_date" timestamp NOT NULL,
	"document_id" varchar(36),
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "coi_upsert_key" UNIQUE("tenant_id","project_id","vendor_id","policy_type")
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"name" text NOT NULL,
	"legal_name" text,
	"dba" text,
	"type" text DEFAULT 'client' NOT NULL,
	"ein" text,
	"duns_number" text,
	"cage_code" text,
	"uei_number" text,
	"address_line1" text,
	"address_line2" text,
	"city" text,
	"state" text,
	"zip_code" text,
	"country" text DEFAULT 'USA',
	"phone" text,
	"fax" text,
	"website" text,
	"primary_contact_name" text,
	"primary_contact_email" text,
	"primary_contact_phone" text,
	"insurance_expiry_date" timestamp,
	"w9_on_file" boolean DEFAULT false,
	"bonding_capacity" numeric(15, 2),
	"licenses_json" jsonb,
	"certifications_json" jsonb,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"tags_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_certifications" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"certification_code" text NOT NULL,
	"certification_name" text NOT NULL,
	"issuing_agency" text,
	"certificate_number" text,
	"issued_at" timestamp,
	"expires_at" timestamp,
	"status" text DEFAULT 'active' NOT NULL,
	"document_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "company_certifications_tenant_id_certification_code_unique" UNIQUE("tenant_id","certification_code")
);
--> statement-breakpoint
CREATE TABLE "company_profile" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"legal_name" text NOT NULL,
	"dba_name" text,
	"cage_code" text,
	"duns_number" text,
	"uei_number" text,
	"naics_codes" text[],
	"psc_codes" text[],
	"certifications" jsonb,
	"bonding_capacity" jsonb,
	"insurance_limits" jsonb,
	"clearance_level" text,
	"employee_count" integer,
	"year_founded" integer,
	"annual_revenue" numeric(15, 2),
	"headquarters_address" jsonb,
	"service_areas" text[],
	"core_competencies" text[],
	"differentiators" text[],
	"past_performance_highlights" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "company_profile_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "company_synonyms" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"company_id" varchar(36) NOT NULL,
	"synonym" text NOT NULL,
	"normalized_key" text NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"confidence" numeric(4, 2) DEFAULT '1.00',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competitor_awards" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"competitor_id" varchar(36) NOT NULL,
	"contract_number" text,
	"agency" text NOT NULL,
	"naics_code" text,
	"set_aside" text,
	"award_value" numeric(14, 2),
	"awarded_at" timestamp,
	"place_of_performance" text,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competitor_pressure" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"opportunity_id" varchar(36) NOT NULL,
	"pressure_level" text NOT NULL,
	"pressure_score" integer NOT NULL,
	"competitor_count" integer,
	"top_competitors" jsonb,
	"analysis_json" jsonb,
	"rationale" text,
	"ai_generated" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "competitor_pressure_tenant_id_opportunity_id_unique" UNIQUE("tenant_id","opportunity_id")
);
--> statement-breakpoint
CREATE TABLE "competitors" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"name" text NOT NULL,
	"duns_number" text,
	"cage_code" text,
	"website" text,
	"notes" text,
	"naics_codes" text[],
	"set_aside_types" text[],
	"primary_agencies" text[],
	"headquarters_state" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compliance_controls" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"framework_id" varchar(36) NOT NULL,
	"control_code" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category" text,
	"priority" text DEFAULT 'medium',
	"implementation_status" text DEFAULT 'not_implemented' NOT NULL,
	"evidence_requirements" text,
	"responsible_user_id" varchar(36),
	"last_assessed_at" timestamp,
	"next_assessment_at" timestamp,
	"notes_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compliance_evidence" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"control_id" varchar(36) NOT NULL,
	"evidence_type" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"document_url" text,
	"collected_at" timestamp DEFAULT now() NOT NULL,
	"collected_by_user_id" varchar(36),
	"expires_at" timestamp,
	"status" text DEFAULT 'valid' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compliance_frameworks" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"framework_code" text NOT NULL,
	"name" text NOT NULL,
	"version" text,
	"description" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "compliance_frameworks_tenant_id_framework_code_unique" UNIQUE("tenant_id","framework_code")
);
--> statement-breakpoint
CREATE TABLE "compliance_items" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"bid_project_id" varchar(36) NOT NULL,
	"title" text NOT NULL,
	"clause_ref" text,
	"severity" text NOT NULL,
	"status" text DEFAULT 'missing' NOT NULL,
	"folder_sort_order" integer,
	"owner_role" text,
	"due_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compliance_requirements" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"opportunity_id" varchar(36) NOT NULL,
	"clause_number" text NOT NULL,
	"clause_title" text,
	"clause_type" text,
	"is_mandatory" boolean DEFAULT true NOT NULL,
	"company_status" text,
	"gap_description" text,
	"remediation_steps" text,
	"remediation_deadline" timestamp,
	"verified_at" timestamp,
	"verified_by" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connector_status" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"connector_type" text NOT NULL,
	"connection_status" text DEFAULT 'not_connected' NOT NULL,
	"last_sync_at" timestamp,
	"last_sync_status" text,
	"last_sync_message" text,
	"records_synced" integer,
	"config_json" jsonb,
	"credentials_valid" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "connector_status_tenant_id_connector_type_unique" UNIQUE("tenant_id","connector_type")
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"buyer_id" varchar(36),
	"first_name" text,
	"last_name" text,
	"email" text,
	"phone" text,
	"title" text,
	"department" text,
	"notes_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_packets" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"award_decision_id" varchar(36) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"storage_key" text,
	"packet_json" jsonb,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_memory" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"user_id" varchar(36),
	"project_id" varchar(36),
	"memory_type" text NOT NULL,
	"memory_key" text NOT NULL,
	"memory_value" jsonb NOT NULL,
	"context" text,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36),
	"title" text NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cost_codes" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text,
	"parent_id" varchar(36),
	"status" text DEFAULT 'active' NOT NULL,
	"quickbooks_account_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cost_codes_tenant_id_code_unique" UNIQUE("tenant_id","code")
);
--> statement-breakpoint
CREATE TABLE "credentials" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"employee_id" varchar(36) NOT NULL,
	"credential_type" text NOT NULL,
	"credential_name" text NOT NULL,
	"issuing_authority" text,
	"credential_number" text,
	"issued_at" timestamp,
	"expires_at" timestamp,
	"status" text DEFAULT 'active' NOT NULL,
	"document_url" text,
	"notes_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crew_assignments" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"employee_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"assignment_date" timestamp NOT NULL,
	"role" text,
	"shift_start" timestamp,
	"shift_end" timestamp,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"assigned_by_user_id" varchar(36),
	"confirmed_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crew_briefings" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"briefing_type" text NOT NULL,
	"title" text NOT NULL,
	"content_json" jsonb,
	"ppe_requirements" text[],
	"safety_checklist_json" jsonb,
	"drawing_references" text[],
	"sent_at" timestamp,
	"sent_to_emails" text[],
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_logs" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"log_date" timestamp NOT NULL,
	"author_user_id" varchar(36),
	"weather_json" jsonb,
	"work_performed_json" jsonb,
	"labor_json" jsonb,
	"equipment_json" jsonb,
	"materials_json" jsonb,
	"visitors_json" jsonb,
	"issues_json" jsonb,
	"safety_notes_json" jsonb,
	"photos_json" jsonb,
	"notes" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"submitted_at" timestamp,
	"approved_by_user_id" varchar(36),
	"approved_at" timestamp,
	"audio_document_id" varchar(36),
	"transcript" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "daily_logs_project_id_log_date_unique" UNIQUE("project_id","log_date")
);
--> statement-breakpoint
CREATE TABLE "daily_plans" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"plan_date" timestamp NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"tasks_json" jsonb,
	"priorities_json" jsonb,
	"meetings_json" jsonb,
	"deliveries_json" jsonb,
	"weather_json" jsonb,
	"generated_at" timestamp,
	"acknowledged_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "daily_plans_user_id_plan_date_unique" UNIQUE("user_id","plan_date")
);
--> statement-breakpoint
CREATE TABLE "daily_snapshots" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"snapshot_date" timestamp NOT NULL,
	"metrics_json" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dashboard_tasks" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"due_at" timestamp,
	"snooze_until" timestamp,
	"position" integer DEFAULT 0 NOT NULL,
	"source" text DEFAULT 'system' NOT NULL,
	"source_entity_type" text,
	"source_entity_id" varchar(36),
	"action_type" text,
	"action_payload" jsonb,
	"completed_at" timestamp,
	"completed_by" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dead_letter_queue" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"original_job_id" varchar(36),
	"job_type" text NOT NULL,
	"payload_json" jsonb,
	"error_json" jsonb,
	"failed_at" timestamp DEFAULT now() NOT NULL,
	"reviewed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "distributed_locks" (
	"lock_key" text PRIMARY KEY NOT NULL,
	"locked_by" text NOT NULL,
	"locked_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doc_files" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"workspace_id" varchar(36) NOT NULL,
	"file_name" text NOT NULL,
	"file_type" text,
	"content_hash" text,
	"version" integer DEFAULT 1 NOT NULL,
	"egnyte_file_id" text,
	"sharepoint_file_id" text,
	"status" text DEFAULT 'current' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doc_workspaces" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" varchar(36) NOT NULL,
	"name" text NOT NULL,
	"egnyte_path_ref" text,
	"sharepoint_path_ref" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_ai_embeddings" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"egnyte_item_id" varchar(36) NOT NULL,
	"metadata_id" varchar(36),
	"chunk_index" integer DEFAULT 0 NOT NULL,
	"chunk_text" text NOT NULL,
	"embedding_vector" jsonb,
	"embedding_model" text DEFAULT 'text-embedding-ada-002',
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "document_ai_embeddings_egnyte_item_id_chunk_index_unique" UNIQUE("egnyte_item_id","chunk_index")
);
--> statement-breakpoint
CREATE TABLE "document_ai_metadata" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"egnyte_item_id" varchar(36) NOT NULL,
	"category_id" varchar(36),
	"category_confidence" numeric(5, 4),
	"subcategory" text,
	"document_title" text,
	"document_date" timestamp,
	"expiration_date" timestamp,
	"contract_value" numeric(15, 2),
	"currency" text DEFAULT 'USD',
	"parties" jsonb,
	"project_name" text,
	"project_number" text,
	"key_dates" jsonb,
	"drawing_number" text,
	"revision_number" text,
	"rfi_number" text,
	"submittal_number" text,
	"change_order_number" text,
	"invoice_number" text,
	"permit_number" text,
	"policy_number" text,
	"summary" text,
	"key_terms" text[],
	"ocr_text" text,
	"page_count" integer,
	"linked_bid_id" varchar(36),
	"linked_opportunity_id" varchar(36),
	"link_confidence" numeric(5, 4),
	"link_method" text,
	"processing_status" text DEFAULT 'pending' NOT NULL,
	"processed_at" timestamp,
	"processing_error" text,
	"is_duplicate" boolean DEFAULT false,
	"duplicate_of_id" varchar(36),
	"needs_review" boolean DEFAULT false,
	"review_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_alerts" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"alert_type" text NOT NULL,
	"severity" text DEFAULT 'info' NOT NULL,
	"egnyte_item_id" varchar(36),
	"bid_id" varchar(36),
	"opportunity_id" varchar(36),
	"title" text NOT NULL,
	"message" text NOT NULL,
	"action_url" text,
	"action_label" text,
	"status" text DEFAULT 'active' NOT NULL,
	"acknowledged_at" timestamp,
	"acknowledged_by" varchar(36),
	"resolved_at" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_audit_log" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"document_id" varchar(36),
	"action" text NOT NULL,
	"actor_id" varchar(36),
	"actor_name" text,
	"actor_type" text DEFAULT 'user' NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"details_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_categories" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"icon" text,
	"color" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_embeddings" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"document_id" varchar(36),
	"entity_type" text NOT NULL,
	"entity_id" varchar(36) NOT NULL,
	"chunk_index" integer DEFAULT 0 NOT NULL,
	"chunk_text" text NOT NULL,
	"embedding_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_processing_queue" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"egnyte_item_id" varchar(36) NOT NULL,
	"processing_type" text NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0,
	"max_attempts" integer DEFAULT 3,
	"result" jsonb,
	"error" text,
	"scheduled_for" timestamp DEFAULT now(),
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_requirements" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category_id" varchar(36),
	"bid_type" text,
	"contract_type" text,
	"min_contract_value" numeric(15, 2),
	"max_contract_value" numeric(15, 2),
	"is_required" boolean DEFAULT true NOT NULL,
	"due_offset_days" integer,
	"reminder_days" integer[],
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_templates" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"key" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"template_json" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_text_content" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"document_id" varchar(36) NOT NULL,
	"page_number" integer,
	"text_content" text NOT NULL,
	"ocr_engine" text DEFAULT 'tesseract',
	"ocr_confidence" numeric(5, 2),
	"processed_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drawing_sets" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36),
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"issued_date" timestamp,
	"issued_by" varchar(36),
	"locked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drawing_sheets" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36),
	"sheet_number" text NOT NULL,
	"sheet_title" text NOT NULL,
	"discipline" text NOT NULL,
	"drawing_type" text,
	"version" integer DEFAULT 1 NOT NULL,
	"is_current_set" boolean DEFAULT true NOT NULL,
	"previous_version_id" varchar(36),
	"storage_key" text NOT NULL,
	"file_type" text NOT NULL,
	"file_size_bytes" integer,
	"scale" text,
	"scale_factor" numeric(10, 4),
	"scale_unit" text DEFAULT 'feet',
	"page_count" integer DEFAULT 1,
	"rotation" integer DEFAULT 0,
	"layers" jsonb,
	"revision_date" timestamp,
	"revision_number" text,
	"drawn_by" text,
	"checked_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "egnyte_auth_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"attempt_type" text NOT NULL,
	"endpoint_url" text NOT NULL,
	"redirect_uri" text,
	"client_id_masked" text,
	"status_code" integer,
	"response_body" text,
	"error_message" text,
	"success" boolean DEFAULT false NOT NULL,
	"has_refresh_token" boolean,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "egnyte_items" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"egnyte_entry_id" text NOT NULL,
	"egnyte_path" text NOT NULL,
	"egnyte_parent_id" text,
	"root_path_id" varchar(36),
	"name" text NOT NULL,
	"is_folder" boolean DEFAULT false NOT NULL,
	"file_type" text,
	"mime_type" text,
	"file_size_bytes" integer,
	"checksum" text,
	"egnyte_last_modified" timestamp,
	"egnyte_created_at" timestamp,
	"mapped_entity_type" text,
	"mapped_entity_id" varchar(36),
	"folder_type" text,
	"sync_status" text DEFAULT 'pending' NOT NULL,
	"last_synced_at" timestamp,
	"sync_error" text,
	"version_count" integer DEFAULT 1,
	"latest_version_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "egnyte_root_paths" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"path" text NOT NULL,
	"label" text NOT NULL,
	"path_type" text DEFAULT 'primary' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_scanned_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "egnyte_sync_events" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"event_type" text NOT NULL,
	"egnyte_entry_id" text NOT NULL,
	"egnyte_path" text,
	"old_path" text,
	"event_data" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"retry_count" integer DEFAULT 0,
	"last_error" text,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "egnyte_sync_state" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"sync_type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"total_items" integer DEFAULT 0,
	"processed_items" integer DEFAULT 0,
	"error_count" integer DEFAULT 0,
	"last_cursor" text,
	"last_event_time" timestamp,
	"started_at" timestamp,
	"completed_at" timestamp,
	"last_checkpoint" timestamp,
	"last_error" text,
	"error_details" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "egnyte_unassigned" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"item_id" varchar(36) NOT NULL,
	"reason" text NOT NULL,
	"suggested_mapping" jsonb,
	"review_status" text DEFAULT 'pending' NOT NULL,
	"assigned_by" varchar(36),
	"assigned_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "egnyte_versions" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"item_id" varchar(36) NOT NULL,
	"egnyte_version_id" text NOT NULL,
	"version_number" integer NOT NULL,
	"file_size_bytes" integer,
	"checksum" text,
	"uploaded_by" text,
	"uploaded_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_messages" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"entity_type" text,
	"entity_id" varchar(36),
	"direction" text DEFAULT 'outbound' NOT NULL,
	"subject" text,
	"body_html" text,
	"body_text" text,
	"from_email" text,
	"to_emails" text[],
	"status" text DEFAULT 'draft' NOT NULL,
	"sent_at" timestamp,
	"external_message_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_sequences" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"name" text NOT NULL,
	"trigger_type" text NOT NULL,
	"steps_json" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"user_id" varchar(36),
	"employee_number" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text,
	"phone" text,
	"department" text,
	"job_title" text,
	"employment_type" text DEFAULT 'full_time' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"hire_date" timestamp,
	"termination_date" timestamp,
	"supervisor_id" varchar(36),
	"hourly_rate" numeric(10, 2),
	"salary_amount" numeric(12, 2),
	"emergency_contact_json" jsonb,
	"address_json" jsonb,
	"skills_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "employees_tenant_id_employee_number_unique" UNIQUE("tenant_id","employee_number")
);
--> statement-breakpoint
CREATE TABLE "entity_attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) DEFAULT 'blackhawk-default' NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" varchar(36) NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text,
	"size" integer,
	"storage_path" text,
	"note" text,
	"uploaded_by" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_embeddings" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" varchar(36) NOT NULL,
	"embedding_text" text NOT NULL,
	"embedding_vector" jsonb,
	"model_version" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "entity_embeddings_tenant_id_entity_type_entity_id_unique" UNIQUE("tenant_id","entity_type","entity_id")
);
--> statement-breakpoint
CREATE TABLE "entity_links" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"source_type" text NOT NULL,
	"source_id" varchar(36) NOT NULL,
	"target_type" text NOT NULL,
	"target_id" varchar(36) NOT NULL,
	"relation_label" text DEFAULT 'related' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_by" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_snapshots" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" varchar(36) NOT NULL,
	"version" integer NOT NULL,
	"snapshot_json" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_watchers" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) DEFAULT 'blackhawk-default' NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" varchar(36) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"name" text,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entity_watchers_unique" UNIQUE("tenant_id","entity_type","entity_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "equipment" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"asset_tag" text NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"make" text,
	"model" text,
	"serial_number" text,
	"year_acquired" integer,
	"purchase_cost" numeric(12, 2),
	"current_value" numeric(12, 2),
	"status" text DEFAULT 'available' NOT NULL,
	"current_warehouse_id" varchar(36),
	"current_project_id" varchar(36),
	"gps_tracker_id" text,
	"last_gps_lat" numeric(10, 7),
	"last_gps_lng" numeric(10, 7),
	"last_gps_at" timestamp,
	"operating_hours" numeric(10, 2) DEFAULT '0',
	"next_maintenance_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "equipment_tenant_id_asset_tag_unique" UNIQUE("tenant_id","asset_tag")
);
--> statement-breakpoint
CREATE TABLE "event_attendees" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" varchar(36) NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"role" text DEFAULT 'required' NOT NULL,
	"response_status" text DEFAULT 'none' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_outbox" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" varchar(36) NOT NULL,
	"handler_name" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"event_type" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" varchar(36) NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"triggered_by" varchar(36),
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "executive_briefings" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"briefing_type" text NOT NULL,
	"briefing_date" timestamp NOT NULL,
	"recipient_user_ids" text[],
	"status" text DEFAULT 'draft' NOT NULL,
	"summary_text" text,
	"highlights_json" jsonb,
	"risks_json" jsonb,
	"metrics_json" jsonb,
	"action_items_json" jsonb,
	"generated_at" timestamp,
	"sent_at" timestamp,
	"audio_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36),
	"flag_key" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"description" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "federal_awards" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"usaspending_award_id" text,
	"piid" text,
	"fain" text,
	"award_type" text,
	"award_description" text,
	"total_obligated_amount" numeric(15, 2),
	"total_outlay_amount" numeric(15, 2),
	"awarding_agency_name" text,
	"awarding_sub_agency_name" text,
	"awarding_agency_code" text,
	"funding_agency_name" text,
	"recipient_name" text,
	"recipient_uei" text,
	"recipient_duns" text,
	"naics_code" text,
	"naics_description" text,
	"psc_code" text,
	"psc_description" text,
	"set_aside_type" text,
	"set_aside_description" text,
	"start_date" timestamp,
	"end_date" timestamp,
	"last_modified_date" timestamp,
	"place_of_performance_city" text,
	"place_of_performance_state" text,
	"place_of_performance_country" text,
	"contract_type" text,
	"extent_competed" text,
	"solicitation_number" text,
	"raw_json" jsonb,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fit_profiles" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"name" text NOT NULL,
	"profile_json" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fit_profiles_v4" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true,
	"min_lead_days" integer DEFAULT 30,
	"pursue_threshold" integer DEFAULT 85,
	"maybe_threshold" integer DEFAULT 65,
	"allowed_states" text[],
	"excluded_keywords" text[],
	"included_keywords" text[],
	"include_naics" text[],
	"exclude_naics" text[],
	"include_psc" text[],
	"exclude_psc" text[],
	"preferred_agencies" text[],
	"excluded_agencies" text[],
	"set_aside_preferences" text[],
	"vehicle_constraints" text[],
	"scoring_weights" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "folder_sections" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"jacket_type" text NOT NULL,
	"sort_order" integer NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"required_for_submit" boolean DEFAULT false,
	"accepted_file_types" text[],
	"auto_file_rules" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "folder_sections_tenant_id_jacket_type_code_unique" UNIQUE("tenant_id","jacket_type","code")
);
--> statement-breakpoint
CREATE TABLE "gps_locations" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" varchar(36) NOT NULL,
	"gps_lat" numeric(10, 7) NOT NULL,
	"gps_lng" numeric(10, 7) NOT NULL,
	"accuracy" numeric(8, 2),
	"speed" numeric(8, 2),
	"heading" numeric(5, 2),
	"recorded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "herbie_actions" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"user_id" varchar(36),
	"action_type" text NOT NULL,
	"action_category" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"reasoning" text,
	"evidence_json" jsonb,
	"related_entity_type" text,
	"related_entity_id" varchar(36),
	"status" text DEFAULT 'pending' NOT NULL,
	"requires_approval" boolean DEFAULT false NOT NULL,
	"approval_request_id" varchar(36),
	"result_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "herbie_decisions" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36),
	"summary" text NOT NULL,
	"rationale" text,
	"decided_by" text NOT NULL,
	"decided_at" timestamp DEFAULT now() NOT NULL,
	"related_entity_type" text,
	"related_entity_id" varchar(36),
	"metadata_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "herbie_digest_dismissals" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" varchar(36) NOT NULL,
	"dismissed_until" timestamp NOT NULL,
	"dismissed_by" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "herbie_extraction_evidence" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"bid_project_id" varchar(36),
	"opportunity_id" varchar(36),
	"field_category" text NOT NULL,
	"field_name" text NOT NULL,
	"extracted_value" text,
	"extracted_value_json" jsonb,
	"source_document_id" varchar(36),
	"egnyte_item_id" varchar(36),
	"page_number" integer,
	"snippet_text" text,
	"snippet_hash" text,
	"bounding_box_json" jsonb,
	"confidence" numeric(4, 2) NOT NULL,
	"extraction_method" text NOT NULL,
	"verified" boolean DEFAULT false,
	"verified_at" timestamp,
	"verified_by" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "herbie_facts" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36),
	"subject_type" text NOT NULL,
	"subject_id" varchar(36),
	"predicate" text NOT NULL,
	"object" text,
	"object_json" jsonb,
	"source_type" text NOT NULL,
	"source_id" varchar(36),
	"confidence" numeric(4, 2) NOT NULL,
	"extracted_at" timestamp DEFAULT now() NOT NULL,
	"superseded_by_id" varchar(36),
	"superseded_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "herbie_outreach_log" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"bid_project_id" varchar(36),
	"approval_request_id" varchar(36),
	"recipient_email" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "herbie_relationships" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36),
	"contact_id" varchar(36),
	"vendor_id" varchar(36),
	"company_id" varchar(36),
	"role" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "herbie_review_queue" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"bid_project_id" varchar(36),
	"opportunity_id" varchar(36),
	"document_id" varchar(36),
	"review_type" text NOT NULL,
	"action_proposed" text NOT NULL,
	"confidence" numeric(4, 2) NOT NULL,
	"reasoning_text" text,
	"alternatives_json" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"resolved_at" timestamp,
	"resolved_by" varchar(36),
	"resolution_action" text,
	"resolution_notes" text,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "highergov_opportunities" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"source" text DEFAULT 'highergov' NOT NULL,
	"notice_id" text NOT NULL,
	"solicitation_number" text,
	"title" text NOT NULL,
	"agency" text,
	"sub_agency" text,
	"posted_at" timestamp,
	"due_at" timestamp,
	"url" text,
	"naics_code" text,
	"set_aside" text,
	"estimated_value" numeric(14, 2),
	"place_of_performance" text,
	"status" text DEFAULT 'new' NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"raw_payload_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"converted_to_opportunity_id" varchar(36),
	"bid_project_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "highergov_opportunities_tenant_id_source_notice_id_unique" UNIQUE("tenant_id","source","notice_id")
);
--> statement-breakpoint
CREATE TABLE "highergov_raw_archive" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"source_type" text NOT NULL,
	"external_id" text NOT NULL,
	"hash_signature" text NOT NULL,
	"raw_payload" jsonb NOT NULL,
	"source_url" text,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "highergov_raw_archive_tenant_id_source_type_external_id_unique" UNIQUE("tenant_id","source_type","external_id")
);
--> statement-breakpoint
CREATE TABLE "highergov_sync_runs" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"source" text DEFAULT 'highergov' NOT NULL,
	"mode" text DEFAULT 'nightly' NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"finished_at" timestamp,
	"fetched_count" integer DEFAULT 0 NOT NULL,
	"inserted_count" integer DEFAULT 0 NOT NULL,
	"updated_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"errors_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_cursor" text,
	"error_log_text" text
);
--> statement-breakpoint
CREATE TABLE "highergov_watch_profiles" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"naics_csv" text DEFAULT '' NOT NULL,
	"keywords_csv" text DEFAULT '' NOT NULL,
	"agencies_csv" text DEFAULT '' NOT NULL,
	"states_csv" text DEFAULT '' NOT NULL,
	"min_value" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"max_value" numeric(14, 2),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"response_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	CONSTRAINT "idempotency_keys_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"type" text NOT NULL,
	"severity" text DEFAULT 'warning' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'open' NOT NULL,
	"entity_type" text,
	"entity_id" varchar(36),
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_events" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36),
	"bid_project_id" varchar(36),
	"run_id" varchar(36),
	"event_type" text NOT NULL,
	"entity_type" text,
	"entity_id" varchar(36),
	"message" text,
	"details_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_health" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"integration_key" text NOT NULL,
	"status" text DEFAULT 'healthy' NOT NULL,
	"last_check_at" timestamp DEFAULT now() NOT NULL,
	"last_success_at" timestamp,
	"last_error_at" timestamp,
	"error_count" integer DEFAULT 0 NOT NULL,
	"meta_json" jsonb
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text,
	"unit" text DEFAULT 'each' NOT NULL,
	"unit_cost" numeric(12, 2),
	"reorder_point" integer DEFAULT 0,
	"preferred_vendor_id" varchar(36),
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_items_tenant_id_sku_unique" UNIQUE("tenant_id","sku")
);
--> statement-breakpoint
CREATE TABLE "inventory_levels" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"item_id" varchar(36) NOT NULL,
	"warehouse_id" varchar(36) NOT NULL,
	"quantity" numeric(12, 2) DEFAULT '0' NOT NULL,
	"reserved_qty" numeric(12, 2) DEFAULT '0',
	"last_counted_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_levels_item_id_warehouse_id_unique" UNIQUE("item_id","warehouse_id")
);
--> statement-breakpoint
CREATE TABLE "inventory_transactions" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"item_id" varchar(36) NOT NULL,
	"warehouse_id" varchar(36) NOT NULL,
	"transaction_type" text NOT NULL,
	"quantity" numeric(12, 2) NOT NULL,
	"reference_type" text,
	"reference_id" varchar(36),
	"notes" text,
	"created_by_user_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"invoice_number" text NOT NULL,
	"invoice_type" text DEFAULT 'receivable' NOT NULL,
	"entity_type" text,
	"entity_id" varchar(36),
	"vendor_id" varchar(36),
	"client_id" varchar(36),
	"project_id" varchar(36),
	"status" text DEFAULT 'draft' NOT NULL,
	"subtotal" numeric(12, 2) DEFAULT '0',
	"tax_amount" numeric(12, 2) DEFAULT '0',
	"total_amount" numeric(12, 2) DEFAULT '0',
	"paid_amount" numeric(12, 2) DEFAULT '0',
	"invoice_date" timestamp,
	"due_date" timestamp,
	"paid_date" timestamp,
	"quickbooks_id" text,
	"notes_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_tenant_id_invoice_number_unique" UNIQUE("tenant_id","invoice_number")
);
--> statement-breakpoint
CREATE TABLE "jacket_build_jobs" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"bid_project_id" varchar(36) NOT NULL,
	"mode" text DEFAULT 'build' NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"docs_created" integer DEFAULT 0 NOT NULL,
	"docs_skipped" integer DEFAULT 0 NOT NULL,
	"docs_failed" integer DEFAULT 0 NOT NULL,
	"result_json" jsonb,
	"error_summary" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "jacket_documents" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"folder_id" varchar(36) NOT NULL,
	"title" text NOT NULL,
	"file_name" text NOT NULL,
	"file_type" text NOT NULL,
	"mime_type" text,
	"file_size_bytes" integer NOT NULL,
	"storage_key" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"latest_version" boolean DEFAULT true NOT NULL,
	"previous_version_id" varchar(36),
	"document_type" text,
	"effective_date" timestamp,
	"expiration_date" timestamp,
	"tags_json" jsonb,
	"keywords" text,
	"ocr_text" text,
	"visibility" text DEFAULT 'internal' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"source_reference" text,
	"generated_by" text,
	"generated_type" text,
	"uploaded_by" varchar(36),
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"is_generated" boolean DEFAULT false NOT NULL,
	"binder_job_id" varchar(36),
	"status" text DEFAULT 'active' NOT NULL,
	"storage_missing" boolean DEFAULT false NOT NULL,
	"storage_checked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jacket_folders" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"jacket_type" text NOT NULL,
	"jacket_id" varchar(36) NOT NULL,
	"folder_section_id" varchar(36),
	"parent_folder_id" varchar(36),
	"name" text NOT NULL,
	"path" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"document_count" integer DEFAULT 0,
	"total_size_bytes" integer DEFAULT 0,
	"is_system_folder" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jacket_timeline" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"jacket_type" text NOT NULL,
	"jacket_id" varchar(36) NOT NULL,
	"event_type" text NOT NULL,
	"event_title" text NOT NULL,
	"event_description" text,
	"related_entity_type" text,
	"related_entity_id" varchar(36),
	"actor_id" varchar(36),
	"actor_name" text,
	"actor_type" text DEFAULT 'user',
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_locks" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"job_name" text NOT NULL,
	"locked_until" timestamp NOT NULL,
	"locked_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "jl_tenant_job_uniq" UNIQUE("tenant_id","job_name")
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" varchar(36) NOT NULL,
	"attempt" integer NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	"status" text DEFAULT 'running' NOT NULL,
	"result_json" jsonb,
	"error_json" jsonb
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"job_type" text NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"payload_json" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"scheduled_at" timestamp,
	"started_at" timestamp,
	"completed_at" timestamp,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_documents" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"document_type" text NOT NULL,
	"source_url" text,
	"source_system" text,
	"metadata" jsonb,
	"status" text DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "labor_rates" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"labor_category" text NOT NULL,
	"hourly_rate" numeric(10, 2) NOT NULL,
	"burdened_rate" numeric(10, 2),
	"effective_date" timestamp NOT NULL,
	"expiration_date" timestamp,
	"rate_type" text DEFAULT 'internal' NOT NULL,
	"wage_area_code" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_weights" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"attribute_name" text NOT NULL,
	"attribute_value" text,
	"weight" numeric(5, 3) DEFAULT '1.0' NOT NULL,
	"win_count" integer DEFAULT 0 NOT NULL,
	"loss_count" integer DEFAULT 0 NOT NULL,
	"no_bid_count" integer DEFAULT 0 NOT NULL,
	"last_updated" timestamp DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "learning_weights_tenant_id_attribute_name_attribute_value_unique" UNIQUE("tenant_id","attribute_name","attribute_value")
);
--> statement-breakpoint
CREATE TABLE "lessons_learned" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"bid_project_id" varchar(36) NOT NULL,
	"tags_json" jsonb,
	"learnings_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lien_waiver_events" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"waiver_id" varchar(36) NOT NULL,
	"event_type" text NOT NULL,
	"actor_user_id" varchar(36),
	"actor_name" text,
	"payload_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lien_waiver_reminders" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lien_waiver_id" varchar(36) NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"reminder_number" integer NOT NULL,
	"scheduled_for" timestamp NOT NULL,
	"sent_at" timestamp,
	"channel" text DEFAULT 'email' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lien_waiver_templates" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"state" varchar(2) NOT NULL,
	"waiver_type" text NOT NULL,
	"template_body" text NOT NULL,
	"statutory" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lien_waivers" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"vendor_id" varchar(36) NOT NULL,
	"subcontract_id" varchar(36),
	"pay_app_id" varchar(36),
	"waiver_number" text NOT NULL,
	"waiver_type" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"state" varchar(2),
	"through_date" timestamp NOT NULL,
	"payment_date" timestamp,
	"payment_amount" numeric(15, 2) NOT NULL,
	"exceptions_json" jsonb,
	"vendor_name" text,
	"vendor_email" text,
	"vendor_address" text,
	"claimant_name" text,
	"claimant_address" text,
	"owner_name" text,
	"project_description" text,
	"property_description" text,
	"filled_body" text,
	"signer_name" text,
	"signer_title" text,
	"signer_email" text,
	"sign_token" varchar(64),
	"sign_token_expires_at" timestamp,
	"signature_data_url" text,
	"signed_ip_address" varchar(64),
	"sent_at" timestamp,
	"signed_at" timestamp,
	"received_at" timestamp,
	"voided_at" timestamp,
	"expires_at" timestamp,
	"document_id" varchar(36),
	"notes_text" text,
	"created_by_user_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lien_waivers_tenant_id_waiver_number_unique" UNIQUE("tenant_id","waiver_number")
);
--> statement-breakpoint
CREATE TABLE "maintenance_records" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"equipment_id" varchar(36) NOT NULL,
	"maintenance_type" text NOT NULL,
	"description" text,
	"performed_by_user_id" varchar(36),
	"vendor_id" varchar(36),
	"cost" numeric(12, 2),
	"hours_at_maintenance" numeric(10, 2),
	"performed_at" timestamp DEFAULT now() NOT NULL,
	"next_maintenance_at" timestamp,
	"notes_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_campaigns" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"campaign_type" text NOT NULL,
	"channel" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"target_audience_json" jsonb,
	"content_json" jsonb,
	"scheduled_at" timestamp,
	"started_at" timestamp,
	"completed_at" timestamp,
	"budget_amount" numeric(12, 2),
	"spent_amount" numeric(12, 2),
	"goals_json" jsonb,
	"results_json" jsonb,
	"created_by_user_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "material_forecasts" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36),
	"opportunity_id" varchar(36),
	"material_category" text NOT NULL,
	"item_description" text NOT NULL,
	"estimated_quantity" numeric(12, 2),
	"unit" text,
	"estimated_unit_cost" numeric(12, 2),
	"estimated_total_cost" numeric(15, 2),
	"lead_time_days" integer,
	"preferred_vendor_id" varchar(36),
	"needed_by_date" timestamp,
	"status" text DEFAULT 'forecast' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metric_snapshots" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"metric_key" text NOT NULL,
	"metric_value" numeric(15, 2) DEFAULT '0' NOT NULL,
	"is_seeded" boolean DEFAULT false NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monitor_events" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"monitor_id" text NOT NULL,
	"entity_id" varchar(36),
	"window_date" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "monitor_events_uidx" UNIQUE("monitor_id","entity_id","window_date")
);
--> statement-breakpoint
CREATE TABLE "my_day_activity_log" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"user_id" varchar(36),
	"item_id" varchar(36),
	"item_type" text,
	"action" text NOT NULL,
	"meta_json" jsonb,
	"ts" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "my_day_item_scores" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"item_id" varchar(36) NOT NULL,
	"item_type" text NOT NULL,
	"user_id" varchar(36),
	"score" integer NOT NULL,
	"band" text NOT NULL,
	"components_json" jsonb NOT NULL,
	"computed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "my_day_item_scores_item" UNIQUE("tenant_id","item_id","item_type")
);
--> statement-breakpoint
CREATE TABLE "my_day_scoring_rules" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"name" text NOT NULL,
	"weights_json" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "my_day_scoring_rules_tenant_name" UNIQUE("tenant_id","name")
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"notification_type" text NOT NULL,
	"in_app" boolean DEFAULT true,
	"email" boolean DEFAULT true,
	"email_digest" text DEFAULT 'instant',
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preferences_user_id_notification_type_unique" UNIQUE("user_id","notification_type")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"user_id" varchar(36),
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text,
	"entity_type" text,
	"entity_id" varchar(36),
	"priority" text DEFAULT 'normal' NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"action_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_tasks" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"employee_id" varchar(36) NOT NULL,
	"task_type" text NOT NULL,
	"task_name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"due_at" timestamp,
	"completed_at" timestamp,
	"completed_by_user_id" varchar(36),
	"document_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"source_system_id" varchar(36),
	"external_id" text,
	"buyer_id" varchar(36),
	"title" text NOT NULL,
	"synopsis" text,
	"description" text,
	"url" text,
	"status" text DEFAULT 'open' NOT NULL,
	"status_raw" text,
	"status_normalized" text DEFAULT 'prospecting' NOT NULL,
	"probability" integer,
	"close_date" timestamp,
	"awarded_date" timestamp,
	"naics_codes" text[],
	"set_aside" text,
	"contract_value" numeric(15, 2),
	"posted_at" timestamp,
	"due_at" timestamp,
	"last_seen_at" timestamp DEFAULT now(),
	"location_json" jsonb,
	"raw_ref_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "opportunities_tenant_id_source_system_id_external_id_unique" UNIQUE("tenant_id","source_system_id","external_id")
);
--> statement-breakpoint
CREATE TABLE "opportunity_amendments" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"opportunity_id" varchar(36) NOT NULL,
	"amendment_no" integer NOT NULL,
	"change_summary" text,
	"raw_ref_id" varchar(36),
	"due_at_override" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity_capture" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"opportunity_id" varchar(36) NOT NULL,
	"stage_id" varchar(36),
	"owner_id" varchar(36),
	"pwin_score" integer,
	"next_step_description" text,
	"next_step_due_date" timestamp,
	"capture_notes" text,
	"competitor_intel" jsonb,
	"decision_makers" jsonb,
	"incumbent_info" jsonb,
	"capture_strategy" text,
	"last_touch_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity_decisions" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"opportunity_id" varchar(36) NOT NULL,
	"decision" text NOT NULL,
	"fit_score" integer DEFAULT 0,
	"risk_level" text DEFAULT 'medium',
	"lead_days" integer,
	"explanation" text,
	"factor_breakdown" jsonb,
	"ai_confidence" integer,
	"decided_by" text DEFAULT 'herbie',
	"decided_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "opportunity_decisions_tenant_id_opportunity_id_unique" UNIQUE("tenant_id","opportunity_id")
);
--> statement-breakpoint
CREATE TABLE "opportunity_requirements" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"opportunity_id" varchar(36) NOT NULL,
	"requirement_type" text NOT NULL,
	"requirement_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity_scores" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"opportunity_id" varchar(36) NOT NULL,
	"fit_profile_id" varchar(36),
	"scoring_model_id" varchar(36),
	"score" integer NOT NULL,
	"recommended_action" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity_sources" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"opportunity_id" varchar(36) NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"source_url" text,
	"source_hash_signature" text,
	"solicitation_number" text,
	"notice_type" text,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "opportunity_sources_tenant_id_source_external_id_unique" UNIQUE("tenant_id","source","external_id")
);
--> statement-breakpoint
CREATE TABLE "opportunity_teaming" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"opportunity_id" varchar(36) NOT NULL,
	"partner_id" varchar(36) NOT NULL,
	"role" text NOT NULL,
	"work_share_percent" integer,
	"status" text DEFAULT 'proposed' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity_watchlist" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"opportunity_id" varchar(36) NOT NULL,
	"watch_reason" text,
	"created_by_user_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_memory_approvals" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"memory_item_id" varchar(36) NOT NULL,
	"proposed_title" text NOT NULL,
	"proposed_summary" text DEFAULT '' NOT NULL,
	"proposed_body" text DEFAULT '' NOT NULL,
	"proposed_category" text DEFAULT 'general' NOT NULL,
	"proposed_sensitivity" text DEFAULT 'internal' NOT NULL,
	"proposed_tags_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"proposed_meta_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewer_note" text,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" varchar(36),
	"created_by" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_memory_entity_links" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"memory_item_id" varchar(36) NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" varchar(36) NOT NULL,
	"role" text DEFAULT 'reference' NOT NULL,
	"created_by" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_memory_items" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"sensitivity" text DEFAULT 'internal' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"requires_approval" boolean DEFAULT true NOT NULL,
	"approved_at" timestamp with time zone,
	"approved_by" varchar(36),
	"tags_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"meta_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"search_text" text DEFAULT '' NOT NULL,
	"created_by" varchar(36),
	"updated_by" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_drafts" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"pipeline_item_id" varchar(36) NOT NULL,
	"draft_type" text NOT NULL,
	"audience" text NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"tone" text DEFAULT 'professional',
	"editable_by_user" boolean DEFAULT true,
	"ai_generated" boolean DEFAULT true,
	"evidence_links" jsonb,
	"confidence_score" integer,
	"prompt_version" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_recommendations" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"opportunity_id" varchar(36) NOT NULL,
	"partner_name" text NOT NULL,
	"partner_type" text NOT NULL,
	"capabilities" text[],
	"relevance_score" integer,
	"rationale" text,
	"contact_info" jsonb,
	"ai_generated" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_shortlist" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"opportunity_id" varchar(36) NOT NULL,
	"recommendation_id" varchar(36),
	"partner_name" text NOT NULL,
	"status" text DEFAULT 'shortlisted' NOT NULL,
	"notes" text,
	"outreach_draft_id" varchar(36),
	"added_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "partner_shortlist_tenant_id_opportunity_id_partner_name_unique" UNIQUE("tenant_id","opportunity_id","partner_name")
);
--> statement-breakpoint
CREATE TABLE "partners" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"name" text NOT NULL,
	"capabilities" text,
	"naics" text[],
	"trades" text[],
	"regions" text[],
	"contact_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pay_applications" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"pay_app_number" integer NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"scheduled_values" numeric(15, 2),
	"previously_billed" numeric(15, 2),
	"current_billed" numeric(15, 2),
	"retainage_held" numeric(15, 2),
	"retainage_released" numeric(15, 2),
	"net_payable" numeric(15, 2),
	"submitted_by_user_id" varchar(36),
	"submitted_at" timestamp,
	"approved_by_user_id" varchar(36),
	"approved_at" timestamp,
	"paid_at" timestamp,
	"paid_amount" numeric(15, 2),
	"lien_waiver_status" text,
	"attachments_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pay_applications_project_id_pay_app_number_unique" UNIQUE("project_id","pay_app_number")
);
--> statement-breakpoint
CREATE TABLE "performance_reviews" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"employee_id" varchar(36) NOT NULL,
	"review_period_start" timestamp NOT NULL,
	"review_period_end" timestamp NOT NULL,
	"reviewer_user_id" varchar(36),
	"overall_rating" integer,
	"ratings_json" jsonb,
	"strengths_json" jsonb,
	"improvements_json" jsonb,
	"goals_json" jsonb,
	"status" text DEFAULT 'draft' NOT NULL,
	"submitted_at" timestamp,
	"acknowledged_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"description" text,
	CONSTRAINT "permissions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "pipeline_items" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" varchar(36) NOT NULL,
	"stage" text DEFAULT 'new' NOT NULL,
	"owner_user_id" varchar(36),
	"priority" text DEFAULT 'medium' NOT NULL,
	"ai_score" integer,
	"ai_score_label" text,
	"ai_rationale" text,
	"ai_summary" text,
	"tags" text[],
	"next_action_at" timestamp,
	"next_action_description" text,
	"last_activity_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pipeline_items_tenant_id_entity_type_entity_id_unique" UNIQUE("tenant_id","entity_type","entity_id")
);
--> statement-breakpoint
CREATE TABLE "policy_violations" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"policy_key" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" varchar(36) NOT NULL,
	"attempted_action" text NOT NULL,
	"blocked_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_shares" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"token" text NOT NULL,
	"audience" text NOT NULL,
	"allowed_categories" text[] DEFAULT '{}'::text[] NOT NULL,
	"expires_at" timestamp,
	"created_by_user_id" varchar(36),
	"revoked_at" timestamp,
	"revoked_by_user_id" varchar(36),
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "portal_shares_token_uidx" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "post_award_transitions" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"bid_project_id" varchar(36) NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"finalized_at" timestamp,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "preference_signals" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"user_id" varchar(36),
	"opportunity_id" varchar(36),
	"signal_type" text NOT NULL,
	"opportunity_attributes" jsonb,
	"time_spent" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pricing_history" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"naics_code" text,
	"agency" text,
	"region" text,
	"award_value" numeric(14, 2),
	"bid_value" numeric(14, 2),
	"outcome" text,
	"awarded_at" timestamp,
	"project_description" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_bid_requests" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(64) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"title" text NOT NULL,
	"trade" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_budgets" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(64) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"title" text NOT NULL,
	"original_budget" numeric(14, 2) DEFAULT '0' NOT NULL,
	"revised_budget" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_checklist_items" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"checklist_id" varchar(36) NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'not_started' NOT NULL,
	"owner_user_id" varchar(36),
	"due_date" timestamp,
	"completed_at" timestamp,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_checklists" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"template_id" varchar(36),
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_daily_logs" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(64) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"title" text NOT NULL,
	"log_date" timestamp DEFAULT now() NOT NULL,
	"weather" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_deliverables" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36),
	"deliverable_type" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"content_json" jsonb,
	"storage_key" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"generated_at" timestamp,
	"generated_by" varchar(36),
	"approved_at" timestamp,
	"approved_by" varchar(36),
	"version" integer DEFAULT 1,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_documents" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(64) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"folder_id" varchar(36),
	"title" text NOT NULL,
	"source_type" text DEFAULT 'upload' NOT NULL,
	"source_url" text,
	"storage_key" text,
	"file_name" text,
	"mime_type" text,
	"linked_entity_type" text,
	"linked_entity_id" varchar(36),
	"source_artifact_id" varchar(36),
	"tags_json" jsonb DEFAULT '[]'::jsonb,
	"metadata_json" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_estimates" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(64) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_folders" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(64) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"parent_folder_id" varchar(36),
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_import_log_rows" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_log_id" varchar(36) NOT NULL,
	"row_number" integer NOT NULL,
	"project_key" text NOT NULL,
	"action" text NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "project_import_logs" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"file_name" text NOT NULL,
	"imported_at" timestamp DEFAULT now() NOT NULL,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"inserted_count" integer DEFAULT 0 NOT NULL,
	"updated_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"error_summary" text
);
--> statement-breakpoint
CREATE TABLE "project_milestones" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"due_date" timestamp,
	"completed_date" timestamp,
	"status" text DEFAULT 'pending' NOT NULL,
	"payment_amount" numeric(12, 2),
	"sequence_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_permissions" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" varchar(36) NOT NULL,
	"permission_level" text NOT NULL,
	"granted_by" varchar(36),
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_permissions_user_id_resource_type_resource_id_unique" UNIQUE("user_id","resource_type","resource_id")
);
--> statement-breakpoint
CREATE TABLE "project_phases" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36),
	"phase_name" text NOT NULL,
	"phase_code" text,
	"phase_type" text NOT NULL,
	"sort_order" integer DEFAULT 0,
	"depends_on" text[],
	"planned_start" timestamp,
	"planned_end" timestamp,
	"actual_start" timestamp,
	"actual_end" timestamp,
	"status" text DEFAULT 'not_started' NOT NULL,
	"completion_percent" integer DEFAULT 0,
	"tasks" jsonb,
	"inspections" jsonb,
	"materials" jsonb,
	"submittals" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_proposals" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(64) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_schedules" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(64) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'not_started' NOT NULL,
	"start_date" timestamp,
	"end_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_selections" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(64) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"title" text NOT NULL,
	"category" text DEFAULT 'selection' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"allowance_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_tasks" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"assignees" text,
	"status" text DEFAULT 'not_started' NOT NULL,
	"priority" text DEFAULT 'medium',
	"labels" text,
	"due_date" timestamp,
	"completed_at" timestamp,
	"attachments_json" jsonb,
	"source" text DEFAULT 'manual',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_timesheets" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(64) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"title" text NOT NULL,
	"work_date" timestamp DEFAULT now() NOT NULL,
	"hours" numeric(6, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_number" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"client_id" varchar(36),
	"opportunity_id" varchar(36),
	"bid_project_id" varchar(36),
	"project_manager_id" varchar(36),
	"status" text DEFAULT 'planning' NOT NULL,
	"type" text,
	"contract_type" text,
	"contract_value" numeric(15, 2),
	"actual_costs" numeric(15, 2),
	"paid_invoices" numeric(15, 2),
	"gross_profit" numeric(15, 2),
	"client" text,
	"project_manager" text,
	"project_type" text,
	"normalized_name" text,
	"start_date" timestamp,
	"expected_end_date" timestamp,
	"actual_end_date" timestamp,
	"address_json" jsonb,
	"gps_lat" numeric(10, 7),
	"gps_lng" numeric(10, 7),
	"budget_json" jsonb,
	"completion_percentage" integer DEFAULT 0,
	"custom_fields_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "projects_tenant_id_project_number_unique" UNIQUE("tenant_id","project_number")
);
--> statement-breakpoint
CREATE TABLE "prompt_templates" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"key" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"template_text" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposal_templates" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"name" text NOT NULL,
	"template_type" text NOT NULL,
	"structure_json" jsonb NOT NULL,
	"far_dfars_clauses" text[],
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_order_lines" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"purchase_order_id" varchar(36) NOT NULL,
	"item_id" varchar(36),
	"description" text NOT NULL,
	"quantity" numeric(12, 2) NOT NULL,
	"unit_cost" numeric(12, 2) NOT NULL,
	"total_cost" numeric(12, 2) NOT NULL,
	"received_qty" numeric(12, 2) DEFAULT '0',
	"cost_code_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"po_number" text NOT NULL,
	"vendor_id" varchar(36) NOT NULL,
	"project_id" varchar(36),
	"status" text DEFAULT 'draft' NOT NULL,
	"subtotal" numeric(12, 2) DEFAULT '0',
	"tax_amount" numeric(12, 2) DEFAULT '0',
	"total_amount" numeric(12, 2) DEFAULT '0',
	"order_date" timestamp,
	"expected_delivery_date" timestamp,
	"received_date" timestamp,
	"approved_by_user_id" varchar(36),
	"approved_at" timestamp,
	"quickbooks_id" text,
	"notes_json" jsonb,
	"needs_review" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_orders_tenant_id_po_number_unique" UNIQUE("tenant_id","po_number")
);
--> statement-breakpoint
CREATE TABLE "pwin_analyses" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"opportunity_id" varchar(36) NOT NULL,
	"pwin_percent" numeric(5, 2) NOT NULL,
	"roi_estimate" numeric(15, 2),
	"risk_score" integer,
	"competition_density" integer,
	"bid_effort_hours" integer,
	"bid_effort_cost" numeric(12, 2),
	"analysis_json" jsonb,
	"recommended_action" text,
	"ai_reasoning" text,
	"calculated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote_templates" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"project_type" text,
	"template_json" jsonb NOT NULL,
	"default_markup" numeric(5, 2) DEFAULT '15.00',
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rack_elevations" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"system_id" varchar(36),
	"rack_name" text NOT NULL,
	"rack_location" text NOT NULL,
	"rack_height" integer DEFAULT 42 NOT NULL,
	"rack_width" integer DEFAULT 19,
	"equipment_json" jsonb NOT NULL,
	"power_circuit" text,
	"power_load" numeric(8, 2),
	"ups_protected" boolean DEFAULT false,
	"cooling_required" boolean DEFAULT false,
	"btu_required" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"text" text NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"due_date" timestamp,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_definitions" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"name" text NOT NULL,
	"report_type" text NOT NULL,
	"config_json" jsonb,
	"schedule_json" jsonb,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_runs" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_definition_id" varchar(36) NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"result_json" jsonb,
	"error_json" jsonb
);
--> statement-breakpoint
CREATE TABLE "retro_scan_clusters" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"detected_solicitation_number" text,
	"detected_agency" text,
	"detected_title" text,
	"detected_due_date" timestamp,
	"source_company_id" varchar(36),
	"source_folder_path" text,
	"document_count" integer DEFAULT 0,
	"document_ids_json" jsonb,
	"cluster_confidence" numeric(4, 2),
	"clustering_method_json" jsonb,
	"status" text DEFAULT 'discovered' NOT NULL,
	"target_bid_project_id" varchar(36),
	"target_folder_path" text,
	"discovered_at" timestamp DEFAULT now() NOT NULL,
	"applied_at" timestamp,
	"applied_by" varchar(36)
);
--> statement-breakpoint
CREATE TABLE "rfis" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"rfi_number" text NOT NULL,
	"subject" text NOT NULL,
	"question" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"priority" text DEFAULT 'normal',
	"submitted_by_user_id" varchar(36),
	"submitted_at" timestamp,
	"assigned_to_user_id" varchar(36),
	"due_date" timestamp,
	"answer" text,
	"answered_by_user_id" varchar(36),
	"answered_at" timestamp,
	"attachments_json" jsonb,
	"distribution_json" jsonb,
	"drafted_by_herbie" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rfis_project_id_rfi_number_unique" UNIQUE("project_id","rfi_number")
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" varchar(36) NOT NULL,
	"permission_id" varchar(36) NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_id_unique" UNIQUE("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "safety_briefings" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36),
	"briefing_type" text NOT NULL,
	"topic" text NOT NULL,
	"content" text,
	"conducted_by_user_id" varchar(36),
	"conducted_at" timestamp NOT NULL,
	"attendees_json" jsonb,
	"signature_data_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "safety_incidents" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"incident_number" text NOT NULL,
	"incident_type" text NOT NULL,
	"severity" text DEFAULT 'minor' NOT NULL,
	"status" text DEFAULT 'reported' NOT NULL,
	"project_id" varchar(36),
	"location_description" text,
	"gps_lat" numeric(10, 7),
	"gps_lng" numeric(10, 7),
	"occurred_at" timestamp NOT NULL,
	"reported_at" timestamp DEFAULT now() NOT NULL,
	"reported_by_user_id" varchar(36),
	"description" text,
	"root_cause_json" jsonb,
	"corrective_actions_json" jsonb,
	"injured_employees_json" jsonb,
	"witnesses_json" jsonb,
	"osha_reportable" boolean DEFAULT false,
	"osha_form_number" text,
	"closed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "safety_incidents_tenant_id_incident_number_unique" UNIQUE("tenant_id","incident_number")
);
--> statement-breakpoint
CREATE TABLE "sam_import_log" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"bid_project_id" varchar(36) NOT NULL,
	"opportunity_id" varchar(36),
	"trigger_source" text NOT NULL,
	"triggered_by_user_id" varchar(36),
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"status" text DEFAULT 'running' NOT NULL,
	"files_attempted" integer DEFAULT 0 NOT NULL,
	"files_imported" integer DEFAULT 0 NOT NULL,
	"files_skipped_duplicate" integer DEFAULT 0 NOT NULL,
	"bytes_imported" integer DEFAULT 0 NOT NULL,
	"errors_json" jsonb,
	"notice_id" text,
	"duration_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sam_ingest_runs" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"run_type" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"modified_since_cursor" timestamp,
	"opportunities_fetched" integer DEFAULT 0,
	"opportunities_new" integer DEFAULT 0,
	"opportunities_updated" integer DEFAULT 0,
	"attachments_downloaded" integer DEFAULT 0,
	"errors_json" jsonb,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "score_explanations" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"opportunity_score_id" varchar(36) NOT NULL,
	"signal_key" text NOT NULL,
	"weight" numeric(5, 2),
	"contribution" numeric(5, 2),
	"details_json" jsonb
);
--> statement-breakpoint
CREATE TABLE "scoring_models" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"name" text NOT NULL,
	"weights_json" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "security_incidents" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"incident_number" text NOT NULL,
	"incident_type" text NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"affected_systems_json" jsonb,
	"detected_at" timestamp NOT NULL,
	"reported_at" timestamp DEFAULT now() NOT NULL,
	"reported_by_user_id" varchar(36),
	"assigned_to_user_id" varchar(36),
	"contained_at" timestamp,
	"resolved_at" timestamp,
	"root_cause_json" jsonb,
	"remediation_json" jsonb,
	"lessons_learned_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "security_incidents_tenant_id_incident_number_unique" UNIQUE("tenant_id","incident_number")
);
--> statement-breakpoint
CREATE TABLE "security_posture" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"category" text NOT NULL,
	"metric" text NOT NULL,
	"current_value" text,
	"target_value" text,
	"status" text DEFAULT 'compliant' NOT NULL,
	"last_checked_at" timestamp DEFAULT now() NOT NULL,
	"next_check_at" timestamp,
	"details_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sequence_enrollments" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"sequence_id" varchar(36) NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" varchar(36) NOT NULL,
	"current_step" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"next_step_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "share_links" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"document_id" varchar(36),
	"folder_id" varchar(36),
	"share_type" text NOT NULL,
	"token" text NOT NULL,
	"password" text,
	"expires_at" timestamp,
	"max_downloads" integer,
	"download_count" integer DEFAULT 0,
	"watermark" boolean DEFAULT false,
	"created_by" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_accessed_at" timestamp,
	CONSTRAINT "share_links_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "sla_rules" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"name" text NOT NULL,
	"priority" text NOT NULL,
	"response_time_minutes" integer NOT NULL,
	"resolution_time_minutes" integer NOT NULL,
	"escalation_rules_json" jsonb,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_credentials" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"source_system_id" varchar(36) NOT NULL,
	"credential_ref" text NOT NULL,
	"rotated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_items_raw" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"source_system_id" varchar(36) NOT NULL,
	"external_id" text NOT NULL,
	"retrieved_at" timestamp DEFAULT now() NOT NULL,
	"content_hash" text NOT NULL,
	"raw_json" jsonb NOT NULL,
	"parser_version" text,
	"run_id" varchar(36),
	CONSTRAINT "source_items_raw_tenant_id_source_system_id_external_id_content_hash_unique" UNIQUE("tenant_id","source_system_id","external_id","content_hash")
);
--> statement-breakpoint
CREATE TABLE "source_parsers" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"source_system_id" varchar(36) NOT NULL,
	"parser_version" text NOT NULL,
	"checksum" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_run_touches" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"source_run_id" varchar(36) NOT NULL,
	"source_system_id" varchar(36) NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" varchar(36) NOT NULL,
	"action" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "srt_tenant_run_entity_uniq" UNIQUE("tenant_id","source_run_id","entity_type","entity_id")
);
--> statement-breakpoint
CREATE TABLE "source_runs" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"source_system_id" varchar(36) NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	"status" text DEFAULT 'running' NOT NULL,
	"counts_json" jsonb,
	"error_json" jsonb
);
--> statement-breakpoint
CREATE TABLE "source_systems" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"config_json" jsonb,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "source_systems_tenant_id_key_unique" UNIQUE("tenant_id","key")
);
--> statement-breakpoint
CREATE TABLE "subcontractor_bids" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"vendor_id" varchar(36) NOT NULL,
	"project_id" varchar(36),
	"bid_project_id" varchar(36),
	"scope_description" text,
	"bid_amount" numeric(15, 2),
	"status" text DEFAULT 'pending' NOT NULL,
	"submitted_at" timestamp,
	"expires_at" timestamp,
	"selected_at" timestamp,
	"rejected_at" timestamp,
	"rejection_reason" text,
	"notes_json" jsonb,
	"attachments_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subcontractors" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"company_name" text NOT NULL,
	"contact_name" text,
	"contact_email" text,
	"contact_phone" text,
	"trade" text NOT NULL,
	"naics_codes" text[],
	"certifications" jsonb,
	"bonding_capacity" numeric(15, 2),
	"insurance_verified" boolean DEFAULT false,
	"performance_rating" numeric(3, 2),
	"projects_completed" integer DEFAULT 0,
	"notes" text,
	"documents_json" jsonb,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"csi_division" varchar(2),
	"csi_section" varchar(8),
	"csi_classification_method" varchar(20),
	"csi_classified_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "subcontracts" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"subcontract_number" text NOT NULL,
	"vendor_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"scope_description" text,
	"contract_amount" numeric(15, 2) NOT NULL,
	"retainage_percent" numeric(5, 2),
	"status" text DEFAULT 'draft' NOT NULL,
	"start_date" timestamp,
	"end_date" timestamp,
	"executed_at" timestamp,
	"completed_at" timestamp,
	"insurance_verified_at" timestamp,
	"terms_json" jsonb,
	"attachments_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subcontracts_tenant_id_subcontract_number_unique" UNIQUE("tenant_id","subcontract_number")
);
--> statement-breakpoint
CREATE TABLE "submittals" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"submittal_number" text NOT NULL,
	"name" text NOT NULL,
	"revision" integer DEFAULT 0,
	"status" text DEFAULT 'draft' NOT NULL,
	"priority" text DEFAULT 'medium',
	"submittal_type" text,
	"description" text,
	"manager_name" text,
	"contractor_name" text,
	"approvers" text,
	"reference" text,
	"labels" text,
	"attachments_json" jsonb,
	"submitted_at" timestamp,
	"approved_at" timestamp,
	"drafted_by_herbie" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "submittals_project_id_submittal_number_unique" UNIQUE("project_id","submittal_number")
);
--> statement-breakpoint
CREATE TABLE "sync_logs" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" varchar(36) NOT NULL,
	"direction" text NOT NULL,
	"status" text NOT NULL,
	"events_processed" integer DEFAULT 0,
	"conflicts" integer DEFAULT 0,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_devices" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"system_id" varchar(36),
	"device_type" text NOT NULL,
	"manufacturer" text,
	"model" text,
	"part_number" text,
	"location" text,
	"room" text,
	"floor" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"installed_count" integer DEFAULT 0,
	"tested_count" integer DEFAULT 0,
	"specs_json" jsonb,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "takeoff_assemblies" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category_id" varchar(36),
	"components_json" jsonb NOT NULL,
	"labor_hours" numeric(10, 2),
	"unit_cost" numeric(12, 2),
	"unit" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "takeoff_categories" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"parent_id" varchar(36),
	"trade" text NOT NULL,
	"default_unit" text NOT NULL,
	"color" text,
	"cost_code_id" varchar(36),
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "takeoff_items" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"blueprint_id" varchar(36),
	"bid_project_id" varchar(36),
	"name" text NOT NULL,
	"quantity" numeric(12, 4) NOT NULL,
	"unit" text DEFAULT 'Each' NOT NULL,
	"unit_cost" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"category" text DEFAULT 'General' NOT NULL,
	"notes" text,
	"color" text DEFAULT '#3b82f6' NOT NULL,
	"page_number" integer,
	"location_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "takeoff_quantities" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36),
	"sheet_id" varchar(36),
	"category_id" varchar(36),
	"assembly_id" varchar(36),
	"room" text,
	"floor" text,
	"phase" text,
	"zone" text,
	"quantity" numeric(12, 4) NOT NULL,
	"unit" text NOT NULL,
	"unit_cost" numeric(12, 2),
	"labor_rate" numeric(10, 2),
	"labor_hours" numeric(10, 2),
	"waste_factor" numeric(5, 2) DEFAULT '0',
	"extended_cost" numeric(14, 2),
	"annotation_id" varchar(36),
	"annotation_json" jsonb,
	"notes" text,
	"taken_off_by" varchar(36),
	"verified_by" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_templates" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"template_name" text NOT NULL,
	"template_type" text NOT NULL,
	"tasks_json" jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teaming_partners" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"company_name" text NOT NULL,
	"duns" text,
	"cage" text,
	"contact_name" text,
	"contact_email" text,
	"contact_phone" text,
	"naics_codes" text[],
	"set_aside_certifications" text[],
	"capabilities" text,
	"past_performance" jsonb,
	"qualification_notes" text,
	"relationship_status" text DEFAULT 'prospect' NOT NULL,
	"last_engagement_date" timestamp,
	"rating" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"key" text NOT NULL,
	"value_json" jsonb,
	CONSTRAINT "tenant_settings_tenant_id_key_unique" UNIQUE("tenant_id","key")
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legal_name" text NOT NULL,
	"dba_name" text,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_attachments" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"ticket_id" varchar(36) NOT NULL,
	"file_name" text NOT NULL,
	"file_type" text,
	"file_size" integer,
	"storage_url" text,
	"gps_lat" numeric(10, 7),
	"gps_lng" numeric(10, 7),
	"captured_at" timestamp,
	"uploaded_by_user_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_categories" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"parent_id" varchar(36),
	"default_priority" text DEFAULT 'normal',
	"default_sla_minutes" integer DEFAULT 480,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_comments" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"ticket_id" varchar(36) NOT NULL,
	"author_user_id" varchar(36),
	"author_name" text,
	"content" text NOT NULL,
	"is_internal" boolean DEFAULT false NOT NULL,
	"attachments_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"ticket_number" text NOT NULL,
	"category_id" varchar(36),
	"subject" text NOT NULL,
	"description" text,
	"source" text DEFAULT 'web' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"assigned_to_user_id" varchar(36),
	"assigned_team" text,
	"reported_by_user_id" varchar(36),
	"reported_by_email" text,
	"reported_by_phone" text,
	"entity_type" text,
	"entity_id" varchar(36),
	"project_id" varchar(36),
	"sla_rule_id" varchar(36),
	"response_deadline" timestamp,
	"resolution_deadline" timestamp,
	"first_response_at" timestamp,
	"resolved_at" timestamp,
	"closed_at" timestamp,
	"escalation_level" integer DEFAULT 0,
	"tags_json" jsonb,
	"custom_fields_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tickets_tenant_id_ticket_number_unique" UNIQUE("tenant_id","ticket_number")
);
--> statement-breakpoint
CREATE TABLE "time_entries" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"employee_id" varchar(36) NOT NULL,
	"project_id" varchar(36),
	"cost_code_id" varchar(36),
	"entry_date" timestamp NOT NULL,
	"clock_in_at" timestamp,
	"clock_out_at" timestamp,
	"break_minutes" integer DEFAULT 0,
	"regular_hours" numeric(5, 2),
	"overtime_hours" numeric(5, 2),
	"double_time_hours" numeric(5, 2),
	"clock_in_method" text,
	"clock_in_gps_lat" numeric(10, 7),
	"clock_in_gps_lng" numeric(10, 7),
	"clock_out_gps_lat" numeric(10, 7),
	"clock_out_gps_lng" numeric(10, 7),
	"status" text DEFAULT 'pending' NOT NULL,
	"approved_by_user_id" varchar(36),
	"approved_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_courses" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"course_code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text,
	"duration_minutes" integer,
	"is_required" boolean DEFAULT false NOT NULL,
	"recertification_months" integer,
	"content_url" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "training_courses_tenant_id_course_code_unique" UNIQUE("tenant_id","course_code")
);
--> statement-breakpoint
CREATE TABLE "training_records" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"employee_id" varchar(36) NOT NULL,
	"course_id" varchar(36) NOT NULL,
	"status" text DEFAULT 'not_started' NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"score" integer,
	"passed" boolean,
	"expires_at" timestamp,
	"certificate_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transition_tasks" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"transition_id" varchar(36) NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"assigned_role" text,
	"due_at" timestamp,
	"completed_at" timestamp,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unmatched_buyers" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"buyer_name" text NOT NULL,
	"normalized_key" text NOT NULL,
	"sam_office_code" text,
	"opportunity_count" integer DEFAULT 1,
	"suggested_company_id" varchar(36),
	"match_confidence" numeric(4, 2),
	"status" text DEFAULT 'pending' NOT NULL,
	"resolved_at" timestamp,
	"resolved_by" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_dashboard_widgets" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"widget_key" text NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"order_index" integer NOT NULL,
	"size" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" varchar(36) NOT NULL,
	"role_id" varchar(36) NOT NULL,
	CONSTRAINT "user_roles_user_id_role_id_unique" UNIQUE("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"password_hash" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_tenant_id_email_unique" UNIQUE("tenant_id","email")
);
--> statement-breakpoint
CREATE TABLE "v4_bid_documents" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"bid_id" varchar(36) NOT NULL,
	"doc_type" text DEFAULT 'other',
	"title" text,
	"folder_path" text,
	"source_url" text,
	"source" text DEFAULT 'manual',
	"external_id" text,
	"storage_provider" text DEFAULT 'db',
	"storage_key" text,
	"sha256" text,
	"file_size" integer,
	"mime_type" text,
	"extracted_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "v4_bid_outreach_drafts" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"bid_id" varchar(36) NOT NULL,
	"draft_type" text,
	"subject" text,
	"body" text,
	"target_json" jsonb,
	"created_by" text DEFAULT 'herbie',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "v4_bid_submissions" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"bid_id" varchar(36) NOT NULL,
	"status" text DEFAULT 'not_started',
	"submitted_at" timestamp,
	"method" text,
	"confirmation_id" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "v4_bid_tasks" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"bid_id" varchar(36) NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'todo',
	"is_blocker" boolean DEFAULT false,
	"owner_user_id" text,
	"due_date" timestamp,
	"source" text DEFAULT 'manual',
	"tags" text[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "v4_bids" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"bid_code" text NOT NULL,
	"name" text NOT NULL,
	"opportunity_id" varchar(36),
	"source" text DEFAULT 'manual',
	"agency_name" text,
	"due_date" timestamp,
	"stage" text DEFAULT 'intake',
	"readiness" text DEFAULT 'blocked',
	"owner_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "v4_bids_tenant_id_bid_code_unique" UNIQUE("tenant_id","bid_code")
);
--> statement-breakpoint
CREATE TABLE "vendor_bid_submissions" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invitation_id" varchar(36) NOT NULL,
	"base_bid_amount" numeric(15, 2),
	"alternates_json" jsonb,
	"allowances_json" jsonb,
	"exclusions_text" text,
	"qualifications_text" text,
	"attachments_json" jsonb,
	"status" text DEFAULT 'draft' NOT NULL,
	"submitted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"vendor_number" text NOT NULL,
	"company_name" text NOT NULL,
	"vendor_type" text DEFAULT 'supplier' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"contact_name" text,
	"email" text,
	"phone" text,
	"address_json" jsonb,
	"tax_id" text,
	"payment_terms" text,
	"categories_json" jsonb,
	"insurance_expires_at" timestamp,
	"license_expires_at" timestamp,
	"bonding_capacity" numeric(15, 2),
	"prequalification_status" text,
	"performance_rating" numeric(3, 2),
	"safety_rating" numeric(3, 2),
	"quality_rating" numeric(3, 2),
	"notes_json" jsonb,
	"quickbooks_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "vendors_tenant_id_vendor_number_unique" UNIQUE("tenant_id","vendor_number")
);
--> statement-breakpoint
CREATE TABLE "warehouses" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'warehouse' NOT NULL,
	"address" text,
	"gps_lat" numeric(10, 7),
	"gps_lng" numeric(10, 7),
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "win_patterns" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"pattern_name" text NOT NULL,
	"pattern_type" text NOT NULL,
	"pattern_value" text NOT NULL,
	"confidence" numeric(5, 3) NOT NULL,
	"support_count" integer DEFAULT 0 NOT NULL,
	"total_bids" integer DEFAULT 0 NOT NULL,
	"win_rate" numeric(5, 3),
	"description" text,
	"last_analyzed" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "win_probability" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"pipeline_item_id" varchar(36) NOT NULL,
	"opportunity_id" varchar(36) NOT NULL,
	"probability" numeric(5, 4) NOT NULL,
	"confidence_level" text,
	"factors" jsonb,
	"next_actions" jsonb,
	"expected_lift" jsonb,
	"model_version" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wip_reports" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"report_date" timestamp NOT NULL,
	"contract_value" numeric(15, 2),
	"approved_changes" numeric(15, 2),
	"revised_contract" numeric(15, 2),
	"costs_to_date" numeric(15, 2),
	"estimated_cost_to_complete" numeric(15, 2),
	"estimated_total_cost" numeric(15, 2),
	"percent_complete" numeric(5, 2),
	"earned_revenue" numeric(15, 2),
	"billed_to_date" numeric(15, 2),
	"over_under_billing" numeric(15, 2),
	"projected_profit" numeric(15, 2),
	"projected_margin" numeric(5, 2),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wip_reports_project_id_report_date_unique" UNIQUE("project_id","report_date")
);
--> statement-breakpoint
CREATE TABLE "work_package_tasks" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"work_package_id" varchar(36) NOT NULL,
	"task_type" text NOT NULL,
	"status" text DEFAULT 'ready' NOT NULL,
	"owner_role" text DEFAULT 'system' NOT NULL,
	"blocked_by" jsonb DEFAULT '[]'::jsonb,
	"artifacts_json" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_packages" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36),
	"approval_request_id" varchar(36),
	"package_type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"summary_json" jsonb,
	"routing_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_activities" ADD CONSTRAINT "agent_activities_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amendment_tracking" ADD CONSTRAINT "amendment_tracking_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amendment_tracking" ADD CONSTRAINT "amendment_tracking_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amendment_tracking" ADD CONSTRAINT "amendment_tracking_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_actions" ADD CONSTRAINT "approval_actions_approval_request_id_approval_requests_id_fk" FOREIGN KEY ("approval_request_id") REFERENCES "public"."approval_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_actions" ADD CONSTRAINT "approval_actions_actor_users_id_fk" FOREIGN KEY ("actor") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_policies" ADD CONSTRAINT "approval_policies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_requested_from_users_id_fk" FOREIGN KEY ("requested_from") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autofill_runs" ADD CONSTRAINT "autofill_runs_rule_id_autofill_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."autofill_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autofill_runs" ADD CONSTRAINT "autofill_runs_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_rule_id_automation_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."automation_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "award_decisions" ADD CONSTRAINT "award_decisions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "award_decisions" ADD CONSTRAINT "award_decisions_bid_project_id_bid_projects_id_fk" FOREIGN KEY ("bid_project_id") REFERENCES "public"."bid_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "award_decisions" ADD CONSTRAINT "award_decisions_winning_bid_response_id_bid_responses_id_fk" FOREIGN KEY ("winning_bid_response_id") REFERENCES "public"."bid_responses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "award_notifications" ADD CONSTRAINT "award_notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "award_notifications" ADD CONSTRAINT "award_notifications_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_addenda" ADD CONSTRAINT "bid_addenda_bid_project_id_bid_projects_id_fk" FOREIGN KEY ("bid_project_id") REFERENCES "public"."bid_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_artifacts" ADD CONSTRAINT "bid_artifacts_bid_project_id_bid_projects_id_fk" FOREIGN KEY ("bid_project_id") REFERENCES "public"."bid_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_binder_versions" ADD CONSTRAINT "bid_binder_versions_bid_project_id_bid_projects_id_fk" FOREIGN KEY ("bid_project_id") REFERENCES "public"."bid_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_checklist_items" ADD CONSTRAINT "bid_checklist_items_checklist_id_bid_checklists_id_fk" FOREIGN KEY ("checklist_id") REFERENCES "public"."bid_checklists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_checklists" ADD CONSTRAINT "bid_checklists_bid_project_id_bid_projects_id_fk" FOREIGN KEY ("bid_project_id") REFERENCES "public"."bid_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_decisions" ADD CONSTRAINT "bid_decisions_bid_project_id_bid_projects_id_fk" FOREIGN KEY ("bid_project_id") REFERENCES "public"."bid_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_decisions" ADD CONSTRAINT "bid_decisions_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_document_status" ADD CONSTRAINT "bid_document_status_bid_id_bid_projects_id_fk" FOREIGN KEY ("bid_id") REFERENCES "public"."bid_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_document_status" ADD CONSTRAINT "bid_document_status_requirement_id_document_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."document_requirements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_document_status" ADD CONSTRAINT "bid_document_status_document_id_egnyte_items_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."egnyte_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_document_status" ADD CONSTRAINT "bid_document_status_metadata_id_document_ai_metadata_id_fk" FOREIGN KEY ("metadata_id") REFERENCES "public"."document_ai_metadata"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_form_line_items" ADD CONSTRAINT "bid_form_line_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_form_line_items" ADD CONSTRAINT "bid_form_line_items_bid_form_section_id_bid_form_sections_id_fk" FOREIGN KEY ("bid_form_section_id") REFERENCES "public"."bid_form_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_form_line_items" ADD CONSTRAINT "bid_form_line_items_cost_code_id_cost_codes_id_fk" FOREIGN KEY ("cost_code_id") REFERENCES "public"."cost_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_form_sections" ADD CONSTRAINT "bid_form_sections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_form_sections" ADD CONSTRAINT "bid_form_sections_bid_form_id_bid_forms_id_fk" FOREIGN KEY ("bid_form_id") REFERENCES "public"."bid_forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_forms" ADD CONSTRAINT "bid_forms_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_forms" ADD CONSTRAINT "bid_forms_bid_project_id_bid_projects_id_fk" FOREIGN KEY ("bid_project_id") REFERENCES "public"."bid_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_forms" ADD CONSTRAINT "bid_forms_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_history" ADD CONSTRAINT "bid_history_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_history" ADD CONSTRAINT "bid_history_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_invitation_events" ADD CONSTRAINT "bid_invitation_events_invitation_id_bid_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."bid_invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_invitation_events" ADD CONSTRAINT "bid_invitation_events_document_id_jacket_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."jacket_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_invitations" ADD CONSTRAINT "bid_invitations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_invitations" ADD CONSTRAINT "bid_invitations_bid_project_id_bid_projects_id_fk" FOREIGN KEY ("bid_project_id") REFERENCES "public"."bid_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_invitations" ADD CONSTRAINT "bid_invitations_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_invitations" ADD CONSTRAINT "bid_invitations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_jacket_artifacts" ADD CONSTRAINT "bid_jacket_artifacts_bid_project_id_bid_projects_id_fk" FOREIGN KEY ("bid_project_id") REFERENCES "public"."bid_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_outcomes" ADD CONSTRAINT "bid_outcomes_bid_project_id_bid_projects_id_fk" FOREIGN KEY ("bid_project_id") REFERENCES "public"."bid_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_partners" ADD CONSTRAINT "bid_partners_bid_id_v4_bids_id_fk" FOREIGN KEY ("bid_id") REFERENCES "public"."v4_bids"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_partners" ADD CONSTRAINT "bid_partners_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_projects" ADD CONSTRAINT "bid_projects_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_projects" ADD CONSTRAINT "bid_projects_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_projects" ADD CONSTRAINT "bid_projects_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_proposal_sections" ADD CONSTRAINT "bid_proposal_sections_bid_project_id_bid_projects_id_fk" FOREIGN KEY ("bid_project_id") REFERENCES "public"."bid_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_proposal_sections" ADD CONSTRAINT "bid_proposal_sections_approval_request_id_approval_requests_id_fk" FOREIGN KEY ("approval_request_id") REFERENCES "public"."approval_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_readiness_scores" ADD CONSTRAINT "bid_readiness_scores_bid_project_id_bid_projects_id_fk" FOREIGN KEY ("bid_project_id") REFERENCES "public"."bid_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_readiness_snapshots" ADD CONSTRAINT "bid_readiness_snapshots_bid_id_v4_bids_id_fk" FOREIGN KEY ("bid_id") REFERENCES "public"."v4_bids"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_response_line_items" ADD CONSTRAINT "bid_response_line_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_response_line_items" ADD CONSTRAINT "bid_response_line_items_bid_response_id_bid_responses_id_fk" FOREIGN KEY ("bid_response_id") REFERENCES "public"."bid_responses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_response_line_items" ADD CONSTRAINT "bid_response_line_items_bid_form_line_item_id_bid_form_line_items_id_fk" FOREIGN KEY ("bid_form_line_item_id") REFERENCES "public"."bid_form_line_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_responses" ADD CONSTRAINT "bid_responses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_responses" ADD CONSTRAINT "bid_responses_bid_project_id_bid_projects_id_fk" FOREIGN KEY ("bid_project_id") REFERENCES "public"."bid_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_responses" ADD CONSTRAINT "bid_responses_bid_form_id_bid_forms_id_fk" FOREIGN KEY ("bid_form_id") REFERENCES "public"."bid_forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_responses" ADD CONSTRAINT "bid_responses_invitation_id_bid_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."bid_invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_responses" ADD CONSTRAINT "bid_responses_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_rfis" ADD CONSTRAINT "bid_rfis_bid_project_id_bid_projects_id_fk" FOREIGN KEY ("bid_project_id") REFERENCES "public"."bid_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_submissions" ADD CONSTRAINT "bid_submissions_bid_project_id_bid_projects_id_fk" FOREIGN KEY ("bid_project_id") REFERENCES "public"."bid_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_tasks" ADD CONSTRAINT "bid_tasks_bid_project_id_bid_projects_id_fk" FOREIGN KEY ("bid_project_id") REFERENCES "public"."bid_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_tasks" ADD CONSTRAINT "bid_tasks_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "binder_jobs" ADD CONSTRAINT "binder_jobs_bid_project_id_bid_projects_id_fk" FOREIGN KEY ("bid_project_id") REFERENCES "public"."bid_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blueprint_annotations" ADD CONSTRAINT "blueprint_annotations_blueprint_id_blueprints_id_fk" FOREIGN KEY ("blueprint_id") REFERENCES "public"."blueprints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyers" ADD CONSTRAINT "buyers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cable_schedules" ADD CONSTRAINT "cable_schedules_system_id_building_systems_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."building_systems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_campaign_id_marketing_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."marketing_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capability_statements" ADD CONSTRAINT "capability_statements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capability_statements" ADD CONSTRAINT "capability_statements_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capture_plan_templates" ADD CONSTRAINT "capture_plan_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capture_plans" ADD CONSTRAINT "capture_plans_pipeline_item_id_pipeline_items_id_fk" FOREIGN KEY ("pipeline_item_id") REFERENCES "public"."pipeline_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capture_stages" ADD CONSTRAINT "capture_stages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capture_tasks" ADD CONSTRAINT "capture_tasks_capture_plan_id_capture_plans_id_fk" FOREIGN KEY ("capture_plan_id") REFERENCES "public"."capture_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capture_tasks" ADD CONSTRAINT "capture_tasks_pipeline_item_id_pipeline_items_id_fk" FOREIGN KEY ("pipeline_item_id") REFERENCES "public"."pipeline_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capture_tasks" ADD CONSTRAINT "capture_tasks_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_flow_forecasts" ADD CONSTRAINT "cash_flow_forecasts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_orders" ADD CONSTRAINT "change_orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_orders" ADD CONSTRAINT "change_orders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_orders" ADD CONSTRAINT "change_orders_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_orders" ADD CONSTRAINT "change_orders_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_template_items" ADD CONSTRAINT "checklist_template_items_template_id_checklist_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."checklist_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_certifications" ADD CONSTRAINT "company_certifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_synonyms" ADD CONSTRAINT "company_synonyms_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_awards" ADD CONSTRAINT "competitor_awards_competitor_id_competitors_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_controls" ADD CONSTRAINT "compliance_controls_framework_id_compliance_frameworks_id_fk" FOREIGN KEY ("framework_id") REFERENCES "public"."compliance_frameworks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_controls" ADD CONSTRAINT "compliance_controls_responsible_user_id_users_id_fk" FOREIGN KEY ("responsible_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_evidence" ADD CONSTRAINT "compliance_evidence_control_id_compliance_controls_id_fk" FOREIGN KEY ("control_id") REFERENCES "public"."compliance_controls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_evidence" ADD CONSTRAINT "compliance_evidence_collected_by_user_id_users_id_fk" FOREIGN KEY ("collected_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_frameworks" ADD CONSTRAINT "compliance_frameworks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_requirements" ADD CONSTRAINT "compliance_requirements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_requirements" ADD CONSTRAINT "compliance_requirements_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_requirements" ADD CONSTRAINT "compliance_requirements_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_status" ADD CONSTRAINT "connector_status_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_buyer_id_buyers_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."buyers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_packets" ADD CONSTRAINT "contract_packets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_packets" ADD CONSTRAINT "contract_packets_award_decision_id_award_decisions_id_fk" FOREIGN KEY ("award_decision_id") REFERENCES "public"."award_decisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_memory" ADD CONSTRAINT "conversation_memory_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_memory" ADD CONSTRAINT "conversation_memory_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_codes" ADD CONSTRAINT "cost_codes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_assignments" ADD CONSTRAINT "crew_assignments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_assignments" ADD CONSTRAINT "crew_assignments_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_assignments" ADD CONSTRAINT "crew_assignments_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_briefings" ADD CONSTRAINT "crew_briefings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_briefings" ADD CONSTRAINT "crew_briefings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_plans" ADD CONSTRAINT "daily_plans_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_plans" ADD CONSTRAINT "daily_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dead_letter_queue" ADD CONSTRAINT "dead_letter_queue_original_job_id_jobs_id_fk" FOREIGN KEY ("original_job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_files" ADD CONSTRAINT "doc_files_workspace_id_doc_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."doc_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_workspaces" ADD CONSTRAINT "doc_workspaces_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_ai_embeddings" ADD CONSTRAINT "document_ai_embeddings_egnyte_item_id_egnyte_items_id_fk" FOREIGN KEY ("egnyte_item_id") REFERENCES "public"."egnyte_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_ai_embeddings" ADD CONSTRAINT "document_ai_embeddings_metadata_id_document_ai_metadata_id_fk" FOREIGN KEY ("metadata_id") REFERENCES "public"."document_ai_metadata"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_ai_metadata" ADD CONSTRAINT "document_ai_metadata_egnyte_item_id_egnyte_items_id_fk" FOREIGN KEY ("egnyte_item_id") REFERENCES "public"."egnyte_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_ai_metadata" ADD CONSTRAINT "document_ai_metadata_category_id_document_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."document_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_ai_metadata" ADD CONSTRAINT "document_ai_metadata_linked_bid_id_bid_projects_id_fk" FOREIGN KEY ("linked_bid_id") REFERENCES "public"."bid_projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_ai_metadata" ADD CONSTRAINT "document_ai_metadata_linked_opportunity_id_opportunities_id_fk" FOREIGN KEY ("linked_opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_alerts" ADD CONSTRAINT "document_alerts_egnyte_item_id_egnyte_items_id_fk" FOREIGN KEY ("egnyte_item_id") REFERENCES "public"."egnyte_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_alerts" ADD CONSTRAINT "document_alerts_bid_id_bid_projects_id_fk" FOREIGN KEY ("bid_id") REFERENCES "public"."bid_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_alerts" ADD CONSTRAINT "document_alerts_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_audit_log" ADD CONSTRAINT "document_audit_log_document_id_jacket_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."jacket_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_embeddings" ADD CONSTRAINT "document_embeddings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_embeddings" ADD CONSTRAINT "document_embeddings_document_id_knowledge_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."knowledge_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_processing_queue" ADD CONSTRAINT "document_processing_queue_egnyte_item_id_egnyte_items_id_fk" FOREIGN KEY ("egnyte_item_id") REFERENCES "public"."egnyte_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_requirements" ADD CONSTRAINT "document_requirements_category_id_document_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."document_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_text_content" ADD CONSTRAINT "document_text_content_document_id_jacket_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."jacket_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "egnyte_items" ADD CONSTRAINT "egnyte_items_root_path_id_egnyte_root_paths_id_fk" FOREIGN KEY ("root_path_id") REFERENCES "public"."egnyte_root_paths"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "egnyte_unassigned" ADD CONSTRAINT "egnyte_unassigned_item_id_egnyte_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."egnyte_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "egnyte_versions" ADD CONSTRAINT "egnyte_versions_item_id_egnyte_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."egnyte_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_sequences" ADD CONSTRAINT "email_sequences_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_current_warehouse_id_warehouses_id_fk" FOREIGN KEY ("current_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_attendees" ADD CONSTRAINT "event_attendees_event_id_calendar_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."calendar_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "executive_briefings" ADD CONSTRAINT "executive_briefings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_flags" ADD CONSTRAINT "feature_flags_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fit_profiles" ADD CONSTRAINT "fit_profiles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "herbie_actions" ADD CONSTRAINT "herbie_actions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "herbie_actions" ADD CONSTRAINT "herbie_actions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "herbie_actions" ADD CONSTRAINT "herbie_actions_approval_request_id_approval_requests_id_fk" FOREIGN KEY ("approval_request_id") REFERENCES "public"."approval_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "herbie_extraction_evidence" ADD CONSTRAINT "herbie_extraction_evidence_bid_project_id_bid_projects_id_fk" FOREIGN KEY ("bid_project_id") REFERENCES "public"."bid_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "herbie_extraction_evidence" ADD CONSTRAINT "herbie_extraction_evidence_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "herbie_extraction_evidence" ADD CONSTRAINT "herbie_extraction_evidence_egnyte_item_id_egnyte_items_id_fk" FOREIGN KEY ("egnyte_item_id") REFERENCES "public"."egnyte_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "herbie_outreach_log" ADD CONSTRAINT "herbie_outreach_log_bid_project_id_bid_projects_id_fk" FOREIGN KEY ("bid_project_id") REFERENCES "public"."bid_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "herbie_outreach_log" ADD CONSTRAINT "herbie_outreach_log_approval_request_id_approval_requests_id_fk" FOREIGN KEY ("approval_request_id") REFERENCES "public"."approval_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "herbie_review_queue" ADD CONSTRAINT "herbie_review_queue_bid_project_id_bid_projects_id_fk" FOREIGN KEY ("bid_project_id") REFERENCES "public"."bid_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "herbie_review_queue" ADD CONSTRAINT "herbie_review_queue_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_levels" ADD CONSTRAINT "inventory_levels_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_levels" ADD CONSTRAINT "inventory_levels_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jacket_build_jobs" ADD CONSTRAINT "jacket_build_jobs_bid_project_id_bid_projects_id_fk" FOREIGN KEY ("bid_project_id") REFERENCES "public"."bid_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jacket_documents" ADD CONSTRAINT "jacket_documents_folder_id_jacket_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."jacket_folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jacket_folders" ADD CONSTRAINT "jacket_folders_folder_section_id_folder_sections_id_fk" FOREIGN KEY ("folder_section_id") REFERENCES "public"."folder_sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons_learned" ADD CONSTRAINT "lessons_learned_bid_project_id_bid_projects_id_fk" FOREIGN KEY ("bid_project_id") REFERENCES "public"."bid_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lien_waiver_events" ADD CONSTRAINT "lien_waiver_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lien_waiver_events" ADD CONSTRAINT "lien_waiver_events_waiver_id_lien_waivers_id_fk" FOREIGN KEY ("waiver_id") REFERENCES "public"."lien_waivers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lien_waiver_events" ADD CONSTRAINT "lien_waiver_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lien_waiver_reminders" ADD CONSTRAINT "lien_waiver_reminders_lien_waiver_id_lien_waivers_id_fk" FOREIGN KEY ("lien_waiver_id") REFERENCES "public"."lien_waivers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lien_waiver_reminders" ADD CONSTRAINT "lien_waiver_reminders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lien_waivers" ADD CONSTRAINT "lien_waivers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lien_waivers" ADD CONSTRAINT "lien_waivers_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lien_waivers" ADD CONSTRAINT "lien_waivers_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lien_waivers" ADD CONSTRAINT "lien_waivers_subcontract_id_subcontracts_id_fk" FOREIGN KEY ("subcontract_id") REFERENCES "public"."subcontracts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lien_waivers" ADD CONSTRAINT "lien_waivers_pay_app_id_pay_applications_id_fk" FOREIGN KEY ("pay_app_id") REFERENCES "public"."pay_applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lien_waivers" ADD CONSTRAINT "lien_waivers_document_id_project_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."project_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lien_waivers" ADD CONSTRAINT "lien_waivers_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_performed_by_user_id_users_id_fk" FOREIGN KEY ("performed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_forecasts" ADD CONSTRAINT "material_forecasts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_forecasts" ADD CONSTRAINT "material_forecasts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_forecasts" ADD CONSTRAINT "material_forecasts_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_forecasts" ADD CONSTRAINT "material_forecasts_preferred_vendor_id_vendors_id_fk" FOREIGN KEY ("preferred_vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_tasks" ADD CONSTRAINT "onboarding_tasks_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_tasks" ADD CONSTRAINT "onboarding_tasks_completed_by_user_id_users_id_fk" FOREIGN KEY ("completed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_source_system_id_source_systems_id_fk" FOREIGN KEY ("source_system_id") REFERENCES "public"."source_systems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_buyer_id_buyers_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."buyers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_raw_ref_id_source_items_raw_id_fk" FOREIGN KEY ("raw_ref_id") REFERENCES "public"."source_items_raw"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_amendments" ADD CONSTRAINT "opportunity_amendments_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_amendments" ADD CONSTRAINT "opportunity_amendments_raw_ref_id_source_items_raw_id_fk" FOREIGN KEY ("raw_ref_id") REFERENCES "public"."source_items_raw"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_capture" ADD CONSTRAINT "opportunity_capture_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_capture" ADD CONSTRAINT "opportunity_capture_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_capture" ADD CONSTRAINT "opportunity_capture_stage_id_capture_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."capture_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_capture" ADD CONSTRAINT "opportunity_capture_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_decisions" ADD CONSTRAINT "opportunity_decisions_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_requirements" ADD CONSTRAINT "opportunity_requirements_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_scores" ADD CONSTRAINT "opportunity_scores_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_scores" ADD CONSTRAINT "opportunity_scores_fit_profile_id_fit_profiles_id_fk" FOREIGN KEY ("fit_profile_id") REFERENCES "public"."fit_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_scores" ADD CONSTRAINT "opportunity_scores_scoring_model_id_scoring_models_id_fk" FOREIGN KEY ("scoring_model_id") REFERENCES "public"."scoring_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_sources" ADD CONSTRAINT "opportunity_sources_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_teaming" ADD CONSTRAINT "opportunity_teaming_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_teaming" ADD CONSTRAINT "opportunity_teaming_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_teaming" ADD CONSTRAINT "opportunity_teaming_partner_id_teaming_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."teaming_partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_watchlist" ADD CONSTRAINT "opportunity_watchlist_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_watchlist" ADD CONSTRAINT "opportunity_watchlist_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_drafts" ADD CONSTRAINT "outreach_drafts_pipeline_item_id_pipeline_items_id_fk" FOREIGN KEY ("pipeline_item_id") REFERENCES "public"."pipeline_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_shortlist" ADD CONSTRAINT "partner_shortlist_recommendation_id_partner_recommendations_id_fk" FOREIGN KEY ("recommendation_id") REFERENCES "public"."partner_recommendations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_applications" ADD CONSTRAINT "pay_applications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_applications" ADD CONSTRAINT "pay_applications_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_applications" ADD CONSTRAINT "pay_applications_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_applications" ADD CONSTRAINT "pay_applications_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_reviewer_user_id_users_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_items" ADD CONSTRAINT "pipeline_items_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_shares" ADD CONSTRAINT "portal_shares_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_shares" ADD CONSTRAINT "portal_shares_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_shares" ADD CONSTRAINT "portal_shares_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_shares" ADD CONSTRAINT "portal_shares_revoked_by_user_id_users_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preference_signals" ADD CONSTRAINT "preference_signals_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_checklist_items" ADD CONSTRAINT "project_checklist_items_checklist_id_project_checklists_id_fk" FOREIGN KEY ("checklist_id") REFERENCES "public"."project_checklists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_checklists" ADD CONSTRAINT "project_checklists_template_id_checklist_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."checklist_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_import_log_rows" ADD CONSTRAINT "project_import_log_rows_import_log_id_project_import_logs_id_fk" FOREIGN KEY ("import_log_id") REFERENCES "public"."project_import_logs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_permissions" ADD CONSTRAINT "project_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_bid_project_id_bid_projects_id_fk" FOREIGN KEY ("bid_project_id") REFERENCES "public"."bid_projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_project_manager_id_users_id_fk" FOREIGN KEY ("project_manager_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_templates" ADD CONSTRAINT "prompt_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_templates" ADD CONSTRAINT "proposal_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pwin_analyses" ADD CONSTRAINT "pwin_analyses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pwin_analyses" ADD CONSTRAINT "pwin_analyses_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rack_elevations" ADD CONSTRAINT "rack_elevations_system_id_building_systems_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."building_systems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_definitions" ADD CONSTRAINT "report_definitions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_runs" ADD CONSTRAINT "report_runs_report_definition_id_report_definitions_id_fk" FOREIGN KEY ("report_definition_id") REFERENCES "public"."report_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retro_scan_clusters" ADD CONSTRAINT "retro_scan_clusters_source_company_id_companies_id_fk" FOREIGN KEY ("source_company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retro_scan_clusters" ADD CONSTRAINT "retro_scan_clusters_target_bid_project_id_bid_projects_id_fk" FOREIGN KEY ("target_bid_project_id") REFERENCES "public"."bid_projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfis" ADD CONSTRAINT "rfis_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfis" ADD CONSTRAINT "rfis_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfis" ADD CONSTRAINT "rfis_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfis" ADD CONSTRAINT "rfis_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfis" ADD CONSTRAINT "rfis_answered_by_user_id_users_id_fk" FOREIGN KEY ("answered_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_briefings" ADD CONSTRAINT "safety_briefings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_briefings" ADD CONSTRAINT "safety_briefings_conducted_by_user_id_users_id_fk" FOREIGN KEY ("conducted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_incidents" ADD CONSTRAINT "safety_incidents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_incidents" ADD CONSTRAINT "safety_incidents_reported_by_user_id_users_id_fk" FOREIGN KEY ("reported_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_explanations" ADD CONSTRAINT "score_explanations_opportunity_score_id_opportunity_scores_id_fk" FOREIGN KEY ("opportunity_score_id") REFERENCES "public"."opportunity_scores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_models" ADD CONSTRAINT "scoring_models_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_incidents" ADD CONSTRAINT "security_incidents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_incidents" ADD CONSTRAINT "security_incidents_reported_by_user_id_users_id_fk" FOREIGN KEY ("reported_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_incidents" ADD CONSTRAINT "security_incidents_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_posture" ADD CONSTRAINT "security_posture_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_enrollments" ADD CONSTRAINT "sequence_enrollments_sequence_id_email_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."email_sequences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_document_id_jacket_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."jacket_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_folder_id_jacket_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."jacket_folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_rules" ADD CONSTRAINT "sla_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_credentials" ADD CONSTRAINT "source_credentials_source_system_id_source_systems_id_fk" FOREIGN KEY ("source_system_id") REFERENCES "public"."source_systems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_items_raw" ADD CONSTRAINT "source_items_raw_source_system_id_source_systems_id_fk" FOREIGN KEY ("source_system_id") REFERENCES "public"."source_systems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_items_raw" ADD CONSTRAINT "source_items_raw_run_id_source_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."source_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_parsers" ADD CONSTRAINT "source_parsers_source_system_id_source_systems_id_fk" FOREIGN KEY ("source_system_id") REFERENCES "public"."source_systems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_runs" ADD CONSTRAINT "source_runs_source_system_id_source_systems_id_fk" FOREIGN KEY ("source_system_id") REFERENCES "public"."source_systems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_systems" ADD CONSTRAINT "source_systems_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcontractor_bids" ADD CONSTRAINT "subcontractor_bids_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcontractor_bids" ADD CONSTRAINT "subcontractor_bids_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcontractor_bids" ADD CONSTRAINT "subcontractor_bids_bid_project_id_bid_projects_id_fk" FOREIGN KEY ("bid_project_id") REFERENCES "public"."bid_projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcontracts" ADD CONSTRAINT "subcontracts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcontracts" ADD CONSTRAINT "subcontracts_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcontracts" ADD CONSTRAINT "subcontracts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submittals" ADD CONSTRAINT "submittals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submittals" ADD CONSTRAINT "submittals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_logs" ADD CONSTRAINT "sync_logs_connection_id_calendar_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."calendar_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_devices" ADD CONSTRAINT "system_devices_system_id_building_systems_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."building_systems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "takeoff_assemblies" ADD CONSTRAINT "takeoff_assemblies_category_id_takeoff_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."takeoff_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "takeoff_items" ADD CONSTRAINT "takeoff_items_blueprint_id_blueprints_id_fk" FOREIGN KEY ("blueprint_id") REFERENCES "public"."blueprints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "takeoff_quantities" ADD CONSTRAINT "takeoff_quantities_sheet_id_drawing_sheets_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."drawing_sheets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "takeoff_quantities" ADD CONSTRAINT "takeoff_quantities_category_id_takeoff_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."takeoff_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "takeoff_quantities" ADD CONSTRAINT "takeoff_quantities_assembly_id_takeoff_assemblies_id_fk" FOREIGN KEY ("assembly_id") REFERENCES "public"."takeoff_assemblies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaming_partners" ADD CONSTRAINT "teaming_partners_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_categories" ADD CONSTRAINT "ticket_categories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_category_id_ticket_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."ticket_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_reported_by_user_id_users_id_fk" FOREIGN KEY ("reported_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_sla_rule_id_sla_rules_id_fk" FOREIGN KEY ("sla_rule_id") REFERENCES "public"."sla_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_courses" ADD CONSTRAINT "training_courses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_records" ADD CONSTRAINT "training_records_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_records" ADD CONSTRAINT "training_records_course_id_training_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."training_courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transition_tasks" ADD CONSTRAINT "transition_tasks_transition_id_post_award_transitions_id_fk" FOREIGN KEY ("transition_id") REFERENCES "public"."post_award_transitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unmatched_buyers" ADD CONSTRAINT "unmatched_buyers_suggested_company_id_companies_id_fk" FOREIGN KEY ("suggested_company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "v4_bid_documents" ADD CONSTRAINT "v4_bid_documents_bid_id_v4_bids_id_fk" FOREIGN KEY ("bid_id") REFERENCES "public"."v4_bids"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "v4_bid_outreach_drafts" ADD CONSTRAINT "v4_bid_outreach_drafts_bid_id_v4_bids_id_fk" FOREIGN KEY ("bid_id") REFERENCES "public"."v4_bids"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "v4_bid_submissions" ADD CONSTRAINT "v4_bid_submissions_bid_id_v4_bids_id_fk" FOREIGN KEY ("bid_id") REFERENCES "public"."v4_bids"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "v4_bid_tasks" ADD CONSTRAINT "v4_bid_tasks_bid_id_v4_bids_id_fk" FOREIGN KEY ("bid_id") REFERENCES "public"."v4_bids"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "v4_bids" ADD CONSTRAINT "v4_bids_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_bid_submissions" ADD CONSTRAINT "vendor_bid_submissions_invitation_id_bid_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."bid_invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "win_probability" ADD CONSTRAINT "win_probability_pipeline_item_id_pipeline_items_id_fk" FOREIGN KEY ("pipeline_item_id") REFERENCES "public"."pipeline_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wip_reports" ADD CONSTRAINT "wip_reports_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wip_reports" ADD CONSTRAINT "wip_reports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_package_tasks" ADD CONSTRAINT "work_package_tasks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_package_tasks" ADD CONSTRAINT "work_package_tasks_work_package_id_work_packages_id_fk" FOREIGN KEY ("work_package_id") REFERENCES "public"."work_packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_packages" ADD CONSTRAINT "work_packages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_packages" ADD CONSTRAINT "work_packages_approval_request_id_approval_requests_id_fk" FOREIGN KEY ("approval_request_id") REFERENCES "public"."approval_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_activities_tenant_id_agent_name_created_at_index" ON "agent_activities" USING btree ("tenant_id","agent_name","created_at");--> statement-breakpoint
CREATE INDEX "agent_activities_entity_type_entity_id_index" ON "agent_activities" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "ai_artifacts_tenant_id_entity_type_entity_id_artifact_type_index" ON "ai_artifacts" USING btree ("tenant_id","entity_type","entity_id","artifact_type");--> statement-breakpoint
CREATE INDEX "aij_queue_idx" ON "artifact_ingestion_jobs" USING btree ("tenant_id","status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "aij_tenant_entity_idx" ON "artifact_ingestion_jobs" USING btree ("tenant_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_events_entity_type_entity_id_index" ON "audit_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_events_actor_index" ON "audit_events" USING btree ("actor");--> statement-breakpoint
CREATE INDEX "audit_events_created_at_index" ON "audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "autofill_rules_tenant_idx" ON "autofill_rules" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "autofill_rules_type_idx" ON "autofill_rules" USING btree ("tenant_id","source_entity_type","target_entity_type");--> statement-breakpoint
CREATE INDEX "autofill_runs_tenant_idx" ON "autofill_runs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "autofill_runs_source_idx" ON "autofill_runs" USING btree ("tenant_id","source_entity_type","source_entity_id");--> statement-breakpoint
CREATE INDEX "autofill_runs_target_idx" ON "autofill_runs" USING btree ("tenant_id","target_entity_type","target_entity_id");--> statement-breakpoint
CREATE INDEX "autofill_runs_event_idx" ON "autofill_runs" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "automation_rules_tenant_id_trigger_type_index" ON "automation_rules" USING btree ("tenant_id","trigger_type");--> statement-breakpoint
CREATE INDEX "automation_runs_tenant_id_rule_id_index" ON "automation_runs" USING btree ("tenant_id","rule_id");--> statement-breakpoint
CREATE INDEX "award_decisions_project_idx" ON "award_decisions" USING btree ("tenant_id","bid_project_id");--> statement-breakpoint
CREATE INDEX "award_decisions_status_idx" ON "award_decisions" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "binder_bid_version_idx" ON "bid_binder_versions" USING btree ("bid_project_id","version");--> statement-breakpoint
CREATE INDEX "bid_form_items_section_idx" ON "bid_form_line_items" USING btree ("bid_form_section_id");--> statement-breakpoint
CREATE INDEX "bid_form_sections_form_idx" ON "bid_form_sections" USING btree ("bid_form_id");--> statement-breakpoint
CREATE INDEX "bid_forms_project_idx" ON "bid_forms" USING btree ("tenant_id","bid_project_id");--> statement-breakpoint
CREATE INDEX "bid_inv_evt_invitation_idx" ON "bid_invitation_events" USING btree ("invitation_id");--> statement-breakpoint
CREATE INDEX "bid_inv_evt_type_idx" ON "bid_invitation_events" USING btree ("invitation_id","event_type");--> statement-breakpoint
CREATE INDEX "bid_inv_project_idx" ON "bid_invitations" USING btree ("tenant_id","bid_project_id");--> statement-breakpoint
CREATE INDEX "bid_inv_vendor_idx" ON "bid_invitations" USING btree ("tenant_id","vendor_id");--> statement-breakpoint
CREATE INDEX "bid_inv_token_hash_idx" ON "bid_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "bja_bidproject_sourceurl_uniq" ON "bid_jacket_artifacts" USING btree ("bid_project_id","source_url") WHERE source_url is not null;--> statement-breakpoint
CREATE INDEX "bja_bidproject_status_idx" ON "bid_jacket_artifacts" USING btree ("bid_project_id","status");--> statement-breakpoint
CREATE INDEX "bja_bidproject_updated_idx" ON "bid_jacket_artifacts" USING btree ("bid_project_id","updated_at");--> statement-breakpoint
CREATE INDEX "bjci_tenant_bid_idx" ON "bid_jacket_checklist_items" USING btree ("tenant_id","bid_project_id");--> statement-breakpoint
CREATE INDEX "bjci_bid_status_idx" ON "bid_jacket_checklist_items" USING btree ("bid_project_id","status");--> statement-breakpoint
CREATE INDEX "bid_resp_items_response_idx" ON "bid_response_line_items" USING btree ("bid_response_id");--> statement-breakpoint
CREATE INDEX "bid_resp_items_lineitem_idx" ON "bid_response_line_items" USING btree ("bid_form_line_item_id");--> statement-breakpoint
CREATE INDEX "bid_responses_project_idx" ON "bid_responses" USING btree ("tenant_id","bid_project_id");--> statement-breakpoint
CREATE INDEX "bid_responses_invitation_idx" ON "bid_responses" USING btree ("invitation_id");--> statement-breakpoint
CREATE INDEX "binder_jobs_bid_idx" ON "binder_jobs" USING btree ("bid_project_id");--> statement-breakpoint
CREATE INDEX "binder_jobs_status_idx" ON "binder_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "capture_activity_log_tenant_id_entity_type_entity_id_index" ON "capture_activity_log" USING btree ("tenant_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "capture_change_events_tenant_id_processed_index" ON "capture_change_events" USING btree ("tenant_id","processed");--> statement-breakpoint
CREATE INDEX "coi_tenant_vendor_idx" ON "coi_certificates" USING btree ("tenant_id","vendor_id");--> statement-breakpoint
CREATE INDEX "coi_tenant_project_idx" ON "coi_certificates" USING btree ("tenant_id","project_id");--> statement-breakpoint
CREATE INDEX "coi_tenant_expiry_idx" ON "coi_certificates" USING btree ("tenant_id","expiry_date");--> statement-breakpoint
CREATE INDEX "companies_tenant_id_name_index" ON "companies" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "companies_tenant_id_status_index" ON "companies" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "company_synonym_idx" ON "company_synonyms" USING btree ("tenant_id","normalized_key");--> statement-breakpoint
CREATE INDEX "contract_packets_award_idx" ON "contract_packets" USING btree ("award_decision_id");--> statement-breakpoint
CREATE INDEX "memory_tenant_key_idx" ON "conversation_memory" USING btree ("tenant_id","memory_type","memory_key");--> statement-breakpoint
CREATE INDEX "memory_project_idx" ON "conversation_memory" USING btree ("tenant_id","project_id");--> statement-breakpoint
CREATE INDEX "dt_tenant_status_idx" ON "dashboard_tasks" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "dt_tenant_priority_idx" ON "dashboard_tasks" USING btree ("tenant_id","priority");--> statement-breakpoint
CREATE INDEX "dt_tenant_position_idx" ON "dashboard_tasks" USING btree ("tenant_id","position");--> statement-breakpoint
CREATE INDEX "dt_source_entity_idx" ON "dashboard_tasks" USING btree ("source_entity_type","source_entity_id");--> statement-breakpoint
CREATE INDEX "doc_ai_item_idx" ON "document_ai_metadata" USING btree ("egnyte_item_id");--> statement-breakpoint
CREATE INDEX "doc_ai_category_idx" ON "document_ai_metadata" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "doc_ai_bid_idx" ON "document_ai_metadata" USING btree ("linked_bid_id");--> statement-breakpoint
CREATE INDEX "doc_ai_opp_idx" ON "document_ai_metadata" USING btree ("linked_opportunity_id");--> statement-breakpoint
CREATE INDEX "doc_ai_status_idx" ON "document_ai_metadata" USING btree ("processing_status");--> statement-breakpoint
CREATE INDEX "doc_alert_status_idx" ON "document_alerts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "doc_alert_type_idx" ON "document_alerts" USING btree ("alert_type");--> statement-breakpoint
CREATE INDEX "embedding_entity_idx" ON "document_embeddings" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "doc_queue_status_priority_idx" ON "document_processing_queue" USING btree ("status","priority");--> statement-breakpoint
CREATE INDEX "doc_queue_item_idx" ON "document_processing_queue" USING btree ("egnyte_item_id");--> statement-breakpoint
CREATE INDEX "document_text_content_tenant_id_document_id_index" ON "document_text_content" USING btree ("tenant_id","document_id");--> statement-breakpoint
CREATE INDEX "egnyte_items_entry_id_idx" ON "egnyte_items" USING btree ("egnyte_entry_id");--> statement-breakpoint
CREATE INDEX "egnyte_items_path_idx" ON "egnyte_items" USING btree ("egnyte_path");--> statement-breakpoint
CREATE INDEX "egnyte_items_parent_idx" ON "egnyte_items" USING btree ("egnyte_parent_id");--> statement-breakpoint
CREATE INDEX "egnyte_items_mapped_idx" ON "egnyte_items" USING btree ("mapped_entity_type","mapped_entity_id");--> statement-breakpoint
CREATE INDEX "entity_attachments_entity_idx" ON "entity_attachments" USING btree ("tenant_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "entity_links_tenant_idx" ON "entity_links" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "entity_links_source_idx" ON "entity_links" USING btree ("tenant_id","source_type","source_id");--> statement-breakpoint
CREATE INDEX "entity_links_target_idx" ON "entity_links" USING btree ("tenant_id","target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "entity_links_uniq" ON "entity_links" USING btree ("tenant_id","source_type","source_id","target_type","target_id","relation_label");--> statement-breakpoint
CREATE INDEX "entity_watchers_entity_idx" ON "entity_watchers" USING btree ("tenant_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "event_outbox_status_idx" ON "event_outbox" USING btree ("status");--> statement-breakpoint
CREATE INDEX "event_outbox_event_idx" ON "event_outbox" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "events_tenant_idx" ON "events" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "events_type_idx" ON "events" USING btree ("tenant_id","event_type");--> statement-breakpoint
CREATE INDEX "events_entity_idx" ON "events" USING btree ("tenant_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "events_created_idx" ON "events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "federal_awards_award_id_idx" ON "federal_awards" USING btree ("usaspending_award_id");--> statement-breakpoint
CREATE INDEX "federal_awards_agency_idx" ON "federal_awards" USING btree ("awarding_agency_name");--> statement-breakpoint
CREATE INDEX "federal_awards_naics_idx" ON "federal_awards" USING btree ("naics_code");--> statement-breakpoint
CREATE INDEX "federal_awards_recipient_idx" ON "federal_awards" USING btree ("recipient_name");--> statement-breakpoint
CREATE INDEX "federal_awards_tenant_idx" ON "federal_awards" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "hd_project_idx" ON "herbie_decisions" USING btree ("tenant_id","project_id","decided_at");--> statement-breakpoint
CREATE INDEX "hd_entity_idx" ON "herbie_decisions" USING btree ("tenant_id","related_entity_type","related_entity_id");--> statement-breakpoint
CREATE INDEX "hdd_tenant_entity_idx" ON "herbie_digest_dismissals" USING btree ("tenant_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "hdd_tenant_until_idx" ON "herbie_digest_dismissals" USING btree ("tenant_id","dismissed_until");--> statement-breakpoint
CREATE INDEX "extraction_bid_field_idx" ON "herbie_extraction_evidence" USING btree ("bid_project_id","field_category");--> statement-breakpoint
CREATE INDEX "extraction_opp_field_idx" ON "herbie_extraction_evidence" USING btree ("opportunity_id","field_category");--> statement-breakpoint
CREATE INDEX "hf_subject_idx" ON "herbie_facts" USING btree ("tenant_id","subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "hf_project_idx" ON "herbie_facts" USING btree ("tenant_id","project_id");--> statement-breakpoint
CREATE INDEX "hf_current_idx" ON "herbie_facts" USING btree ("tenant_id","superseded_by_id");--> statement-breakpoint
CREATE INDEX "hf_predicate_idx" ON "herbie_facts" USING btree ("tenant_id","subject_type","subject_id","predicate");--> statement-breakpoint
CREATE INDEX "hr_project_idx" ON "herbie_relationships" USING btree ("tenant_id","project_id");--> statement-breakpoint
CREATE INDEX "hr_role_idx" ON "herbie_relationships" USING btree ("tenant_id","role","status");--> statement-breakpoint
CREATE INDEX "review_queue_status_idx" ON "herbie_review_queue" USING btree ("tenant_id","status","priority");--> statement-breakpoint
CREATE INDEX "hg_opps_due_idx" ON "highergov_opportunities" USING btree ("due_at");--> statement-breakpoint
CREATE INDEX "hg_opps_status_idx" ON "highergov_opportunities" USING btree ("status");--> statement-breakpoint
CREATE INDEX "hg_opps_score_idx" ON "highergov_opportunities" USING btree ("score");--> statement-breakpoint
CREATE INDEX "hg_watch_profiles_tenant_idx" ON "highergov_watch_profiles" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "ie_project_idx" ON "ingestion_events" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "ie_bidproject_idx" ON "ingestion_events" USING btree ("bid_project_id","created_at");--> statement-breakpoint
CREATE INDEX "ie_run_idx" ON "ingestion_events" USING btree ("run_id","created_at");--> statement-breakpoint
CREATE INDEX "ie_tenant_created_idx" ON "ingestion_events" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "jacket_documents_tenant_id_folder_id_index" ON "jacket_documents" USING btree ("tenant_id","folder_id");--> statement-breakpoint
CREATE INDEX "jacket_documents_tenant_id_document_type_index" ON "jacket_documents" USING btree ("tenant_id","document_type");--> statement-breakpoint
CREATE INDEX "jacket_documents_tenant_id_status_index" ON "jacket_documents" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "jacket_folders_tenant_id_jacket_type_jacket_id_index" ON "jacket_folders" USING btree ("tenant_id","jacket_type","jacket_id");--> statement-breakpoint
CREATE INDEX "jacket_folders_tenant_id_path_index" ON "jacket_folders" USING btree ("tenant_id","path");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_jacket_folder_sort" ON "jacket_folders" USING btree ("tenant_id","jacket_type","jacket_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_jacket_folder_name" ON "jacket_folders" USING btree ("tenant_id","jacket_type","jacket_id","name");--> statement-breakpoint
CREATE INDEX "jacket_timeline_tenant_id_jacket_type_jacket_id_index" ON "jacket_timeline" USING btree ("tenant_id","jacket_type","jacket_id");--> statement-breakpoint
CREATE INDEX "jacket_timeline_tenant_id_event_type_index" ON "jacket_timeline" USING btree ("tenant_id","event_type");--> statement-breakpoint
CREATE INDEX "jl_tenant_job_idx" ON "job_locks" USING btree ("tenant_id","job_name");--> statement-breakpoint
CREATE INDEX "jobs_status_scheduled_at_index" ON "jobs" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "lwe_waiver_idx" ON "lien_waiver_events" USING btree ("waiver_id","created_at");--> statement-breakpoint
CREATE INDEX "lwr_due_idx" ON "lien_waiver_reminders" USING btree ("scheduled_for","sent_at");--> statement-breakpoint
CREATE INDEX "lwr_waiver_idx" ON "lien_waiver_reminders" USING btree ("lien_waiver_id");--> statement-breakpoint
CREATE INDEX "lwt_state_type_idx" ON "lien_waiver_templates" USING btree ("state","waiver_type");--> statement-breakpoint
CREATE INDEX "lw_project_status_idx" ON "lien_waivers" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "lw_vendor_idx" ON "lien_waivers" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "lw_pay_app_idx" ON "lien_waivers" USING btree ("pay_app_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lw_sign_token_uniq" ON "lien_waivers" USING btree ("sign_token") WHERE sign_token IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_metric_snapshot" ON "metric_snapshots" USING btree ("tenant_id","metric_key","period_start","period_end");--> statement-breakpoint
CREATE INDEX "metric_snapshots_tenant_id_metric_key_index" ON "metric_snapshots" USING btree ("tenant_id","metric_key");--> statement-breakpoint
CREATE INDEX "monitor_events_tenant_idx" ON "monitor_events" USING btree ("tenant_id","monitor_id","window_date");--> statement-breakpoint
CREATE INDEX "opportunities_tenant_id_status_index" ON "opportunities" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "opportunities_tenant_id_status_normalized_index" ON "opportunities" USING btree ("tenant_id","status_normalized");--> statement-breakpoint
CREATE INDEX "opportunities_tenant_id_due_at_index" ON "opportunities" USING btree ("tenant_id","due_at");--> statement-breakpoint
CREATE INDEX "org_memory_approvals_tenant_idx" ON "org_memory_approvals" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "org_memory_approvals_mem_idx" ON "org_memory_approvals" USING btree ("memory_item_id");--> statement-breakpoint
CREATE INDEX "org_memory_approvals_status_idx" ON "org_memory_approvals" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "org_memory_entity_links_uniq" ON "org_memory_entity_links" USING btree ("tenant_id","memory_item_id","entity_type","entity_id","role");--> statement-breakpoint
CREATE INDEX "org_memory_entity_links_tenant_entity_idx" ON "org_memory_entity_links" USING btree ("tenant_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "org_memory_entity_links_tenant_mem_idx" ON "org_memory_entity_links" USING btree ("tenant_id","memory_item_id");--> statement-breakpoint
CREATE INDEX "org_memory_items_tenant_idx" ON "org_memory_items" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "org_memory_items_status_idx" ON "org_memory_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "org_memory_items_category_idx" ON "org_memory_items" USING btree ("category");--> statement-breakpoint
CREATE INDEX "partner_recommendations_tenant_id_opportunity_id_index" ON "partner_recommendations" USING btree ("tenant_id","opportunity_id");--> statement-breakpoint
CREATE INDEX "pipeline_items_tenant_id_stage_index" ON "pipeline_items" USING btree ("tenant_id","stage");--> statement-breakpoint
CREATE INDEX "portal_shares_project_idx" ON "portal_shares" USING btree ("tenant_id","project_id","revoked_at");--> statement-breakpoint
CREATE INDEX "pd_project_folder_idx" ON "project_documents" USING btree ("project_id","folder_id");--> statement-breakpoint
CREATE INDEX "pd_project_created_idx" ON "project_documents" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "pd_source_artifact_idx" ON "project_documents" USING btree ("source_artifact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_folders_tenant_project_name_uniq" ON "project_folders" USING btree ("tenant_id","project_id","name");--> statement-breakpoint
CREATE INDEX "retro_cluster_status_idx" ON "retro_scan_clusters" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "source_items_raw_tenant_id_source_system_id_external_id_index" ON "source_items_raw" USING btree ("tenant_id","source_system_id","external_id");--> statement-breakpoint
CREATE INDEX "srt_tenant_run_idx" ON "source_run_touches" USING btree ("tenant_id","source_run_id");--> statement-breakpoint
CREATE INDEX "srt_tenant_entity_idx" ON "source_run_touches" USING btree ("tenant_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "tickets_tenant_id_status_index" ON "tickets" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "unmatched_buyers_status_idx" ON "unmatched_buyers" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_user_widget" ON "user_dashboard_widgets" USING btree ("tenant_id","user_id","widget_key");--> statement-breakpoint
CREATE INDEX "v4_bid_documents_tenant_id_bid_id_index" ON "v4_bid_documents" USING btree ("tenant_id","bid_id");--> statement-breakpoint
CREATE INDEX "v4_bid_tasks_tenant_id_bid_id_status_index" ON "v4_bid_tasks" USING btree ("tenant_id","bid_id","status");--> statement-breakpoint
CREATE INDEX "v4_bids_tenant_id_stage_index" ON "v4_bids" USING btree ("tenant_id","stage");--> statement-breakpoint
CREATE INDEX "v4_bids_tenant_id_due_date_index" ON "v4_bids" USING btree ("tenant_id","due_date");--> statement-breakpoint
CREATE INDEX "vendor_bid_sub_invitation_idx" ON "vendor_bid_submissions" USING btree ("invitation_id");--> statement-breakpoint
CREATE INDEX "win_probability_tenant_id_pipeline_item_id_index" ON "win_probability" USING btree ("tenant_id","pipeline_item_id");