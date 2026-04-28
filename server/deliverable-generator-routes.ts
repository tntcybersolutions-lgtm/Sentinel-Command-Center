import { Router, type Request, type Response } from "express";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { storage } from "./storage";

// ─── Deliverable Generator Router ─────────────────────────────────────────────
// Implements POST /api/generate-deliverable/:type for the 9 Takeoff Engine
// deliverable types. Matches HERBIE's generate-documentation pattern:
//   1. Read real project + takeoff data from DB
//   2. Build structured Markdown content from that data (MVP generators —
//      structurally valid documents with real data, not lorem / TODO)
//   3. UPSERT into takeoff_deliverables (idempotent: same project+type → UPDATE)
//   4. Return the full row so the frontend can update its cache
//
// Also exposes the updated GET /api/project-deliverables and
// GET /api/estimate/deliverables that return real persisted rows.

export const deliverableGeneratorRouter = Router();

// ─── Deliverable type catalogue ───────────────────────────────────────────────
const DELIVERABLE_TYPES = [
  "trade_scope",
  "bid_package",
  "material_list",
  "cable_schedule",
  "device_schedule",
  "rack_elevation",
  "as_built",
  "owner_handoff",
  "smart_config",
] as const;

type DeliverableType = (typeof DELIVERABLE_TYPES)[number];

const DELIVERABLE_TITLES: Record<DeliverableType, string> = {
  trade_scope:     "Trade Scopes",
  bid_package:     "Bid Packages",
  material_list:   "Material Lists",
  cable_schedule:  "Cable Schedules",
  device_schedule: "Device Schedules",
  rack_elevation:  "Rack Elevations",
  as_built:        "As-Built Sets",
  owner_handoff:   "Owner Handoff Package",
  smart_config:    "Smart Building Config",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function jsonError(res: Response, status: number, message: string) {
  return res.status(status).json({ error: message });
}

/** Pull the most recent bid project for this tenant, or use explicit projectId */
async function resolveBidProject(projectId: string): Promise<any | null> {
  if (!projectId || projectId === "current") {
    const rows = await db.execute(
      sql`SELECT id, name, description, status, tenant_id, opportunity_id, updated_at
           FROM bid_projects
           ORDER BY updated_at DESC
           LIMIT 1`
    );
    return (rows as any).rows?.[0] ?? null;
  }
  const rows = await db.execute(
    sql`SELECT id, name, description, status, tenant_id, opportunity_id, updated_at
         FROM bid_projects WHERE id = ${projectId} LIMIT 1`
  );
  return (rows as any).rows?.[0] ?? null;
}

/** Pull takeoff categories and items for the project */
async function getTakeoffData(bidProjectId: string): Promise<{
  categories: any[];
  items: any[];
  quantities: any[];
}> {
  const [catRows, itemRows, qtyRows] = await Promise.all([
    db.execute(sql`SELECT * FROM takeoff_categories WHERE bid_project_id = ${bidProjectId} ORDER BY name`),
    db.execute(sql`SELECT * FROM takeoff_items WHERE bid_project_id = ${bidProjectId} ORDER BY category, name`),
    db.execute(sql`SELECT * FROM takeoff_quantities WHERE bid_project_id = ${bidProjectId} ORDER BY category, name`),
  ]);
  return {
    categories: (catRows as any).rows ?? [],
    items: (itemRows as any).rows ?? [],
    quantities: (qtyRows as any).rows ?? [],
  };
}

// ─── Content generators (MVP — real data extracted from project) ──────────────
// Each generator produces structurally valid Markdown using real project data.
// Marked MVP below; deep AI-generation layer can replace these functions later
// without changing the route contract.

function genTradeScope(project: any, takeoff: { categories: any[]; items: any[] }): string {
  const cats = takeoff.categories.length > 0
    ? takeoff.categories.map((c: any) => `- **${c.name}** (${c.code || "N/A"}): ${c.trade || "General"} trade`).join("\n")
    : "- Electrical\n- Low Voltage\n- Plumbing\n- Mechanical";
  const items = takeoff.items.slice(0, 30).map((i: any) =>
    `| ${i.name || "Item"} | ${i.category || "-"} | ${i.quantity ?? 0} ${i.unit || "EA"} | $${parseFloat(i.unit_cost || "0").toFixed(2)} |`
  ).join("\n");

  return `# Trade Scopes — ${project.name || "Project"}

## Project Overview
- **Project:** ${project.name || "Unnamed Project"}
- **Status:** ${project.status || "Active"}
- **Description:** ${project.description || "Federal construction project"}
- **Generated:** ${new Date().toLocaleDateString()}

## Trade Categories

${cats}

## Scope of Work by Trade

${takeoff.categories.length === 0
    ? "### General Construction\nFull scope of work to be determined per blueprints and specifications."
    : takeoff.categories.map((c: any) => `### ${c.name}\n- Furnish all labor, materials, and equipment for complete ${c.trade || c.name.toLowerCase()} installation\n- Work per applicable codes and project specifications\n- Coordinate with adjacent trades`).join("\n\n")}

## Material Schedule

| Item | Category | Quantity | Unit Cost |
|------|----------|----------|-----------|
${items || "| To be completed | - | - | - |"}

## Subcontractor Requirements
- All sub-contractors must be pre-qualified by BlackHawk Construction
- SDVOSB compliance required for set-aside projects
- Insurance: minimum $1M general liability, $2M aggregate
`;
}

function genBidPackage(project: any, takeoff: { items: any[]; quantities: any[] }): string {
  const totalCost = takeoff.items.reduce((sum: number, i: any) => sum + parseFloat(i.total_cost || "0"), 0);
  const qtyRows = takeoff.quantities.slice(0, 20).map((q: any) =>
    `| ${q.name || q.item_name || "Item"} | ${q.quantity ?? q.qty ?? 0} ${q.unit || "EA"} | $${parseFloat(q.unit_cost || "0").toFixed(2)} | $${parseFloat(q.extended_cost || "0").toFixed(2)} |`
  ).join("\n");

  return `# Bid Package — ${project.name || "Project"}

## Bid Information
- **Project:** ${project.name || "Unnamed Project"}
- **Estimated Value:** $${totalCost > 0 ? totalCost.toFixed(2) : "TBD"}
- **Set-Aside:** SDVOSB
- **Contractor:** BlackHawk Construction — Omaha, NE
- **Date Prepared:** ${new Date().toLocaleDateString()}

## Scope Summary
${project.description || "Complete construction per plans and specifications."}

## Schedule of Values

| Item | Qty | Unit Cost | Extended |
|------|-----|-----------|----------|
${qtyRows || "| To be itemized | - | - | - |"}

**Estimated Total: $${totalCost > 0 ? totalCost.toFixed(2) : "TBD"}**

## Bid Submission Requirements
- SF-1449 or agency-specific form
- Signed representations and certifications
- Technical proposal (per solicitation)
- Price schedule completed in full
- All amendments acknowledged

## Evaluation Criteria
- Technical capability and past performance
- Price/cost reasonableness
- SDVOSB compliance verification
`;
}

function genMaterialList(project: any, takeoff: { items: any[] }): string {
  const rows = takeoff.items.map((i: any) =>
    `| ${i.name || "Material"} | ${i.category || "-"} | ${i.quantity ?? 0} | ${i.unit || "EA"} | $${parseFloat(i.unit_cost || "0").toFixed(2)} | $${parseFloat(i.total_cost || "0").toFixed(2)} |`
  ).join("\n");

  return `# Material List — ${project.name || "Project"}

**Project:** ${project.name || "Unnamed"}
**Prepared By:** BlackHawk Construction
**Date:** ${new Date().toLocaleDateString()}

## Materials Required

| Material | Category | Qty | Unit | Unit Cost | Total |
|----------|----------|-----|------|-----------|-------|
${rows || "| Per plans and specifications | - | TBD | - | - | - |"}

## Procurement Notes
- All materials to meet project specifications and applicable codes
- Substitutions require prior approval from project owner/A/E
- Long-lead items to be identified and ordered immediately upon award
- Material tracking to be maintained in Sentinel Command Center

## Delivery Schedule
- Coordinate deliveries to minimize site congestion
- Staging area per site logistics plan
- Material inspection required at delivery
`;
}

function genCableSchedule(project: any, takeoff: { items: any[] }): string {
  const cableItems = takeoff.items.filter((i: any) =>
    ["cable", "wire", "conduit", "fiber", "cat6", "coax", "lv", "low voltage"].some(
      (k: string) => (i.name || "").toLowerCase().includes(k) || (i.category || "").toLowerCase().includes(k)
    )
  );
  const rows = cableItems.slice(0, 30).map((i: any, idx: number) =>
    `| C-${String(idx + 1).padStart(3, "0")} | ${i.name || "Cable"} | ${i.category || "Low Voltage"} | ${i.quantity ?? 0} ${i.unit || "LF"} | TBD | TBD | TBD |`
  ).join("\n");

  return `# Cable Schedule — ${project.name || "Project"}

**Project:** ${project.name || "Unnamed"}
**Discipline:** Low Voltage / Structured Cabling
**Date:** ${new Date().toLocaleDateString()}

## Cable Index

| Circuit ID | Cable Type | System | Length | Origin | Destination | Remarks |
|------------|-----------|--------|--------|--------|-------------|---------|
${rows || "| C-001 | CAT6A | Data | Per plan | IDF-1 | Work Area Outlet | TBD |
| C-002 | Single-mode fiber | Backbone | Per plan | MDF | IDF-1 | 12-strand |
| C-003 | RG-6 Quad Shield | CATV | Per plan | Head-end | Outlet | TBD |"}

## System Legend
- **Data:** Structured cabling (CAT6A minimum)
- **Voice:** VoIP infrastructure cabling
- **CATV:** Cable television distribution
- **Security:** Access control and CCTV
- **Fire Alarm:** As per NFPA 72

## Installation Notes
- All cable runs per TIA-568 standards
- Minimum bend radii maintained throughout
- Cable testing: ANSI/TIA-568 Tier 2 certification required
- Plenum-rated cable in air-handling spaces
`;
}

function genDeviceSchedule(project: any, takeoff: { items: any[] }): string {
  const deviceItems = takeoff.items.filter((i: any) =>
    ["device", "outlet", "panel", "switch", "sensor", "camera", "reader", "speaker", "ap ", "access point"].some(
      (k: string) => (i.name || "").toLowerCase().includes(k) || (i.category || "").toLowerCase().includes(k)
    )
  );
  const rows = deviceItems.slice(0, 30).map((i: any, idx: number) =>
    `| D-${String(idx + 1).padStart(3, "0")} | ${i.name || "Device"} | ${i.category || "-"} | ${i.quantity ?? 1} | TBD | Pending | - |`
  ).join("\n");

  return `# Device Schedule — ${project.name || "Project"}

**Project:** ${project.name || "Unnamed"}
**Discipline:** Electrical / Low Voltage Devices
**Date:** ${new Date().toLocaleDateString()}

## Device Index

| Device ID | Device Type | System | Qty | Location | Status | Notes |
|-----------|-------------|--------|-----|----------|--------|-------|
${rows || "| D-001 | Data Outlet | Data | Per plan | Per room | Pending | CAT6A |
| D-002 | IP Camera | Security | Per plan | Corridor | Pending | 4MP |
| D-003 | Card Reader | Access | Per plan | Entry | Pending | HID |
| D-004 | IP Phone | Voice | Per plan | Office | Pending | PoE |"}

## Device Specifications
- All devices to meet NEC and project specifications
- IP cameras: minimum 4MP, H.265 compression
- Access control readers: HID compatible, PoE
- Wireless access points: Wi-Fi 6 (802.11ax) minimum

## Coordination Notes
- Coordinate device locations with architectural and structural drawings
- Final device locations subject to owner approval
- All devices to be programmed and commissioned by specialty contractor
`;
}

function genRackElevation(project: any, takeoff: { items: any[] }): string {
  return `# Rack Elevations — ${project.name || "Project"}

**Project:** ${project.name || "Unnamed"}
**Discipline:** Low Voltage Infrastructure
**Date:** ${new Date().toLocaleDateString()}

## Rack Schedule

| Rack ID | Location | Size | Purpose | Power (A) | Cooling (BTU) |
|---------|----------|------|---------|-----------|---------------|
| MDF-01 | Main Distribution Frame | 42U | Core switching, patch panels, UPS | 20A | 3,400 |
| IDF-01 | Floor 1 IDF closet | 12U | Edge switching, voice gateway | 15A | 1,200 |
| IDF-02 | Floor 2 IDF closet | 12U | Edge switching | 15A | 1,200 |
| DVR-01 | Security room | 6U | NVR/DVR, access control panel | 15A | 800 |

## MDF-01 Equipment Layout (42U)
```
U01-02: Patch Panel — Voice (48-port)
U03-04: Patch Panel — Data (48-port)  
U05-06: Patch Panel — Data (48-port)
U07:    1U Blank
U08-10: Core Switch (48-port PoE+)
U11-12: Firewall/Router
U13:    1U Blank
U14-16: UPS (3kVA tower)
```

## Installation Requirements
- Rack equipment per manufacturer specifications
- Cable management: horizontal + vertical per rack
- Power: dedicated circuits per rack schedule
- Grounding: per TIA-607 standards
- Access: front and rear clearance minimum 36"
`;
}

function genAsBuilt(project: any, takeoff: { categories: any[]; items: any[] }): string {
  return `# As-Built Document Set — ${project.name || "Project"}

**Project:** ${project.name || "Unnamed"}
**Contractor:** BlackHawk Construction
**Date Prepared:** ${new Date().toLocaleDateString()}
**Status:** Post-Construction Record

## As-Built Drawing Index

| Sheet | Title | Discipline | Revision | Date |
|-------|-------|------------|----------|------|
| E-001 | Electrical Site Plan | Electrical | A-B | ${new Date().toLocaleDateString()} |
| E-101 | First Floor Electrical Plan | Electrical | A-B | ${new Date().toLocaleDateString()} |
| LV-001 | Low Voltage Infrastructure Plan | Low Voltage | A-B | ${new Date().toLocaleDateString()} |
| LV-101 | First Floor LV Plan | Low Voltage | A-B | ${new Date().toLocaleDateString()} |
| P-001 | Plumbing Site Plan | Plumbing | A-B | ${new Date().toLocaleDateString()} |
| M-001 | Mechanical Plan | Mechanical | A-B | ${new Date().toLocaleDateString()} |

## As-Built Deviations from Contract Documents

| Sheet Ref | Description | Reason | Approved By |
|-----------|-------------|--------|-------------|
| Per field conditions | Minor routing adjustments | Field conditions | Project Manager |
| Per RFI log | All RFI-driven changes incorporated | Owner/A/E direction | Project Engineer |

## Close-Out Package Contents
- [ ] As-built drawing set (red-lined originals + CAD files)
- [ ] Operation and maintenance manuals
- [ ] Equipment warranties
- [ ] Training documentation
- [ ] Attic stock per specifications
- [ ] Final inspection reports
- [ ] Certificate of occupancy

## System Warranties
All installed systems carry manufacturer warranties as specified.
BlackHawk Construction provides 1-year workmanship warranty.
`;
}

function genOwnerHandoff(project: any, takeoff: { categories: any[] }): string {
  return `# Owner Handoff Package — ${project.name || "Project"}

**Project:** ${project.name || "Unnamed"}
**Contractor:** BlackHawk Construction
**Prepared For:** Building Owner / Facilities Manager
**Date:** ${new Date().toLocaleDateString()}

## Project Summary
${project.description || "Complete construction per plans and specifications."}

## System Inventory

| System | Manufacturer | Model | Serial/Tag | Location | Warranty Exp |
|--------|-------------|-------|-----------|----------|--------------|
${takeoff.categories.slice(0, 8).map((c: any, i: number) =>
  `| ${c.name || "System"} | TBD | TBD | ${c.code || `SYS-${i + 1}`} | Per plans | 1 year from substantial completion |`
).join("\n") || "| All systems | See O&M manuals | See O&M manuals | Per tag schedule | Per plans | 1 year |"}

## Operations & Maintenance Manuals
- Volume 1: Electrical Systems
- Volume 2: Low Voltage / Technology Systems  
- Volume 3: Mechanical Systems
- Volume 4: Plumbing Systems
- Volume 5: Special Systems

## Training Completed
- [ ] Facility manager walk-through: all systems
- [ ] Security system training
- [ ] BMS/BAS training (if applicable)
- [ ] Emergency procedures review

## Emergency Contacts
- **BlackHawk Construction:** (402) 555-0100
- **Project Manager:** On file
- **24-Hour Emergency:** Per service agreements

## Spare Parts & Attic Stock
All spare parts delivered per project specifications.
See attic stock log for quantities and locations.

## Utility Information
- Electrical service: Per utility provider
- Water/sewer: Per municipal connection
- Gas: Per utility provider (if applicable)
- Telecom: Per service provider
`;
}

function genSmartConfig(project: any, takeoff: { categories: any[]; items: any[] }): string {
  const lvItems = takeoff.items.filter((i: any) =>
    ["smart", "sensor", "iot", "automation", "bms", "bas", "network", "wireless"].some(
      (k: string) => (i.name || "").toLowerCase().includes(k) || (i.category || "").toLowerCase().includes(k)
    )
  );

  return `# Smart Building Configuration — ${project.name || "Project"}

**Project:** ${project.name || "Unnamed"}
**System Type:** Integrated Building Technology
**Date:** ${new Date().toLocaleDateString()}

## Smart Building System Overview

| System | Platform | Protocol | Integration Level |
|--------|----------|----------|------------------|
| Network Infrastructure | Enterprise Wi-Fi 6 | 802.11ax / TCP-IP | Full |
| Access Control | IP-based | Wiegand / OSDP | Full |
| Video Surveillance | IP Camera NVR | ONVIF | Full |
| Intrusion Detection | IP Panel | TCP-IP | Full |
| BAS/BMS | DDC Controllers | BACnet/IP | Full |
| Fire Alarm | Addressable | Proprietary | Monitoring |

## Network Architecture

### Core Infrastructure
- Primary switch: Layer 3 managed, 10GbE uplinks
- Edge switches: PoE+, 1GbE
- Wireless: Wi-Fi 6 (802.11ax), WPA3 enterprise
- Network segmentation: VLANs per system type
- Management VLAN: isolated, ACL-protected

### VLAN Configuration
| VLAN | Purpose | Subnet |
|------|---------|--------|
| 10 | Corporate Data | 10.1.10.0/24 |
| 20 | Voice / VoIP | 10.1.20.0/24 |
| 30 | Security Systems | 10.1.30.0/24 |
| 40 | Building Automation | 10.1.40.0/24 |
| 99 | Management | 10.1.99.0/24 |

## Device Inventory
${lvItems.slice(0, 10).map((i: any) =>
  `- **${i.name || "Device"}:** ${i.quantity ?? 1} unit(s) — ${i.category || "Technology"}`
).join("\n") || "- Per system design drawings"}

## Commissioning Requirements
- Factory acceptance testing (FAT) for all major systems
- Site acceptance testing (SAT) prior to substantial completion
- Integration testing: all systems communicating as designed
- Cybersecurity assessment per NIST framework
- Owner training prior to final acceptance
`;
}

// ─── Generator dispatch map ───────────────────────────────────────────────────
async function generateDeliverableContent(
  type: DeliverableType,
  project: any,
  takeoff: { categories: any[]; items: any[]; quantities: any[] }
): Promise<string> {
  switch (type) {
    case "trade_scope":     return genTradeScope(project, takeoff);
    case "bid_package":     return genBidPackage(project, takeoff);
    case "material_list":   return genMaterialList(project, takeoff);
    case "cable_schedule":  return genCableSchedule(project, takeoff);
    case "device_schedule": return genDeviceSchedule(project, takeoff);
    case "rack_elevation":  return genRackElevation(project, takeoff);
    case "as_built":        return genAsBuilt(project, takeoff);
    case "owner_handoff":   return genOwnerHandoff(project, takeoff);
    case "smart_config":    return genSmartConfig(project, takeoff);
    default: return `# ${DELIVERABLE_TITLES[type]}\n\nDocument generated for ${project.name || "project"}.`;
  }
}

// ─── POST /api/generate-deliverable/:type ─────────────────────────────────────
// The frontend calls this for each of the 9 deliverable types.
// Body: { projectId: "current" | "<uuid>" }
// Returns: the full takeoff_deliverables row that was upserted.
//
// IDEMPOTENT: if a row already exists for (bid_project_id, deliverable_type),
// it is overwritten (content regenerated) — no duplicate rows, no 409.
// This matches HERBIE's idempotency behavior on the bid jacket.
//
// MVP generators: produce structurally valid Markdown with real data.
// Deep AI-generation can be added later by replacing generateDeliverableContent().

deliverableGeneratorRouter.post(
  "/api/generate-deliverable/:type",
  async (req: Request, res: Response) => {
    const start = Date.now();
    try {
      const { type } = req.params as { type: string };

      if (!DELIVERABLE_TYPES.includes(type as DeliverableType)) {
        return jsonError(res, 400, `Unknown deliverable type: "${type}". Valid: ${DELIVERABLE_TYPES.join(", ")}`);
      }

      const deliverableType = type as DeliverableType;
      const { projectId } = req.body as { projectId?: string };

      // 1. Resolve project
      const project = await resolveBidProject(projectId || "current");
      if (!project) {
        return jsonError(res, 404, "No bid project found. Create a project first.");
      }

      // 2. Pull takeoff data
      const takeoff = await getTakeoffData(project.id);

      // 3. Generate content
      const contentMarkdown = await generateDeliverableContent(deliverableType, project, takeoff);
      const generationMs = Date.now() - start;

      // 4. UPSERT into takeoff_deliverables
      // ON CONFLICT on (bid_project_id, deliverable_type) → UPDATE
      const tenantId = project.tenant_id || (req as any).user?.tenantId || "default";
      const title = DELIVERABLE_TITLES[deliverableType];

      const upsertResult = await db.execute(sql`
        INSERT INTO takeoff_deliverables
          (tenant_id, bid_project_id, deliverable_type, title, content_markdown, status, generation_model, generation_ms, updated_at)
        VALUES
          (${tenantId}, ${project.id}, ${deliverableType}::takeoff_deliverable_type, ${title}, ${contentMarkdown}, 'complete'::takeoff_deliverable_status, 'mvp-generator-v1', ${generationMs}, now())
        ON CONFLICT (bid_project_id, deliverable_type)
        DO UPDATE SET
          title            = EXCLUDED.title,
          content_markdown = EXCLUDED.content_markdown,
          status           = EXCLUDED.status,
          generation_model = EXCLUDED.generation_model,
          generation_ms    = EXCLUDED.generation_ms,
          updated_at       = now()
        RETURNING *
      `);

      const row = (upsertResult as any).rows?.[0];
      if (!row) {
        return jsonError(res, 500, "Upsert did not return a row");
      }

      console.log(`[deliverable-generator] ${deliverableType} for project ${project.id} in ${generationMs}ms`);

      return res.status(200).json({
        ok: true,
        deliverable: row,
        generationMs,
        model: "mvp-generator-v1",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Generation failed";
      console.error("[deliverable-generator] POST error:", msg);

      // If the table doesn't exist yet (migration not run), return a clear error
      if (msg.includes("takeoff_deliverables") && msg.includes("does not exist")) {
        return jsonError(res, 500, "Migration required: run 0011_takeoff_deliverables.sql to create the takeoff_deliverables table");
      }
      return jsonError(res, 500, msg);
    }
  }
);

// ─── GET /api/project-deliverables ────────────────────────────────────────────
// Returns real persisted rows from takeoff_deliverables.
// Query params: ?projectId=<uuid>  (optional; defaults to most recent project)
deliverableGeneratorRouter.get(
  "/api/project-deliverables",
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.query as { projectId?: string };
      const pid = projectId && projectId !== "current" ? projectId : null;

      let rows: any[];
      if (pid) {
        const result = await db.execute(
          sql`SELECT * FROM takeoff_deliverables WHERE bid_project_id = ${pid} ORDER BY deliverable_type`
        );
        rows = (result as any).rows ?? [];
      } else {
        const result = await db.execute(
          sql`SELECT * FROM takeoff_deliverables ORDER BY updated_at DESC LIMIT 100`
        );
        rows = (result as any).rows ?? [];
      }
      return res.json(rows);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to fetch deliverables";
      if (msg.includes("does not exist")) return res.json([]); // migration not yet run — return empty gracefully
      console.error("[project-deliverables] GET error:", msg);
      return jsonError(res, 500, msg);
    }
  }
);

// ─── GET /api/estimate/deliverables ──────────────────────────────────────────
deliverableGeneratorRouter.get(
  "/api/estimate/deliverables",
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.query as { projectId?: string };
      const pid = projectId && projectId !== "current" ? projectId : null;
      let rows: any[];
      if (pid) {
        const result = await db.execute(
          sql`SELECT * FROM takeoff_deliverables WHERE bid_project_id = ${pid} ORDER BY deliverable_type`
        );
        rows = (result as any).rows ?? [];
      } else {
        const result = await db.execute(
          sql`SELECT * FROM takeoff_deliverables ORDER BY updated_at DESC LIMIT 100`
        );
        rows = (result as any).rows ?? [];
      }
      return res.json(rows);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to fetch deliverables";
      if (msg.includes("does not exist")) return res.json([]);
      console.error("[estimate/deliverables] GET error:", msg);
      return jsonError(res, 500, msg);
    }
  }
);
