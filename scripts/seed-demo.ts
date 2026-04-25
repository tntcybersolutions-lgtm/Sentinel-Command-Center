import { db } from "../server/db";
import {
  projects,
  rfis,
  submittals,
  projectTasks,
  dailyLogs,
  vendors,
  coiCertificates,
  notifications,
  auditEvents,
  approvalRequests,
  agentActivities,
} from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";

const TENANT_ID = "blackhawk-default";
const PROJECT_NUMBER = "MAPLE-001";
const PROJECT_NAME = "Maple Street Office Build-Out";
const VENDOR_NUMBER = "V-ACME-001";
const VENDOR_NAME = "Acme Plumbing";
const DEMO_TAG = "demo-seed:maple-001";

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(9, 0, 0, 0);
  return d;
}

function daysAgo(n: number): Date {
  return daysFromNow(-n);
}

export async function seedDemo() {
  console.log("[seed-demo] Starting demo seed for", PROJECT_NAME);

  let projectId: string;
  const existingProject = await db
    .select()
    .from(projects)
    .where(and(eq(projects.tenantId, TENANT_ID), eq(projects.projectNumber, PROJECT_NUMBER)))
    .limit(1);

  if (existingProject.length > 0) {
    projectId = existingProject[0].id;
    console.log("[seed-demo] Project already exists:", projectId);
  } else {
    const [created] = await db
      .insert(projects)
      .values({
        tenantId: TENANT_ID,
        projectNumber: PROJECT_NUMBER,
        name: PROJECT_NAME,
        description:
          "Tenant build-out of 14,200 sf office space on the second floor. Demolition complete; framing and MEP rough-in in progress.",
        status: "active",
        contractType: "lump_sum",
        contractValue: "1850000.00",
        actualCosts: "612000.00",
        client: "Maple Holdings LLC",
        projectManager: "Pat Dorsey",
        projectType: "commercial",
        startDate: daysAgo(45),
        expectedEndDate: daysFromNow(120),
        completionPercentage: 32,
        addressJson: { line1: "412 Maple Street", city: "Omaha", state: "NE", zip: "68102" },
      })
      .returning();
    projectId = created.id;
    console.log("[seed-demo] Created project:", projectId);
  }

  let vendorId: string;
  const existingVendor = await db
    .select()
    .from(vendors)
    .where(and(eq(vendors.tenantId, TENANT_ID), eq(vendors.vendorNumber, VENDOR_NUMBER)))
    .limit(1);

  if (existingVendor.length > 0) {
    vendorId = existingVendor[0].id;
  } else {
    const [vendor] = await db
      .insert(vendors)
      .values({
        tenantId: TENANT_ID,
        vendorNumber: VENDOR_NUMBER,
        companyName: VENDOR_NAME,
        vendorType: "subcontractor",
        status: "active",
        contactName: "Mike Acme",
        email: "mike@acmeplumbing.example",
        phone: "402-555-0102",
        categoriesJson: ["plumbing", "medical_gas"],
      })
      .returning();
    vendorId = vendor.id;
  }
  console.log("[seed-demo] Vendor:", vendorId);

  // COI: upsert keyed on (tenantId, projectId, vendorId, policyType) so reruns
  // refresh expiry to keep it ~10 days out (demo invariant).
  const coiExpiry = daysFromNow(10);
  const coiValues = {
    tenantId: TENANT_ID,
    projectId,
    vendorId,
    policyType: "gl",
    carrier: "Hartford",
    policyNumber: "HTF-2026-44128",
    limitsJson: { each_occurrence: 1000000, aggregate: 2000000, waiver_of_subrogation: true },
    effectiveDate: daysAgo(355),
    expiryDate: coiExpiry,
    status: "active" as const,
    notes: "GL policy nearing expiry — Herbie flagged for renewal.",
  };
  await db
    .insert(coiCertificates)
    .values(coiValues)
    .onConflictDoUpdate({
      target: [
        coiCertificates.tenantId,
        coiCertificates.projectId,
        coiCertificates.vendorId,
        coiCertificates.policyType,
      ],
      set: {
        carrier: coiValues.carrier,
        policyNumber: coiValues.policyNumber,
        limitsJson: coiValues.limitsJson,
        effectiveDate: coiValues.effectiveDate,
        expiryDate: coiValues.expiryDate,
        status: coiValues.status,
        notes: coiValues.notes,
        updatedAt: new Date(),
      },
    });
  console.log("[seed-demo] COI upserted for", VENDOR_NAME, "(expires", coiExpiry.toDateString() + ")");

  const rfiSeeds = [
    {
      number: "RFI-001",
      subject: "Concrete spec discrepancy — section 03 30 00",
      question:
        "Drawing S2.1 calls out 4000 psi mix at column line C, but spec section 03 30 00 lists 3000 psi. Which controls?",
      priority: "high",
      status: "open",
      ageDays: 4,
    },
    {
      number: "RFI-002",
      subject: "Ceiling grid layout in lobby",
      question: "Reflected ceiling plan shows 2x2 grid; finish schedule references 2x4. Please clarify.",
      priority: "normal",
      status: "open",
      ageDays: 7,
    },
    {
      number: "RFI-003",
      subject: "Door hardware — suite 210",
      question: "Hardware set H-3 references electric strike; access control package not awarded. Hold or proceed?",
      priority: "normal",
      status: "open",
      ageDays: 2,
    },
  ];

  for (const r of rfiSeeds) {
    const exists = await db
      .select()
      .from(rfis)
      .where(and(eq(rfis.projectId, projectId), eq(rfis.rfiNumber, r.number)))
      .limit(1);
    if (exists.length === 0) {
      await db.insert(rfis).values({
        tenantId: TENANT_ID,
        projectId,
        rfiNumber: r.number,
        subject: r.subject,
        question: r.question,
        status: r.status,
        priority: r.priority,
        submittedAt: daysAgo(r.ageDays),
        dueDate: daysFromNow(7 - r.ageDays),
      });
    }
  }
  console.log("[seed-demo] RFIs ensured:", rfiSeeds.length);

  const submittalSeeds = [
    {
      number: "SUB-001",
      name: "Storefront Glazing — manufacturer cut sheets",
      type: "product_data",
      contractor: "Cornhusker Glass",
      ageDays: 5,
    },
    {
      number: "SUB-002",
      name: "VAV Boxes — shop drawings",
      type: "shop_drawing",
      contractor: "Midwest Mechanical",
      ageDays: 3,
    },
  ];

  for (const s of submittalSeeds) {
    const exists = await db
      .select()
      .from(submittals)
      .where(and(eq(submittals.projectId, projectId), eq(submittals.submittalNumber, s.number)))
      .limit(1);
    if (exists.length === 0) {
      await db.insert(submittals).values({
        tenantId: TENANT_ID,
        projectId,
        submittalNumber: s.number,
        name: s.name,
        status: "pending",
        priority: "medium",
        submittalType: s.type,
        contractorName: s.contractor,
        submittedAt: daysAgo(s.ageDays),
      });
    }
  }
  console.log("[seed-demo] Submittals ensured:", submittalSeeds.length);

  const taskSeeds = [
    { name: "Confirm structural steel delivery date", dueOffset: -3, priority: "high" },
    { name: "Submit pay app #2 to owner", dueOffset: -1, priority: "high" },
    { name: "Schedule fire-stopping inspection (3rd floor)", dueOffset: 2, priority: "medium" },
    { name: "Walk site with electrical foreman re: panel relocation", dueOffset: 5, priority: "medium" },
  ];

  for (const t of taskSeeds) {
    const exists = await db
      .select()
      .from(projectTasks)
      .where(and(eq(projectTasks.projectId, projectId), eq(projectTasks.name, t.name)))
      .limit(1);
    if (exists.length === 0) {
      await db.insert(projectTasks).values({
        tenantId: TENANT_ID,
        projectId,
        name: t.name,
        status: t.dueOffset < 0 ? "in_progress" : "not_started",
        priority: t.priority,
        dueDate: daysFromNow(t.dueOffset),
        source: "manual",
      });
    }
  }
  console.log("[seed-demo] Tasks ensured:", taskSeeds.length);

  // Daily logs: delete prior demo logs (tagged via notes prefix) so reruns
  // on later days slide the window forward and the dataset stays fixed-size.
  await db
    .delete(dailyLogs)
    .where(
      and(
        eq(dailyLogs.tenantId, TENANT_ID),
        eq(dailyLogs.projectId, projectId),
        sql`${dailyLogs.notes} LIKE ${"[" + DEMO_TAG + "]%"}`,
      ),
    );

  const logSeeds = [
    { ageDays: 1, weather: "Clear, 48F", source: "voice", note: "Voice memo — foreman recorded daily log on phone." },
    { ageDays: 2, weather: "Overcast, 41F", source: "manual", note: "Standard log entry." },
    { ageDays: 3, weather: "Rain AM / Clear PM, 39F", source: "manual", note: "Half-day delay due to weather." },
    { ageDays: 4, weather: "Clear, 46F", source: "manual", note: "Full crew on site." },
    { ageDays: 5, weather: "Partly Cloudy, 44F", source: "manual", note: "Inspection passed for fire-stopping floor 2." },
  ];

  for (const log of logSeeds) {
    await db.insert(dailyLogs).values({
      tenantId: TENANT_ID,
      projectId,
      logDate: daysAgo(log.ageDays),
      weatherJson: { conditions: log.weather },
      workPerformedJson: ["Framing 3rd floor west wing", "MEP rough-in zones 2 and 3"],
      laborJson: { crews: 4, totalHours: 32 },
      status: "submitted",
      source: log.source,
      notes: `[${DEMO_TAG}] ${log.note}`,
    }).onConflictDoNothing();
  }
  console.log("[seed-demo] Daily logs reseeded:", logSeeds.length);

  // Notification + approval: upsert by tag in title/contextJson so reruns
  // refresh the message text (which references the rolling expiry date).
  const notifTitle = "Acme Plumbing GL COI expires in 10 days";
  await db
    .delete(notifications)
    .where(and(eq(notifications.tenantId, TENANT_ID), eq(notifications.title, notifTitle)));

  await db.insert(notifications).values({
    tenantId: TENANT_ID,
    type: "coi_expiry_warning",
    title: notifTitle,
    message: `Herbie drafted a renewal email. COI expires ${coiExpiry.toDateString()}. Review in the approval queue.`,
    entityType: "project",
    entityId: projectId,
    priority: "high",
    actionUrl: "/approvals",
  });

  await db
    .delete(approvalRequests)
    .where(
      and(
        eq(approvalRequests.tenantId, TENANT_ID),
        eq(approvalRequests.entityId, vendorId),
        eq(approvalRequests.actionType, "draft_coi_renewal"),
      ),
    );

  await db.insert(approvalRequests).values({
    tenantId: TENANT_ID,
    entityType: "vendor",
    entityId: vendorId,
    actionType: "draft_coi_renewal",
    status: "pending",
    priority: "high",
    contextJson: {
      ref: DEMO_TAG,
      recipient: "mike@acmeplumbing.example",
      subject: `COI Renewal — ${VENDOR_NAME} (expires ${coiExpiry.toDateString()})`,
      bodyDraft: `Hi Mike,\n\nYour General Liability policy on file (Hartford HTF-2026-44128) expires on ${coiExpiry.toDateString()} (10 days). Please send an updated COI naming Maple Holdings LLC and BlackHawk Construction as additional insureds before the expiration date.\n\nThanks,\nPat Dorsey\nMaple Street Office Build-Out`,
      projectId,
    },
  });
  console.log("[seed-demo] Notification + approval refreshed");

  // Recent activity: cockpit reads agent_activities (recentAgentReports), so
  // seed those alongside audit_events. Wipe-and-reseed to keep the timeline
  // anchored to "now" on each rerun.
  // Cockpit's recentAgentReports filters agentActivities by actionType="report",
  // so all demo activity rows use that actionType to be visible in the UI.
  const agentActivitySeeds = [
    {
      ageMin: 6,
      agentName: "herbie",
      description: "Extracted COI fields: Acme Plumbing GL (Hartford, HTF-2026-44128). Confidence 0.94.",
      status: "success",
      durationMs: 1820,
    },
    {
      ageMin: 14,
      agentName: "herbie",
      description: "Drafted COI renewal email for Acme Plumbing — landed in approval queue.",
      status: "success",
      durationMs: 2104,
    },
    {
      ageMin: 32,
      agentName: "herbie",
      description: "Classified Contract.pdf → contract; primary parties identified.",
      status: "success",
      durationMs: 3290,
    },
    {
      ageMin: 110,
      agentName: "herbie",
      description: "Transcribed 47-second voice memo and structured into daily log draft.",
      status: "success",
      durationMs: 4870,
    },
  ];

  await db
    .delete(agentActivities)
    .where(
      and(
        eq(agentActivities.tenantId, TENANT_ID),
        eq(agentActivities.entityType, "project"),
        eq(agentActivities.entityId, projectId),
      ),
    );

  for (const ev of agentActivitySeeds) {
    await db.insert(agentActivities).values({
      tenantId: TENANT_ID,
      agentName: ev.agentName,
      actionType: "report",
      entityType: "project",
      entityId: projectId,
      description: ev.description,
      status: ev.status,
      durationMs: ev.durationMs,
      createdAt: new Date(Date.now() - ev.ageMin * 60_000),
    });
  }
  console.log("[seed-demo] Agent activities reseeded:", agentActivitySeeds.length);

  // Audit events: also wipe-and-reseed for the same drift reason.
  const auditSeeds = [
    { ageMin: 5, action: "extracted_fields", entityType: "document", note: "COI parsed: Acme Plumbing GL" },
    { ageMin: 12, action: "drafted_message", entityType: "vendor", note: "Renewal email drafted for Acme Plumbing" },
    { ageMin: 28, action: "uploaded", entityType: "document", note: "Contract.pdf uploaded by Pat Dorsey" },
    { ageMin: 47, action: "created", entityType: "rfi", note: "RFI-001 opened: concrete spec discrepancy" },
    { ageMin: 95, action: "submitted", entityType: "daily_log", note: "Voice memo daily log submitted by foreman" },
  ];

  await db
    .delete(auditEvents)
    .where(
      and(
        eq(auditEvents.tenantId, TENANT_ID),
        eq(auditEvents.entityId, projectId),
        eq(auditEvents.actorType, "agent"),
      ),
    );

  for (const ev of auditSeeds) {
    await db.insert(auditEvents).values({
      tenantId: TENANT_ID,
      eventType: ev.action,
      actor: "herbie",
      actorType: "agent",
      entityType: ev.entityType,
      entityId: projectId,
      action: ev.action,
      metaJson: { note: ev.note, demoTag: DEMO_TAG },
      createdAt: new Date(Date.now() - ev.ageMin * 60_000),
    });
  }
  console.log("[seed-demo] Audit events reseeded:", auditSeeds.length);

  return {
    projectId,
    projectNumber: PROJECT_NUMBER,
    projectName: PROJECT_NAME,
    vendorId,
    coiExpiresAt: coiExpiry.toISOString(),
    counts: {
      rfis: rfiSeeds.length,
      submittals: submittalSeeds.length,
      tasks: taskSeeds.length,
      dailyLogs: logSeeds.length,
      coiCertificates: 1,
      notifications: 1,
      approvals: 1,
      agentActivities: agentActivitySeeds.length,
      auditEvents: auditSeeds.length,
    },
  };
}

const isMain = import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("seed-demo.ts");

if (isMain) {
  seedDemo()
    .then((result) => {
      console.log("[seed-demo] DONE:", JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error("[seed-demo] FAILED:", err);
      process.exit(1);
    });
}
