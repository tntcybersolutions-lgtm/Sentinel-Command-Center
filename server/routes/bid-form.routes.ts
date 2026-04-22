import { Router, Request, Response } from "express";
import { db } from "../db";
import {
  bidForms, bidFormSections, bidFormLineItems,
  bidResponses, bidResponseLineItems,
  bidInvitations, vendors, costCodes, bidProjects,
  type BidForm, type BidFormSection, type BidFormLineItem,
  type BidProject, type Vendor,
} from "@shared/schema";
import { eq, and, asc, desc, sql, type SQL } from "drizzle-orm";

const bidFormRouter = Router();

const DEFAULT_TENANT = "blackhawk-default";

function getTenantId(_req: Request): string {
  return DEFAULT_TENANT;
}

function p(v: string | string[]): string {
  if (Array.isArray(v)) {
    console.warn(`[bid-form] param received as array (${v.length} elements), taking first element: "${v[0]}"`);
    return v[0];
  }
  return v;
}

async function findBidFormById(formId: string): Promise<BidForm | undefined> {
  const rows = await db.select().from(bidForms).where(sql`${bidForms.id} = ${formId}`);
  return rows[0];
}

async function findBidProjectById(projectId: string): Promise<BidProject | undefined> {
  const rows = await db.select().from(bidProjects).where(sql`${bidProjects.id} = ${projectId}`);
  return rows[0];
}

async function findBidFormByProject(tenantId: string, projectId: string): Promise<BidForm | undefined> {
  const rows = await db.select().from(bidForms).where(
    sql`${bidForms.tenantId} = ${tenantId} AND ${bidForms.bidProjectId} = ${projectId}`
  );
  return rows[0];
}

async function findSectionById(sectionId: string): Promise<BidFormSection | undefined> {
  const rows = await db.select().from(bidFormSections).where(sql`${bidFormSections.id} = ${sectionId}`);
  return rows[0];
}

async function findLineItemById(itemId: string): Promise<BidFormLineItem | undefined> {
  const rows = await db.select().from(bidFormLineItems).where(sql`${bidFormLineItems.id} = ${itemId}`);
  return rows[0];
}

function uniqueStrings(arr: (string | null)[]): string[] {
  return Array.from(new Set(arr.filter((x): x is string => x !== null)));
}

bidFormRouter.get("/bid-projects/:projectId/bid-forms", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const projectId = p(req.params.projectId);
    const forms = await db.select().from(bidForms).where(
      sql`${bidForms.tenantId} = ${tenantId} AND ${bidForms.bidProjectId} = ${projectId}`
    ).orderBy(desc(bidForms.createdAt));
    res.json(forms);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

bidFormRouter.post("/bid-projects/:projectId/bid-forms", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const projectId = p(req.params.projectId);

    const bid = await findBidProjectById(projectId);
    if (!bid) {
      return res.status(404).json({ error: "Bid project not found", bidProjectId: projectId });
    }

    const existingForm = await findBidFormByProject(tenantId, projectId);
    if (existingForm) {
      return res.status(409).json({ error: "Bid form already exists", bidFormId: existingForm.id, bidId: projectId });
    }

    const { instructions, allowUnitPricing } = req.body;
    const [form] = await db.insert(bidForms).values({
      tenantId,
      bidProjectId: projectId,
      instructions: instructions || "",
      allowUnitPricing: allowUnitPricing || false,
      status: "draft",
      version: 1,
    } as any).returning();
    console.log(`[BidForm] Created bid form ${form.id} for bid ${projectId} (tenant: ${tenantId})`);
    res.status(201).json(form);
  } catch (err: any) {
    console.error(`[BidForm] Failed to create bid form for project ${req.params.projectId}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

bidFormRouter.put("/bid-forms/:formId", async (req: Request, res: Response) => {
  try {
    const formId = p(req.params.formId);
    const existing = await findBidFormById(formId);
    if (!existing) return res.status(404).json({ error: "Bid form not found", formId });

    const { instructions, allowUnitPricing } = req.body;
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (instructions !== undefined) updates.instructions = instructions;
    if (allowUnitPricing !== undefined) updates.allowUnitPricing = allowUnitPricing;
    const [updated] = await db.update(bidForms).set(updates).where(sql`${bidForms.id} = ${formId}`).returning();
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

bidFormRouter.post("/bid-forms/:formId/publish", async (req: Request, res: Response) => {
  try {
    const formId = p(req.params.formId);
    const form = await findBidFormById(formId);
    if (!form) return res.status(404).json({ error: "Bid form not found" });
    if (form.status === "published") return res.status(400).json({ error: "Already published" });
    const sections = await db.select().from(bidFormSections).where(sql`${bidFormSections.bidFormId} = ${formId}`);
    if (sections.length === 0) return res.status(400).json({ error: "Add at least one section before publishing" });
    const items = await db.select().from(bidFormLineItems).where(
      sql`${bidFormLineItems.bidFormSectionId} IN (SELECT id FROM bid_form_sections WHERE bid_form_id = ${formId})`
    );
    if (items.length === 0) return res.status(400).json({ error: "Add at least one line item before publishing" });
    const [updated] = await db.update(bidForms).set({
      status: "published",
      publishedAt: new Date(),
      updatedAt: new Date(),
    }).where(sql`${bidForms.id} = ${formId}`).returning();
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

bidFormRouter.post("/bid-forms/:formId/close", async (req: Request, res: Response) => {
  try {
    const formId = p(req.params.formId);
    const existing = await findBidFormById(formId);
    if (!existing) return res.status(404).json({ error: "Bid form not found", formId });

    const [updated] = await db.update(bidForms).set({
      status: "closed",
      closedAt: new Date(),
      updatedAt: new Date(),
    }).where(sql`${bidForms.id} = ${formId}`).returning();
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

bidFormRouter.get("/bid-forms/:formId/sections", async (req: Request, res: Response) => {
  try {
    const formId = p(req.params.formId);
    const sections = await db.select().from(bidFormSections)
      .where(sql`${bidFormSections.bidFormId} = ${formId}`)
      .orderBy(asc(bidFormSections.sortOrder));
    res.json(sections);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

bidFormRouter.post("/bid-forms/:formId/sections", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const formId = p(req.params.formId);
    const form = await findBidFormById(formId);
    if (!form) return res.status(404).json({ error: "Bid form not found", formId });

    const { sectionType, title, sortOrder, isRequired } = req.body;
    const [section] = await db.insert(bidFormSections).values({
      tenantId,
      bidFormId: formId,
      sectionType: sectionType || "base",
      title: title || "Base Bid",
      sortOrder: sortOrder ?? 0,
      isRequired: isRequired !== false,
    } as any).returning();
    res.json(section);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

bidFormRouter.put("/bid-form-sections/:sectionId", async (req: Request, res: Response) => {
  try {
    const sectionId = p(req.params.sectionId);
    const existing = await findSectionById(sectionId);
    if (!existing) return res.status(404).json({ error: "Bid form section not found", sectionId });

    const { title, sectionType, sortOrder, isRequired } = req.body;
    const updates: Record<string, any> = {};
    if (title !== undefined) updates.title = title;
    if (sectionType !== undefined) updates.sectionType = sectionType;
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;
    if (isRequired !== undefined) updates.isRequired = isRequired;
    const [updated] = await db.update(bidFormSections).set(updates).where(sql`${bidFormSections.id} = ${sectionId}`).returning();
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

bidFormRouter.delete("/bid-form-sections/:sectionId", async (req: Request, res: Response) => {
  try {
    const sectionId = p(req.params.sectionId);
    const existing = await findSectionById(sectionId);
    if (!existing) return res.status(404).json({ error: "Bid form section not found", sectionId });

    await db.delete(bidFormLineItems).where(sql`${bidFormLineItems.bidFormSectionId} = ${sectionId}`);
    await db.delete(bidFormSections).where(sql`${bidFormSections.id} = ${sectionId}`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

bidFormRouter.get("/bid-form-sections/:sectionId/line-items", async (req: Request, res: Response) => {
  try {
    const sectionId = p(req.params.sectionId);
    const items = await db.select().from(bidFormLineItems)
      .where(sql`${bidFormLineItems.bidFormSectionId} = ${sectionId}`)
      .orderBy(asc(bidFormLineItems.sortOrder));
    res.json(items);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

bidFormRouter.post("/bid-forms/:formId/line-items", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { sectionId, costCodeId, itemCode, description, uom, qty, sortOrder, isRequired } = req.body;
    if (!sectionId) return res.status(400).json({ error: "sectionId is required" });
    if (!description) return res.status(400).json({ error: "description is required" });
    const [item] = await db.insert(bidFormLineItems).values({
      tenantId,
      bidFormSectionId: sectionId,
      costCodeId: costCodeId || null,
      itemCode: itemCode || null,
      description,
      uom: uom || null,
      qty: qty ? String(qty) : null,
      sortOrder: sortOrder ?? 0,
      isRequired: isRequired !== false,
    } as any).returning();
    res.json(item);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

bidFormRouter.put("/bid-form-line-items/:itemId", async (req: Request, res: Response) => {
  try {
    const itemId = p(req.params.itemId);
    const existing = await findLineItemById(itemId);
    if (!existing) return res.status(404).json({ error: "Line item not found", itemId });

    const { costCodeId, itemCode, description, uom, qty, sortOrder, isRequired } = req.body;
    const updates: Record<string, any> = {};
    if (costCodeId !== undefined) updates.costCodeId = costCodeId || null;
    if (itemCode !== undefined) updates.itemCode = itemCode || null;
    if (description !== undefined) updates.description = description;
    if (uom !== undefined) updates.uom = uom || null;
    if (qty !== undefined) updates.qty = qty ? String(qty) : null;
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;
    if (isRequired !== undefined) updates.isRequired = isRequired;
    const [updated] = await db.update(bidFormLineItems).set(updates).where(sql`${bidFormLineItems.id} = ${itemId}`).returning();
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

bidFormRouter.delete("/bid-form-line-items/:itemId", async (req: Request, res: Response) => {
  try {
    const itemId = p(req.params.itemId);
    const existing = await findLineItemById(itemId);
    if (!existing) return res.status(404).json({ error: "Line item not found", itemId });

    await db.delete(bidFormLineItems).where(sql`${bidFormLineItems.id} = ${itemId}`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

bidFormRouter.get("/cost-codes", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const codes = await db.select().from(costCodes)
      .where(sql`${costCodes.tenantId} = ${tenantId} AND ${costCodes.status} = 'active'`)
      .orderBy(asc(costCodes.code));
    res.json(codes);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

bidFormRouter.post("/cost-codes", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { code, name, description, category } = req.body;
    if (!code || !name) return res.status(400).json({ error: "code and name are required" });
    const [cc] = await db.insert(costCodes).values({
      tenantId,
      code,
      name,
      description: description || null,
      category: category || null,
    } as any).returning();
    res.json(cc);
  } catch (err: any) {
    if (err.message?.includes("unique")) {
      return res.status(409).json({ error: "Cost code already exists for this tenant" });
    }
    res.status(500).json({ error: err.message });
  }
});

bidFormRouter.get("/bid-forms/:formId/full", async (req: Request, res: Response) => {
  try {
    const formId = p(req.params.formId);
    const form = await findBidFormById(formId);
    if (!form) return res.status(404).json({ error: "Bid form not found" });
    const sections = await db.select().from(bidFormSections)
      .where(sql`${bidFormSections.bidFormId} = ${formId}`)
      .orderBy(asc(bidFormSections.sortOrder));
    const allItems = await db.select().from(bidFormLineItems)
      .where(sql`${bidFormLineItems.bidFormSectionId} IN (SELECT id FROM bid_form_sections WHERE bid_form_id = ${formId})`)
      .orderBy(asc(bidFormLineItems.sortOrder));
    const allCostCodeIds = uniqueStrings(allItems.map(i => i.costCodeId));
    let costCodeMap: Record<string, any> = {};
    if (allCostCodeIds.length > 0) {
      const codes = await db.select().from(costCodes).where(
        sql`${costCodes.id} IN (${sql.join(allCostCodeIds.map(id => sql`${id}`), sql`, `)})`
      );
      codes.forEach(c => { costCodeMap[c.id] = c; });
    }
    const sectionsWithItems = sections.map(s => ({
      ...s,
      lineItems: allItems.filter(i => i.bidFormSectionId === s.id).map(i => ({
        ...i,
        costCode: i.costCodeId ? costCodeMap[i.costCodeId] || null : null,
      })),
    }));
    res.json({ ...form, sections: sectionsWithItems });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

bidFormRouter.get("/bid-projects/:projectId/leveling", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const projectId = p(req.params.projectId);
    const selectedAlts = (req.query.alternates as string || "").split(",").filter(Boolean);

    const form = await findBidFormByProject(tenantId, projectId);
    if (!form) return res.json({ form: null, vendors: [], sections: [], responses: [], rollups: {} });

    const sections = await db.select().from(bidFormSections)
      .where(sql`${bidFormSections.bidFormId} = ${form.id}`)
      .orderBy(asc(bidFormSections.sortOrder));

    const allItems = await db.select().from(bidFormLineItems)
      .where(sql`${bidFormLineItems.bidFormSectionId} IN (SELECT id FROM bid_form_sections WHERE bid_form_id = ${form.id})`)
      .orderBy(asc(bidFormLineItems.sortOrder));

    const responses = await db.select().from(bidResponses)
      .where(sql`${bidResponses.bidProjectId} = ${projectId} AND ${bidResponses.bidFormId} = ${form.id}`);

    const submittedResponses = responses.filter(r => r.status === "submitted");

    const responseIds = submittedResponses.map(r => r.id);
    let allResponseItems: any[] = [];
    if (responseIds.length > 0) {
      allResponseItems = await db.select().from(bidResponseLineItems)
        .where(sql`${bidResponseLineItems.bidResponseId} IN (${sql.join(responseIds.map(id => sql`${id}`), sql`, `)})`);
    }

    const vendorIds = uniqueStrings(submittedResponses.map(r => r.vendorId));
    let vendorMap: Record<string, any> = {};
    if (vendorIds.length > 0) {
      const vlist = await db.select().from(vendors).where(
        sql`${vendors.id} IN (${sql.join(vendorIds.map(id => sql`${id}`), sql`, `)})`
      );
      vlist.forEach(v => { vendorMap[v.id] = v; });
    }

    const costCodeIds = uniqueStrings(allItems.map(i => i.costCodeId));
    let costCodeMap: Record<string, any> = {};
    if (costCodeIds.length > 0) {
      const codes = await db.select().from(costCodes).where(
        sql`${costCodes.id} IN (${sql.join(costCodeIds.map(id => sql`${id}`), sql`, `)})`
      );
      codes.forEach(c => { costCodeMap[c.id] = c; });
    }

    const baseSectionIds = sections.filter(s => s.sectionType === "base").map(s => s.id);
    const altSections = sections.filter(s => s.sectionType === "alternate");

    const rollups: Record<string, any> = {};
    for (const resp of submittedResponses) {
      const respItems = allResponseItems.filter(ri => ri.bidResponseId === resp.id);
      const itemMap: Record<string, any> = {};
      respItems.forEach(ri => { itemMap[ri.bidFormLineItemId] = ri; });

      let baseTotal = 0;
      const altTotals: Record<string, number> = {};
      const costCodeTotals: Record<string, number> = {};

      for (const item of allItems) {
        const ri = itemMap[item.id];
        const total = ri && ri.included ? Number(ri.totalPrice || 0) : 0;
        const section = sections.find(s => s.id === item.bidFormSectionId);
        if (!section) continue;

        if (baseSectionIds.includes(section.id)) {
          baseTotal += total;
        }
        if (section.sectionType === "alternate") {
          altTotals[section.id] = (altTotals[section.id] || 0) + total;
        }

        if (item.costCodeId) {
          costCodeTotals[item.costCodeId] = (costCodeTotals[item.costCodeId] || 0) + total;
        }
      }

      const selectedAltTotal = altSections
        .filter(s => selectedAlts.includes(s.id))
        .reduce((sum, s) => sum + (altTotals[s.id] || 0), 0);

      rollups[resp.vendorId] = {
        vendorId: resp.vendorId,
        vendorName: vendorMap[resp.vendorId]?.companyName || "Unknown",
        responseId: resp.id,
        status: resp.status,
        submittedAt: resp.submittedAt,
        notes: resp.notes,
        baseTotal,
        altTotals,
        grandTotal: baseTotal + selectedAltTotal,
        costCodeTotals,
        lineItems: itemMap,
      };
    }

    const vendorRollups = Object.values(rollups);
    const lowBid = vendorRollups.length > 0 ? Math.min(...vendorRollups.map((r: any) => r.grandTotal)) : 0;
    vendorRollups.forEach((r: any) => {
      r.varianceFromLow = lowBid > 0 ? ((r.grandTotal - lowBid) / lowBid) * 100 : 0;
    });

    const sectionsWithItems = sections.map(s => ({
      ...s,
      lineItems: allItems.filter(i => i.bidFormSectionId === s.id).map(i => ({
        ...i,
        costCode: i.costCodeId ? costCodeMap[i.costCodeId] || null : null,
      })),
    }));

    res.json({
      form,
      sections: sectionsWithItems,
      vendors: vendorRollups,
      allResponses: responses.map(r => ({
        ...r,
        vendorName: vendorMap[r.vendorId]?.companyName || "Unknown",
      })),
      lowBid,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

bidFormRouter.get("/bid-projects/:projectId/leveling/csv", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const projectId = p(req.params.projectId);
    const selectedAlts = (req.query.alternates as string || "").split(",").filter(Boolean);

    const form = await findBidFormByProject(tenantId, projectId);
    if (!form) return res.status(404).json({ error: "No bid form found" });

    const sections = await db.select().from(bidFormSections)
      .where(sql`${bidFormSections.bidFormId} = ${form.id}`)
      .orderBy(asc(bidFormSections.sortOrder));
    const allItems = await db.select().from(bidFormLineItems)
      .where(sql`${bidFormLineItems.bidFormSectionId} IN (SELECT id FROM bid_form_sections WHERE bid_form_id = ${form.id})`)
      .orderBy(asc(bidFormLineItems.sortOrder));
    const responses = await db.select().from(bidResponses)
      .where(sql`${bidResponses.bidProjectId} = ${projectId} AND ${bidResponses.bidFormId} = ${form.id} AND ${bidResponses.status} = 'submitted'`);

    const responseIds = responses.map(r => r.id);
    let allResponseItems: any[] = [];
    if (responseIds.length > 0) {
      allResponseItems = await db.select().from(bidResponseLineItems)
        .where(sql`${bidResponseLineItems.bidResponseId} IN (${sql.join(responseIds.map(id => sql`${id}`), sql`, `)})`);
    }

    const vendorIds = uniqueStrings(responses.map(r => r.vendorId));
    let vendorMap: Record<string, any> = {};
    if (vendorIds.length > 0) {
      const vlist = await db.select().from(vendors).where(
        sql`${vendors.id} IN (${sql.join(vendorIds.map(id => sql`${id}`), sql`, `)})`
      );
      vlist.forEach(v => { vendorMap[v.id] = v; });
    }

    const costCodeIds = uniqueStrings(allItems.map(i => i.costCodeId));
    let costCodeMap: Record<string, any> = {};
    if (costCodeIds.length > 0) {
      const codes = await db.select().from(costCodes).where(
        sql`${costCodes.id} IN (${sql.join(costCodeIds.map(id => sql`${id}`), sql`, `)})`
      );
      codes.forEach(c => { costCodeMap[c.id] = c; });
    }

    const vendorNames = responses.map(r => vendorMap[r.vendorId]?.companyName || "Unknown");
    const header = ["Section", "Cost Code", "Description", "UOM", "Qty", ...vendorNames];
    const rows: string[][] = [header];

    for (const section of sections) {
      const sectionItems = allItems.filter(i => i.bidFormSectionId === section.id);
      for (const item of sectionItems) {
        const row: string[] = [
          section.title,
          item.costCodeId ? (costCodeMap[item.costCodeId]?.code || "") : "",
          item.description,
          item.uom || "",
          item.qty || "",
        ];
        for (const resp of responses) {
          const ri = allResponseItems.find(
            ri => ri.bidResponseId === resp.id && ri.bidFormLineItemId === item.id
          );
          row.push(ri && ri.included ? (ri.totalPrice || "0") : "0");
        }
        rows.push(row);
      }
      const sectionTotalRow: string[] = [section.title + " Total", "", "", "", ""];
      for (const resp of responses) {
        const total = sectionItems.reduce((sum, item) => {
          const ri = allResponseItems.find(
            ri => ri.bidResponseId === resp.id && ri.bidFormLineItemId === item.id
          );
          return sum + (ri && ri.included ? Number(ri.totalPrice || 0) : 0);
        }, 0);
        sectionTotalRow.push(total.toFixed(2));
      }
      rows.push(sectionTotalRow);
    }

    const grandRow: string[] = ["GRAND TOTAL", "", "", "", ""];
    const baseSectionIds = sections.filter(s => s.sectionType === "base").map(s => s.id);
    const selectedAltIds = sections.filter(s => s.sectionType === "alternate" && selectedAlts.includes(s.id)).map(s => s.id);
    const includedSectionIds = [...baseSectionIds, ...selectedAltIds];
    for (const resp of responses) {
      const total = allItems
        .filter(i => includedSectionIds.includes(i.bidFormSectionId))
        .reduce((sum, item) => {
          const ri = allResponseItems.find(
            ri => ri.bidResponseId === resp.id && ri.bidFormLineItemId === item.id
          );
          return sum + (ri && ri.included ? Number(ri.totalPrice || 0) : 0);
        }, 0);
      grandRow.push(total.toFixed(2));
    }
    rows.push(grandRow);

    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="bid-leveling-${projectId}.csv"`);
    res.send(csv);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export { bidFormRouter };
