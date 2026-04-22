import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { HerbieOrchestrator } from "../services/herbie/orchestrator";
import { db } from "../db";
import { bidProjects, opportunities } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import OpenAI from "openai";

const herbieRouter = Router();

const bidChatRequestSchema = z.object({
  bidId: z.string().uuid(),
  userId: z.string().uuid(),
  message: z.string().min(1),
  screenContext: z.string().optional(),
});

const generalChatSchema = z.object({
  message: z.string().min(1),
  conversationId: z.string().optional(),
  history: z.array(z.any()).optional(),
});

const orchestrator = new HerbieOrchestrator();

herbieRouter.post("/chat", async (req: Request, res: Response) => {
  const bidParsed = bidChatRequestSchema.safeParse(req.body);
  if (bidParsed.success) {
    const result = await orchestrator.chat(bidParsed.data);
    return res.json(result);
  }

  const generalParsed = generalChatSchema.safeParse(req.body);
  if (!generalParsed.success) {
    return res.status(400).json({ ok: false, errors: generalParsed.error.flatten().fieldErrors });
  }

  try {
    const { herbieAgent } = await import("../agents/herbie.agent");
    const result = await herbieAgent.process(generalParsed.data.message, generalParsed.data.history || []);
    return res.json({
      message: result.response,
      toolCalls: result.toolCalls,
      conversationId: generalParsed.data.conversationId,
    });
  } catch (error: any) {
    console.error("Error in HERBIE general chat:", error);
    return res.status(500).json({ error: "Failed to process chat message" });
  }
});

async function generateDocumentation(openai: OpenAI, project: any, opp: any): Promise<{ ok: boolean; documentation?: any; error?: string }> {
  const title = opp.title || "Federal Construction Project";
  const setAside = opp.setAside || "Full and Open Competition";
  const naicsCodes = Array.isArray(opp.naicsCodes) ? opp.naicsCodes.join(", ") : (opp.naicsCodes || "236220");
  const contractValue = opp.contractValue ? `$${(Number(opp.contractValue) / 1000000).toFixed(2)}M` : "TBD";
  const description = opp.description || opp.synopsis || "Federal construction project";
  const locationJson = opp.locationJson as any;
  const location = locationJson?.city
    ? `${locationJson.city}, ${locationJson.state || ""}`
    : (typeof locationJson === "string" ? locationJson : "To Be Determined");

  const prompt = `You are HERBIE, the AI proposal specialist for BlackHawk Construction, a premier federal construction contractor. Generate DETAILED, PROFESSIONAL bid documentation following Shipley proposal methodology and federal acquisition best practices.

**OPPORTUNITY DETAILS:**
- **Solicitation Title:** ${title}
- **Set-Aside Status:** ${setAside}
- **Estimated Contract Value:** ${contractValue}
- **NAICS Code(s):** ${naicsCodes}
- **Place of Performance:** ${location}
- **Project Scope:** ${description}

**BLACKHAWK CONSTRUCTION PROFILE:**
- Founded: 1996 by Dave Hueser | Headquarters: Omaha, NE
- Led by Bradley Hueser (President, Marine Corps Veteran), Dave Hueser (VP), Nolan Kosmicki (Chief of Operations), Kathy Hueser (Office Manager)
- SDVOSB (Service-Disabled Veteran-Owned Small Business) certified
- Certifications: ISO 9001:2015, OSHA VPP Star
- Bonding Capacity: $75M single / $150M aggregate
- Active Secret Facility Clearance (FCL)
- Specializes in VA, DoD, and federal agency construction

Generate comprehensive proposal documentation in **Markdown format** with proper headers (##, ###), bullet points, numbered lists, and tables where appropriate. Each section should be 300-500 words with specific details, metrics, and actionable content. Make the content SPECIFIC to this opportunity — reference the project title, scope, agency, and set-aside throughout.

**REQUIRED SECTIONS (respond as JSON with these 8 keys, each containing Markdown-formatted text):**

1. **executiveSummary** - Executive overview including:
   - Opening value proposition specific to this project
   - Key discriminators (3-4 bullet points)
   - Relevant experience summary with metrics
   - Win themes aligned to evaluation criteria
   - Clear call to action

2. **technicalApproach** - Detailed methodology including:
   - Project execution phases with realistic timeline for this scope
   - Quality Management System (QMS) overview
   - Safety program highlights with metrics
   - Technology/tools to be employed
   - Subcontractor management approach
   - Communication and reporting plan

3. **pastPerformance** - Structured reference matrix:
   - 3 relevant contract examples in table format matching this project type
   - For each: Contract name, Agency, Value, Period, CPARS rating
   - Relevancy statements linking past work to this requirement
   - Performance metrics (on-time %, under-budget %, safety record)

4. **keyPersonnel** - Organizational structure:
   - BlackHawk leadership: Bradley Hueser (President), Dave Hueser (VP), Nolan Kosmicki (Chief of Ops), Kathy Hueser (Office Manager)
   - Key personnel table with real roles and relevant certifications
   - Personnel highlights showing relevance to this project
   - Succession planning approach

5. **complianceNotes** - Compliance matrix:
   - FAR/DFARS clause applicability for this project type
   - Set-aside compliance (${setAside})
   - Labor standards (Davis-Bacon, SCA applicability)
   - Environmental compliance
   - Security clearance status
   - Insurance and bonding confirmation

6. **riskAssessment** - Risk register:
   - Table with: Risk ID, Description, Probability, Impact, Mitigation Strategy
   - 5-6 realistic risks SPECIFIC to this project scope
   - Contingency approaches for top risks
   - Risk monitoring process

7. **competitiveAnalysis** - Market positioning:
   - SWOT analysis for this opportunity
   - Competitive landscape for ${setAside} set-aside
   - BlackHawk differentiators with proof points
   - Price-to-win considerations
   - Teaming strategy if applicable

8. **pricingStrategy** - Cost narrative:
   - Pricing methodology for this scope
   - Labor rate competitiveness
   - Cost drivers specific to ${title}
   - Value engineering opportunities
   - Payment milestone approach
   - Cost realism justification

Respond ONLY with a valid JSON object. Each value should be a string containing properly formatted Markdown.`;

  console.log(`[HERBIE] Generating documentation for: ${title} (${project.id})`);

  const response = await openai.responses.create({
    model: "gpt-5.1",
    input: [
      {
        role: "system",
        content: "You are HERBIE, BlackHawk Construction's expert proposal automation AI. Generate professional, Shipley-compliant government proposal content. Always respond with valid JSON containing Markdown-formatted strings. Use real-world construction industry terminology and metrics. Be specific, quantitative, and action-oriented. Reference the actual project details throughout — never produce generic content.",
      },
      { role: "user", content: prompt },
    ],
  });

  const content = response.output_text || "{}";
  let documentation;
  try {
    const cleanContent = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    documentation = JSON.parse(cleanContent);
  } catch {
    return { ok: false, error: "Failed to parse AI response as JSON" };
  }

  const requiredKeys = ["executiveSummary", "technicalApproach", "pastPerformance", "keyPersonnel", "complianceNotes", "riskAssessment", "competitiveAnalysis", "pricingStrategy"];
  const missingKeys = requiredKeys.filter(k => !documentation[k]);
  if (missingKeys.length > 0) {
    return { ok: false, error: `Missing sections: ${missingKeys.join(", ")}` };
  }

  console.log(`[HERBIE] Documentation generated for: ${title}`);
  return { ok: true, documentation };
}

function needsDocs(docJson: any): boolean {
  if (!docJson) return true;
  if (typeof docJson === "object" && docJson.executiveSummary === "") return true;
  if (typeof docJson === "string" && docJson.length < 200) return true;
  return false;
}

herbieRouter.post("/generate-documentation/:projectId", async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const project = await db.select().from(bidProjects).where(sql`${bidProjects.id} = ${projectId}`).then(r => r[0]);
    if (!project) return res.status(404).json({ ok: false, error: "Project not found" });

    const opp = project.opportunityId
      ? await db.select().from(opportunities).where(sql`${opportunities.id} = ${project.opportunityId}`).then(r => r[0])
      : null;
    if (!opp) return res.status(404).json({ ok: false, error: "No linked opportunity" });

    const openai = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });

    const doc = await generateDocumentation(openai, project, opp);
    if (!doc.ok) return res.status(500).json(doc);

    await db.update(bidProjects).set({ documentationJson: doc.documentation, updatedAt: new Date() }).where(sql`${bidProjects.id} = ${projectId}`);
    return res.json({ ok: true, projectId, sections: Object.keys(doc.documentation!) });
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

herbieRouter.post("/generate-all-documentation", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 3, 5);
    const allProjects = await db
      .select({
        id: bidProjects.id,
        opportunityId: bidProjects.opportunityId,
        documentationJson: bidProjects.documentationJson,
      })
      .from(bidProjects);

    const projectsWithoutDocs = allProjects.filter(p => needsDocs(p.documentationJson)).slice(0, limit);

    if (projectsWithoutDocs.length === 0) {
      return res.json({ ok: true, generated: 0, message: "All bid projects already have documentation" });
    }

    const opps = await db.select().from(opportunities);
    const oppMap = new Map(opps.map(o => [o.id, o]));

    const openai = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });

    let generated = 0;
    const errors: string[] = [];

    for (const project of projectsWithoutDocs) {
      const opp = oppMap.get(project.opportunityId || "");
      if (!opp) {
        errors.push(`${project.id}: No opportunity data found`);
        continue;
      }

      try {
        const doc = await generateDocumentation(openai, project, opp);
        if (!doc.ok) {
          errors.push(`${project.id}: ${doc.error}`);
          continue;
        }

        await db.update(bidProjects).set({ documentationJson: doc.documentation, updatedAt: new Date() }).where(eq(bidProjects.id, project.id));
        generated++;
        console.log(`[HERBIE] Batch progress: ${generated}/${projectsWithoutDocs.length}`);
      } catch (err: any) {
        errors.push(`${project.id}: ${err.message}`);
        console.error(`[HERBIE] Failed:`, err.message);
      }
    }

    return res.json({
      ok: true,
      total: projectsWithoutDocs.length,
      generated,
      remaining: allProjects.filter(p => needsDocs(p.documentationJson)).length - generated,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error("[HERBIE] Batch documentation generation failed:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

export { herbieRouter };
