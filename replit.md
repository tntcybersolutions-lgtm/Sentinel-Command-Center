# BLACKHAWK SENTINEL

## Overview
BLACKHAWK SENTINEL is an enterprise-grade bid intelligence and operations automation platform designed for BlackHawk Construction. Its primary purpose is to streamline bid management processes, leverage data for strategic decision-making, and automate operational tasks. Key capabilities include AI-powered opportunity scoring, integrated bid workflow approvals, and an AI assistant named HERBIE for natural language interactions, modernizing bid processes and reducing manual effort. The platform aims to enhance efficiency, provide a significant competitive advantage in federal contracting, and support strategic growth.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
BLACKHAWK SENTINEL is built as a full-stack TypeScript application.

### UI/UX Decisions
The user interface is a responsive single-page application using React 18, `wouter` for routing, and `shadcn/ui` components with Tailwind CSS for styling. It supports light/dark modes and features a consistent sidebar layout. The navigation is configurable, offering a Procore-style Lifecycle OS experience with a project context selector and live badge counts. The home page provides a clean workspace with action boxes, a compact projects table, and a recent activity feed.

### Technical Implementations
-   **Frontend**: React 18, TypeScript, Wouter, TanStack React Query, shadcn/ui, Tailwind CSS, Vite.
-   **Backend**: Express 5, Node.js, TypeScript (ESM), RESTful JSON APIs. Drizzle ORM for PostgreSQL, Zod for schema validation.
-   **Data Model**: Comprehensive Procore-style data model for companies, bid projects, opportunities, vendors, subcontractors, and documents, including versioning, audit logs, and permissions.
-   **Multi-tenancy**: Implemented using a `tenant_id` across all database entities.
-   **Core Services**: Audit, Approval, Scoring, Bid, Comms, and Digest services, all with approval gating.
-   **Job Queue System**: PostgreSQL-backed for task management, scheduling (e.g., SAM.gov polling), and processing with retry mechanisms.
-   **AI Integration**: Utilizes OpenAI API for chat, voice, and image generation.
-   **HERBIE AI Agent**: Provides tools for opportunity search, bid management, approvals, scheduling, email drafting, and briefings. All external actions are auditable and require approval.
-   **HERBIE Autonomous Agent**: Scores SAM.gov opportunities, initiates approval requests for high-scoring prospects, and auto-creates bid projects upon approval.
-   **HERBIE Document Intelligence Engine**: AI-powered document analysis (GPT-4o-mini) for auto-categorization, metadata extraction, summary generation, and intelligent linking.
-   **HERBIE Command Dashboard**: Features RAG with OpenAI embeddings and pgvector for semantic search, a Tool Router Service, a Memory Service for preferences, and a Connector Service for external platforms.
-   **GovSync 2.0 Multi-Agent System**: Includes specialized agents for strategic analysis, legal compliance, and award/amendment monitoring.
-   **Document Management System**: End-to-end handling with object storage, auto-folder creation, audit logging, and versioning.
-   **Knowledge Vault Document Processing**: Processes various file types for smart categorization, metadata extraction, and semantic search.
-   **Design & Systems Module**: Manages blueprints, takeoff estimation, project phase auto-building, and system tracking.
-   **Advanced Platform APIs**: Auto-Filing Rules, Secure Share Links, Notifications, RBAC Permissions, OCR with Full-Text Search.
-   **Real-Time Pipeline**: Server-Sent Events (SSE) for real-time updates and query invalidation.
-   **Proactive Alerts**: In-app, email, and Teams webhook notifications for 7 types of alerts.
-   **AI Review Queue**: All HERBIE autonomous actions are subject to a human review approval workflow.
-   **Enterprise Bid Binder**: Professional bid package generator with descriptive section title pages and continuous page numbering.
-   **Egnyte Sync System**: Enterprise-grade document synchronization with unlimited depth recursion, resumable sync, delta sync, and live progress tracking.
-   **Jacket Systems**: Canonical folder taxonomies for `Company Jacket` and `Bid Jacket` with idempotent healing and integrity checks.
-   **Buyer & Vendor Routing**: Normalizes buyer names, matches companies, and routes new entities for auto-creation or AI review.
-   **HERBIE Autonomous Scoring**: Scores opportunities based on multiple criteria and triggers approval for high-scoring prospects.
-   **Retro-Organizer**: Scans bid packages for misplaced documents, proposes reorganization, and generates a BID_INDEX JSON.
-   **Per-Route Error Boundaries**: Ensures crash-safe fallback for each route.
-   **Dashboard Widget Registry**: Customizable dashboard widgets with user overrides.
-   **Competitor & Compliance Intelligence**: Provides strategic insights and compliance summaries for bids.
-   **Strategic Pricing Intelligence**: Computes baseline pricing from historical data and provides pricing guidance and win probability.
-   **Post-Award Transition System**: Manages post-award processes with auto-generated kickoff tasks.
-   **Automated Document Ingestion Pipeline**: Unified ingestion pipeline orchestrates discovery (SAM.gov, HigherGov), artifact upsert, document download, 3-tier classification (deterministic, rule-scored, AI fallback), and project document filing. Includes full UI for monitoring ingestion activities.
-   **Ingestion Chaining Architecture**: Enables automated chaining from SAM.gov opportunity discovery to document ingestion, with a robust job queuing and retry mechanism.
-   **Org Memory System**: Organizational knowledge base with approval workflows, polymorphic entity linking, and Herbie policies for RAG integration.
-   **Unified Event-Driven Architecture**: PostgreSQL-backed event bus with reliable outbox pattern and retry mechanisms.
-   **Automated Workflows**: Registered workflows for `OpportunityWon`, `SolicitationParsed`, `TakeoffUpdated`, and `TakeoffDelta`.
-   **Autofill Engine**: Three modes (deterministic, rule-based, AI suggestion) with user confirmation.
-   **Context Dock & Automation Tab**: Reusable UI components for displaying related entities, event history, and autofill runs.
-   **Margin Calculator API**: Computes sell price from base cost using fixed margin policy percentages.
-   **Capture and Project Workspaces**: Dedicated workspaces for managing opportunities, bids, and active projects with detailed tabs for various functions.
-   **Bid Jacket Artifacts System**: Manages artifact templates, bid jacket artifacts, and checklist items, integrated with SAM.gov and HigherGov for auto-ingestion.
-   **Construction Command Center**: AI-driven contractor operations platform with agents for precon, backoffice, monitoring, project management, field operations, and KPI tracking.
-   **Voice Daily Log**: Per-project field-capture page for daily logs, allowing voice memo simulation and manual entry.
-   **Herbie Digest**: Enriched digest page displaying per-item context with project names, action types, and a 7-day "Mark Resolved" workflow.
-   **Change Order Approvals (Phase F)**: `/change-order-approvals` calls `GET /api/approvals?type=change_order` (new `?type=` filter alias supports `change_order`, `coi`, `bid`, `vendor`, plus exact `action_type` match — all parameterized via Drizzle `sql\`\`${param}\`\``). Decisions go through new `PATCH /api/approvals/:id` accepting `{status: "approved"|"rejected"|"denied", notes?}`, normalizing `rejected → denied`, with a 409 state-transition guard so a non-pending approval can't be re-decided. Audit event written on every decision. UI: PENDING/DECIDED/ALL filter pills + 3 stat cards (count, pending value, decided count) + per-approval rows showing CO# badge, priority/status badges, days-pending, project name (regex-parsed from `context.message`), CO title, amount, requested_by, description, Approve/Reject buttons + View CO link. Legacy POST `/:id/approve|deny` routes left intact.
-   **Vendor Confidence Dashboard (Phase G)**: `/vendor-confidence` rewritten with two new derived endpoints. `GET /api/vendor-confidence/vendors` returns enriched vendor list with computed `confidenceScore` (0–100) and `tier` (Preferred ≥85 / Approved 70-84 / Watch 50-69 / At-Risk <50). `GET /api/vendor-confidence/stats` returns `{total, avgConfidence, tiers, preferred, approved, watch, atRisk, expiredInsurance, expiringInsurance}`. Both routes 500 if `vendorService.listVendors()` returns non-array (no silent zeroing). `computeVendorConfidence(v)` averages available `performanceRating + safetyRating + qualityRating` (×20 to scale 0-5 → 0-100), then applies bonuses/penalties: insurance fresh ≥30d (+5) / expiring (-5) / expired (-15); license fresh (+3) / expired (-10); prequal approved (+8) / pending (-2) / rejected|blacklisted (-25); status inactive|suspended|blacklisted (-30). Empty-rating fallback uses 3.0 → 60 base (Watch). UI: 6 stat cards across the top, optional insurance warning banner (guarded with `> 0` to avoid React 0-render gotcha), search input + tier filter pills, and full vendor table with name, trade, color-coded score progress bar, tier badge, prequal status, and `relTime(updatedAt)`.
-   **Sentinel Command Center Demo Seed**: Script to pre-seed a demo project for platform demonstrations.
-   **Takeoff Engine Import from Plans**: At `/estimate/takeoff`, the "Import from Plans" button (`button-import-takeoff`) opens a dedicated `Import Takeoff from Plans` dialog (NOT the upload-sheets modal). User selects a drawing sheet from `/api/drawing-sheets`; the modal previews and then bulk-creates takeoff_quantities scoped to that sheet using `IMPORT_TEMPLATES` keyed by discipline (architectural/structural/electrical/mep/low_voltage/fire_life_safety/default). The mutation tracks `{created, skipped, failed}` per item, invalidates `["/api/takeoff-quantities"]` whenever any rows wrote (even on partial failure), surfaces an error toast when `created === 0` (with the missing category names), and a partial-success toast (destructive variant) when some items were skipped/failed. Hardened CSV export uses BOM + RFC-4180 escaping, DOM-anchored download trigger, empty-data guard, and try/catch with explicit error toasts.

## External Dependencies
-   **Database**: PostgreSQL
-   **AI Services**: OpenAI API
-   **External Integrations**:
    -   SAM.gov
    -   HigherGov
    -   Microsoft Office 365 Graph API
    -   Egnyte
    -   Microsoft Teams