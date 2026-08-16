import { Router, Request, Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { blueprints, blueprintAnnotations, takeoffItems } from "@shared/schema";
import {
  calibrate,
  computeQuantity,
  applyWaste,
  extendCents,
  roundQuantity,
  TakeoffMeasurementError,
  LINEAR_UNITS,
  AREA_UNITS,
  VOLUME_UNITS,
  COUNT_UNITS,
  type Calibration,
  type MeasurementGeometry,
  type TakeoffUnit,
} from "@shared/takeoff-measure";
import {
  validateSheetUpload,
  SHEET_FORMATS,
  SHEET_ACCEPT_ATTRIBUTE,
  MAX_SHEET_BYTES,
} from "@shared/sheet-formats";

/**
 * Quantity takeoff — measurement, not estimation.
 *
 * The contract this router enforces: **the client never supplies a quantity.**
 * It supplies geometry the user drew on a calibrated sheet, and the server
 * recomputes the quantity from that geometry on every write. A takeoff line
 * item is therefore always re-derivable from its own stored points, which is
 * what makes it defensible when a bid is challenged.
 *
 * Mounted at /api/takeoff (singular). /api/takeoffs (plural) is the existing
 * manual line-item CRUD in routes.ts and is left untouched — Express matches
 * these as distinct paths.
 */
const takeoffRouter = Router();

// TODO(audit A1): replace with req.user.tenantId once authentication exists.
const DEFAULT_TENANT_ID = "blackhawk-default";

/** Calibrations live in blueprint_annotations, one per (blueprint, page). */
const CALIBRATION_ANNOTATION = "calibration";

/** Bumped when the engine's math changes, so stored items can be re-verified. */
const ENGINE_VERSION = 1;

const ALL_UNITS = [
  ...LINEAR_UNITS,
  ...AREA_UNITS,
  ...VOLUME_UNITS,
  ...COUNT_UNITS,
] as const;

const pointSchema = z.object({ x: z.number().finite(), y: z.number().finite() });

const geometrySchema = z.object({
  kind: z.enum(["linear", "area", "count", "volume"]),
  pageNumber: z.number().int().positive(),
  points: z.array(pointSchema).min(1).max(10_000),
  depthFeet: z.number().finite().positive().optional(),
  holes: z.array(z.array(pointSchema).min(3)).max(200).optional(),
});

/**
 * Narrow a path parameter to a string.
 *
 * Express types `req.params` values as `string | string[]` (a repeated segment
 * yields an array), so every direct use is a type error. Mirrors the `pOpt`
 * helper already used in server/routes.ts.
 */
function pathParam(req: Request, name: string): string {
  const value = (req.params as Record<string, string | string[] | undefined>)[name];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function handleError(res: Response, error: unknown, context: string) {
  if (error instanceof TakeoffMeasurementError) {
    // These are user-actionable ("calibrate the sheet first"), so the message
    // is safe and useful to return.
    return res.status(400).json({ error: error.message });
  }
  console.error(`[takeoff] ${context}`, error);
  return res.status(500).json({ error: "Takeoff operation failed" });
}

/** The audit record for a page's calibration, if one was drawn in-app. */
async function loadCalibrationAnnotation(
  blueprintId: string,
  pageNumber: number
): Promise<Calibration | null> {
  const [row] = await db
    .select()
    .from(blueprintAnnotations)
    .where(
      and(
        eq(blueprintAnnotations.tenantId, DEFAULT_TENANT_ID),
        eq(blueprintAnnotations.blueprintId, blueprintId),
        eq(blueprintAnnotations.annotationType, CALIBRATION_ANNOTATION),
        eq(blueprintAnnotations.pageNumber, pageNumber)
      )
    )
    .orderBy(desc(blueprintAnnotations.createdAt))
    .limit(1);

  return row ? (row.dataJson as Calibration) : null;
}

/**
 * Load the calibration for a page, or null.
 *
 * `blueprints.pixelsPerFootByPage` is the source of truth — it is the schema's
 * own first-class per-page calibration store. The drawn reference (the two
 * points and the length the user typed) is additionally recorded as a
 * blueprint_annotation so a scale can be *audited*, not merely used.
 *
 * Note the reciprocal: the column holds sheet-units-per-foot, while the
 * measurement engine works in feet-per-unit.
 */
async function loadCalibration(
  blueprintId: string,
  pageNumber: number
): Promise<Calibration | null> {
  const [sheet] = await db
    .select({ byPage: blueprints.pixelsPerFootByPage })
    .from(blueprints)
    .where(and(eq(blueprints.id, blueprintId), eq(blueprints.tenantId, DEFAULT_TENANT_ID)))
    .limit(1);

  const byPage = (sheet?.byPage ?? null) as Record<string, number> | null;
  const unitsPerFoot = byPage?.[String(pageNumber)];

  if (typeof unitsPerFoot === "number" && Number.isFinite(unitsPerFoot) && unitsPerFoot > 0) {
    // Prefer the audit record — it carries the reference line that produced
    // this scale. Fall back to reconstructing from the column alone for sheets
    // calibrated outside this router.
    const annotation = await loadCalibrationAnnotation(blueprintId, pageNumber);
    if (annotation) return annotation;
    return {
      feetPerUnit: 1 / unitsPerFoot,
      pageNumber,
      referencePixelDistance: unitsPerFoot,
      referenceRealFeet: 1,
    };
  }

  // Sheets calibrated before the column existed.
  return loadCalibrationAnnotation(blueprintId, pageNumber);
}

/**
 * POST /api/takeoff/blueprints/:blueprintId/calibrate
 *
 * The user drags a line across a dimension whose real length they know and
 * types that length. Everything measured on the page afterwards derives from
 * this. Stored per page — sheets in one set are routinely at different scales,
 * and applying a plan's scale to a detail sheet is a classic takeoff error.
 */
takeoffRouter.post("/blueprints/:blueprintId/calibrate", async (req: Request, res: Response) => {
  try {
    const body = z
      .object({
        pageNumber: z.number().int().positive(),
        from: pointSchema,
        to: pointSchema,
        realFeet: z.number().finite().positive(),
      })
      .safeParse(req.body);

    if (!body.success) {
      return res.status(400).json({ error: "Invalid calibration", details: body.error.issues });
    }

    const { pageNumber, from, to, realFeet } = body.data;

    const blueprintId = pathParam(req, "blueprintId");

    const [blueprint] = await db
      .select({ id: blueprints.id, byPage: blueprints.pixelsPerFootByPage })
      .from(blueprints)
      .where(and(eq(blueprints.id, blueprintId), eq(blueprints.tenantId, DEFAULT_TENANT_ID)))
      .limit(1);

    if (!blueprint) return res.status(404).json({ error: "Blueprint not found" });

    // Throws TakeoffMeasurementError on a degenerate reference line.
    const calibration = calibrate(from, to, realFeet, pageNumber);

    // Source of truth: the schema's own per-page calibration column. Merge so
    // calibrating page 3 never clears the scale already set on pages 1 and 2 —
    // sheets in one set are routinely at different scales.
    const existing = (blueprint.byPage ?? {}) as Record<string, number>;
    const merged = { ...existing, [String(pageNumber)]: 1 / calibration.feetPerUnit };

    await db
      .update(blueprints)
      .set({ pixelsPerFootByPage: merged, calibratedAt: new Date() })
      .where(and(eq(blueprints.id, blueprintId), eq(blueprints.tenantId, DEFAULT_TENANT_ID)));

    // Audit trail: what was actually drawn, so a scale can be re-checked later
    // rather than merely trusted.
    await db.insert(blueprintAnnotations).values({
      tenantId: DEFAULT_TENANT_ID,
      blueprintId,
      pageNumber,
      annotationType: CALIBRATION_ANNOTATION,
      dataJson: calibration,
      label: `Scale: ${realFeet} ft reference`,
      color: "#f59e0b",
    });

    res.json({ calibration, unitsPerFoot: merged[String(pageNumber)] });
  } catch (error) {
    handleError(res, error, "calibrate");
  }
});

/** GET /api/takeoff/blueprints/:blueprintId/calibration?pageNumber=N */
takeoffRouter.get("/blueprints/:blueprintId/calibration", async (req: Request, res: Response) => {
  try {
    const pageNumber = Number(req.query.pageNumber ?? 1);
    if (!Number.isInteger(pageNumber) || pageNumber < 1) {
      return res.status(400).json({ error: "pageNumber must be a positive integer" });
    }
    const calibration = await loadCalibration(pathParam(req, "blueprintId"), pageNumber);
    res.json({ calibration });
  } catch (error) {
    handleError(res, error, "get calibration");
  }
});

/**
 * POST /api/takeoff/measurements
 *
 * Persist a drawn measurement as a takeoff line item. The request carries
 * geometry; the server computes the quantity. A `quantity` field in the body
 * is ignored on purpose — see the module docstring.
 */
takeoffRouter.post("/measurements", async (req: Request, res: Response) => {
  try {
    const body = z
      .object({
        blueprintId: z.string().min(1),
        bidProjectId: z.string().min(1).optional(),
        name: z.string().min(1).max(200),
        category: z.string().min(1).max(100).default("General"),
        unit: z.enum(ALL_UNITS as unknown as [TakeoffUnit, ...TakeoffUnit[]]),
        geometry: geometrySchema,
        wastePercent: z.number().finite().min(0).max(100).default(0),
        unitCostCents: z.number().int().min(0).default(0),
        notes: z.string().max(2000).optional(),
        color: z.string().max(20).optional(),
      })
      .safeParse(req.body);

    if (!body.success) {
      return res.status(400).json({ error: "Invalid measurement", details: body.error.issues });
    }

    const input = body.data;
    const geometry = input.geometry as MeasurementGeometry;

    const calibration = await loadCalibration(input.blueprintId, geometry.pageNumber);
    if (!calibration) {
      return res.status(400).json({
        error: `Page ${geometry.pageNumber} has not been calibrated. Draw a line across a known dimension first.`,
      });
    }

    // The single source of truth for the number. Throws on any geometry that
    // cannot support the requested unit.
    const computed = computeQuantity(geometry, calibration, input.unit);
    const quantityWithWaste = applyWaste(computed.quantity, input.wastePercent);
    const extendedCents = extendCents(quantityWithWaste, input.unitCostCents);

    const [created] = await db
      .insert(takeoffItems)
      .values({
        tenantId: DEFAULT_TENANT_ID,
        blueprintId: input.blueprintId,
        bidProjectId: input.bidProjectId,
        name: input.name,
        // The existing column is decimal dollars; cents stay in locationJson
        // so the exact figure survives regardless of decimal rounding.
        quantity: String(roundQuantity(quantityWithWaste, 4)),
        unit: input.unit,
        unitCost: (input.unitCostCents / 100).toFixed(2),
        category: input.category,
        notes: input.notes,
        color: input.color ?? "#3b82f6",
        pageNumber: geometry.pageNumber,
        // Snapshot the calibration alongside the geometry: if the sheet is
        // re-calibrated later, this item still records what it was measured
        // against, and /recompute can surface the difference.
        locationJson: {
          engineVersion: ENGINE_VERSION,
          geometry,
          calibration,
          wastePercent: input.wastePercent,
          unitCostCents: input.unitCostCents,
          computed: {
            quantity: computed.quantity,
            quantityWithWaste,
            extendedCents,
            feet: computed.feet,
            squareFeet: computed.squareFeet,
            cubicFeet: computed.cubicFeet,
            count: computed.count,
          },
        },
      })
      .returning();

    res.status(201).json({
      item: created,
      computed: {
        quantity: roundQuantity(computed.quantity, 4),
        quantityWithWaste: roundQuantity(quantityWithWaste, 4),
        extendedCents,
        unit: input.unit,
      },
    });
  } catch (error) {
    handleError(res, error, "create measurement");
  }
});

/**
 * POST /api/takeoff/measurements/:id/recompute
 *
 * Re-derive a stored line item from its own geometry. This is the audit path:
 * it proves a number on a bid can still be reproduced from the points that
 * produced it, and surfaces any drift if the engine or the sheet calibration
 * has changed since.
 */
takeoffRouter.post("/measurements/:id/recompute", async (req: Request, res: Response) => {
  try {
    const [item] = await db
      .select()
      .from(takeoffItems)
      .where(
        and(
          eq(takeoffItems.id, pathParam(req, "id")),
          eq(takeoffItems.tenantId, DEFAULT_TENANT_ID)
        )
      )
      .limit(1);

    if (!item) return res.status(404).json({ error: "Takeoff item not found" });

    const stored = item.locationJson as
      | {
          geometry?: MeasurementGeometry;
          calibration?: Calibration;
          wastePercent?: number;
          unitCostCents?: number;
          computed?: { quantityWithWaste?: number };
        }
      | null;

    if (!stored?.geometry || !stored?.calibration) {
      return res.status(400).json({
        error:
          "This item was entered manually and has no geometry to recompute. Only measured items can be audited.",
      });
    }

    const recomputed = computeQuantity(
      stored.geometry,
      stored.calibration,
      item.unit as TakeoffUnit
    );
    const withWaste = applyWaste(recomputed.quantity, stored.wastePercent ?? 0);

    const previous = Number(item.quantity);
    const drift = withWaste - previous;

    res.json({
      previousQuantity: previous,
      recomputedQuantity: roundQuantity(withWaste, 4),
      // Tolerance matches the 4-decimal precision the column is stored at.
      matches: Math.abs(drift) < 1e-4,
      drift: roundQuantity(drift, 6),
      unit: item.unit,
      calibration: stored.calibration,
      engineVersion: ENGINE_VERSION,
      storedEngineVersion: (stored as { engineVersion?: number }).engineVersion ?? null,
    });
  } catch (error) {
    handleError(res, error, "recompute measurement");
  }
});

/**
 * GET /api/takeoff/summary?bidProjectId=...
 *
 * Roll a project's takeoff up by category, in integer cents.
 */
takeoffRouter.get("/summary", async (req: Request, res: Response) => {
  try {
    const bidProjectId = typeof req.query.bidProjectId === "string" ? req.query.bidProjectId : null;
    if (!bidProjectId) {
      return res.status(400).json({ error: "bidProjectId is required" });
    }

    const items = await db
      .select()
      .from(takeoffItems)
      .where(
        and(
          eq(takeoffItems.tenantId, DEFAULT_TENANT_ID),
          eq(takeoffItems.bidProjectId, bidProjectId)
        )
      );

    const byCategory = new Map<string, { category: string; itemCount: number; extendedCents: number }>();
    let grandTotalCents = 0;
    let measuredCount = 0;

    for (const item of items) {
      const stored = item.locationJson as { computed?: { extendedCents?: number } } | null;

      // Prefer the exact cents recorded at measurement time; fall back to the
      // decimal columns for manually-entered legacy rows.
      const cents =
        typeof stored?.computed?.extendedCents === "number"
          ? stored.computed.extendedCents
          : extendCents(Number(item.quantity), Math.round(Number(item.unitCost) * 100));

      if (stored?.computed) measuredCount++;

      const bucket = byCategory.get(item.category) ?? {
        category: item.category,
        itemCount: 0,
        extendedCents: 0,
      };
      bucket.itemCount++;
      bucket.extendedCents += cents;
      byCategory.set(item.category, bucket);
      grandTotalCents += cents;
    }

    res.json({
      categories: Array.from(byCategory.values()).sort((a, b) => b.extendedCents - a.extendedCents),
      grandTotalCents,
      itemCount: items.length,
      // Honest provenance: how many of these numbers came from measured
      // geometry vs. someone typing a quantity in.
      measuredCount,
      manualCount: items.length - measuredCount,
    });
  } catch (error) {
    handleError(res, error, "summary");
  }
});

/**
 * POST /api/takeoff/sheets  (multipart/form-data)
 *
 * Upload a drawing sheet in any format the app accepts — not just PDF. Real
 * sets arrive as scanned multi-page TIFF, CAD exports, and plotter output, and
 * refusing everything but PDF means the drawings people actually have cannot be
 * measured.
 *
 * The uploaded bytes are sniffed rather than trusted: the extension is a claim
 * by the uploader, and handing a mislabelled file to a decoder that trusts its
 * shape is how a parser gets fed something it was never meant to read.
 */
takeoffRouter.post(
  "/sheets",
  (req: Request, res: Response, next) => {
    // Loaded lazily so the router has no import-time dependency on multer.
    import("multer")
      .then((m) => {
        const upload = m.default({
          storage: m.default.memoryStorage(),
          limits: { fileSize: MAX_SHEET_BYTES, files: 1 },
        }).single("file");
        upload(req as never, res as never, (err: unknown) => {
          if (err) {
            const message =
              (err as { code?: string }).code === "LIMIT_FILE_SIZE"
                ? `File exceeds the ${MAX_SHEET_BYTES / 1024 / 1024} MB limit.`
                : "Upload failed.";
            return res.status(400).json({ error: message });
          }
          next();
        });
      })
      .catch(next);
  },
  async (req: Request, res: Response) => {
    try {
      const file = (req as Request & { file?: { originalname: string; mimetype: string; size: number; buffer: Buffer } }).file;
      if (!file) return res.status(400).json({ error: "No file was uploaded." });

      const meta = z
        .object({
          title: z.string().min(1).max(200).optional(),
          bidProjectId: z.string().min(1).optional(),
          projectId: z.string().min(1).optional(),
          category: z.string().min(1).max(100).optional(),
        })
        .safeParse(req.body ?? {});
      if (!meta.success) {
        return res.status(400).json({ error: "Invalid sheet metadata", details: meta.error.issues });
      }

      const validation = validateSheetUpload(
        file.originalname,
        file.size,
        new Uint8Array(file.buffer.subarray(0, 4096)),
        file.mimetype
      );
      if (!validation.ok) {
        return res.status(400).json({ error: validation.reason });
      }

      const format = validation.format;

      // Page count is only knowable up front for formats we can inspect
      // cheaply. PDF is read here; TIFF page count is resolved by the client
      // decoder on first open; everything else is a single sheet.
      let pageCount = 1;
      if (format.id === "pdf") {
        try {
          const { PDFDocument } = await import("pdf-lib");
          const doc = await PDFDocument.load(file.buffer, { updateMetadata: false });
          pageCount = doc.getPageCount();
        } catch {
          // A PDF we cannot parse for a page count is still storable and may
          // still open in pdf.js, which is more tolerant. Don't fail the upload.
          pageCount = 1;
        }
      }

      const { ObjectStorageService } = await import("../replit_integrations/object_storage");
      const storage = new ObjectStorageService();
      const uploadUrl = await storage.getObjectEntityUploadURL();

      const put = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": format.mimeTypes[0] ?? "application/octet-stream" },
        body: new Uint8Array(file.buffer),
      });
      if (!put.ok) {
        console.error("[takeoff] object storage PUT failed", put.status);
        return res.status(502).json({ error: "Could not store the uploaded sheet." });
      }

      // The presigned URL carries the object path; strip the query to get the
      // stable key the passthrough route serves from.
      const storageKey = new URL(uploadUrl).pathname;

      const [created] = await db
        .insert(blueprints)
        .values({
          tenantId: DEFAULT_TENANT_ID,
          bidProjectId: meta.data.bidProjectId,
          projectId: meta.data.projectId,
          title: meta.data.title?.trim() || file.originalname,
          fileName: file.originalname,
          storageKey,
          fileSize: file.size,
          mimeType: format.mimeTypes[0] ?? file.mimetype,
          pageCount,
          category: meta.data.category ?? "Drawings",
        })
        .returning();

      res.status(201).json({
        sheet: created,
        format: {
          id: format.id,
          label: format.label,
          measurable: format.measurable,
          multiPage: format.multiPage,
          note: format.note ?? null,
        },
        // Surfaced so the UI can say "stored, but export to PDF to measure"
        // instead of letting the user discover it by clicking around.
        measurable: format.measurable,
      });
    } catch (error) {
      handleError(res, error, "upload sheet");
    }
  }
);

/** GET /api/takeoff/formats — what the uploader accepts, for the UI. */
takeoffRouter.get("/formats", (_req: Request, res: Response) => {
  res.json({
    formats: SHEET_FORMATS.map((f) => ({
      id: f.id,
      label: f.label,
      extensions: f.extensions,
      measurable: f.measurable,
      multiPage: f.multiPage,
      note: f.note ?? null,
    })),
    accept: SHEET_ACCEPT_ATTRIBUTE,
    maxBytes: MAX_SHEET_BYTES,
  });
});

export { takeoffRouter };
