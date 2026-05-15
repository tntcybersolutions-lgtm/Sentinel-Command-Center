import type { Express, Request, Response } from "express";
import crypto from "crypto";
import { db } from "./db";
import { receipts, projectPhotos } from "@shared/schema";
// LLM caller — adjust the import path if the LLM service lives elsewhere in this codebase.
let askHerbie: (args: { systemPrompt: string; userImageDataUrl: string; maxTokens: number }) => Promise<string>;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  askHerbie = require("./services/herbie.service").askHerbie;
} catch {
  askHerbie = async () => { throw new Error("Herbie LLM service not wired — receipts/ocr disabled."); };
}

type ObjectStorageClient = {
  upload(opts: { bucket: string; key: string; data: Buffer; contentType?: string }): Promise<{ url: string }>;
};
let objectStorage: ObjectStorageClient | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  objectStorage = require("@replit/object-storage").default ?? null;
} catch {
  objectStorage = null;
}
const PHOTO_BUCKET = "sentinel-photos";

const idempotencySeen = new Map<string, { at: number }>();
function dedupe(key?: string): boolean {
  if (!key) return false;
  const now = Date.now();
  for (const [k, v] of idempotencySeen) if (now - v.at > 600_000) idempotencySeen.delete(k);
  if (idempotencySeen.has(key)) return true;
  idempotencySeen.set(key, { at: now });
  return false;
}

function getProjectId(req: Request): string {
  return req.params.id || req.body?.projectId || "default";
}

function clampString(s: unknown, max = 240): string {
  if (typeof s !== "string") return "";
  return s.slice(0, max);
}

const OCR_PROMPT = `You are reading a photo of a paper receipt for a US construction subcontractor.
Extract the structured fields below. Output STRICT JSON, no prose, no markdown fences.

Schema:
{
  "vendor": string,
  "total": number,
  "currency": "USD" | "CAD" | string,
  "purchaseDate": "YYYY-MM-DD" | null,
  "category": "Materials" | "Tools" | "Fuel" | "Equipment" | "Permits" | "Subcontractor" | "Meals" | "Other",
  "lineItems": [{ "description": string, "amount": number }]
}

If a field is unreadable, use null (or 0 for amounts). Pick the most likely category from the list above.`;

async function ocrReceipt(req: Request, res: Response) {
  const image = clampString(req.body?.image, 5_000_000);
  if (!image || !image.startsWith("data:image/")) {
    res.status(400).json({ error: "image (data URL) required" }); return;
  }
  try {
    const raw = await askHerbie({ systemPrompt: OCR_PROMPT, userImageDataUrl: image, maxTokens: 600 });
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    const parsed = JSON.parse(cleaned);
    res.json(parsed);
  } catch (e) {
    res.status(502).json({ error: "ocr failed", detail: clampString((e as Error).message, 200) });
  }
}

async function saveReceipt(req: Request, res: Response) {
  const idempKey = clampString(req.header("Idempotency-Key"), 64);
  if (dedupe(idempKey)) { res.status(409).json({ duplicate: true }); return; }
  const projectId = getProjectId(req);
  const body = req.body ?? {};
  const row = {
    id: crypto.randomUUID(),
    projectId,
    vendor: clampString(body.vendor, 200),
    total: Number(body.total) || 0,
    currency: clampString(body.currency, 8) || "USD",
    purchaseDate: typeof body.purchaseDate === "string" ? body.purchaseDate : null,
    category: clampString(body.category, 60) || "Other",
    lineItemsJson: JSON.stringify(Array.isArray(body.lineItems) ? body.lineItems : []),
    imageUrl: clampString(body.imageUrl, 5_000_000),
    createdAt: new Date(),
  };
  try {
    await (db as unknown as { insert: (t: unknown) => { values: (v: unknown) => Promise<unknown> } })
      .insert(receipts).values(row as never);
    res.json({ ok: true, id: row.id });
  } catch (e) {
    res.status(500).json({ error: "insert failed", detail: clampString((e as Error).message, 200) });
  }
}

function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; mime: string } | null {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  return { mime: m[1], buffer: Buffer.from(m[2], "base64") };
}

async function uploadPhoto(req: Request, res: Response) {
  const idempKey = clampString(req.header("Idempotency-Key"), 64);
  if (dedupe(idempKey)) { res.status(409).json({ duplicate: true }); return; }
  const projectId = getProjectId(req);
  const dataUrl = clampString(req.body?.storageUrl, 8_000_000);
  const decoded = dataUrlToBuffer(dataUrl);
  if (!decoded) { res.status(400).json({ error: "valid data URL required" }); return; }
  if (decoded.buffer.length > 6 * 1024 * 1024) {
    res.status(413).json({ error: "max 6MB" }); return;
  }
  let storedUrl = dataUrl;
  if (objectStorage) {
    const ext = decoded.mime === "image/png" ? "png" : "jpg";
    const key = projectId + "/" + Date.now() + "-" + crypto.randomBytes(6).toString("hex") + "." + ext;
    try {
      const result = await objectStorage.upload({
        bucket: PHOTO_BUCKET, key, data: decoded.buffer, contentType: decoded.mime,
      });
      storedUrl = result.url;
    } catch (e) {
      console.error("[photos/upload] object storage failed:", (e as Error).message);
    }
  }
  const row = {
    id: crypto.randomUUID(),
    projectId,
    storageUrl: storedUrl,
    caption: clampString(req.body?.caption, 240),
    pinsJson: JSON.stringify(Array.isArray(req.body?.pins) ? req.body.pins : []),
    capturedAt: new Date(Number(req.body?.capturedAt) || Date.now()),
    mimeType: clampString(req.body?.mimeType, 40) || decoded.mime,
    createdAt: new Date(),
  };
  try {
    await (db as unknown as { insert: (t: unknown) => { values: (v: unknown) => Promise<unknown> } })
      .insert(projectPhotos).values(row as never);
    res.json({ ok: true, id: row.id, url: storedUrl });
  } catch (e) {
    res.status(500).json({ error: "insert failed", detail: clampString((e as Error).message, 200) });
  }
}

export function registerSprint6Routes(app: Express): void {
  app.post("/api/receipts/ocr", ocrReceipt);
  app.post("/api/projects/:id/receipts", saveReceipt);
  app.post("/api/projects/:id/photos/upload", uploadPhoto);
}
