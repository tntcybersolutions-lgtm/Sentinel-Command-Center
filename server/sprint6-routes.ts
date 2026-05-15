// Sprint 6 — receipts OCR, receipt save, photo upload. (Rewritten by Sprint 7.5.)
import type { Express, Request, Response } from "express";
import crypto from "crypto";
import { db } from "./db";
import { sql } from "drizzle-orm";

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
  objectStorage = (require("@replit/object-storage") as { default?: ObjectStorageClient }).default ?? null;
} catch {
  objectStorage = null;
}
const PHOTO_BUCKET = "sentinel-photos";

function clampString(s: unknown, max = 240): string {
  if (typeof s !== "string") return "";
  return s.slice(0, max);
}
function getProjectId(req: Request): string {
  return req.params.id || req.body?.projectId || "default";
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
    res.json(JSON.parse(cleaned));
  } catch (e) {
    res.status(502).json({ error: "ocr failed", detail: clampString((e as Error).message, 200) });
  }
}

async function saveReceipt(req: Request, res: Response) {
  const projectId = getProjectId(req);
  const body = req.body ?? {};
  const id = crypto.randomUUID();
  const vendor = clampString(body.vendor, 200);
  const total = Number(body.total) || 0;
  const currency = clampString(body.currency, 8) || "USD";
  const purchaseDate = typeof body.purchaseDate === "string" ? body.purchaseDate : null;
  const category = clampString(body.category, 60) || "Other";
  const lineItemsJson = JSON.stringify(Array.isArray(body.lineItems) ? body.lineItems : []);
  const imageUrl = clampString(body.imageUrl, 5_000_000);
  try {
    await (db as unknown as { execute: (q: unknown) => Promise<unknown> }).execute(
      sql`INSERT INTO receipts (id, project_id, vendor, total, currency, purchase_date, category, line_items_json, image_url)
          VALUES (${id}, ${projectId}, ${vendor}, ${total}, ${currency}, ${purchaseDate}, ${category}, ${lineItemsJson}, ${imageUrl})`,
    );
    res.json({ ok: true, id });
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
  const projectId = getProjectId(req);
  const dataUrl = clampString(req.body?.storageUrl, 8_000_000);
  const decoded = dataUrlToBuffer(dataUrl);
  if (!decoded) { res.status(400).json({ error: "valid data URL required" }); return; }
  if (decoded.buffer.length > 6 * 1024 * 1024) { res.status(413).json({ error: "max 6MB" }); return; }
  let storedUrl = dataUrl;
  if (objectStorage) {
    const ext = decoded.mime === "image/png" ? "png" : "jpg";
    const key = projectId + "/" + Date.now() + "-" + crypto.randomBytes(6).toString("hex") + "." + ext;
    try {
      const result = await objectStorage.upload({ bucket: PHOTO_BUCKET, key, data: decoded.buffer, contentType: decoded.mime });
      storedUrl = result.url;
    } catch (e) {
      console.error("[photos/upload] object storage failed:", (e as Error).message);
    }
  }
  res.json({ ok: true, url: storedUrl });
}

export function registerSprint6Routes(app: Express): void {
  app.post("/api/receipts/ocr", ocrReceipt);
  app.post("/api/projects/:id/receipts", saveReceipt);
  app.post("/api/projects/:id/photos/upload", uploadPhoto);
  console.log("[sprint6] receipt OCR + photo upload wired");
}
