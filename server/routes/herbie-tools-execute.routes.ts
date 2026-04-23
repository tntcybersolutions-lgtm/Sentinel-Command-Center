// HTTP surface for the Herbie tool registry. Lets the client (or the
// existing herbie-command routes) invoke a tool directly without
// going through an LLM loop. The LLM-integrated tool-calling path
// is a separate Feature 6 sub-slice.
//
// POST /api/herbie/tools/execute { tool, args, projectId? }
// GET  /api/herbie/tools/specs   — returns HERBIE_TOOL_SPECS for
//                                  clients that want to render a
//                                  per-tool UI.

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import {
  HERBIE_TOOL_SPECS,
  executeHerbieTool,
} from "../services/herbie-tools";

const router = Router();
const DEFAULT_TENANT_ID = "blackhawk-default";

function tenantOf(req: Request): string {
  return (req as any)?.user?.tenantId || DEFAULT_TENANT_ID;
}
function userOf(req: Request): string {
  return (req as any)?.user?.id || "herbie";
}

const ExecuteSchema = z.object({
  tool: z.string().min(1).max(64),
  args: z.record(z.any()).default({}),
  projectId: z.string().uuid().optional(),
});

router.post("/execute", async (req: Request, res: Response) => {
  const parsed = ExecuteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input", issues: parsed.error.issues });
  }
  try {
    const result = await executeHerbieTool(
      { tool: parsed.data.tool, args: parsed.data.args },
      {
        tenantId: tenantOf(req),
        userId: userOf(req),
        projectId: parsed.data.projectId,
      },
    );
    // Map tool error codes to sensible HTTP status codes.
    if (!result.success) {
      const status =
        result.code === "UNKNOWN_TOOL" || result.code === "BAD_ARGS" ? 400 :
        result.code === "NOT_FOUND" ? 404 :
        result.code === "NOT_IMPLEMENTED" ? 501 :
        500;
      return res.status(status).json(result);
    }
    return res.json(result);
  } catch (error: any) {
    console.error("POST /api/herbie/tools/execute error:", error);
    res.status(500).json({ error: error?.message ?? "Tool execution failed" });
  }
});

router.get("/specs", (_req: Request, res: Response) => {
  res.json({ specs: HERBIE_TOOL_SPECS });
});

export const herbieToolsExecuteRouter = router;
