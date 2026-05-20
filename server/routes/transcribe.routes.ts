/**
 * Sprint M6 — /api/transcribe
 *
 * Reusable speech-to-text endpoint that VoiceMicButton (and any other
 * hold-to-speak UI) posts to. Wraps the existing OpenAI gpt-4o-mini-transcribe
 * client in server/replit_integrations/audio/client.ts.
 *
 * Request:
 *   POST /api/transcribe
 *   multipart/form-data
 *     audio  (required) — Blob from MediaRecorder (webm/mp4/ogg/wav)
 *
 * Response:
 *   200 { text: string }
 *   400 { error: "audio file required" }
 *   500 { error: string }
 *
 * iOS Safari note: MediaRecorder produces webm on Chrome/Android and mp4
 * (or audio/mp4) on iOS. ensureCompatibleFormat detects the bytes and
 * converts to WAV when needed before sending to the transcription model.
 */

import { Router, type Request, type Response } from "express";
import multer from "multer";
import {
  speechToText,
  ensureCompatibleFormat,
} from "../replit_integrations/audio/client";

const router = Router();

const MAX_AUDIO_MB = 25;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AUDIO_MB * 1024 * 1024 },
});

router.post(
  "/",
  upload.single("audio"),
  async (req: Request, res: Response) => {
    const t0 = Date.now();
    try {
      if (!req.file?.buffer || req.file.buffer.length === 0) {
        return res.status(400).json({ error: "audio file required" });
      }
      // Convert iOS/Safari mp4 (and other non-wav/mp3 formats) to WAV.
      const { buffer, format } = await ensureCompatibleFormat(req.file.buffer);
      const text = await speechToText(buffer, format);
      const ms = Date.now() - t0;
      console.log(
        `[transcribe] ok bytes=${req.file.buffer.length} format=${format} chars=${text.length} ms=${ms}`,
      );
      return res.json({ text });
    } catch (e: any) {
      const ms = Date.now() - t0;
      console.error("[transcribe] failed", { ms, err: e?.message || e });
      return res
        .status(500)
        .json({ error: e?.message || "transcribe failed" });
    }
  },
);

export default router;
