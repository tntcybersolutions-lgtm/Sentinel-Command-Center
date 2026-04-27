# BLACKHAWK SENTINEL

## Overview
BLACKHAWK SENTINEL is an enterprise-grade bid intelligence and operations automation platform for BlackHawk Construction. It aims to streamline bid management, automate operational tasks, and use data for strategic decision-making. Key features include AI-powered opportunity scoring, integrated bid workflow approvals, and an AI assistant named HERBIE for natural language interactions, enhancing efficiency and providing a competitive advantage in federal contracting.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
BLACKHAWK SENTINEL is a full-stack TypeScript application.

### UI/UX Decisions
The user interface is a responsive single-page application built with React 18, `wouter` for routing, and `shadcn/ui` with Tailwind CSS for styling. It supports light/dark modes, features a consistent sidebar layout with configurable navigation (Procore-style Lifecycle OS), a project context selector, and live badge counts. The home page includes action boxes, a compact projects table, and a recent activity feed.

### Technical Implementations
-   **Frontend**: React 18, TypeScript, Wouter, TanStack React Query, shadcn/ui, Tailwind CSS, Vite.
-   **Backend**: Express 5, Node.js, TypeScript (ESM), RESTful JSON APIs, Drizzle ORM for PostgreSQL, Zod for schema validation.
-   **Data Model**: Comprehensive Procore-style model for companies, bids, opportunities, vendors, subcontractors, and documents, including versioning, audit logs, and permissions.
-   **Multi-tenancy**: Implemented via a `tenant_id` across all database entities.
-   **Core Services**: Audit, Approval, Scoring, Bid, Comms, and Digest services with approval gating.
-   **Job Queue System**: PostgreSQL-backed for task management, scheduling, and processing with retries.
-   **AI Integration**: Utilizes OpenAI API for chat, voice, and image generation.
-   **HERBIE AI Agent**: Provides tools for opportunity search, bid management, approvals, scheduling, email drafting, and briefings. All external actions are auditable and require approval.
-   **HERBIE Autonomous Agent**: Scores SAM.gov opportunities and initiates approval requests for high-scoring prospects, auto-creating bid projects upon approval.
-   **HERBIE Document Intelligence Engine**: AI-powered document analysis (GPT-4o-mini) for auto-categorization, metadata extraction, summary generation, and intelligent linking.
-   **HERBIE Command Dashboard**: Features RAG with OpenAI embeddings and pgvector for semantic search, a Tool Router Service, a Memory Service, and a Connector Service.
-   **GovSync 2.0 Multi-Agent System**: Includes agents for strategic analysis, legal compliance, and award/amendment monitoring.
-   **Document Management System**: End-to-end handling with object storage, auto-folder creation, audit logging, and versioning.
-   **Knowledge Vault Document Processing**: Processes various file types for smart categorization, metadata extraction, and semantic search.
-   **Design & Systems Module**: Manages blueprints, takeoff estimation, project phase auto-building, and system tracking.
-   **Advanced Platform APIs**: Auto-Filing Rules, Secure Share Links, Notifications, RBAC Permissions, OCR with Full-Text Search.
-   **Real-Time Pipeline**: Server-Sent Events (SSE) for real-time updates and query invalidation.
-   **Proactive Alerts**: In-app, email, and Teams webhook notifications.
-   **AI Review Queue**: All HERBIE autonomous actions are subject to human review approval.
-   **Enterprise Bid Binder**: Professional bid package generator.
-   **Egnyte Sync System**: Enterprise-grade document synchronization with advanced features.
-   **Jacket Systems**: Canonical folder taxonomies for `Company Jacket` and `Bid Jacket` with idempotent healing.
-   **Buyer & Vendor Routing**: Normalizes buyer names, matches companies, and routes new entities for auto-creation or AI review.
-   **HERBIE Autonomous Scoring**: Scores opportunities and triggers approval for high-scoring prospects.
-   **Retro-Organizer**: Scans bid packages for misplaced documents, proposes reorganization, and generates a BID_INDEX JSON.
-   **Lien Waiver System**: End-to-end conditional/unconditional partial+final waiver workflow with strict state machine enforcement and audit trails. Includes 50-state statutory templates, public e-sign magic links (`/sign/lien-waiver/:token`) with atomic single-use token burn (DB-enforced via partial unique index `lw_sign_token_uniq`), 3/7/14-day reminder schedule with overlap-safe 60s monitor (in-process in-flight guard + atomic conditional `markReminderSent` claim), and `voidWaiver` service-level invariant that cancels pending reminders for every caller.
-   **Automated Document Ingestion Pipeline**: Unified pipeline orchestrates discovery (SAM.gov, HigherGov), artifact upsert, document download, 3-tier classification, and project document filing, with a UI for monitoring.
-   **Ingestion Chaining Architecture**: Enables automated chaining from opportunity discovery to document ingestion.
-   **Org Memory System**: Organizational knowledge base with approval workflows and Herbie policies for RAG integration.
-   **Unified Event-Driven Architecture**: PostgreSQL-backed event bus with reliable outbox pattern.
-   **Automated Workflows**: Registered workflows for `OpportunityWon`, `SolicitationParsed`, `TakeoffUpdated`, and `TakeoffDelta`.
-   **Autofill Engine**: Three modes (deterministic, rule-based, AI suggestion) with user confirmation.
-   **Margin Calculator API**: Computes sell price from base cost using fixed margin policy percentages.
-   **Capture and Project Workspaces**: Dedicated workspaces for managing opportunities, bids, and active projects.
-   **Bid Jacket Artifacts System**: Manages artifact templates and checklist items, integrated with SAM.gov and HigherGov for auto-ingestion.
-   **Construction Command Center**: AI-driven contractor operations platform with specialized agents.

## External Dependencies
-   **Database**: PostgreSQL
-   **AI Services**: OpenAI API
-   **External Integrations**:
    -   SAM.gov
    -   HigherGov
    -   Microsoft Office 365 Graph API
    -   Egnyte
    -   Microsoft Teams