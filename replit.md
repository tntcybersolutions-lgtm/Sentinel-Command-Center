# BLACKHAWK SENTINEL

## Overview
BLACKHAWK SENTINEL is an enterprise-grade bid intelligence and operations automation platform for BlackHawk Construction. It aims to streamline bid management, leverage data for strategic decision-making, and automate operational tasks to enhance efficiency and competitive advantage in federal contracting. Key capabilities include AI-powered opportunity scoring, integrated bid workflow approvals, and an AI assistant named HERBIE for natural language interactions, modernizing bid processes and reducing manual effort. The platform seeks to provide a significant competitive edge in the market.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
BLACKHAWK SENTINEL is a full-stack TypeScript application with a React frontend, an Express backend, and PostgreSQL for data persistence.

### UI/UX Decisions
The user interface is a responsive single-page application built with React 18, `wouter` for routing, and `shadcn/ui` components styled with Tailwind CSS, supporting light/dark modes and a consistent sidebar layout. The navigation is configured via `navConfig.ts` with 8 groups (~27 items, cleaned of duplicates), allowing for a Procore-style Lifecycle OS experience with a project context selector and live badge counts. The home page (`home-assistant.tsx`) is a clean Buildertrend-style workspace with 4 action boxes (Approvals, RFIs, Tasks, Submittals), a compact projects table linking to Project Cockpit, and a recent activity feed. Six redundant dashboard pages were deleted (executive, PM cockpit, operations, accounting, precon, legacy dashboard) with their old routes redirecting to appropriate pages.

### Technical Implementations
-   **Frontend**: React 18, TypeScript, Wouter, TanStack React Query, shadcn/ui, Tailwind CSS, Vite.
-   **Backend**: Express 5, Node.js, TypeScript (ESM), RESTful JSON APIs. Drizzle ORM for PostgreSQL integration, Zod for schema validation.
-   **Data Model**: A comprehensive Procore-style data model for companies, bid projects, opportunities, vendors, subcontractors, documents (with versioning, audit logs, permissions).
-   **Multi-tenancy**: Implemented using a `tenant_id` across all database entities.
-   **Core Services**: Audit, Approval, Scoring, Bid, Comms, and Digest services, all with approval gating.
-   **Job Queue System**: PostgreSQL-backed for task management, scheduling (e.g., SAM.gov polling), and processing with retry mechanisms.
-   **AI Integration**: Utilizes OpenAI API for chat, voice, and image generation.
-   **HERBIE AI Agent**: Provides tools for opportunity search, bid management, approvals, scheduling, email drafting, and briefings. All external actions are auditable and require approval.
-   **HERBIE Autonomous Agent**: Scores SAM.gov opportunities, initiates approval requests for high-scoring prospects, and auto-creates bid projects upon approval.
-   **HERBIE Document Intelligence Engine**: AI-powered document analysis (GPT-4o-mini) for auto-categorization, metadata extraction, summary generation, and intelligent linking.
-   **HERBIE Command Dashboard**: Features RAG with OpenAI embeddings and pgvector for semantic search, a Tool Router Service, a Memory Service for preferences, and a Connector Service for external platforms.
-   **GovSync 2.0 Multi-Agent System**: Comprises CIO-Bot (strategic analysis), LegalOps (compliance), and Foreman-Bot (award/amendment monitoring).
-   **Document Management System**: End-to-end handling with Object Storage (Replit App Storage/GCS), auto-folder creation, audit logging, and versioning.
-   **Knowledge Vault Document Processing**: Processes various file types for smart categorization, metadata extraction, and semantic search.
-   **Design & Systems Module**: Manages blueprints, takeoff estimation, project phase auto-building, and system tracking.
-   **Advanced Platform APIs**: Auto-Filing Rules, Secure Share Links, Notifications, RBAC Permissions, OCR with Full-Text Search.
-   **Real-Time Pipeline**: Server-Sent Events (SSE) via `event-stream.service.ts` with client-side hooks for real-time updates and query invalidation.
-   **Proactive Alerts**: 7 types of alerts delivered via in-app, email, and Teams webhooks.
-   **Auto-Filing**: Rules engine for automated document movement and renaming.
-   **AI Review Queue**: All HERBIE autonomous actions are gated through a human review approval workflow.
-   **Enterprise Bid Binder**: Professional bid package generator with descriptive section title pages, continuous page numbering, and evidence maps.
-   **Egnyte Sync System**: Enterprise-grade document synchronization with unlimited depth recursion, resumable sync, delta sync (10-min intervals), reconciliation, and live progress tracking.
-   **Jacket Systems**: Canonical folder taxonomies (`Company Jacket`, `Bid Jacket`) managed by `jacket.service.ts` with idempotent healing and integrity checks.
-   **Buyer & Vendor Routing**: Normalizes buyer names, matches companies, and routes new entities for auto-creation or AI review based on confidence scores.
-   **HERBIE Autonomous Scoring**: Scores opportunities based on multiple criteria and triggers approval for high-scoring prospects.
-   **Retro-Organizer**: Scans bid packages for misplaced documents, proposes reorganization, and generates a BID_INDEX JSON.
-   **Per-Route Error Boundaries**: Ensures crash-safe fallback for each route.
-   **Dashboard Widget Registry**: Customizable dashboard widgets with user overrides.
-   **Competitor & Compliance Intelligence**: Provides strategic insights and compliance summaries for bids.
-   **Strategic Pricing Intelligence**: Computes baseline pricing from historical data and provides pricing guidance and win probability.
-   **Post-Award Transition System**: Manages post-award processes with auto-generated kickoff tasks.
-   **Automated Document Ingestion Pipeline**: Unified ingestion pipeline (`ingestion-pipeline.service.ts`) that orchestrates the full cycle: SAM.gov attachment discovery via `sam-discovery.service.ts` (Tier 1 rawJson extraction from `sourceItemsRaw`, supports `resourceLinks`, `resource_links`, `attachments`, `documents`, `links`, `additionalInfoLink`), HigherGov discovery via `highergov-discovery.service.ts` (calls `HigherGovAdapter.listDocuments()`), artifact upsert with URL dedup and placeholder upgrade pattern (matches templateCode with null sourceUrl → upgrades), document download with retry/ZIP extraction, 3-tier classification (deterministic → rule-scored → AI fallback via GPT-4o-mini `classifyArtifactAsync()`), and project document filing. Routes: `POST /api/projects/:id/ingestion/run`, `POST /api/projects/:id/ingestion/resync`, `GET /api/projects/:id/ingestion/status`, `POST /api/ingestion/artifacts/:id/retry`. IngestionResult returns `{ runId, discovered, upserted, downloaded, filed, failed, skipped, extractedFromZips, errors[] }`. Full IngestionActivityPanel UI with artifact list, folder badges, classification confidence icons, diagnostic banners (missing API keys, empty discovery), source breakdown, and activity feed.
-   **Ingestion Chaining Architecture**: Three new tables (`source_run_touches`, `job_locks`, `artifact_ingestion_jobs`) enable automated SAM.gov → document ingestion chaining. SAM.gov `runIngestion()` records touched opportunity IDs into `source_run_touches`, computes impacted bid projects via join, and enqueues `artifact_ingestion_jobs`. A SKIP LOCKED worker (`server/workers/documentIngestion.worker.ts`) runs every 5 minutes via scheduler, claims queued jobs with `FOR UPDATE SKIP LOCKED`, processes them through `runFullIngestion()`, and handles failures with exponential backoff (5m → 15m → 1h → 6h). Coarse `job_locks` table prevents overlapping cycles (300s TTL). Three route "kicks" (approve, decision=pursue, HigherGov convert) enqueue high-priority ingestion jobs via `enqueueArtifactIngestionJob()` with unique constraint deduplication (`onConflictDoNothing`). Helpers in `server/services/ingestion/ingestion.helpers.ts`.
-   **Org Memory System**: Organizational knowledge base with approval workflows, polymorphic entity linking, and Herbie policies for RAG integration.
-   **Unified Event-Driven Architecture**: PostgreSQL-backed event bus with reliable outbox pattern and retry mechanisms.
-   **Automated Workflows**: Registered workflows for `OpportunityWon`, `SolicitationParsed`, `TakeoffUpdated`, and `TakeoffDelta`.
-   **Entity Link Service**: Universal cross-module linking.
-   **Autofill Engine**: Three modes (deterministic, rule-based, AI suggestion) with user confirmation.
-   **Context Dock & Automation Tab**: Reusable UI components for displaying related entities, event history, and autofill runs.
-   **Margin Calculator API**: Computes sell price from base cost using fixed margin policy percentages.
-   **Capture and Project Workspaces**: Dedicated workspaces for managing opportunities, bids, and active projects with detailed tabs for various functions.
-   **DocumentsPanel**: Reusable component for scoped document fetching.
-   **Bid Jacket Artifacts System**: Manages artifact templates, bid jacket artifacts, and checklist items, integrated with SAM.gov and HigherGov for auto-ingestion.
-   **Construction Command Center (Phase 3)**: AI-driven contractor operations platform with 6 agents (precon, backoffice, monitors, pm, fieldops, kpi). PM and FieldOps agents persist reports to `agent_activities` with `actionType="report"`. Monitors auto-create `project_tasks` (source="monitor") and `approval_requests` idempotently for critical/high-severity alerts. Project Cockpit (`/projects/:id/cockpit`) is a per-project operational workspace with 6 tabs (RFIs, Submittals, COs, Daily Reports, Tasks, Agent Reports) and embedded agent run buttons. Seed data via `POST /api/admin/seed-phase3`. Key files: `server/agents/pmAgent.ts`, `server/agents/fieldOpsAgent.ts`, `server/services/contractor-monitors.service.ts`, `server/seeds/phase3-seed.ts`, `client/src/pages/project-cockpit.tsx`.
-   **Herbie Digest Polish (Phase D)**: `/herbie-digest` page now shows enriched per-item context. `DigestItem` extended with `projectId`, `projectName`, `actionType`, `createdAt`. `loadProjectNameMap()` resolves project names from `projects` table (NOT `bid_projects` — that table has no `name`). COIs and RFIs auto-resolve project name via `projectId`; approvals only resolve when `entityType="bid_project"`. New `herbie_digest_dismissals` table (tenantId, entityType, entityId, dismissedUntil, dismissedBy) backs a 7-day "Mark Resolved" workflow. `DELETE /api/herbie/digest/dismiss/:entityType/:entityId` wipes-and-reinserts the dismissal (no onConflict needed). `gatherActiveDismissals()` filters items whose `(entity.type, entity.id)` matches an active dismissal. UI: project name + relative createdAt ("3d ago") + actionType chip render in each card; "Mark Resolved" button on every item with an entity reference, with toast feedback and query invalidation.
-   **Sentinel Command Center Demo Seed (Phase 1, Phase A)**: `scripts/seed-demo.ts` (also runnable via `POST /api/admin/seed-demo`, NODE_ENV=production gated by `ALLOW_DEMO_SEED=true`) pre-seeds the "Maple Street Office Build-Out" demo project (projectNumber `MAPLE-001`, tenantId `blackhawk-default`) per the 15-min demo script in `ROADMAP.md`. Seeds: 1 project ($1.85M lump_sum, 32% complete, Maple Holdings LLC), 1 vendor "Acme Plumbing" (`V-ACME-001`), 1 GL COI upserted with rolling 10-day expiry (yellow `warning_14d` rollup), 3 open RFIs, 2 pending submittals, 4 project tasks (2 overdue), 5 daily logs (1 voice source — wipe-and-reseed via `[demo-seed:maple-001]` notes prefix to prevent date drift), 1 high-priority notification, 1 pending `draft_coi_renewal` approval request with full body draft, 4 herbie `agent_activities` (actionType="report" so they surface in cockpit `recentAgentReports`), 5 audit_events. Idempotent: COI/notification/approval/agent_activities/audit_events use upsert or wipe-and-reseed so reruns refresh the rolling expiry date and keep dataset size fixed.

## External Dependencies
-   **Database**: PostgreSQL
-   **AI Services**: OpenAI API
-   **External Integrations**:
    -   SAM.gov (federal opportunity data)
    -   HigherGov (federal opportunity data connector)
    -   Microsoft Office 365 Graph API (Outlook calendar, email)
    -   Egnyte (document storage)
    -   Microsoft Teams (notifications)