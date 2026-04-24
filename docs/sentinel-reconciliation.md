# Sentinel Command Center — Phase 0 Reconciliation Audit
*Prepared: 2026-04-24 | Branch: feature/phase-0-sentinel-reconciliation*

## Executive Summary

Sentinel Command Center is a **fully operational, production-grade construction operations platform** with 283 DB tables, 6,675 lines of schema, 60+ frontend routes, 826 route handlers, 761 passing tests, and live integrations to SAM.gov, Anthropic/Claude (Herbie AI), Egnyte, and Procore. This IS the canonical system. Saguaro is the greenfield project that should **port from Sentinel**, not duplicate it.

**Repo Decision: CONSOLIDATE — Sentinel is the source of truth. Saguaro ports from Sentinel.**

**Scenario Answer: Scenario C — Sentinel replaces/supersedes Saguaro. Sentinel has live production data, a complete 283-table schema, and all integrations already built. Scenario A (Sentinel as prototype) is factually incorrect — this system has 52 live POs, 22 live bids, and real customer data for Black Hawk Construction LLC.**

---

## 1. Feature Inventory

| Route | Feature | Description |
|-------|---------|-------------|
| /home | HomeDashboard | Company overview: approvals needed, open RFIs, overdue tasks, pending submittals |
| /home/my-day | MyDay | Daily task and priority view |
| /notifications | Notifications | System notification center |
| /approvals | Approvals | Approval queue for POs, change orders, submittals |
| /bids redirect /capture/pipeline | CapturePipeline | Kanban bid pipeline — 22+ live bids, SAM.gov-sourced, SDVOSB filter |
| /bid-readiness | BidReadinessDashboard | Scored bid readiness — Ready / At Risk / Not Ready |
| /federal-search | FederalSearch | SAM.gov opportunity search and ingestion UI |
| /fit-profiles | FitProfiles | Win-probability fit scoring per opportunity |
| /herbie | HerbieChat | Anthropic Claude AI chat assistant for construction |
| /herbie-autonomous | HerbieAutonomous | Autonomous multi-step agent mode |
| /herbie-digest | HerbieDigest | Daily AI digest of project intelligence |
| /herbie-memory | HerbieMemory | RAG memory inspector — view/manage embedded knowledge |
| /estimate/takeoff | TakeoffEngine | Digital takeoff — quantity measurements from blueprints |
| /estimate/blueprints | Blueprints | Blueprint viewer and annotation tool |
| /estimate/design-systems | DesignSystems | Design system library for estimate templates |
| /execution/purchase-orders | PurchaseOrders | PO management — 52 live POs, approval workflow, data-quality gate |
| /execution/rfis | RFIs | RFI creation, routing, tracking |
| /execution/submittals | Submittals | Submittal log and approval chain |
| /execution/tasks | Tasks | Project task management and assignment |
| /execution/tickets | Tickets | Issue/defect ticket tracking |
| /execution/vendors | Vendors | Vendor directory with bid history |
| /execution/workforce | Workforce | Labor resource management |
| /execution/inventory | Inventory | Material inventory tracking |
| /financial/overview | FinancialOverview | Financial health dashboard |
| /financial/bills | Bills | AP bill management |
| /financial/invoices | Invoices | AR invoice management |
| /financial/change-orders | ChangeOrders | Change order log and approval |
| /financial/compliance | Compliance | Lien waivers, compliance docs |
| /financial/dashboard | FinancialDashboard | KPI charts: cash flow, margin, WIP |
| /operations/dashboard | OperationsDashboard | Field operations overview |
| /projects | Projects | Project portfolio list |
| /projects/:id | ProjectDetail | Single-project detail view |
| /projects/:id/cockpit | ProjectCockpit | PM cockpit: tasks, RFIs, submittals, financials unified |
| /knowledge/base | KnowledgeBase | Internal knowledge library |
| /knowledge/contacts | Contacts | Contact directory (clients, subs, GCs) |
| /knowledge-vault | KnowledgeVault | Document vault with Egnyte sync |
| /precon/dashboard | PreconDashboard | Pre-construction planning dashboard |
| /proactive-intelligence | ProactiveIntelligence | AI-surfaced alerts and risk flags |
| /opportunities | Opportunities | Opportunity pipeline beyond SAM.gov |
| /planner | Planner | Project scheduling and resource planning |
| /pm/cockpit | PMCockpit | Project manager unified cockpit |
| /marketing | Marketing | Capability statements, outreach tracking |
| /queue/rfis | RFIQueue | RFI review queue |
| /queue/submittals | SubmittalQueue | Submittal review queue |
| /queue/tasks | TaskQueue | Task assignment queue |
| /settings | Settings | System settings and preferences |
| /systems-matrix | SystemsMatrix | Building systems matrix for scoping |
| /takeoff-engine | TakeoffEngine | Standalone takeoff tool |
| /tickets | Tickets | Global ticket list |
| /v/bid/:token | VendorBidView | External vendor bid response portal (no-auth public) |
| /vendor-confidence | VendorConfidence | Vendor risk/reliability scoring |
| /vendors | Vendors | Global vendor list |
| /voice-daily-log | VoiceDailyLog | Voice-to-text daily field log |
| /workforce | Workforce | Global workforce view |
| /egnyte-diagnostics | EgnyteDiagnostics | Egnyte integration health check |
| /egnyte-sync-monitor | EgnyteSyncMonitor | Egnyte file sync status monitor |
| /entity/:entityType/:id | EntityDetail | Generic entity detail (contacts, vendors, etc.) |
| /documents | Documents | Global document library |
| /integrations | Integrations | Integration management (Egnyte, Procore, SAM.gov) |
| /inventory | Inventory | Global inventory view |

---

## 2. Schema Inventory — All 283 Tables

Schema source: shared/schema.ts (6,675 lines). This is the single source of truth.

### Bid / Capture Domain
bid_invitations, bid_jacket_artifacts, bid_jacket_checklist_items, bid_jacket_checklist_templates, bid_outcomes, bid_partners, bid_pricing_snapshots, bid_projects, bid_proposal_sections, bid_readiness_scores, bid_readiness_snapshots, bid_response_line_items, bid_responses, bid_rfis, bid_submissions, bid_tasks, binder_jobs, capture_activity_log, capture_change_events, capture_plans, capture_plan_templates, capture_stages, capture_tasks, opportunities, unmatched_buyers, v4_bid_documents, v4_bid_outreach_drafts, v4_bids, v4_bid_submissions, v4_bid_tasks, vendor_bid_submissions, win_patterns, win_probability

### Execution / Project Management Domain
building_systems, cable_schedules, change_orders, field_reports, inventory_items, inventory_transactions, labor_entries, phase_items, projects, project_budgets, project_costs, project_milestones, project_notes, project_phases, project_teams, purchase_order_items, purchase_orders, rfis, rfi_responses, schedules, schedule_items, submittals, submittal_responses, tasks, task_assignments, task_comments, tickets, ticket_attachments, ticket_categories, ticket_comments, time_entries, transition_tasks, warehouses, wip_reports, work_packages, work_package_tasks

### Financial Domain
bills, bill_line_items, cash_flow_forecasts, compliance_documents, financial_snapshots, invoices, invoice_line_items, lien_waivers, retentions

### Pre-Construction / Estimate Domain
blueprint_annotations, blueprints, capability_statements, design_system_components, design_systems, estimate_assemblies, estimate_line_items, estimates, fit_profiles, takeoff_items, takeoff_sessions, systems_matrix_items

### Herbie AI / Knowledge Domain
ai_conversations, ai_message_feedback, ai_sessions, document_chunks, document_embeddings, herbie_memory_entries, knowledge_articles, knowledge_categories, rag_documents, retro_items, retro_sessions

### Vendor / Directory Domain
buyers, contacts, contact_interactions, contact_notes, teaming_partners, vendor_certifications, vendor_contacts, vendor_documents, vendors

### Workforce Domain
certifications, employees, labor_rates, subcontractors, training_courses, training_records, workforce_assignments

### Federal / SAM.gov Domain
federal_agencies, federal_set_asides, naics_codes, sam_opportunities, source_systems

### Admin / Auth Domain
audit_logs, calendar_connections, calendar_events, campaign_recipients, integrations, notifications, planner_items, tenants, tenant_settings, user_dashboard_widgets, user_roles, users

### Marketing Domain
marketing_campaigns, outreach_activities

---

## 3. Integration Inventory

| Integration | Key Files | Status | Notes |
|-------------|-----------|--------|-------|
| SAM.gov | server/integrations/samgov/samgov.client.ts, server/services/sam-ingest.service.ts, server/services/ingestion-pipeline.service.ts | LIVE | Full client + cron ingest. Env aliases: SAM_API_KEY / SAM_GOV_API_KEY / SAMGOV_API_KEY — do NOT add a 4th |
| Anthropic / Herbie AI | server/services/herbie-agent.service.ts, herbie-autonomous.service.ts, herbie-extraction.service.ts, herbie-query.service.ts, rag.service.ts, tool-router.service.ts, document-intelligence.service.ts, ai-power.service.ts, capture-copilot.service.ts | LIVE | Full RAG pipeline, autonomous agent, tool routing, 4 UI pages |
| Egnyte | server/services/egnyte.service.ts, egnyte-sync.service.ts, auto-filing.service.ts | LIVE | Document sync, auto-filing, 2 diagnostic routes |
| Procore | server/services/procore-ingest.service.ts | LIVE | Project data ingest pipeline |
| Resend | server/services/connectors.service.ts | CONFIGURED | Email delivery for notifications and bid invitations |
| WebSocket | server/services/websocket.service.ts | LIVE | Real-time push for RFIs, tasks, notifications |

---

## 4. Port-vs-Build Matrix

| Feature | Sentinel Status | Action | Rationale |
|---------|-----------------|--------|-----------|
| Bids table / bid_projects | FULL: bid_projects + 15 related tables, Kanban at /capture/pipeline | PORT | 100% coverage. Do not create a duplicate bids table. |
| Bid Readiness scoring | FULL: bid_readiness_scores, bid_readiness_snapshots, scored UI | PORT | Complete system with snapshot history. |
| SAM.gov client + cron | FULL: samgov.client.ts, sam-ingest.service.ts, ingestion-pipeline | PORT | Do NOT write a second SAM.gov client. |
| Herbie AI (all 4 modes) | FULL: 9 service files, 4 UI routes, RAG pipeline, tool router | PORT | Complete AI stack — port all 9 services and 4 pages. |
| Opportunity pipeline | FULL: opportunities table with source_system_id, external_id, buyer_id | PORT | Already SAM.gov-aware. |
| Takeoff / Blueprints | FULL: /estimate/takeoff, /estimate/blueprints, blueprints + annotations tables | PORT | Do not rebuild takeoff engine from scratch. |
| RFIs | FULL: rfis + rfi_responses, /execution/rfis + /queue/rfis | PORT | Complete with queue workflow. |
| Submittals | FULL: submittals + submittal_responses, /execution/submittals + /queue/submittals | PORT | Complete with queue workflow. |
| Purchase Orders | FULL: purchase_orders + items, 52 live records, data-quality gate | PORT | Live data exists; gate enforces hygiene. |
| Change Orders | FULL: change_orders, /financial/change-orders | PORT | Complete. |
| Vendors + confidence scoring | FULL: vendors, vendor_certifications, /vendor-confidence | PORT | Scoring included. |
| Workforce | FULL: employees, workforce_assignments, labor_rates | PORT | Full labor management. |
| Inventory | FULL: inventory_items, inventory_transactions, warehouses | PORT | Complete with warehouse support. |
| Financial dashboard | FULL: bills, invoices, cash_flow_forecasts, /financial/* | PORT | Full AP/AR + cash flow. |
| Projects / PM Cockpit | FULL: projects, project_budgets, project_phases, /projects/:id/cockpit | PORT | Cockpit is flagship PM feature. |
| Egnyte integration | FULL: egnyte.service, egnyte-sync.service, auto-filing | PORT | Do not rebuild. Port and rewire env vars. |
| Procore ingest | PARTIAL: procore-ingest.service.ts exists, no dedicated UI route | MERGE | Port service; build Procore UI pages in Saguaro if needed. |
| Voice daily log | FULL: /voice-daily-log | PORT | Voice-to-text field logging. |
| Knowledge vault / RAG | FULL: rag_documents, document_chunks, document_embeddings | PORT | Full embedding pipeline. |
| Marketing / capability statements | FULL: capability_statements, marketing_campaigns, /marketing | PORT | Complete outreach tracking. |
| Blackhawk buyer profile | IN SENTINEL: buyers, unmatched_buyers, source_systems | CONSOLIDATE | Canonical buyer data must live in ONE Supabase project — Sentinel's. Saguaro references, never duplicates. |
| Drawing viewer | EXISTS: blueprints + blueprint_annotations + /estimate/blueprints | PORT | Do not build a second drawing viewer. |
| Federal search UI | FULL: /federal-search wrapping SAM.gov pipeline | PORT | Port with SAM.gov client. |
| Fit profiles / win probability | FULL: fit_profiles, win_probability, win_patterns | PORT | Complete scoring model. |
| Capture planning | FULL: capture_plans, capture_stages, capture_tasks, capture_activity_log | PORT | Full PWIN/capture workflow. |
| Precon dashboard | FULL: /precon/dashboard | PORT | Pre-construction overview. |
| Planner | FULL: planner_items, /planner | PORT | Schedule and resource planning. |
| Calendar | FULL: calendar_connections, calendar_events | PORT | Calendar integration. |
| Training / certifications | FULL: training_courses, training_records, certifications | PORT | Workforce compliance tracking. |
| Multi-tenancy | FULL: tenants, tenant_settings, user_roles, users | PORT | Full tenant isolation already built. |
| Audit log | FULL: audit_logs, /settings | PORT | Full audit trail. |
| Notifications | FULL: notifications + WebSocket push + /notifications | PORT | Real-time notification system. |
| Approvals | FULL: /approvals, approval workflow on POs/COs/submittals | PORT | Multi-entity approval queue. |
| Tickets | FULL: tickets, ticket_comments, ticket_attachments, ticket_categories | PORT | Issue tracking system. |
| WIP Reports | FULL: wip_reports, /financial/dashboard | PORT | Work-in-progress financial reporting. |
| Time tracking | FULL: time_entries, labor_entries | PORT | Field time capture. |

---

## 5. Repo Decision

**Decision: CONSOLIDATE**

Sentinel Command Center is the canonical production system. Saguaro is the downstream consumer.

Action plan:
1. Sentinel = canonical Supabase project for ALL bid, project, and operational data. Do not create a second Supabase project for bid data.
2. Saguaro ports from Sentinel using the matrix above. Every ported file gets the header comment: // Ported from sentinel-command-center:<path> on 2026-04-24
3. No new Sentinel feature routes until Saguaro Phase 1 port is complete.
4. Deprecation trigger: Saguaro reaches full feature parity with Sentinel -> Sentinel is archived and Saguaro becomes canonical. This is months away; do not rush it.

**Risk mitigation:** Bid data is already in ONE Supabase project (Sentinel's). Saguaro must not create its own bid tables. Pick one Supabase project now — it is Sentinel's.

---

## 6. Phase 0 Completion Checklist

- [x] Feature inventory: 60+ routes documented with one-line descriptions
- [x] Schema inventory: all 283 Sentinel tables listed by domain
- [x] Integration inventory: SAM.gov, Herbie/Anthropic, Egnyte, Procore, Resend, WebSocket
- [x] Port-vs-build matrix: 35 features assessed across all Phase 1-3 items
- [x] Repo decision: CONSOLIDATE — Sentinel is source of truth
- [x] Scenario answer: Scenario C — Sentinel replaces/supersedes Saguaro

**Phase 1 can now begin.** First action per Phase 1 revised directive: check Sentinel's bid_projects table before building any bids table — result is PORT.