import { Router, Request, Response } from "express";
import { z } from "zod";
import {
  createAward,
  getAward,
  rescindAward,
  regeneratePacket,
  getPacketPdfBytes,
} from "../services/award.service";

const awardRouter = Router();

const awardBodySchema = z.object({
  winningBidResponseId: z.string().min(1, "winningBidResponseId is required"),
  selectedAlternateIds: z.array(z.string()).optional().default([]),
  notes: z.string().optional(),
  adminOverride: z.boolean().optional(),
});

const rescindBodySchema = z.object({
  reason: z.string().optional(),
});

awardRouter.post("/bid-projects/:projectId/award", async (req: Request, res: Response) => {
  try {
    const projectId = req.params.projectId as string;
    const parsed = awardBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid request body" });
    }

    const { winningBidResponseId, selectedAlternateIds, notes, adminOverride } = parsed.data;

    const result = await createAward({
      bidProjectId: projectId,
      winningBidResponseId,
      selectedAlternateIds: selectedAlternateIds || [],
      notes,
      adminOverride,
    });

    res.json({
      award: result.award,
      packet: {
        id: result.packet.id,
        version: result.packet.version,
        storageKey: result.packet.storageKey,
      },
    });
  } catch (err: any) {
    const status = err.message.includes("already has an active") ? 409
      : err.message.includes("not found") ? 404
      : err.message.includes("Only submitted") ? 400
      : 500;
    res.status(status).json({ error: err.message });
  }
});

awardRouter.get("/bid-projects/:projectId/award", async (req: Request, res: Response) => {
  try {
    const projectId = req.params.projectId as string;
    const result = await getAward(projectId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

awardRouter.post("/bid-projects/:projectId/award/rescind", async (req: Request, res: Response) => {
  try {
    const projectId = req.params.projectId as string;
    const parsed = rescindBodySchema.safeParse(req.body);
    const reason = parsed.success ? (parsed.data.reason || "No reason provided") : "No reason provided";
    const award = await rescindAward(projectId, reason);
    res.json({ success: true, award });
  } catch (err: any) {
    const status = err.message.includes("No active") ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
});

awardRouter.post("/bid-projects/:projectId/award/packet/regenerate", async (req: Request, res: Response) => {
  try {
    const projectId = req.params.projectId as string;
    const packet = await regeneratePacket(projectId);
    res.json({
      id: packet.id,
      version: packet.version,
      storageKey: packet.storageKey,
    });
  } catch (err: any) {
    const status = err.message.includes("No active") ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
});

awardRouter.get("/bid-projects/:projectId/award/packet/download", async (req: Request, res: Response) => {
  try {
    const projectId = req.params.projectId as string;
    const packetId = req.query.packetId as string | undefined;
    const pdfBytes = await getPacketPdfBytes(projectId, packetId);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="award-packet-${projectId}.pdf"`);
    res.send(Buffer.from(pdfBytes));
  } catch (err: any) {
    const status = err.message.includes("not found") || err.message.includes("No active") ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
});

export { awardRouter };
