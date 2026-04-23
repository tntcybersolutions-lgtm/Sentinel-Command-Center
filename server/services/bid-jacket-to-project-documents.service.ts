import { db } from "../db";
import { and, eq, or, sql } from "drizzle-orm";
import {
  projectDocuments,
  artifactTemplates,
  bidJacketArtifacts,
} from "../../shared/schema";
import { ensureDefaultProjectFolders, getProjectFolderMap } from "./project-documents.seed";
import OpenAI from "openai";

export type ClassificationResult = {
  folder: string;
  method: "deterministic" | "rule_scored" | "ai" | "ai_low_confidence";
  confidence: number;
  reasoning: string;
  alternativeFolders: string[];
};

type ResolveParams = {
  templateCode?: string | null;
  category?: string | null;
  phase?: string | null;
  title: string;
  sourceType: string;
};

const CANON = {
  ADMIN: "01_Project Admin",
  CONTRACT: "02_Contract",
  SUBMITTALS: "03_Submittals",
  RFIS: "04_RFIs",
  DRAWINGS: "05_Drawings",
  SPECS: "06_Specifications",
  BID_FORMS: "07_Bid Forms",
  ADDENDA: "08_Addenda",
  PHOTOS: "09_Photos",
  CLOSEOUT: "10_Closeout",
} as const;

const CANON_TO_LEGACY: Record<string, string> = {
  [CANON.ADMIN]: "01_Admin",
  [CANON.CONTRACT]: "02_Contract",
  [CANON.SUBMITTALS]: "05_Submittals",
  [CANON.RFIS]: "04_RFIs",
  [CANON.DRAWINGS]: "03_Drawings_Specs",
  [CANON.SPECS]: "03_Drawings_Specs",
  [CANON.BID_FORMS]: "02_Contract",
  [CANON.ADDENDA]: "02_Contract",
  [CANON.PHOTOS]: "01_Admin",
  [CANON.CLOSEOUT]: "10_Closeout",
};

function norm(s?: string | null) {
  return (s ?? "").trim();
}

function lower(s?: string | null) {
  return norm(s).toLowerCase();
}

function hasAny(hay: string, needles: string[]) {
  return needles.some((n) => hay.includes(n));
}

function isPhotoLike(title: string) {
  const t = title.toLowerCase();
  return hasAny(t, [
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic",
    "photo", "site photo", "picture",
  ]);
}

function isAddendaLike(titleOrCode: string) {
  const s = titleOrCode.toLowerCase();
  return hasAny(s, [
    "addendum", "addenda", "amendment", "amended", "modification", "mod ",
    "solicitation amendment", "amend", "revision", "rev ",
    "qa", "q&a", "questions and answers", "questions & answers",
  ]);
}

function isBidFormsLike(titleOrCode: string) {
  const s = titleOrCode.toLowerCase();
  return hasAny(s, [
    "bid form", "proposal form", "pricing", "price schedule", "schedule of values",
    "sf1449", "sf33", "sf30", "sf26", "sf18",
    "representations", "certification", "certifications",
    "cover sheet", "executive summary",
    "forms", "template", "submission form",
  ]);
}

function isDrawingLike(titleOrCode: string) {
  const s = titleOrCode.toLowerCase();
  return hasAny(s, [
    "drawing", "drawings", "plan", "plans", "blueprint", "blueprints",
    "sheet", "sheets", "cad", "dwg", "dxf",
  ]);
}

function isSpecLike(titleOrCode: string) {
  const s = titleOrCode.toLowerCase();
  return hasAny(s, [
    "spec", "specs", "specification", "specifications",
    "sow", "pws", "statement of work", "scope of work",
    "requirements", "performance work statement",
    "technical requirements",
  ]);
}

function isRfiLike(titleOrCode: string) {
  const s = titleOrCode.toLowerCase();
  return hasAny(s, ["rfi", "request for information", "question", "clarification"]);
}

function isSubmittalLike(titleOrCode: string) {
  const s = titleOrCode.toLowerCase();
  return hasAny(s, ["submittal", "submission", "shop drawing", "product data"]);
}

function isCloseoutLike(titleOrCode: string) {
  const s = titleOrCode.toLowerCase();
  return hasAny(s, ["closeout", "warranty", "as-built", "as built", "o&m", "om manual", "turnover"]);
}

function isContractLike(titleOrCode: string) {
  const s = titleOrCode.toLowerCase();
  return hasAny(s, [
    "solicitation", "contract", "agreement",
    "wage determination", "wage", "dol", "department of labor",
    "clauses", "terms and conditions",
  ]);
}

export function resolveFolderNameForArtifact(params: ResolveParams) {
  const templateCode = norm(params.templateCode);
  const category = lower(params.category);
  const phase = lower(params.phase);
  const title = norm(params.title);
  const sourceType = lower(params.sourceType);

  if (templateCode) {
    const tc = templateCode.toLowerCase();

    if (isAddendaLike(tc)) return CANON.ADDENDA;
    if (isDrawingLike(tc)) return CANON.DRAWINGS;
    if (isSpecLike(tc)) return CANON.SPECS;
    if (tc.includes("solicitation") || isContractLike(tc)) return CANON.CONTRACT;
    if (isRfiLike(tc)) return CANON.RFIS;
    if (isSubmittalLike(tc)) return CANON.SUBMITTALS;
    if (isBidFormsLike(tc)) return CANON.BID_FORMS;
    if (isCloseoutLike(tc)) return CANON.CLOSEOUT;
    if (tc.includes("invoice") || tc.includes("bill")) return CANON.CONTRACT;
    if (tc.includes("po") || tc.includes("purchase")) return CANON.CONTRACT;
    if (tc.includes("daily")) return CANON.ADMIN;
  }

  if (category) {
    if (category.includes("closeout")) return CANON.CLOSEOUT;
    if (category.includes("rfi") || category.includes("q&a")) return CANON.RFIS;
    if (category.includes("submittal")) return CANON.SUBMITTALS;
    if (category.includes("drawing")) return CANON.DRAWINGS;
    if (category.includes("spec")) return CANON.SPECS;
    if (category.includes("proposal") || category.includes("compliance")) {
      if (isBidFormsLike(title)) return CANON.BID_FORMS;
      return CANON.CONTRACT;
    }
    if (category.includes("sam")) return CANON.CONTRACT;
    if (category.includes("estimating")) return CANON.ADMIN;
  }

  const t = title.toLowerCase();
  if (isPhotoLike(title)) return CANON.PHOTOS;
  if (isAddendaLike(t)) return CANON.ADDENDA;
  if (isBidFormsLike(t)) return CANON.BID_FORMS;
  if (isDrawingLike(t)) return CANON.DRAWINGS;
  if (isSpecLike(t)) return CANON.SPECS;
  if (isRfiLike(t)) return CANON.RFIS;
  if (isSubmittalLike(t)) return CANON.SUBMITTALS;
  if (isCloseoutLike(t)) return CANON.CLOSEOUT;
  if (isContractLike(t)) return CANON.CONTRACT;

  if (sourceType === "samgov" || sourceType === "sam" || sourceType === "highergov") return CANON.CONTRACT;

  return CANON.ADMIN;
}

const KEYWORD_WEIGHTS: Record<string, [string[], number][]> = {
  [CANON.ADDENDA]: [
    [["addendum", "addenda", "amendment", "modification", "amend", "mod "], 10],
    [["revision", "rev ", "change order"], 5],
    [["qa", "q&a", "questions and answers"], 8],
  ],
  [CANON.DRAWINGS]: [
    [["drawing", "drawings", "blueprint", "plan set", "sheet"], 10],
    [["cad", "dwg", "dxf", ".dwg"], 8],
    [["floor plan", "site plan", "elevation"], 6],
  ],
  [CANON.SPECS]: [
    [["specification", "specifications", "spec"], 10],
    [["sow", "pws", "statement of work", "scope of work", "performance work statement"], 10],
    [["technical requirements", "division"], 6],
  ],
  [CANON.CONTRACT]: [
    [["solicitation", "contract", "agreement"], 10],
    [["wage determination", "davis bacon", "dol", "clauses"], 8],
    [["terms and conditions", "sf1449", "sf33", "sf30"], 6],
  ],
  [CANON.BID_FORMS]: [
    [["bid form", "proposal form", "pricing", "price schedule"], 10],
    [["schedule of values", "representations", "certifications"], 8],
    [["cover sheet", "executive summary", "submission form"], 5],
  ],
  [CANON.RFIS]: [
    [["rfi", "request for information"], 10],
    [["clarification", "question"], 5],
  ],
  [CANON.SUBMITTALS]: [
    [["submittal", "submission", "shop drawing", "product data"], 10],
  ],
  [CANON.CLOSEOUT]: [
    [["closeout", "warranty", "as-built", "as built", "o&m", "turnover"], 10],
  ],
  [CANON.PHOTOS]: [
    [["photo", "picture", "site photo", ".jpg", ".jpeg", ".png"], 10],
  ],
  [CANON.ADMIN]: [
    [["admin", "meeting minutes", "daily log", "correspondence", "schedule"], 3],
  ],
};

function scoredClassify(text: string): { folder: string; confidence: number; scores: Record<string, number> } {
  const lower = text.toLowerCase();
  const scores: Record<string, number> = {};

  for (const [folder, weightGroups] of Object.entries(KEYWORD_WEIGHTS)) {
    let total = 0;
    for (const [keywords, weight] of weightGroups) {
      for (const kw of keywords) {
        if (lower.includes(kw)) {
          total += weight;
        }
      }
    }
    if (total > 0) scores[folder] = total;
  }

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) return { folder: CANON.ADMIN, confidence: 0, scores };

  const topScore = sorted[0]![1];
  const secondScore = sorted.length > 1 ? sorted[1]![1] : 0;

  const confidence = secondScore === 0
    ? (topScore >= 10 ? 0.95 : 0.7)
    : (topScore > secondScore * 2 ? 0.9 : topScore > secondScore ? 0.7 : 0.5);

  return { folder: sorted[0]![0], confidence, scores };
}

export function classifyArtifact(params: ResolveParams): ClassificationResult {
  const templateCode = (params.templateCode ?? "").trim();
  const title = params.title ?? "";
  const sourceType = (params.sourceType ?? "").toLowerCase();

  if (templateCode) {
    const tc = templateCode.toLowerCase();
    const deterministicMap: [string, (s: string) => boolean][] = [
      [CANON.ADDENDA, isAddendaLike],
      [CANON.DRAWINGS, isDrawingLike],
      [CANON.SPECS, isSpecLike],
      [CANON.CONTRACT, (s) => s.includes("solicitation") || isContractLike(s)],
      [CANON.RFIS, isRfiLike],
      [CANON.SUBMITTALS, isSubmittalLike],
      [CANON.BID_FORMS, isBidFormsLike],
      [CANON.CLOSEOUT, isCloseoutLike],
    ];

    for (const [folder, check] of deterministicMap) {
      if (check(tc)) {
        return {
          folder,
          method: "deterministic",
          confidence: 1.0,
          reasoning: `templateCode "${templateCode}" maps to ${folder}`,
          alternativeFolders: [],
        };
      }
    }
  }

  const combined = `${title} ${templateCode}`;
  const scored = scoredClassify(combined);

  if (scored.confidence >= 0.7) {
    const alts = Object.entries(scored.scores)
      .filter(([f]) => f !== scored.folder)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([f]) => f);

    return {
      folder: scored.folder,
      method: "rule_scored",
      confidence: scored.confidence,
      reasoning: `Keyword scoring: ${JSON.stringify(scored.scores)}`,
      alternativeFolders: alts,
    };
  }

  if (sourceType === "samgov" || sourceType === "highergov") {
    return {
      folder: CANON.CONTRACT,
      method: "rule_scored",
      confidence: 0.6,
      reasoning: `Unresolved by scoring, defaulting to ${CANON.CONTRACT} for ${sourceType} source`,
      alternativeFolders: scored.folder !== CANON.CONTRACT ? [scored.folder] : [],
    };
  }

  return {
    folder: CANON.ADMIN,
    method: "rule_scored",
    confidence: 0.4,
    reasoning: `Low confidence classification — filed to ${CANON.ADMIN} as default. Review recommended.`,
    alternativeFolders: scored.folder !== CANON.ADMIN ? [scored.folder] : [],
  };
}

async function aiClassifyFolder(params: {
  fileName: string | null;
  title: string;
  folders: string[];
}): Promise<{ folder: string; confidence: number; reasoning: string } | null> {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const openai = new OpenAI({
      apiKey,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined,
    });

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 200,
      messages: [
        {
          role: "system",
          content:
            "You are a document classifier for bid/construction docs. " +
            'Return ONLY strict JSON: {"folder":"...","confidence":0..1,"reasoning":"..."}. ' +
            "folder MUST be one of the provided folders.",
        },
        {
          role: "user",
          content: JSON.stringify({
            title: params.title,
            fileName: params.fileName,
            folders: params.folders,
          }),
        },
      ],
    });

    const text = response.choices?.[0]?.message?.content;
    if (typeof text !== "string") return null;

    const parsed = JSON.parse(text);
    if (!parsed?.folder || typeof parsed.confidence !== "number") return null;
    return {
      folder: String(parsed.folder),
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence))),
      reasoning: String(parsed.reasoning || ""),
    };
  } catch {
    return null;
  }
}

const ALL_CANON_FOLDERS = Object.values(CANON);

export async function classifyArtifactAsync(
  params: ResolveParams & { fileName?: string | null }
): Promise<ClassificationResult> {
  const sync = classifyArtifact(params);

  if (sync.confidence >= 0.7) return sync;

  const ai = await aiClassifyFolder({
    fileName: params.fileName ?? null,
    title: params.title,
    folders: [...ALL_CANON_FOLDERS],
  });

  if (ai && (ALL_CANON_FOLDERS as readonly string[]).includes(ai.folder) && ai.confidence >= 0.7) {
    return {
      folder: ai.folder,
      method: "ai",
      confidence: ai.confidence,
      reasoning: ai.reasoning,
      alternativeFolders: [],
    };
  }

  if (ai) {
    return {
      folder: CANON.ADMIN,
      method: "ai_low_confidence",
      confidence: ai.confidence,
      reasoning: ai.reasoning || "AI confidence below threshold; defaulted to Admin",
      alternativeFolders: ai.folder !== CANON.ADMIN ? [ai.folder] : [],
    };
  }

  return sync;
}

export function resolveFolderNameForArtifactLegacy(params: ResolveParams) {
  const canon = resolveFolderNameForArtifact(params);
  return CANON_TO_LEGACY[canon] ?? canon;
}

function normalizeMimeType(fileName?: string | null) {
  if (!fileName) return null;
  const f = fileName.toLowerCase();
  if (f.endsWith(".pdf")) return "application/pdf";
  if (f.endsWith(".zip")) return "application/zip";
  if (f.endsWith(".doc") || f.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (f.endsWith(".xls") || f.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (f.endsWith(".jpg") || f.endsWith(".jpeg")) return "image/jpeg";
  if (f.endsWith(".png")) return "image/png";
  if (f.endsWith(".txt")) return "text/plain";
  return null;
}

export async function importBidJacketArtifactsToProjectDocuments(params: {
  tenantId: string;
  projectId: string;
  bidProjectId: string;
  runId?: string;
}) {
  const { tenantId, projectId, bidProjectId, runId } = params;
  const { logIngestionEvent } = await import("./ingestion-events.service");

  await logIngestionEvent({
    tenantId,
    projectId,
    bidProjectId,
    runId: runId ?? null,
    eventType: "import.started",
    message: "Bid jacket → project documents import started",
  });

  await ensureDefaultProjectFolders(tenantId, projectId);
  const { byName } = await getProjectFolderMap(tenantId, projectId);

  const artifacts = await db
    .select({
      id: bidJacketArtifacts.id,
      title: bidJacketArtifacts.title,
      sourceType: bidJacketArtifacts.sourceType,
      sourceUrl: bidJacketArtifacts.sourceUrl,
      storageKey: bidJacketArtifacts.storageKey,
      templateCode: bidJacketArtifacts.templateCode,
      metadataJson: bidJacketArtifacts.metadataJson,
      category: artifactTemplates.category,
      phase: artifactTemplates.phase,
      defaultFormat: artifactTemplates.defaultFormat,
    })
    .from(bidJacketArtifacts)
    .leftJoin(artifactTemplates, eq(bidJacketArtifacts.templateCode, artifactTemplates.code))
    .where(and(eq(bidJacketArtifacts.tenantId, tenantId), eq(bidJacketArtifacts.bidProjectId, bidProjectId)));

  if (artifacts.length === 0) {
    await logIngestionEvent({
      tenantId,
      projectId,
      bidProjectId,
      runId: runId ?? null,
      eventType: "import.completed",
      message: "No artifacts found for bid project",
      detailsJson: { inserted: 0, skipped: 0, reason: "no_artifacts" },
    });
    return { inserted: 0, skipped: 0, reason: "no_artifacts" as const };
  }

  let inserted = 0;
  let skipped = 0;

  for (const a of artifacts) {
    const fileName =
      a.sourceUrl?.split("/").pop()?.split("?")[0] ?? null;
    const classification = await classifyArtifactAsync({
      templateCode: a.templateCode,
      category: a.category,
      phase: a.phase,
      title: a.title,
      sourceType: a.sourceType,
      fileName,
    });
    const folderName = classification.folder;

    const folderId = byName.get(folderName) ?? byName.get(CANON.ADMIN) ?? byName.get("01_Admin");
    if (!folderId) {
      skipped++;
      await logIngestionEvent({
        tenantId,
        projectId,
        bidProjectId,
        runId: runId ?? null,
        eventType: "import.skipped",
        entityType: "bid_jacket_artifact",
        entityId: a.id,
        message: "Skipped artifact: no matching folderId",
        detailsJson: { folderName },
      });
      continue;
    }

    const existing = await db
      .select({ id: projectDocuments.id })
      .from(projectDocuments)
      .where(
        and(
          eq(projectDocuments.tenantId, tenantId),
          eq(projectDocuments.projectId, projectId),
          or(
            a.storageKey ? eq(projectDocuments.storageKey, a.storageKey) : sql`false`,
            a.sourceUrl ? eq(projectDocuments.sourceUrl, a.sourceUrl) : sql`false`,
            and(eq(projectDocuments.title, a.title), eq(projectDocuments.sourceType, a.sourceType)),
          ),
        )
      )
      .limit(1);

    if (existing.length > 0) {
      skipped++;
      await logIngestionEvent({
        tenantId,
        projectId,
        bidProjectId,
        runId: runId ?? null,
        eventType: "import.skipped",
        entityType: "bid_jacket_artifact",
        entityId: a.id,
        message: "Skipped artifact: duplicate detected",
        detailsJson: {
          folderName,
          dedupeMatched: {
            byStorageKey: !!a.storageKey,
            bySourceUrl: !!a.sourceUrl,
            byTitleAndSourceType: true,
          },
          existingProjectDocumentId: existing[0]!.id,
        },
      });
      continue;
    }

    const docFileName =
      a.sourceUrl?.split("/").pop()?.split("?")[0] ??
      (a.templateCode ? `${a.templateCode}.${a.defaultFormat ?? "pdf"}` : null);

    const mimeType = normalizeMimeType(docFileName);

    const classificationMeta = {
      ...(a.metadataJson as object ?? {}),
      classification: {
        method: classification.method,
        folder: classification.folder,
        confidence: classification.confidence,
        reasoning: classification.reasoning,
        alternativeFolders: classification.alternativeFolders,
        classifiedAt: new Date().toISOString(),
      },
    };

    try {
      const insertedRow = await db
        .insert(projectDocuments)
        .values({
          tenantId,
          projectId,
          folderId,
          title: a.title,
          sourceType: a.sourceType,
          sourceUrl: a.sourceUrl,
          storageKey: a.storageKey,
          fileName: docFileName,
          mimeType,
          linkedEntityType: "bid_jacket_artifact",
          linkedEntityId: a.id,
          sourceArtifactId: a.id,
          tagsJson: null,
          metadataJson: classificationMeta,
        })
        .returning({ id: projectDocuments.id });

      inserted++;

      await logIngestionEvent({
        tenantId,
        projectId,
        bidProjectId,
        runId: runId ?? null,
        eventType: "import.inserted",
        entityType: "project_document",
        entityId: insertedRow?.[0]?.id ?? null,
        message: `Filed "${a.title}" → ${folderName} (${classification.method}, confidence: ${classification.confidence})`,
        detailsJson: {
          artifactId: a.id,
          folderName,
          folderId,
          title: a.title,
          sourceType: a.sourceType,
          sourceUrl: a.sourceUrl,
          storageKey: a.storageKey,
          fileName: docFileName,
          mimeType,
          classification,
        },
      });
    } catch (err: any) {
      skipped++;
      await logIngestionEvent({
        tenantId,
        projectId,
        bidProjectId,
        runId: runId ?? null,
        eventType: "import.error",
        entityType: "bid_jacket_artifact",
        entityId: a.id,
        message: "Failed inserting project document",
        detailsJson: {
          folderName,
          error: {
            name: err?.name,
            message: err?.message,
            code: err?.code,
          },
        },
      });
    }
  }

  await logIngestionEvent({
    tenantId,
    projectId,
    bidProjectId,
    runId: runId ?? null,
    eventType: "import.completed",
    message: "Bid jacket → project documents import completed",
    detailsJson: { inserted, skipped, artifactsCount: artifacts.length },
  });

  return { inserted, skipped, reason: "ok" as const };
}
