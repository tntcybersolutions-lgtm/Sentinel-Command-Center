// Roadmap Feature 4 — Voice Daily Log capture.
//
// Flow:
//   1. Foreman records a 30–90s memo on their phone (handled at the
//      upload layer; this service takes audio bytes or an audio URL).
//   2. transcribeAudio() → OpenAI Whisper. Returns plain text.
//   3. extractStructured() → OpenAI chat completion with a
//      schema-locked prompt. Returns a typed DailyLogDraft.
//   4. upsertVoiceDailyLog() → writes/updates the daily_logs row
//      keyed by (project_id, log_date). Keeps the raw transcript on
//      the row so the UI can surface "view transcript" alongside the
//      parsed fields.
//
// Both LLM calls are indirected through pluggable providers so tests
// can mock cleanly and a dev environment without OpenAI keys can fall
// back to a deterministic stub.

import { db } from "../db";
import { dailyLogs } from "@shared/schema";
import { and, eq } from "drizzle-orm";

export interface DailyLogDraft {
  weather?: string | null;
  workPerformed?: string[];
  labor?: Array<{ trade?: string; count?: number; hours?: number }>;
  equipment?: string[];
  materials?: Array<{ item?: string; qty?: string }>;
  issues?: string[];
  safetyNotes?: string[];
  visitors?: string[];
  notes?: string | null;
}

export interface TranscribeResult {
  text: string;
  /** True if we fell back to a stub rather than calling a real model. */
  stub: boolean;
}

export interface Transcriber {
  transcribe(audio: Buffer | { url: string }): Promise<TranscribeResult>;
}

export interface Extractor {
  extract(transcript: string): Promise<{ draft: DailyLogDraft; stub: boolean }>;
}

// Default transcriber: lazy-load OpenAI, fall back to stub if no key.
export function createOpenAITranscriber(): Transcriber {
  return {
    async transcribe(audio) {
      const apiKey =
        process.env.AI_INTEGRATIONS_OPENAI_API_KEY ||
        process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return {
          text:
            "[stub transcript — no OPENAI_API_KEY configured. Wire one to enable Whisper.]",
          stub: true,
        };
      }
      const OpenAI = (await import("openai")).default;
      const client = new OpenAI({
        apiKey,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });
      // OpenAI's current SDK expects a File-like object for
      // transcriptions.create. For Phase 1 we accept either a Buffer
      // (uploaded multipart) or a URL the server can fetch.
      let file: any;
      if (Buffer.isBuffer(audio)) {
        file = new File([audio], "memo.webm", { type: "audio/webm" });
      } else {
        const res = await fetch(audio.url);
        if (!res.ok) throw new Error(`audio fetch failed: ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        file = new File([buf], "memo.webm", { type: "audio/webm" });
      }
      const result: any = await client.audio.transcriptions.create({
        file,
        model: "whisper-1",
      });
      return { text: String(result?.text ?? ""), stub: false };
    },
  };
}

const EXTRACTION_SYSTEM_PROMPT = `You parse a foreman's end-of-day voice memo into a structured JSON daily log. Output ONLY valid JSON matching this schema:

{
  "weather": "string or null",
  "workPerformed": ["string"],
  "labor": [{ "trade": "string", "count": number, "hours": number }],
  "equipment": ["string"],
  "materials": [{ "item": "string", "qty": "string" }],
  "issues": ["string"],
  "safetyNotes": ["string"],
  "visitors": ["string"],
  "notes": "string or null"
}

Rules:
- Be concise. Preserve the foreman's wording where possible.
- If a section wasn't mentioned, omit it or use [] / null.
- Do not fabricate. Do not output any prose outside the JSON.`;

// Kept for backwards compatibility with any caller still asking for
// the OpenAI extractor by name. New callers should use
// createClaudeExtractor() (or the default, which resolves to Claude).
export function createOpenAIExtractor(): Extractor {
  return createClaudeExtractor();
}

// Default structured-extraction backend: Claude Haiku 4.5. Haiku is
// the right tier here — the task is deterministic transcript parsing,
// not reasoning, and Haiku is cheap + fast. If ANTHROPIC_API_KEY is
// absent, the provider's stub mode returns a deterministic fallback
// so dev without keys still produces a usable daily log.
export function createClaudeExtractor(): Extractor {
  return {
    async extract(transcript) {
      const { getLLMProvider } = await import("./llm");
      const provider = getLLMProvider();
      if (provider.stub) {
        return { draft: stubExtraction(transcript), stub: true };
      }
      const { data, raw } = await provider.extractJson<unknown>({
        system: EXTRACTION_SYSTEM_PROMPT,
        userPrompt: transcript,
        tier: "extraction",
        maxTokens: 2_048,
      });
      if (data === undefined) {
        console.warn(
          "[voice-daily-log] Claude returned non-JSON, falling back to stub. raw=",
          raw.slice(0, 200),
        );
        return { draft: stubExtraction(transcript), stub: true };
      }
      return { draft: normalizeDraft(data), stub: false };
    },
  };
}

function stubExtraction(transcript: string): DailyLogDraft {
  // Deterministic fallback so the endpoint is still usable without
  // OpenAI configured — the foreman sees the transcript in `notes`
  // and can fill in the structured fields manually.
  return {
    notes: transcript.trim() || null,
    workPerformed: [],
    labor: [],
    equipment: [],
    materials: [],
    issues: [],
    safetyNotes: [],
    visitors: [],
  };
}

function normalizeDraft(raw: any): DailyLogDraft {
  return {
    weather: typeof raw?.weather === "string" ? raw.weather : null,
    workPerformed: Array.isArray(raw?.workPerformed)
      ? raw.workPerformed.filter((x: any) => typeof x === "string")
      : [],
    labor: Array.isArray(raw?.labor) ? raw.labor : [],
    equipment: Array.isArray(raw?.equipment)
      ? raw.equipment.filter((x: any) => typeof x === "string")
      : [],
    materials: Array.isArray(raw?.materials) ? raw.materials : [],
    issues: Array.isArray(raw?.issues)
      ? raw.issues.filter((x: any) => typeof x === "string")
      : [],
    safetyNotes: Array.isArray(raw?.safetyNotes)
      ? raw.safetyNotes.filter((x: any) => typeof x === "string")
      : [],
    visitors: Array.isArray(raw?.visitors)
      ? raw.visitors.filter((x: any) => typeof x === "string")
      : [],
    notes: typeof raw?.notes === "string" ? raw.notes : null,
  };
}

export interface VoiceDailyLogInput {
  tenantId: string;
  projectId: string;
  logDate: Date;
  audio: Buffer | { url: string };
  audioDocumentId?: string;
  authorUserId?: string;
  transcriber?: Transcriber;
  extractor?: Extractor;
}

export interface VoiceDailyLogResult {
  dailyLogId: string;
  transcript: string;
  draft: DailyLogDraft;
  stubbed: { transcribe: boolean; extract: boolean };
}

export async function upsertVoiceDailyLog(
  input: VoiceDailyLogInput,
): Promise<VoiceDailyLogResult> {
  // Whisper stays on OpenAI (Claude doesn't do audio transcription).
  // Structured extraction defaults to Claude Haiku via the LLM
  // abstraction — cheap, fast, tier-appropriate.
  const transcriber = input.transcriber ?? createOpenAITranscriber();
  const extractor = input.extractor ?? createClaudeExtractor();

  const { text: transcript, stub: stubT } = await transcriber.transcribe(input.audio);
  const { draft, stub: stubE } = await extractor.extract(transcript);

  // Upsert by (tenant, project, date). daily_logs has a unique index
  // on (project_id, log_date) — we look up first and either insert
  // or update, honoring the schema-level guard without relying on
  // onConflict semantics (keeps the code portable if the index
  // changes).
  const existing = await db
    .select({ id: dailyLogs.id })
    .from(dailyLogs)
    .where(
      and(
        eq(dailyLogs.tenantId, input.tenantId),
        eq(dailyLogs.projectId, input.projectId),
        eq(dailyLogs.logDate, input.logDate),
      ),
    )
    .limit(1);

  const row = {
    weatherJson: draft.weather ? { description: draft.weather } : null,
    workPerformedJson: draft.workPerformed ?? [],
    laborJson: draft.labor ?? [],
    equipmentJson: draft.equipment ?? [],
    materialsJson: draft.materials ?? [],
    visitorsJson: draft.visitors ?? [],
    issuesJson: draft.issues ?? [],
    safetyNotesJson: draft.safetyNotes ?? [],
    notes: draft.notes ?? null,
    transcript,
    source: "voice" as const,
    audioDocumentId: input.audioDocumentId ?? null,
    authorUserId: input.authorUserId ?? null,
    updatedAt: new Date(),
  };

  if (existing[0]) {
    await db
      .update(dailyLogs)
      .set(row)
      .where(eq(dailyLogs.id, existing[0].id));
    return {
      dailyLogId: existing[0].id,
      transcript,
      draft,
      stubbed: { transcribe: stubT, extract: stubE },
    };
  }

  const [inserted] = await db
    .insert(dailyLogs)
    .values({
      tenantId: input.tenantId,
      projectId: input.projectId,
      logDate: input.logDate,
      status: "draft",
      ...row,
    })
    .returning({ id: dailyLogs.id });

  return {
    dailyLogId: inserted.id,
    transcript,
    draft,
    stubbed: { transcribe: stubT, extract: stubE },
  };
}
