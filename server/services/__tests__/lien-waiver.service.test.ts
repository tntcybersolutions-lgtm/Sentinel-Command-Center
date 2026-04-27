import { describe, it, expect, vi, beforeEach } from "vitest";

// In-memory mock store for the two tables this service touches.
interface DbRow {
  id: string;
  [k: string]: any;
}
const store: Record<string, DbRow[]> = {
  lien_waivers: [],
  lien_waiver_events: [],
  lien_waiver_templates: [],
  lien_waiver_reminders: [],
  vendors: [],
  projects: [],
};

function tableKey(arg: any): string {
  const name =
    arg?._?.name ||
    arg?.[Symbol.for("drizzle:Name")] ||
    (typeof arg?.toString === "function" ? arg.toString() : "");
  const s = String(name);
  if (s.includes("lien_waiver_events")) return "lien_waiver_events";
  if (s.includes("lien_waiver_templates")) return "lien_waiver_templates";
  if (s.includes("lien_waiver_reminders")) return "lien_waiver_reminders";
  if (s.includes("lien_waivers")) return "lien_waivers";
  if (s.includes("vendors")) return "vendors";
  if (s.includes("projects")) return "projects";
  throw new Error(`Unexpected table: ${s}`);
}

function colName(col: any): string {
  const raw =
    (col && typeof col === "object" && "name" in col && col.name) ||
    (col && col._ && col._.name) ||
    String(col);
  return String(raw);
}

function shortColName(col: any): string {
  if (col && typeof col === "object" && col._column) return col._column;
  const full = colName(col);
  const dot = full.indexOf(".");
  return dot >= 0 ? full.slice(dot + 1) : full;
}

function readCol(row: DbRow, col: any): unknown {
  if (!col) return undefined;
  const full = colName(col);
  // Qualified ("table.col"): look up prefixed key only. Do NOT fall back
  // to the unprefixed short name — the join builder may have merged a
  // sibling table's value under the same short name (e.g. waiver.sentAt
  // shadowing reminder.sentAt), which would corrupt isNull/lte checks.
  if (full.indexOf(".") >= 0) {
    return row[full];
  }
  // Unqualified — best-effort short-name lookup.
  const short = shortColName(col);
  if (short in row) return row[short];
  return undefined;
}

// Build a row that has both unprefixed keys (for backwards compat with
// any code that reads row.foo directly) AND `${table}.${col}` keys for
// every property present on the row. Used by both the no-join and the
// inner-join collectors so qualified col-aware predicates always resolve.
function enrich(row: DbRow, table: string): DbRow {
  const out: any = { ...row };
  for (const k of Object.keys(row)) out[`${table}.${k}`] = row[k];
  return out;
}

let currentTable: string | null = null;

function makeDbMock() {
  return {
    insert: (tbl: any) => {
      currentTable = tableKey(tbl);
      return {
        values: (vals: any) => {
          const row: DbRow = {
            id: `${currentTable}-${store[currentTable!].length + 1}`,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...vals,
          };
          store[currentTable!].push(row);
          return {
            returning: async () => [row],
          };
        },
      };
    },
    select: (cols?: any) => ({
      from: (tbl: any) => {
        currentTable = tableKey(tbl);
        const fromTable = currentTable;
        let filter: ((r: DbRow) => boolean) | null = null;
        // Inner-join state. When set, rows are produced as
        // `{ [aliasA]: leftRow, [aliasB]: rightRow }` to match the
        // shape drizzle returns when you `.select({ a: tbl, b: tbl })`.
        let join:
          | {
              rightTable: string;
              joinPred: (flat: DbRow) => boolean;
            }
          | null = null;

        const collect = (): DbRow[] => {
          const left = store[fromTable];
          if (!join) {
            return left
              .map((r) => enrich(r, fromTable))
              .filter((r) => !filter || filter(r));
          }
          const right = store[join.rightTable];
          const out: DbRow[] = [];
          // cols is the projection map: e.g. { reminder: lienWaiverReminders, waiver: lienWaivers }
          const aliases = cols ? Object.keys(cols) : [];
          // Map alias → table name
          const aliasTable: Record<string, string> = {};
          for (const a of aliases) {
            const t = cols[a];
            const tName = (t && (t._?.name || t.toString?.())) || "";
            aliasTable[a] = String(tName);
          }
          for (const l of left) {
            for (const r of right) {
              // Build a flat row carrying both unprefixed (left wins)
              // and table-prefixed keys (`${tableName}.${col}`) so that
              // our col-aware predicates can disambiguate join sides.
              const flat: any = { ...r, ...l };
              for (const k of Object.keys(l)) flat[`${fromTable}.${k}`] = l[k];
              for (const k of Object.keys(r)) flat[`${join!.rightTable}.${k}`] = r[k];
              if (!join!.joinPred(flat)) continue;
              const row: any = {};
              for (const a of aliases) {
                const tName = aliasTable[a];
                row[a] = tName === fromTable ? l : r;
              }
              if (!filter || filter(flat)) {
                out.push(row);
              }
            }
          }
          return out;
        };

        const builder: any = {
          innerJoin: (rightTbl: any, pred: any) => {
            const rightTable = tableKey(rightTbl);
            join = { rightTable, joinPred: (flat) => pred(flat) };
            return builder;
          },
          where: (pred: any) => {
            filter = pred;
            return builder;
          },
          orderBy: () => builder,
          limit: async (n: number) => {
            const rows = collect();
            const sliced = rows.slice(0, n);
            if (cols && cols.count) {
              return [{ count: rows.length }];
            }
            return sliced;
          },
          then: undefined as any,
        };
        builder.then = (resolve: any) => {
          const rows = collect();
          if (cols && cols.count) return resolve([{ count: rows.length }]);
          return resolve(rows);
        };
        return builder;
      },
    }),
    update: (tbl: any) => {
      currentTable = tableKey(tbl);
      return {
        set: (patch: any) => {
          const tableName = currentTable!;
          return {
            where: (pred: any) => {
              // Apply the patch immediately so callers that don't chain
              // `.returning()` still get the side effect (the real
              // drizzle `update().set().where()` returns a thenable).
              // Predicates use qualified col names, so evaluate against
              // an enriched copy of each row but mutate the originals.
              const targets = store[tableName].filter((r) =>
                pred(enrich(r, tableName)),
              );
              targets.forEach((t) => Object.assign(t, patch));
              const result = targets;
              return {
                returning: async () => result,
                then: (resolve: any) => resolve(result),
              };
            },
          };
        },
      };
    },
    delete: (tbl: any) => {
      currentTable = tableKey(tbl);
      const tableName = currentTable!;
      return {
        where: (pred: any) => {
          const before = store[tableName];
          const matches = before.filter((r) => pred(enrich(r, tableName)));
          const matchSet = new Set(matches);
          store[tableName] = before.filter((r) => !matchSet.has(r));
          return {
            returning: async () => matches,
            then: (resolve: any) => resolve(matches),
          };
        },
      };
    },
  };
}

vi.mock("../../db", () => ({ db: makeDbMock() }));
vi.mock("drizzle-orm", () => ({
  and: (...preds: Array<(r: DbRow) => boolean>) => (r: DbRow) =>
    preds.every((p) => p(r)),
  eq: (col: any, val: any) => {
    // Handle col-vs-col (used in join conditions like
    // `eq(lienWaivers.id, lienWaiverReminders.lienWaiverId)`).
    const isColRef =
      val && typeof val === "object" && (val._?.name || val.name);
    return (r: DbRow) => {
      const left = readCol(r, col);
      const right = isColRef ? readCol(r, val) : val;
      return left === right;
    };
  },
  lte: (col: any, val: any) => (r: DbRow) => {
    const v = readCol(r, col);
    if (v == null) return false;
    const a = v instanceof Date ? v.getTime() : (v as number);
    const b = val instanceof Date ? val.getTime() : val;
    return a <= b;
  },
  gt: (col: any, val: any) => (r: DbRow) => {
    const v = readCol(r, col);
    if (v == null) return false;
    const a = v instanceof Date ? v.getTime() : (v as number);
    const b = val instanceof Date ? val.getTime() : val;
    return a > b;
  },
  isNull: (col: any) => (r: DbRow) => readCol(r, col) == null,
  desc: (c: any) => c,
  asc: (c: any) => c,
  sql: () => ({ count: true }),
}));
// Schema mock — drizzle's pgTable name is read via column.name lookups.
// Columns store BOTH a fully-qualified key (`${table}.${col}`) and a
// short name. The eq/lte/isNull predicates resolve a column ref to
// its qualified key first and fall back to the short name, so that
// joined queries (which produce flat rows with qualified keys) and
// single-table queries (which use raw row objects with short keys)
// both work without ambiguity.
vi.mock("@shared/schema", () => {
  const make = (name: string, columns: string[]) => {
    const tbl: any = { _: { name }, toString: () => name };
    columns.forEach(
      (c) =>
        (tbl[c] = {
          name: `${name}.${c}`,
          _: { name: `${name}.${c}` },
          _table: name,
          _column: c,
        }),
    );
    return tbl;
  };
  return {
    lienWaivers: make("lien_waivers", [
      "id",
      "tenantId",
      "projectId",
      "vendorId",
      "subcontractId",
      "payAppId",
      "waiverNumber",
      "waiverType",
      "status",
      "throughDate",
      "paymentAmount",
      "exceptionsJson",
      "signerName",
      "signerTitle",
      "signerEmail",
      "sentAt",
      "signedAt",
      "receivedAt",
      "voidedAt",
      "expiresAt",
      "documentId",
      "notesText",
      "createdByUserId",
      "createdAt",
      "updatedAt",
      // Extended columns (additive) for templates / e-sign / autofill.
      "state",
      "paymentDate",
      "vendorName",
      "vendorEmail",
      "vendorAddress",
      "claimantName",
      "claimantAddress",
      "ownerName",
      "projectDescription",
      "propertyDescription",
      "filledBody",
      "signToken",
      "signTokenExpiresAt",
      "signatureDataUrl",
      "signedIpAddress",
    ]),
    lienWaiverEvents: make("lien_waiver_events", [
      "id",
      "tenantId",
      "waiverId",
      "eventType",
      "actorUserId",
      "actorName",
      "payloadJson",
      "createdAt",
    ]),
    vendors: make("vendors", ["id", "companyName", "contactName"]),
    projects: make("projects", ["id", "name", "projectNumber"]),
    lienWaiverTemplates: make("lien_waiver_templates", [
      "id",
      "state",
      "waiverType",
      "templateBody",
      "statutory",
      "createdAt",
      "updatedAt",
    ]),
    lienWaiverReminders: make("lien_waiver_reminders", [
      "id",
      "tenantId",
      "lienWaiverId",
      "reminderNumber",
      "scheduledFor",
      "sentAt",
      "channel",
      "createdAt",
    ]),
  };
});

// Mock the templates seed module so autofill tests don't need real DB
// templates — we hand-place rows in the in-memory store and also stub
// findTemplate to read from there.
vi.mock("../lien-waiver-templates.seed", () => ({
  ALL_STATES: ["CA", "TX"],
  WAIVER_TYPE_KEYS: [
    "conditional_progress",
    "unconditional_progress",
    "conditional_final",
    "unconditional_final",
  ],
  fillTemplate: (body: string, vars: Record<string, string>) =>
    body.replace(/\{\{(\w+)\}\}/g, (_m: string, k: string) => vars[k] ?? `{{${k}}}`),
  findTemplate: async (state: string, type: string) => {
    return (
      store.lien_waiver_templates.find(
        (t) => t.state === state && t.waiverType === type,
      ) ?? null
    );
  },
  seedLienWaiverTemplates: async () => ({ inserted: 0, total: store.lien_waiver_templates.length }),
}));

const TENANT = "test-tenant";

beforeEach(() => {
  store.lien_waivers.length = 0;
  store.lien_waiver_events.length = 0;
  store.lien_waiver_templates.length = 0;
  store.lien_waiver_reminders.length = 0;
  store.vendors.length = 0;
  store.projects.length = 0;
  store.vendors.push({ id: "v1", companyName: "Acme Plumbing", contactName: "Joe" });
  store.projects.push({ id: "p1", name: "Maple Build", projectNumber: "MAP-1" });
});

const baseInput = () => ({
  tenantId: TENANT,
  projectId: "p1",
  vendorId: "v1",
  waiverType: "conditional_partial" as const,
  throughDate: new Date("2026-04-01"),
  paymentAmount: 12500,
});

describe("lien-waiver.service", () => {
  it("creates a draft with auto waiver number and logs an event", async () => {
    const svc = await import("../lien-waiver.service");
    const w = await svc.createWaiver(baseInput());
    expect(w.status).toBe("draft");
    expect(w.waiverNumber).toMatch(/^LW-\d{4}-0001$/);
    expect(store.lien_waiver_events.length).toBe(1);
    expect(store.lien_waiver_events[0].eventType).toBe("created");
  });

  it("auto-numbers sequentially per tenant", async () => {
    const svc = await import("../lien-waiver.service");
    const a = await svc.createWaiver(baseInput());
    const b = await svc.createWaiver(baseInput());
    expect(a.waiverNumber.endsWith("0001")).toBe(true);
    expect(b.waiverNumber.endsWith("0002")).toBe(true);
  });

  it("walks the happy-path lifecycle draft → sent → signed → received", async () => {
    const svc = await import("../lien-waiver.service");
    const w = await svc.createWaiver(baseInput());
    const sent = await svc.sendWaiver(TENANT, w.id);
    expect(sent.status).toBe("sent");
    expect(sent.sentAt).toBeTruthy();
    const signed = await svc.signWaiver(TENANT, w.id);
    expect(signed.status).toBe("signed");
    expect(signed.signedAt).toBeTruthy();
    const recv = await svc.receiveWaiver(TENANT, w.id);
    expect(recv.status).toBe("received");
    expect(recv.receivedAt).toBeTruthy();
    const events = store.lien_waiver_events.map((e) => e.eventType);
    expect(events).toEqual(["created", "sent", "signed", "received"]);
  });

  it("rejects invalid transitions with a 409-style error", async () => {
    const svc = await import("../lien-waiver.service");
    const w = await svc.createWaiver(baseInput());
    // can't receive a draft
    await expect(svc.receiveWaiver(TENANT, w.id)).rejects.toMatchObject({
      message: expect.stringContaining("cannot transition"),
      statusCode: 409,
    });
  });

  it("strictly enforces draft → sent → signed (no skipping sent)", async () => {
    const svc = await import("../lien-waiver.service");
    const w = await svc.createWaiver(baseInput());
    // Cannot sign a draft directly — must go through sent first.
    await expect(svc.signWaiver(TENANT, w.id)).rejects.toMatchObject({
      message: expect.stringContaining("cannot transition"),
      statusCode: 409,
    });
  });

  it("does not allow voiding a received (terminal) waiver", async () => {
    const svc = await import("../lien-waiver.service");
    const w = await svc.createWaiver(baseInput());
    await svc.sendWaiver(TENANT, w.id);
    await svc.signWaiver(TENANT, w.id);
    await svc.receiveWaiver(TENANT, w.id);
    await expect(svc.voidWaiver(TENANT, w.id, "oops")).rejects.toMatchObject({
      message: expect.stringContaining("cannot transition"),
      statusCode: 409,
    });
  });

  it("send is idempotent — re-sending a sent waiver returns the row unchanged", async () => {
    const svc = await import("../lien-waiver.service");
    const w = await svc.createWaiver(baseInput());
    await svc.sendWaiver(TENANT, w.id);
    const beforeEvents = store.lien_waiver_events.length;
    const again = await svc.sendWaiver(TENANT, w.id);
    expect(again.status).toBe("sent");
    expect(store.lien_waiver_events.length).toBe(beforeEvents);
  });

  it("voids from any non-final state and records the reason", async () => {
    const svc = await import("../lien-waiver.service");
    const w = await svc.createWaiver(baseInput());
    await svc.sendWaiver(TENANT, w.id);
    const voided = await svc.voidWaiver(TENANT, w.id, "duplicate of LW-2026-0007");
    expect(voided.status).toBe("voided");
    expect(voided.voidedAt).toBeTruthy();
    const voidEvent = store.lien_waiver_events.find((e) => e.eventType === "voided");
    expect(voidEvent?.payloadJson).toMatchObject({ reason: expect.stringContaining("duplicate") });
  });

  it("blocks edits on non-draft waivers", async () => {
    const svc = await import("../lien-waiver.service");
    const w = await svc.createWaiver(baseInput());
    await svc.sendWaiver(TENANT, w.id);
    await expect(
      svc.updateWaiver(TENANT, w.id, { paymentAmount: 999 }),
    ).rejects.toMatchObject({ message: expect.stringContaining("draft"), statusCode: 409 });
  });

  it("computes stats with outstanding amount over draft+sent", async () => {
    const svc = await import("../lien-waiver.service");
    const a = await svc.createWaiver({ ...baseInput(), paymentAmount: 100 });
    const b = await svc.createWaiver({ ...baseInput(), paymentAmount: 250 });
    await svc.sendWaiver(TENANT, a.id);
    const stats = await svc.getStats(TENANT);
    expect(stats.total).toBe(2);
    expect(stats.draft).toBe(1);
    expect(stats.sent).toBe(1);
    expect(stats.outstandingAmount).toBe(350);
  });

  it("generates document text for all four waiver types", async () => {
    const svc = await import("../lien-waiver.service");
    for (const t of svc.WAIVER_TYPES) {
      const w = await svc.createWaiver({ ...baseInput(), waiverType: t });
      const text = await svc.generateDocumentText(TENANT, w.id);
      expect(text).toContain("WAIVER");
      expect(text).toContain(w.waiverNumber);
      if (t.startsWith("conditional")) {
        expect(text).toContain("does not become effective");
      } else {
        expect(text).toContain("paid in full");
      }
      if (t.endsWith("final")) {
        expect(text).toContain("FINAL waiver");
      } else {
        expect(text).toContain("PARTIAL");
      }
    }
  });

  it("rejects invalid waiver types", async () => {
    const svc = await import("../lien-waiver.service");
    await expect(
      svc.createWaiver({ ...baseInput(), waiverType: "invalid" as any }),
    ).rejects.toThrow(/invalid waiver_type/);
  });

  // ── E-sign token flow ─────────────────────────────────────────
  it("issues a sign token, allows public sign-by-token, then burns the token", async () => {
    const svc = await import("../lien-waiver.service");
    const w = await svc.createWaiver(baseInput());
    await svc.sendWaiver(TENANT, w.id);

    const { token, expiresAt } = await svc.generateSignToken(TENANT, w.id);
    expect(token).toBeTruthy();
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());

    const lookup = await svc.findWaiverBySignToken(token);
    expect(lookup?.id).toBe(w.id);

    const signed = await svc.signByToken(
      token,
      { name: "Joe Vendor", title: "Owner", email: "joe@acme.com" },
      "data:image/png;base64,AAAA",
      "127.0.0.1",
    );
    expect(signed.status).toBe("signed");
    expect(signed.signerName).toBe("Joe Vendor");
    expect(signed.signedIpAddress).toBe("127.0.0.1");

    // Token must be burned — looking it up again returns null.
    const after = await svc.findWaiverBySignToken(token);
    expect(after).toBeNull();
  });

  it("rejects sign-by-token when the waiver is not in 'sent' state", async () => {
    const svc = await import("../lien-waiver.service");
    const w = await svc.createWaiver(baseInput());
    // Generate a token while still draft is blocked; first send.
    await svc.sendWaiver(TENANT, w.id);
    const { token } = await svc.generateSignToken(TENANT, w.id);
    // Manually flip the waiver back to draft to simulate a stale token race
    store.lien_waivers[0].status = "draft";
    await expect(
      svc.signByToken(
        token,
        { name: "X" },
        "data:image/png;base64,AAAA",
        null,
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("rejects expired sign tokens", async () => {
    const svc = await import("../lien-waiver.service");
    const w = await svc.createWaiver(baseInput());
    await svc.sendWaiver(TENANT, w.id);
    const { token } = await svc.generateSignToken(TENANT, w.id);
    // Fast-forward expiry by mutating the row.
    store.lien_waivers[0].signTokenExpiresAt = new Date(Date.now() - 1000);
    await expect(
      svc.signByToken(token, { name: "X" }, "data:image/png;base64,AAAA", null),
    ).rejects.toMatchObject({ statusCode: 410 });
  });

  it("refuses sign tokens for voided or received waivers", async () => {
    const svc = await import("../lien-waiver.service");
    const w = await svc.createWaiver(baseInput());
    await svc.sendWaiver(TENANT, w.id);
    await svc.voidWaiver(TENANT, w.id, "test");
    await expect(svc.generateSignToken(TENANT, w.id)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("signByToken cannot reuse a token after the first successful sign (race-safe burn)", async () => {
    // Defense-in-depth check for the atomic single-use burn. The token
    // is cleared inside the same UPDATE that flips status → 'signed', so
    // a second concurrent attempt with the same token must fail with
    // 404 (token no longer exists). We can't simulate true concurrency
    // here, but we can simulate the win/lose ordering: first call wins
    // and burns; second call sees no row and 404s.
    const svc = await import("../lien-waiver.service");
    const w = await svc.createWaiver(baseInput());
    await svc.sendWaiver(TENANT, w.id);
    const { token } = await svc.generateSignToken(TENANT, w.id);
    const sig = "data:image/png;base64,AAAA";
    const firstWin = await svc.signByToken(token, { name: "Joe" }, sig, "1.1.1.1");
    expect(firstWin.status).toBe("signed");
    expect(store.lien_waivers[0].signToken).toBeNull();
    await expect(
      svc.signByToken(token, { name: "Mallory" }, sig, "9.9.9.9"),
    ).rejects.toMatchObject({ statusCode: 404 });
    // Only one 'signed' event is recorded — the second attempt did NOT
    // emit a duplicate audit row.
    const signedEvents = store.lien_waiver_events.filter(
      (e) => e.eventType === "signed",
    );
    expect(signedEvents).toHaveLength(1);
  });

  it("schema enforces partial unique index on sign_token (cross-tenant safety)", async () => {
    // Cross-tenant safety relies on the DB-level partial unique index
    // `lw_sign_token_uniq` (sign_token WHERE sign_token IS NOT NULL).
    // Drizzle's index builder internals are version-fragile, so we
    // pin this guarantee with a source-level check on the schema
    // definition. Any refactor that drops `uniqueIndex(...)` or the
    // partial `WHERE sign_token IS NOT NULL` predicate will break
    // this test BEFORE it ships.
    const fs = await import("fs/promises");
    const path = await import("path");
    const src = await fs.readFile(
      path.resolve(__dirname, "../../../shared/schema.ts"),
      "utf-8",
    );
    expect(src).toMatch(
      /uniqueIndex\("lw_sign_token_uniq"\)\s*\.on\(table\.signToken\)\s*\.where\(sql`sign_token IS NOT NULL`\)/,
    );
  });

  // ── Reminders ─────────────────────────────────────────────────
  it("schedules three default reminders at 3/7/14 day offsets", async () => {
    const svc = await import("../lien-waiver.service");
    const w = await svc.createWaiver(baseInput());
    await svc.sendWaiver(TENANT, w.id);
    const base = new Date("2026-04-01T00:00:00Z");
    const reminders = await svc.scheduleDefaultReminders(TENANT, w.id, base);
    expect(reminders).toHaveLength(3);
    expect(reminders.map((r) => r.reminderNumber)).toEqual([1, 2, 3]);
    const offsets = reminders.map(
      (r) => Math.round((r.scheduledFor.getTime() - base.getTime()) / 86_400_000),
    );
    expect(offsets).toEqual([3, 7, 14]);
  });

  it("processes only due reminders for waivers still in 'sent' state", async () => {
    const svc = await import("../lien-waiver.service");
    const w = await svc.createWaiver(baseInput());
    await svc.sendWaiver(TENANT, w.id);
    // Schedule reminders in the past so they are due.
    await svc.scheduleDefaultReminders(
      TENANT,
      w.id,
      new Date(Date.now() - 30 * 86_400_000),
    );
    const result = await svc.processDueReminders(new Date());
    expect(result.processed).toBe(3);
    expect(result.skipped).toBe(0);
    // All marked sent.
    expect(store.lien_waiver_reminders.every((r) => r.sentAt != null)).toBe(true);
    // Each fire emitted a reminder_sent audit event.
    const sentEvents = store.lien_waiver_events.filter(
      (e) => e.eventType === "reminder_sent",
    );
    expect(sentEvents).toHaveLength(3);
  });

  it("skips (and burns) reminders when the waiver has progressed past 'sent'", async () => {
    const svc = await import("../lien-waiver.service");
    const w = await svc.createWaiver(baseInput());
    await svc.sendWaiver(TENANT, w.id);
    await svc.scheduleDefaultReminders(
      TENANT,
      w.id,
      new Date(Date.now() - 30 * 86_400_000),
    );
    // Move waiver to signed — reminders should not fire.
    await svc.signWaiver(TENANT, w.id);
    const result = await svc.processDueReminders(new Date());
    expect(result.processed).toBe(0);
    expect(result.skipped).toBe(3);
    // No reminder_sent events emitted.
    expect(
      store.lien_waiver_events.filter((e) => e.eventType === "reminder_sent"),
    ).toHaveLength(0);
  });

  it("cancelPendingReminders deletes only un-sent reminders", async () => {
    const svc = await import("../lien-waiver.service");
    const w = await svc.createWaiver(baseInput());
    await svc.sendWaiver(TENANT, w.id);
    await svc.scheduleDefaultReminders(TENANT, w.id);
    // Mark the first one sent so it should NOT be cancelled.
    store.lien_waiver_reminders[0].sentAt = new Date();
    const cancelled = await svc.cancelPendingReminders(TENANT, w.id);
    expect(cancelled).toBe(2);
    expect(store.lien_waiver_reminders).toHaveLength(1);
    expect(store.lien_waiver_reminders[0].sentAt).toBeTruthy();
  });

  // ── Autofill ──────────────────────────────────────────────────
  it("autofillWaiver renders the seeded template into filledBody and audits", async () => {
    const svc = await import("../lien-waiver.service");
    // Seed a fake CA template covering this waiver type.
    store.lien_waiver_templates.push({
      id: "tpl-ca-cp",
      state: "CA",
      waiverType: "conditional_progress",
      templateBody:
        "STATE={{claimantName}} VENDOR={{vendorName}} AMT=${{amount}} PROJ={{projectDescription}}",
      statutory: true,
    });
    const w = await svc.createWaiver({
      ...baseInput(),
      waiverType: "conditional_partial",
    });
    // Patch onto the row the new fields the service consults.
    store.lien_waivers[0].state = "CA";
    store.lien_waivers[0].claimantName = "Acme Plumbing";
    store.lien_waivers[0].vendorName = "Acme Plumbing";
    store.lien_waivers[0].projectDescription = "Maple Build";

    const result = await svc.autofillWaiver(TENANT, w.id);
    expect(result.statutory).toBe(true);
    expect(result.templateId).toBe("tpl-ca-cp");
    expect(result.filledBody).toContain("STATE=Acme Plumbing");
    expect(result.filledBody).toContain("VENDOR=Acme Plumbing");
    expect(result.filledBody).toContain("AMT=$12500.00");
    expect(result.filledBody).toContain("PROJ=Maple Build");
    // filledBody persisted on the row.
    expect(store.lien_waivers[0].filledBody).toBe(result.filledBody);
    // Event audited.
    expect(
      store.lien_waiver_events.find((e) => e.eventType === "autofilled"),
    ).toBeTruthy();
  });

  it("autofillWaiver throws 404 when no template is seeded for state+type", async () => {
    const svc = await import("../lien-waiver.service");
    const w = await svc.createWaiver(baseInput());
    store.lien_waivers[0].state = "ZZ";
    await expect(svc.autofillWaiver(TENANT, w.id)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
