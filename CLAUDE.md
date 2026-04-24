# CLAUDE.md — Sentinel Command Center

This file is the persistent project memory for Claude Code on this repo. It is the first thing to read at the start of any session. Update the **Current Phase** section as work progresses.

---

## Product Summary

**Sentinel Command Center** is a Procore replacement for small-to-mid construction contractors (10–200-person GCs and specialty contractors). It is AI-native from day one.

- **The wedge:** **Herbie** — an embedded AI teammate (not a chatbot, not a feature) who functions as a real member of every project team. He reads documents, drafts paperwork, tracks compliance, captures field notes, answers questions, and proactively reaches out when something needs attention.
- **Why we win:** Procore charges $375+/user/month, is bloated, and their AI is bolted on. Sentinel is leaner, cheaper, and Herbie is the product. Every PM who uses Herbie should feel like they hired a sharp, tireless project coordinator for a fraction of the cost.
- **Win condition:** A PM saves 5+ hours/week with Herbie, tells two contractor friends, we get referrals. Every client-facing artifact (portal, generated PDFs, emails Herbie drafts) carries a **"Powered by Sentinel + Herbie"** footer to drive passive referrals.
- **Phase 1 demo target:** A 15-minute walkthrough that makes a contractor say *"when can I have this."*

See **HERBIE.md** for Herbie's persona, memory architecture, and behavior contract.

---

## Hard Rules (Never Violate)

1. **Never touch `server/data/`** — confidential client data (tax docs, COIs, corporate articles for Blackhawk, BJ Shower Door, 4G Steel, Goosmann Law, etc.). Gitignored. Do not read it, do not commit it, do not reference its contents.
2. **Never touch `attached_assets/`** — gitignored bulk client assets.
3. **Never commit** `.env`, secrets, keys, certs, or anything in the existing `.gitignore`.
4. **Always run the build and any existing tests** before declaring a task done. Report results.
5. **Ask before installing new packages.** Justify each one.
6. **Small commits with clear messages.** No mega-commits.
7. **Write tests for new business logic.** Data models, AI pipelines, and API endpoints need real tests. UI can be lighter.
8. **Herbie never sends external communications** (email, SMS, client portal messages) without a human approval gate in Phase 1. He can draft, queue, and notify the PM that something is ready to send. Phase 2 introduces trust-tiered autonomy.
9. **If unsure about product direction, ask.** If unsure about implementation, propose 2 options with tradeoffs.
10. **Do not modify `.gitignore`** to expose `server/data/` or `attached_assets/`. If a feature seems to need data from there, stop and ask.
11. **Treat `main` as protected.** Work only on `feature/phase-1-herbie`. Never commit to `main` directly.
12. **Secrets never in tracked files.** `.replit` previously contained a plaintext `EGNYTE_CLIENT_SECRET` (committed in `4a018a8`); it has been scrubbed and the value must be treated as compromised and rotated at Egnyte. All secrets belong in **Replit Secrets** (UI) or a local gitignored `.env`. The `secret-scan` build gate (`scripts/secret-scan-gate.cjs`) will fail the build if a credential-shaped value lands in any tracked file again.

---

## Tech Stack

| Layer | Stack |
|---|---|
| Frontend | React 18, TypeScript, Vite 7, Wouter, TanStack Query, shadcn/ui + Radix, Tailwind 3, Zustand, Framer Motion |
| Backend | Express 5, Node 20, TypeScript ESM (dev via `tsx`, prod bundled to CJS via esbuild) |
| Database | PostgreSQL 16, Drizzle ORM, drizzle-zod |
| AI | **Anthropic SDK (`@anthropic-ai/sdk`)** — Claude Opus 4.7 for orchestration, Claude Haiku 4.5 for extraction. OpenAI SDK kept only for Whisper transcription. |
| Object storage | Replit Object Storage (`@replit/object-storage`) + `@google-cloud/storage` |
| Queue/workers | Postgres-backed queue in `server/queue/` + `SKIP LOCKED` worker in `server/workers/` |
| Auth | Passport + passport-local, `express-session` backed by `connect-pg-simple` |
| Real-time | WebSocket (`ws`) + SSE via `event-stream.service.ts` |
| Tests | Vitest (only one test file today: `server/tests/jacket-guards.test.ts`) |
| Hosting | Replit (autoscale); Vite dev middleware runs inside Express in dev |

---

## Architecture

```
server/
  index.ts            # single Express app; serves API + client (Vite mid in dev, static in prod)
  routes.ts           # 23k+ lines, ~826 route handlers (scheduled for incremental split)
  routes/             # newer scoped route modules (herbie, awards, vendor portal, bid forms)
  storage.ts          # 1.2k-line storage/DB-access layer
  agents/             # herbie + herbie.autonomous + 8 others (cio-bot, foreman-bot, legalops, pm, fieldOps, precon, backOffice, kpi)
  services/           # ~80 service modules
  queue/              # scheduler + worker + queue service
  workers/            # documentIngestion.worker.ts (SKIP LOCKED)
  integrations/       # samgov, highergov, egnyte, o365, quickbooks, teams, usaspending
  adapters/, connectors/
  seeds/
  tests/              # 1 file (server-dependent)
  data/               # OFF-LIMITS — confidential, gitignored
client/src/
  App.tsx             # wouter routes + per-route error boundaries (SafeRoute pattern)
  pages/              # ~55 top-level pages
  components/         # shadcn/ui primitives + domain components
  features/drawers, row-actions
  nav/, hooks/, lib/, contexts/
shared/
  schema.ts           # single Drizzle schema — 283 tables, 6,522 lines
  models/             # (mostly empty)
```

**Request flow:** client fetch/TanStack Query → `/api/*` → Express → `registerRoutes(app)` → service layer → Drizzle → Postgres. Writes often emit an audit event and/or enqueue a job; jobs run in the background worker. Herbie calls go through `herbie.agent.ts` + tool-router → services + approval gate. SSE + WebSocket push updates back to the client for real-time invalidations.

---

## How to Run, Build, Test

```bash
npm install                  # install deps (currently 23 vulns — see Known Gotchas)
npm run dev                  # NODE_ENV=development tsx server/index.ts (port 5000; serves API + Vite middleware)
npm run build                # tsx script/build.ts (runs secret-scan + no-placeholder + data-quality gates, then vite + esbuild)
npm start                    # NODE_ENV=production node dist/index.cjs (serves built client from dist/public)
npm run check                # tsc --noEmit (strict TS)
npm run db:push              # drizzle-kit push (requires DATABASE_URL)
npm test                     # unit tests — no DB, no server required (db module is mocked per test)
npm run test:watch           # unit tests in watch mode
npm run test:integration     # integration tests (requires a live server on :5000)
npm run test:all             # unit + integration, sequentially
```

**Test layout:**
- Unit tests live next to what they test: `server/services/__tests__/*.test.ts`, `client/src/**/__tests__/*.test.ts(x)`. Discovered via `**/__tests__/**/*.test.{ts,tsx}`.
- Integration tests live under `server/tests/integration/` and run against a live server (`:5000`).
- `vitest.config.ts` excludes the integration path from default runs; `vitest.integration.config.ts` targets it exclusively.

Required env vars (minimum to boot): `DATABASE_URL`, `PORT` (defaults to 5000). Additional env vars (OpenAI, SAM.gov, HigherGov, Egnyte, Microsoft, QuickBooks, Teams) are only needed for the integrations that touch them.

---

## Coding Conventions

- **TypeScript:** `strict: true` is on. No `any` escapes without a comment explaining why.
- **Path aliases:** `@/*` → `client/src/*`, `@shared/*` → `shared/*`. Use them.
- **Frontend components:** shadcn/ui + Tailwind. Every route must be wrapped in `SafeRoute` (see existing pattern in `client/src/App.tsx`) for per-route error boundaries.
- **Database:** Drizzle + Zod via `drizzle-zod`. Insert/select schemas live next to the table definition in `shared/schema.ts`.
- **Services:** Business logic lives in `server/services/<domain>.service.ts`. Route handlers should be thin — parse, authorize, call service, return.
- **External-facing writes:** route through `audit.service` and, when applicable, `approval.service`. Herbie outbound comms always go through the approval queue in Phase 1.
- **Logging:** use the `log(message, source)` helper in `server/index.ts`. Avoid bare `console.log` in server code; `console.error` is fine for caught errors.
- **File naming:** kebab-case for files, PascalCase for React components, camelCase for service/exported functions, snake_case for Postgres columns and table names.
- **Tests:** new business logic (services, pipelines, route handlers touching data) gets a Vitest spec. UI tests are optional but welcomed for complex flows.

---

## Commit & Branch Policy

- Work only on `feature/phase-1-herbie`. **`main` is protected** — never commit or push to it directly.
- Small, focused commits. One logical change per commit.
- Commit message style (observed in repo): `type: short subject` (e.g. `docs: …`, `feat: …`, `fix: …`, `refactor: …`, `test: …`, `chore: …`).
- Do not skip hooks (`--no-verify`), amend published commits, or force-push without explicit approval.
- Do not push to `origin` unless asked.

---

## `.gitignore` Policy — Why It's Tight

`server/data/` and `attached_assets/` hold **confidential client documents** — tax forms, COIs, corporate articles, internal correspondence for Blackhawk Construction, BJ Shower Door, 4G Steel, Goosmann Law, and others. These are **never** to be read, referenced, copied, summarized, or exposed through any feature, log, or commit. If a feature request seems to require data from these directories, stop and ask; the answer is almost always "synthesize a fixture instead."

Likewise: `.env`, `.env.*`, `*.pem`, `*.key`, and all `*.tar.gz` archives are gitignored. Do not add secrets to any tracked file.

---

## Known Gotchas & Footguns

- **`no-placeholder-gate` opt-out convention.** If a line legitimately contains a banned word (e.g. a regex literal whose source happens to spell "placeholder", or a copy test), append the marker comment `// no-placeholder-gate: allow-line` to that line. The gate ignores matching lines via an explicit `IGNORE_LINE_PATTERNS` entry. Keep the marker narrow and per-line — do not add file-level exemptions. Never remove banned patterns to make a gate pass.
- **`data-quality-gate` is GREEN** ✅ — repaired 2025-04-24: `APPLY=true node scripts/repair-purchase-orders.cjs` collapsed 3 repeated-Copy `poNumber` chains (202504700-SC-002 variants) to Copy 2/3/4. Build passes all 3 gates.
- **Leaked secret in `.replit:53`** — `EGNYTE_CLIENT_SECRET` is plaintext and committed. Needs rotation + scrub. Queued as Ticket #2.
- **`npm audit`** — 23 vulnerabilities (1 critical, 11 high). Critical is `fast-xml-parser`. `xlsx` has no fix available (ReDoS + prototype pollution); evaluate whether it's needed at runtime.
- **`server/routes.ts` is 23k lines / 826 handlers.** Any edit there is risky. New routes should go in `server/routes/<domain>.ts`. Incremental split is ongoing.
- **`shared/schema.ts` is 283 tables / 6,522 lines.** When adding tables, keep them grouped by domain and resist reshaping neighbors.
- **Three SAM.gov env-var aliases** exist in code (`SAM_API_KEY`, `SAM_GOV_API_KEY`, `SAMGOV_API_KEY`). Historical drift — don't add a fourth.
- **Default tenant is `blackhawk-default`.** Header in `App.tsx:420` still says "BLACKHAWK SENTINEL". Rebranding is Phase 1 work, not yet done.
- **Only one Vitest file exists**, and it expects a live server on `:5000`. Hard rule 7 (tests for new business logic) is unenforceable until we add a non-server-dependent Vitest harness. Queued as Ticket #3.
- **LLM is OpenAI-only.** No provider abstraction. A future Anthropic swap would touch many files — pay that cost intentionally.
- **Two daily-log tables:** `daily_logs` and `project_daily_logs` both exist. Confirm canonical before extending either.
- **Vite middleware inside Express** — in dev, Vite runs as Express middleware (see `server/index.ts:141`). Don't start a separate Vite dev server.

---

## Current Phase

**Phase 1 — Herbie MVP.** Rebrand as Sentinel Command Center, prune federal-contracting surfaces from the user-facing app, build the 10 Phase 1 features in `ROADMAP.md`, hit a 15-minute demo that makes a contractor say "when can I have this."

### Foundation complete

- Build gates: `secret-scan` PASSED, `no-placeholder` PASSED, `data-quality` still red (PO repair pending, see below).
- `.replit` secret scrub + `scripts/secret-scan-gate.cjs` enforcing no-credentials-in-tracked-files.
- Vitest harness split: `npm test` (unit, no DB) vs `npm run test:integration` (live server).
- Zero TypeScript errors (`npm run check` clean).
- `npm audit`: 23 → 10 vulnerabilities, no critical remaining.
- DB schema live: `npm run db:push` applied the new tables.

### Feature work landed — all 10 Phase 1 features have working foundations

- **Feature 1 (brand rebrand) — done.** All user-visible surfaces renamed, including the Herbie orchestrator system prompt (now loads from `HERBIE.md` via `herbie-identity.service.ts`). Zero remaining "BLACKHAWK SENTINEL" / "Blackhawk Sentinel" references in tracked client/server source.
- **Feature 2 (GC taxonomy foundation) — done.** `shared/gc-artifact-taxonomy.ts`.
- **Feature 3 (COI tracker) — end-to-end landed.** Schema + `coi.service.ts` (expiry tiers, upsert, partition) + `/api/coi/*` HTTP routes + cockpit rollup in `/api/projects/:id/cockpit` + `monitorExpiringCois` in `contractor-monitors.service.ts`.
- **Feature 4 (voice daily log) — landed.** Schema columns (`daily_logs.audio_document_id`, `transcript`, `source`) + `voice-daily-log.service.ts` with pluggable `Transcriber`/`Extractor` interfaces (OpenAI Whisper + gpt-4o-mini defaults, deterministic stubs when keys are absent) + `POST /api/projects/:projectId/daily-logs/voice` accepting multipart or JSON `{ audioUrl }`.
- **Feature 5 (RFI + Submittal drafting) — done.** `rfi-draft.service.ts` and `submittal-draft.service.ts` + dispatchers registered at boot + `POST /api/rfi/draft` and `POST /api/submittal/draft`.
- **Feature 6 (Ask Herbie) — landed.** `herbie-identity.service.ts` loads `HERBIE.md` at runtime, caches by mtime. Orchestrator's `chat()` now accepts optional `projectId`/`tenantId` and assembles the three-layer project-memory block (facts / decisions / relationships) into the system prompt via `formatProjectMemoryBlock()`.
- **Feature 7 (portal + footer) — landed.** `PoweredByFooter` component with `muted` / `brand` variants, in use on `vendor-portal.tsx`.
- **Feature 8 (three-layer memory) — end-to-end landed.** Schema (`herbie_facts`, `herbie_decisions`, `herbie_relationships`) + `herbie-facts.service.ts` (confidence-gated routing, supersession, upsert-by-role) + `/api/herbie/memory/*` HTTP routes.
- **Feature 9 (proactive monitor) — COI slice landed.** `monitorExpiringCois` runs alongside the other monitors in `runAllMonitors`.
- **Feature 10 (approval queue) — end-to-end landed.** Backend: `registerApprovalDispatcher(actionType, fn)` registry, `draft_external_message` / `draft_rfi` / `draft_submittal` / `draft_coi_renewal` action types, idempotent `processDecision` with dispatcher hook + error swallowing. Frontend: `approvals.tsx` renders Herbie-drafted items with action-specific labels, verbs, glyphs, and PM-facing summary copy.

### Known external actions still required

- **`data-quality-gate` build gate** ✅ — RESOLVED 2025-04-24. The 3 repeated-Copy PO chains were repaired with `APPLY=true node scripts/repair-purchase-orders.cjs`. No further action needed.
- **Rotate `EGNYTE_CLIENT_SECRET` in Egnyte admin** and add the new value to Replit Secrets. The old committed value is burned.
- **Optional:** set `OPENAI_API_KEY` (or `AI_INTEGRATIONS_OPENAI_API_KEY`) to enable real Whisper transcription in Feature 4. Without it, voice daily logs fall back to a deterministic stub that returns a placeholder transcript — the endpoint stays functional for dev / demo.

Update this section as milestones land.

---

## Related Files

- **HERBIE.md** — Herbie's persona, memory architecture, tool contracts, and behavior rules. Loaded into every Herbie LLM call as the identity-memory layer.
- **ROADMAP.md** — Phase 1 MVP features, data model deltas, build order, and 15-minute demo script.
