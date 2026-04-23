import { describe, it, expect, vi, beforeEach } from "vitest";

interface DbRow {
  id: string;
  [k: string]: any;
}
const store: Record<string, DbRow[]> = { daily_logs: [] };

function tableKey(arg: any): string {
  const name =
    arg?._?.name ||
    arg?.[Symbol.for("drizzle:Name")] ||
    (typeof arg?.toString === "function" ? arg.toString() : "");
  if (String(name).includes("daily_logs")) return "daily_logs";
  throw new Error(`Unexpected table: ${String(name)}`);
}

let currentTable: string | null = null;

function makeDbMock() {
  return {
    insert: (tbl: any) => {
      currentTable = tableKey(tbl);
      return {
        values: (vals: any) => {
          const row: DbRow = {
            id: `dl-${store[currentTable!].length + 1}`,
            ...vals,
          };
          store[currentTable!].push(row);
          return {
            returning: async (cols?: any) =>
              cols && cols.id ? [{ id: row.id }] : [row],
          };
        },
      };
    },
    select: (_cols?: any) => ({
      from: (tbl: any) => {
        currentTable = tableKey(tbl);
        let filter: ((r: DbRow) => boolean) | null = null;
        return {
          where: (pred: any) => {
            filter = pred;
            return {
              limit: async (n: number) => {
                const rows = store[currentTable!].filter(
                  (r) => !filter || filter(r),
                );
                return rows.slice(0, n);
              },
            };
          },
        };
      },
    }),
    update: (tbl: any) => {
      currentTable = tableKey(tbl);
      return {
        set: (patch: any) => ({
          where: async (pred: any) => {
            const target = store[currentTable!].find((r) => pred(r));
            if (target) Object.assign(target, patch);
            return { rowCount: target ? 1 : 0 };
          },
        }),
      };
    },
  };
}

function buildPredicates() {
  return {
    and: (...preds: Array<(r: DbRow) => boolean>) => (r: DbRow) =>
      preds.every((p) => p(r)),
    eq: (col: any, val: any) => {
      const name = colName(col);
      return (r: DbRow) => {
        const a = r[name];
        const b = val;
        if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
        return a === b;
      };
    },
    isNull: (col: any) => {
      const name = colName(col);
      return (r: DbRow) => r[name] == null;
    },
    desc: (c: any) => c,
    asc: (c: any) => c,
    or: () => () => true,
    sql: () => ({}),
  };
}

function colName(col: any): string {
  const raw =
    (col && typeof col === "object" && "name" in col && col.name) ||
    (col && col._ && col._.name) ||
    String(col);
  return snakeToCamel(String(raw));
}
function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_m, c) => c.toUpperCase());
}

vi.mock("../../db", () => ({ pool: {}, db: makeDbMock() }));
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return { ...actual, ...buildPredicates() };
});

import {
  upsertVoiceDailyLog,
  type Transcriber,
  type Extractor,
  type DailyLogDraft,
} from "../voice-daily-log.service";

function fakeTranscriber(text: string): Transcriber {
  return { transcribe: async () => ({ text, stub: false }) };
}
function fakeExtractor(draft: DailyLogDraft): Extractor {
  return { extract: async () => ({ draft, stub: false }) };
}

function reset() {
  store.daily_logs.length = 0;
}

describe("voice-daily-log.service — upsertVoiceDailyLog", () => {
  beforeEach(reset);

  it("creates a daily_log with transcript + structured fields on first upload", async () => {
    const logDate = new Date("2026-05-15T00:00:00Z");
    const result = await upsertVoiceDailyLog({
      tenantId: "t1",
      projectId: "p1",
      logDate,
      audio: Buffer.from("fake audio"),
      transcriber: fakeTranscriber(
        "Clear day. Crew of 6 framers did exterior walls. No issues.",
      ),
      extractor: fakeExtractor({
        weather: "Clear day",
        workPerformed: ["Exterior walls"],
        labor: [{ trade: "framers", count: 6, hours: 8 }],
        issues: [],
        equipment: [],
        materials: [],
        safetyNotes: [],
        visitors: [],
        notes: null,
      }),
    });
    expect(result.dailyLogId).toBeDefined();
    expect(store.daily_logs).toHaveLength(1);
    const row = store.daily_logs[0];
    expect(row.source).toBe("voice");
    expect(row.transcript).toContain("Clear day");
    expect(row.weatherJson).toEqual({ description: "Clear day" });
    expect(row.workPerformedJson).toEqual(["Exterior walls"]);
  });

  it("updates the existing log for the same (project, date) rather than duplicating", async () => {
    const logDate = new Date("2026-05-15T00:00:00Z");
    await upsertVoiceDailyLog({
      tenantId: "t1",
      projectId: "p1",
      logDate,
      audio: Buffer.from("a"),
      transcriber: fakeTranscriber("first pass"),
      extractor: fakeExtractor({ notes: "first pass" }),
    });
    const second = await upsertVoiceDailyLog({
      tenantId: "t1",
      projectId: "p1",
      logDate,
      audio: Buffer.from("b"),
      transcriber: fakeTranscriber("corrected version"),
      extractor: fakeExtractor({ notes: "corrected version" }),
    });
    expect(store.daily_logs).toHaveLength(1);
    expect(store.daily_logs[0].transcript).toBe("corrected version");
    expect(second.dailyLogId).toBe(store.daily_logs[0].id);
  });

  it("reports stubbed=true when the transcriber/extractor ran in fallback mode", async () => {
    const result = await upsertVoiceDailyLog({
      tenantId: "t1",
      projectId: "p1",
      logDate: new Date("2026-05-16T00:00:00Z"),
      audio: Buffer.from("x"),
      transcriber: {
        transcribe: async () => ({ text: "stub text", stub: true }),
      },
      extractor: { extract: async () => ({ draft: { notes: "stub text" }, stub: true }) },
    });
    expect(result.stubbed).toEqual({ transcribe: true, extract: true });
  });

  it("accepts a remote audio URL via the transcriber abstraction", async () => {
    // The service passes audio through to the transcriber verbatim —
    // url-delivery support is the transcriber's concern, and we don't
    // re-validate here. This test just confirms the call shape is
    // preserved.
    const seen: any[] = [];
    const transcriber: Transcriber = {
      transcribe: async (audio) => {
        seen.push(audio);
        return { text: "remote transcript", stub: false };
      },
    };
    await upsertVoiceDailyLog({
      tenantId: "t1",
      projectId: "p1",
      logDate: new Date("2026-05-17T00:00:00Z"),
      audio: { url: "https://example.test/audio.webm" },
      transcriber,
      extractor: fakeExtractor({ notes: "remote transcript" }),
    });
    expect(seen[0]).toEqual({ url: "https://example.test/audio.webm" });
  });

  it("normalizes omitted draft fields to empty arrays in the stored row", async () => {
    await upsertVoiceDailyLog({
      tenantId: "t1",
      projectId: "p1",
      logDate: new Date("2026-05-18T00:00:00Z"),
      audio: Buffer.from("a"),
      transcriber: fakeTranscriber("notes only"),
      extractor: fakeExtractor({ notes: "notes only" }),
    });
    const row = store.daily_logs[0];
    expect(row.workPerformedJson).toEqual([]);
    expect(row.laborJson).toEqual([]);
    expect(row.equipmentJson).toEqual([]);
  });
});
