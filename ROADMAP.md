# ROADMAP.md — Sentinel Command Center, Phase 1 MVP

**Goal:** A 15-minute demo that makes a small-to-mid GC PM say *"when can I have this."* Herbie is the product. Every feature below either shows Herbie working or makes room for him to work.

**Branch:** `feature/phase-1-herbie`. **Shipping target:** Phase 1 demo-ready.

**Complexity legend:** S = < 1 day, M = 1–3 days, L = 3–7 days, XL = 1–2 weeks.

---

## Phase 1 Features

### 1. Projects Workspace

**User story:** As a PM, I can create a project, add team members, and see one dashboard with everything active on it.

**Reuse:** `server/services/projects.service.ts`; `client/src/pages/project-cockpit.tsx`; `client/src/pages/projects/ProjectDetail.tsx`; `client/src/pages/projects/ProjectWorkspace.tsx`; existing `projects` schema.

**New:** GC-focused project create form (strip federal-contracting fields — NAICS, set-aside, solicitation number — from the default UX; keep them behind an optional "federal" tab for backward compat). New `PoweredByFooter` component (used in Feature 7 too). Tenant rebrand of header from "BLACKHAWK SENTINEL" to "Sentinel Command Center".

**Data model delta:** none new. Possibly add `projects.project_type` enum (`federal` | `commercial` | `residential`) if not already present.

**Herbie capabilities:** `get_project_status`.

**Acceptance criteria:**
- New project created via UI appears in `projects/active` list within one request cycle.
- Project dashboard shows: open RFIs, pending submittals, overdue tasks, COI status rollup, recent activity.
- Team members can be added/removed and see the project.
- Sidebar header reads "Sentinel Command Center".

**Complexity:** M.

---

### 2. Document Vault with Herbie Extraction

**User story:** As a PM, I can drop in plans, specs, COIs, contracts, and COs, and Herbie auto-classifies them and pulls out the key fields.

**Reuse:** `server/services/document.service.ts`; `server/services/ingestion-pipeline.service.ts`; `server/services/herbie-extraction.service.ts`; `server/services/document-intelligence.service.ts`; Replit Object Storage integration; existing `doc_files` / `bid_jacket_artifacts` tables; `client/src/components/documents/*`.

**New:** GC-focused artifact taxonomy (`plans`, `specs`, `coi`, `contract`, `change_order`, `submittal`, `rfi`, `daily_log`, `photos`, `invoice`, `misc`) distinct from the federal bid-jacket taxonomy. New extraction prompts per artifact type. Preview/edit UI for extracted fields before Herbie commits them to `herbie_facts`.

**Data model delta:** new `project_documents` table (or extension of existing; TBD during ticket). Artifact-type enum.

**Herbie capabilities:** `read_document`, `extract_fields`, `record_fact`.

**Acceptance criteria:**
- Upload any of plans/specs/COI/contract/CO; Herbie classifies within 30s of upload.
- Extracted fields appear in preview UI with confidence scores; PM can accept/edit before commit.
- Confidence < 0.7 lands in `herbie_review_queue` instead of `herbie_facts`.
- Source is preserved on every committed fact.

**Complexity:** L.

---

### 3. COI Tracker with Auto-Expiration Alerts

**User story:** As a PM, I never get surprised by an expired COI because Herbie tracks every one and flags renewals before they lapse.

**Reuse:** `server/services/alerts.service.ts`; `server/services/compliance.service.ts`; `server/services/notifications` paths; queue/scheduler; existing notification types.

**New:** `coi_certificates` table. `server/services/coi.service.ts`. Renewal-draft endpoint (Herbie drafts an email to the sub/vendor; lands in approval queue). UI card on the project cockpit showing COI rollup (Green/Yellow/Red by expiry distance).

**Data model delta:**
- New table `coi_certificates`: `id`, `tenant_id`, `project_id` (nullable — COIs can be company-level), `vendor_id`, `policy_type` (`GL` / `WC` / `auto` / `umbrella` / etc.), `carrier`, `policy_number`, `limits_json`, `effective_date`, `expiry_date`, `document_id` (link to uploaded COI), `status` (`active` / `expired` / `pending_renewal`), `created_at`, `updated_at`.

**Herbie capabilities:** `extract_fields` (parse COI PDF at upload), `flag_for_review` (30/14/7/1-day alerts), `draft_message` (renewal email draft), `record_fact`.

**Acceptance criteria:**
- Upload a COI → fields extracted → row in `coi_certificates`.
- 30/14/7/1-day alerts enqueued via scheduler and fire on time.
- On 14-day alert, Herbie drafts a renewal email to the vendor that lands in the approval queue (never auto-sent).
- Expired COI blocks the vendor from appearing as "current" on project cockpit rollup.

**Complexity:** L.

---

### 4. Daily Log Voice Capture

**User story:** As a foreman or super, I record a 60-second voice memo at end of day on my phone, and Herbie turns it into a structured daily log.

**Reuse:** `project_daily_logs` table; project cockpit daily-logs tab; upload infra.

**New:** Server endpoint `POST /api/projects/:id/daily-logs/voice` that accepts audio blob, calls OpenAI Whisper for transcription, then calls a structured-extraction LLM call to fill `{weather, crew, tasks_completed, issues, equipment, safety, photos_referenced}`. Mobile-friendly UI with record button in cockpit. Manual edit step before save.

**Data model delta:** add `daily_logs.audio_document_id` (link to uploaded audio), `daily_logs.transcript`, `daily_logs.source` (`voice` | `manual` | `photo`). Decide `daily_logs` vs `project_daily_logs` as canonical first (one of the tickets).

**Herbie capabilities:** `log_daily`, `extract_fields`.

**Acceptance criteria:**
- 60s voice memo uploads and produces a structured draft daily log in < 60s.
- Draft opens in edit mode for the foreman to correct; save commits.
- Transcript is preserved alongside structured fields.
- If the foreman misses a day, Herbie flags it proactively (hooks into Feature 9).

**Complexity:** L.

---

### 5. RFI and Submittal Drafting

**User story:** As a PM, I tell Herbie *"draft an RFI on the concrete spec discrepancy in section 03 30 00"* and get a clean draft I review and send.

**Reuse:** `rfis`, `submittals`, `bid_rfis` tables; `client/src/pages/execution-rfis.tsx`; `client/src/pages/execution-submittals.tsx`.

**New:** `server/services/rfi-draft.service.ts`, `server/services/submittal-draft.service.ts` (or extend existing). Herbie endpoints: `POST /api/herbie/draft-rfi`, `POST /api/herbie/draft-submittal`. Draft lands in `approval_requests` with `type='outbound_rfi'` / `'outbound_submittal'`; approval action triggers the real send.

**Data model delta:** possibly extend `rfis`/`submittals` with `status='draft_pending_approval'` state if not already present. Add `drafted_by_herbie` boolean for analytics.

**Herbie capabilities:** `create_rfi`, `create_submittal`, `draft_message`, `record_decision`.

**Acceptance criteria:**
- "Draft RFI on X" in Herbie chat creates a draft RFI visible in the approval queue.
- PM can edit the draft inline before approving.
- Approve → RFI persists as sent (Phase 1: "sent" means committed to the project; real email sending is optional).
- `herbie_actions` records the drafting event; `herbie_decisions` records the PM approval decision.

**Complexity:** M.

---

### 6. Ask Herbie — Semantic Search + Chat

**User story:** As a PM, I can ask Herbie *"what's blocking the ABC project"* or *"find the latest concrete spec"* and get a tight answer grounded in project data.

**Reuse:** `server/agents/herbie.agent.ts`; `server/services/rag.service.ts`; `server/services/herbie-query.service.ts`; `server/services/herbie-memory.service.ts`; `conversation_memory` table; `client/src/pages/herbie.tsx`.

**New:** Project-scoped context assembler (per the memory-read rules in HERBIE.md). UI polish on `/automation/herbie` — cleaner chat transcript, source citations under answers, "viewing in project: X" context chip. Session state in `conversation_memory` keyed by (user_id, project_id).

**Data model delta:** none new; possibly add `conversation_memory.project_id` if not already present for project-scoping.

**Herbie capabilities:** `search_project`, `read_document`, `get_project_status`.

**Acceptance criteria:**
- Asking a question grounded in uploaded docs returns an answer with source citations (doc name + page/section).
- Switching project context in UI filters Herbie's search to that project.
- Follow-up questions retain context across 20+ messages without regression.
- Herbie's responses follow the voice guide in HERBIE.md (terse, direct).

**Complexity:** M.

---

### 7. Client/Sub Read-Only Portal with "Powered by Sentinel + Herbie" Footer

**User story:** As a client or subcontractor, I get a link, I see only the project docs and status the PM chose to share, and every page has a "Powered by Sentinel + Herbie" footer.

**Reuse:** `client/src/pages/vendor-portal.tsx`; `server/routes/vendor-portal.routes.ts`; share-link infrastructure.

**New:** `PoweredByFooter` component (also used in project cockpit client view and all generated PDFs). Scoped read-only project view with configurable visibility (PM picks which artifacts/categories are public). Token-gated via existing share-link mechanism.

**Data model delta:** `portal_shares` table: `id`, `tenant_id`, `project_id`, `audience` (`client` | `sub` | `vendor`), `token`, `scope_json` (which categories are visible), `expires_at`, `created_by`, `created_at`.

**Herbie capabilities:** none direct (Herbie is not the audience's Herbie in Phase 1).

**Acceptance criteria:**
- PM creates a share link scoped to a subset of artifacts; link opens to that subset only.
- All portal pages + generated PDFs carry the "Powered by Sentinel + Herbie" footer.
- Link token can be revoked; revoked links 404.
- Attempted access outside scope returns 403 without leaking existence.

**Complexity:** M.

---

### 8. Herbie Three-Layer Memory Subsystem

**User story:** As a PM, Herbie remembers what he's learned about my projects across sessions and uses it to give better answers.

**Reuse:** `conversation_memory` (covers `herbie_messages`); `org_memory_items`; `preference_signals`; pgvector extension (already referenced in code).

**New:**
- `herbie_facts` table: `id`, `tenant_id`, `project_id`, `subject` (entity type + id), `predicate`, `object`, `source_type` (`document` | `message` | `user`), `source_id`, `confidence`, `extracted_at`, `superseded_by` (nullable), `created_at`.
- `herbie_decisions` table: `id`, `tenant_id`, `project_id`, `summary`, `rationale`, `decided_by` (user_id or `herbie`), `decided_at`, `related_entity_type`, `related_entity_id`.
- `herbie_relationships` table: `id`, `tenant_id`, `project_id` (nullable for cross-project), `contact_id` / `vendor_id` / `company_id`, `role`, `status`, `notes`, `created_at`.
- Write helpers in `server/services/herbie-memory.service.ts` (extend existing).
- Read helpers for the system-prompt assembler.

**Data model delta:** three new tables (above).

**Herbie capabilities:** `record_fact`, `record_decision`, `search_project`.

**Acceptance criteria:**
- Every auto-extraction above 0.7 confidence writes a fact with source.
- Conflicting facts mark old as `superseded_by`; do not hard-delete.
- `get_project_status` reads from these tables, not ad-hoc joins.
- Semantic recall returns messages with their linked facts inline.

**Complexity:** XL.

---

### 9. Proactive Monitor (Background Sweep)

**User story:** As a PM, Herbie tells me about the things I forgot to ask about.

**Reuse:** `server/services/contractor-monitors.service.ts`; `server/queue/scheduler.ts`; `server/queue/worker.ts`; `server/workers/documentIngestion.worker.ts` (pattern); `agent_activities`; `notifications`; `approval_requests`.

**New:** Additional monitor jobs: `coi-expiry`, `submittal-overdue`, `daily-log-missing`, `change-order-stale`, `invoice-overdue`, `extraction-conflict`. Each runs on a cron (hourly or daily) and enqueues items into `notifications` and/or `approval_requests` when they trip thresholds. Idempotency via a `(monitor_id, entity_id, date)` unique key so the same alert doesn't fire twice.

**Data model delta:** `monitor_events` table (or reuse `agent_activities` with a `monitor_id` field) for idempotency + audit.

**Herbie capabilities:** `flag_for_review`, `draft_message`, `get_project_status`.

**Acceptance criteria:**
- Monitor jobs run on schedule without overlap (already handled by `job_locks`).
- COI expiring in 14 days fires one alert in `notifications` per COI per day window.
- Alerts show up in the approval queue (if they produced a draft) or the notification bell.
- Monitor runs leave an audit trail.

**Complexity:** L.

---

### 10. Approval Queue UI for Drafted External Messages

**User story:** As a PM, I review every message Herbie wants to send, edit as needed, and approve or cancel.

**Reuse:** `client/src/pages/approvals.tsx`; `server/services/approval.service.ts`; `approval_requests`, `approval_actions`, `herbie_review_queue`.

**New:** New card type `draft_external_message` in the approval UI, with: (1) the drafted message body in an editable rich-text field, (2) the recipient + channel chip, (3) context pane showing what Herbie knew (source facts + triggering event), (4) Send / Edit & Send / Cancel buttons. On approval, the service dispatches the send (Phase 1: send = commit + optional email via O365 if configured). Explicit "never auto-send" banner reinforces the Phase 1 rule.

**Data model delta:** `approval_requests.payload_json` already covers most; possibly extend with a typed shape for `draft_external_message`.

**Herbie capabilities:** `draft_message` end-to-end completion path.

**Acceptance criteria:**
- Drafted message appears within 30s of Herbie creating it.
- PM can edit inline and approve; edited version is what gets sent.
- Cancel marks the draft `rejected` with optional reason stored in `approval_actions`.
- No path sends without passing through this UI in Phase 1.

**Complexity:** M.

---

## Consolidated Data Model Delta

New tables (Phase 1):

1. `coi_certificates` (Feature 3)
2. `herbie_facts` (Feature 8)
3. `herbie_decisions` (Feature 8)
4. `herbie_relationships` (Feature 8)
5. `portal_shares` (Feature 7)
6. `monitor_events` *(or reuse `agent_activities` — decide during Ticket)* (Feature 9)

Extensions to existing tables (Phase 1):

- `projects.project_type` (enum, if not present)
- `daily_logs.audio_document_id`, `daily_logs.transcript`, `daily_logs.source`
- `conversation_memory.project_id` (if not already present)
- `rfis.drafted_by_herbie`, `submittals.drafted_by_herbie`

Decisions still open:

- `daily_logs` vs `project_daily_logs` — canonical table for Phase 1 (ticket to decide).
- `herbie_preferences` new table vs extend `preference_signals` (audit current usage first).

---

## Herbie Capability Matrix (tool × feature)

|                       | F1 | F2 | F3 | F4 | F5 | F6 | F7 | F8 | F9 | F10 |
|-----------------------|----|----|----|----|----|----|----|----|----|-----|
| `read_document`       |    | ✅ | ✅ |    |    | ✅ |    |    |    |     |
| `extract_fields`      |    | ✅ | ✅ | ✅ |    |    |    |    |    |     |
| `search_project`      | ✅ | ✅ |    |    | ✅ | ✅ |    | ✅ | ✅ |     |
| `create_rfi`          |    |    |    |    | ✅ |    |    |    |    | ✅ |
| `create_submittal`    |    |    |    |    | ✅ |    |    |    |    | ✅ |
| `log_daily`           |    |    |    | ✅ |    |    |    |    | ✅ |     |
| `flag_for_review`     |    | ✅ | ✅ | ✅ |    |    |    |    | ✅ | ✅ |
| `draft_message`       |    |    | ✅ |    | ✅ |    |    |    | ✅ | ✅ |
| `record_fact`         |    | ✅ | ✅ | ✅ |    |    |    | ✅ |    |     |
| `record_decision`     |    |    |    |    | ✅ |    |    | ✅ |    | ✅ |
| `get_project_status`  | ✅ |    | ✅ |    |    | ✅ |    | ✅ | ✅ |     |

---

## Build Order (Dependency-Sorted)

1. **Foundation unblockers** — fix `no-placeholder-gate` false positive, rotate/scrub the `.replit` secret, scaffold a Vitest harness that doesn't require a live server. *(Tickets #1–#3.)*
2. **Herbie memory schema** (Feature 8) — facts/decisions/relationships tables + write helpers. Everything else reads/writes through these.
3. **Projects workspace rebrand** (Feature 1) — naming + pruned create form. Demo backdrop.
4. **Document vault retune** (Feature 2) — GC artifact taxonomy + extraction prompts. First visible Herbie value.
5. **COI tracker** (Feature 3) — demos Herbie's compliance muscle; depends on Features 2 + 8.
6. **Daily-log voice** (Feature 4) — demos field-to-office value; depends on Feature 2 (audio upload) + 8 (facts).
7. **RFI/Submittal drafting** (Feature 5) — depends on Feature 10 (approval card).
8. **Ask Herbie** (Feature 6) — depends on Features 2 + 8.
9. **Proactive monitor** (Feature 9) — depends on Features 3 + 5 + 4 (things to monitor).
10. **Approval queue external-draft card** (Feature 10) — can be built in parallel once Feature 5 draft shape is defined.
11. **Portal + footer** (Feature 7) — can be built in parallel with the above; low-dep.

---

## 15-Minute Demo Script

Cold open — demo project "Maple Street Office Build-Out" is pre-seeded with a few docs and a COI 10 days from expiry.

| t (min) | Beat | What PM sees | What Herbie does |
|---|---|---|---|
| 0:00 | "Here's the project dashboard." | Cockpit: open RFIs, pending submittals, COI status (yellow), recent activity. "Powered by" footer. | — |
| 1:30 | Drop in a contract PDF + a COI PDF. | Progress bars, then "classified: contract / COI" badges + extracted-field preview. | `read_document`, `extract_fields`, writes to `herbie_facts` on accept. |
| 3:30 | "Ask Herbie: *what's the notice-to-cure window in the contract?*" | Chat answer with source citation to the contract clause. | `search_project`, `read_document`. |
| 5:00 | Foreman pulls out phone, records 45s voice memo on camera. | Structured daily log draft appears with weather / crew / tasks / issues fields. | Whisper → `extract_fields` → `log_daily`. |
| 7:30 | Notification pops: "Acme Plumbing COI expires in 10 days. Drafted renewal — review?" | PM opens approval queue, sees drafted email, edits one sentence, clicks Approve. | `flag_for_review`, `draft_message`, landed in `approval_requests`. |
| 10:00 | "Ask Herbie to draft an RFI about the concrete spec discrepancy." | Chat → "drafted, in your queue." PM clicks into queue, reviews, approves. | `create_rfi`, `draft_message`. |
| 12:00 | Show the client portal link on a second device. | Client view: project timeline, shared docs only, "Powered by Sentinel + Herbie" footer. | — |
| 13:30 | Recap: *"This is what Herbie did for you in 13 minutes. Imagine a month."* | Cockpit shows: 4 facts learned, 2 drafts created, 1 monitor caught, 1 document classified. | — |
| 14:30 | Close. Hand the mic over. | — | — |

**Buffer:** 30–60 seconds. If something drags, cut the portal-link beat first (it's the least Herbie-forward).

---

## Out of Scope for Phase 1

- Trust-tiered autonomous outbound (Phase 2).
- Multi-LLM-provider abstraction (Phase 2).
- Financial modules beyond read-only status (invoices, bills, change-order finals).
- Full Procore import path (`procore-ingest.service.ts` stays stubbed).
- Federal-contracting workflows (samgov, highergov, bid-jacket agents) — hidden from the user-facing nav; code stays in place.
- Egnyte sync improvements (keep as-is; only care that it doesn't break).
- `server/routes.ts` split (tracked separately; do incrementally as we touch areas).

---

## Risks to Flag Before Ticketing

1. **Build is red** (`no-placeholder-gate`) — Ticket #1. Blocks green-CI on everything downstream.
2. **Leaked secret in `.replit`** — Ticket #2. Rotate first, then scrub.
3. **Tests near-zero** — Ticket #3. Every Phase 1 ticket after #3 writes real tests.
4. **`shared/schema.ts` size** — each new table adds to a 6.5k-line file. Group by domain; resist reshaping neighbors.
5. **Herbie is OpenAI-only** — do not optimize prompts against OpenAI quirks that would break on a provider swap later. Keep prompts conventional.
