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
12. **`.replit` currently contains a plaintext `EGNYTE_CLIENT_SECRET`** (line 53). Do not push changes that keep it there; flag immediately if a task touches `.replit`. Rotation + scrub is a queued ticket.

---

## Tech Stack

| Layer | Stack |
|---|---|
| Frontend | React 18, TypeScript, Vite 7, Wouter, TanStack Query, shadcn/ui + Radix, Tailwind 3, Zustand, Framer Motion |
| Backend | Express 5, Node 20, TypeScript ESM (dev via `tsx`, prod bundled to CJS via esbuild) |
| Database | PostgreSQL 16, Drizzle ORM, drizzle-zod |
| AI | OpenAI SDK (`openai` v6). No Anthropic wired today. |
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
npm run build                # tsx script/build.ts (currently RED — see Known Gotchas)
npm start                    # NODE_ENV=production node dist/index.cjs (serves built client from dist/public)
npm run check                # tsc --noEmit (strict TS)
npm run db:push              # drizzle-kit push (requires DATABASE_URL)
npx vitest                   # run existing Vitest suite (note: current test needs a live server on :5000)
```

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
- **`data-quality-gate` is currently RED** against the live DB — 3 critical "(Copy) (Copy)" chained `poNumber` values. A repair script exists at `scripts/repair-purchase-orders.cjs` but running it mutates live data; don't invoke without explicit approval. Separate ticket.
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

Update this section as milestones land.

---

## Related Files

- **HERBIE.md** — Herbie's persona, memory architecture, tool contracts, and behavior rules. Loaded into every Herbie LLM call as the identity-memory layer.
- **ROADMAP.md** — Phase 1 MVP features, data model deltas, build order, and 15-minute demo script.
