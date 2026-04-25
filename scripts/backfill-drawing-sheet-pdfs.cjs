#!/usr/bin/env node
// Backfill drawing_sheets rows that have synthetic / unreachable storage_keys
// with a real per-sheet PDF placeholder uploaded to the public object bucket.
// Idempotent: rows whose existing storage_key already resolves to a real file
// are left untouched.

const { Client } = require("pg");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const { Storage } = require("@google-cloud/storage");

const TENANT_ID = "blackhawk-default";
const REPL_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

function getStorageClient() {
  return new Storage({
    credentials: {
      audience: "replit",
      subject_token_type: "access_token",
      token_url: `${REPL_SIDECAR_ENDPOINT}/token`,
      type: "external_account",
      credential_source: { url: `${REPL_SIDECAR_ENDPOINT}/credential` },
      universe_domain: "googleapis.com",
    },
    projectId: "",
  });
}

function parsePublicTarget() {
  const raw = (process.env.PUBLIC_OBJECT_SEARCH_PATHS || "")
    .split(",")[0]
    .trim()
    .replace(/^\//, "");
  if (!raw) throw new Error("PUBLIC_OBJECT_SEARCH_PATHS not set");
  const [bucket, ...rest] = raw.split("/");
  return { bucket, prefix: rest.join("/") || "public" };
}

async function buildSheetPdf(sheet) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]); // US Letter
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);

  // Title block border
  page.drawRectangle({
    x: 24, y: 24, width: 564, height: 744,
    borderColor: rgb(0.15, 0.15, 0.18), borderWidth: 1.5,
  });
  page.drawLine({
    start: { x: 24, y: 132 }, end: { x: 588, y: 132 },
    color: rgb(0.15, 0.15, 0.18), thickness: 1,
  });

  // Sheet number (huge, top-right of title block)
  page.drawText(sheet.sheet_number || "—", {
    x: 380, y: 60, size: 36, font: helvBold, color: rgb(0.05, 0.05, 0.1),
  });

  // Sheet title
  page.drawText("BLACKHAWK CONSTRUCTION", {
    x: 40, y: 100, size: 11, font: helvBold, color: rgb(0.3, 0.05, 0.05),
  });
  page.drawText(sheet.sheet_title || "Untitled Sheet", {
    x: 40, y: 78, size: 16, font: helvBold, color: rgb(0.05, 0.05, 0.1),
  });
  page.drawText(`Discipline: ${sheet.discipline || "—"}`, {
    x: 40, y: 58, size: 10, font: helv, color: rgb(0.3, 0.3, 0.35),
  });
  page.drawText(`Scale: ${sheet.scale || "NTS"}    Revision: ${sheet.revision_number || "—"}`, {
    x: 40, y: 42, size: 10, font: helv, color: rgb(0.3, 0.3, 0.35),
  });

  // Drawing area placeholder grid
  const gridX = 60, gridY = 180, gridW = 492, gridH = 540;
  page.drawRectangle({
    x: gridX, y: gridY, width: gridW, height: gridH,
    borderColor: rgb(0.7, 0.7, 0.75), borderWidth: 0.5,
  });
  for (let i = 1; i < 10; i++) {
    const x = gridX + (gridW / 10) * i;
    page.drawLine({ start: { x, y: gridY }, end: { x, y: gridY + gridH }, color: rgb(0.85, 0.85, 0.88), thickness: 0.3 });
  }
  for (let i = 1; i < 10; i++) {
    const y = gridY + (gridH / 10) * i;
    page.drawLine({ start: { x: gridX, y }, end: { x: gridX + gridW, y }, color: rgb(0.85, 0.85, 0.88), thickness: 0.3 });
  }

  page.drawText("Sheet preview — full drawing pending upload of source file.", {
    x: gridX + 40, y: gridY + gridH / 2, size: 11, font: helv, color: rgb(0.45, 0.45, 0.5),
  });
  page.drawText(`Sheet ID: ${sheet.id}`, {
    x: gridX + 40, y: gridY + gridH / 2 - 18, size: 8, font: helv, color: rgb(0.55, 0.55, 0.6),
  });

  return Buffer.from(await doc.save());
}

async function pathExists(client, bucket, objectName) {
  try {
    const [exists] = await client.bucket(bucket).file(objectName).exists();
    return exists;
  } catch {
    return false;
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("[BACKFILL] SKIPPED (no DATABASE_URL)");
    process.exit(0);
  }

  const pg = new Client({ connectionString: process.env.DATABASE_URL });
  await pg.connect();

  const { rows: sheets } = await pg.query(
    `SELECT id, sheet_number, sheet_title, discipline, storage_key, file_type, scale, revision_number
     FROM drawing_sheets WHERE tenant_id = $1`,
    [TENANT_ID],
  );
  console.log(`[BACKFILL] inspecting ${sheets.length} drawing_sheets rows`);

  const storageClient = getStorageClient();
  const { bucket, prefix } = parsePublicTarget();

  let healed = 0;
  let alreadyOk = 0;

  for (const sheet of sheets) {
    const key = sheet.storage_key || "";
    let resolvedOk = false;
    if (key.startsWith("/")) {
      const parts = key.slice(1).split("/");
      if (parts.length >= 2) {
        resolvedOk = await pathExists(storageClient, parts[0], parts.slice(1).join("/"));
      }
    } else if (key) {
      // public-search style
      resolvedOk = await pathExists(storageClient, bucket, `${prefix}/${key}`);
    }

    if (resolvedOk) {
      alreadyOk++;
      continue;
    }

    const pdfBytes = await buildSheetPdf(sheet);
    const objectName = `${prefix}/drawings/${sheet.id}.pdf`;
    await storageClient.bucket(bucket).file(objectName).save(pdfBytes, {
      contentType: "application/pdf",
      resumable: false,
    });
    const newKey = `/${bucket}/${objectName}`;
    await pg.query(
      `UPDATE drawing_sheets SET storage_key = $1, file_type = 'pdf', updated_at = NOW() WHERE id = $2`,
      [newKey, sheet.id],
    );
    healed++;
    console.log(`  + healed ${sheet.sheet_number} ${sheet.sheet_title} → ${newKey}`);
  }

  await pg.end();
  console.log(`[BACKFILL] done — healed=${healed} alreadyOk=${alreadyOk}`);
}

main().catch((err) => {
  console.error("[BACKFILL] failed:", err);
  process.exit(1);
});
