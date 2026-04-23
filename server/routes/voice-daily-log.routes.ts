// Roadmap Feature 4 — Voice Daily Log HTTP surface.
//
// POST /api/projects/:projectId/daily-logs/voice
//   multipart/form-data:
//     audio        (required) — audio blob from the phone recorder
//     logDate      (optional) — ISO date, defaults to today
//     authorUserId (optional) — uuid
//
//   JSON body alternative (audio delivered by URL, e.g. after the
//   client uploads the blob to object storage first):
//     { "audioUrl": "...", "logDate": "...", "authorUserId": "..." }

import { Router, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import { upsertVoiceDailyLog } from "../services/voice-daily-log.service";

const router = Router();
const DEFAULT_TENANT_ID = "blackhawk-default";
const MAX_AUDIO_MB = 25;

function tenantOf(req: Request): string {
  return (req as any)?.user?.tenantId || DEFAULT_TENANT_ID;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AUDIO_MB * 1024 * 1024 },
});

const JsonBodySchema = z.object({
  audioUrl: z.string().url(),
  logDate: z.coerce.date().optional(),
  authorUserId: z.string().uuid().optional(),
  audioDocumentId: z.string().uuid().optional(),
});

router.post(
  "/projects/:projectId/daily-logs/voice",
  upload.single("audio"),
  async (req: Request, res: Response) => {
    try {
      const tenantId = tenantOf(req);
      const projectId = String(req.params.projectId);

      // Two delivery modes: uploaded file or caller-provided URL.
      let audio: Buffer | { url: string };
      let logDate: Date;
      let authorUserId: string | undefined;
      let audioDocumentId: string | undefined;

      if (req.file) {
        audio = req.file.buffer;
        logDate = req.body.logDate ? new Date(req.body.logDate) : startOfDay(new Date());
        authorUserId = req.body.authorUserId || undefined;
        audioDocumentId = req.body.audioDocumentId || undefined;
      } else {
        const parsed = JsonBodySchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            error: "Provide either a multipart 'audio' file or a JSON body with audioUrl.",
            issues: parsed.error.issues,
          });
        }
        audio = { url: parsed.data.audioUrl };
        logDate = parsed.data.logDate ?? startOfDay(new Date());
        authorUserId = parsed.data.authorUserId;
        audioDocumentId = parsed.data.audioDocumentId;
      }

      const result = await upsertVoiceDailyLog({
        tenantId,
        projectId,
        logDate,
        audio,
        audioDocumentId,
        authorUserId,
      });

      res.status(201).json(result);
    } catch (error: any) {
      console.error("POST /api/projects/:id/daily-logs/voice error:", error);
      res
        .status(500)
        .json({ error: error?.message ?? "Failed to process voice daily log" });
    }
  },
);

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

export const voiceDailyLogRouter = router;
