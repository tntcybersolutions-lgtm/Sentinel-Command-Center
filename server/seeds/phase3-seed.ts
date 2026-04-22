import { db } from "../db";
import { dailyLogs, rfis, submittals, changeOrders } from "@shared/schema";
import { sql } from "drizzle-orm";

const TENANT_ID = "blackhawk-default";

const TARGET_PROJECTS = [
  { id: "550b90e6-dcbf-4602-8c70-c4799beaaeb9", name: "Dock Elevator Installation at Offutt AFB" },
  { id: "77c17e10-feb8-4dab-9ebb-5d294f0b88c6", name: "Underwood Hills HVAC & Intercom Upgrades" },
  { id: "41114203-dcb3-49f0-b4a6-cfb23dfc1d92", name: "UP Museum Windows & Doors" },
  { id: "bbc65447-0038-4927-ad66-330f3927dceb", name: "Sioux City Mat Lab HVAC Updates" },
  { id: "958ad51a-9fa9-49bd-96dc-758fd9342ca0", name: "100 Ton Portable Chiller" },
  { id: "6b26f81f-49e2-4078-86a1-cfe3a81315f5", name: "TO2 - Medical Gas Maintenance Services" },
];

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(7, 0, 0, 0);
  return d;
}

const WEATHER_OPTIONS = [
  { conditions: "Clear", temp: 42, wind: "NW 8mph", humidity: 35 },
  { conditions: "Partly Cloudy", temp: 38, wind: "S 12mph", humidity: 45 },
  { conditions: "Overcast", temp: 34, wind: "W 15mph", humidity: 55 },
  { conditions: "Light Rain", temp: 40, wind: "SE 10mph", humidity: 72 },
  { conditions: "Snow Flurries", temp: 28, wind: "N 18mph", humidity: 60 },
  { conditions: "Foggy", temp: 36, wind: "Calm", humidity: 88 },
  { conditions: "Clear/Cold", temp: 22, wind: "NW 20mph", humidity: 30 },
];

const WORK_ACTIVITIES = [
  ["Installed ductwork runs on 2nd floor west wing", "Connected VAV boxes to main trunk line", "Ran condensate drains to floor drains"],
  ["Framed partition walls in rooms 201-205", "Hung drywall on east corridor", "Taped and mudded first coat on south wing"],
  ["Pulled wire for lighting circuits 3rd floor", "Installed panel board PB-3A", "Terminated 20A receptacle circuits rooms 301-310"],
  ["Set structural steel columns grid lines D-F", "Welded beam connections W14x22 at 2nd floor", "Installed metal decking bays 4-8"],
  ["Poured concrete slab section C (42 CY)", "Finished and cured overnight with blankets", "Stripped forms on section A-2"],
  ["Installed roofing membrane sections 4-6", "Applied flashing at parapet walls", "Set roof curbs for RTU-3 and RTU-4"],
  ["Ran medical gas copper lines 2nd floor ICU", "Pressure tested Zone 3 oxygen lines at 150 PSI", "Installed gas outlet boxes rooms 220-228"],
  ["Set elevator cab and counterweight in shaft 2", "Aligned guide rails and checked plumb", "Installed door operators at floors 1-3"],
  ["Installed fire sprinkler mains in mechanical room", "Ran branch lines corridor B", "Tested backflow preventer assembly"],
  ["Replaced HVAC bard unit on roof", "Connected refrigerant lines and charged system", "Commissioned thermostat controls"],
];

const LABOR_ENTRIES = [
  { crews: 3, trades: ["HVAC", "Pipefitter"], totalHours: 24, overtimeHours: 2 },
  { crews: 4, trades: ["Carpenter", "Drywall"], totalHours: 32, overtimeHours: 4 },
  { crews: 2, trades: ["Electrician"], totalHours: 16, overtimeHours: 0 },
  { crews: 5, trades: ["Ironworker", "Welder"], totalHours: 40, overtimeHours: 6 },
  { crews: 3, trades: ["Concrete", "Laborer"], totalHours: 30, overtimeHours: 8 },
  { crews: 2, trades: ["Roofer", "Sheet Metal"], totalHours: 16, overtimeHours: 0 },
  { crews: 3, trades: ["Plumber", "Medical Gas"], totalHours: 24, overtimeHours: 3 },
  { crews: 2, trades: ["Elevator Mechanic"], totalHours: 20, overtimeHours: 4 },
];

const EQUIPMENT_ENTRIES = [
  ["Scissor lift #12", "Pipe threader", "Oxy-acetylene torch setup"],
  ["Table saw", "Screw gun (4)", "Drywall lift"],
  ["Wire puller", "Conduit bender 1-1/4\"", "Megger tester"],
  ["Crane 30-ton (rented)", "Welding machine Lincoln 400"],
  ["Concrete pump truck", "Vibrator (3)", "Power trowel"],
  ["Forklift CAT 6K", "Boom lift JLG 60ft"],
];

const ISSUES = [
  ["RFI #14 response still pending from A/E — blocking ductwork routing at column line 6"],
  ["Material delivery delayed: elevator door frames backordered 2 weeks from manufacturer"],
  ["Owner requested design change to room 204 layout — awaiting formal CO direction"],
  ["Subcontractor (drywall) short-staffed, sent 2 of 4 committed crew members"],
  ["Weather delay — site too wet for concrete pour, rescheduled to tomorrow"],
  ["Safety incident: near-miss, falling tool from 2nd floor scaffold. Corrective action implemented."],
  ["Discovered unforeseen underground utility conflict at grid line B-3, need survey"],
  ["GFE (government furnished equipment) not delivered to site as scheduled"],
  [],
  [],
];

const SAFETY_NOTES = [
  "Toolbox talk: fall protection requirements for scaffold work above 6 feet",
  "JHA reviewed for hot work permit — fire watch assigned for welding operations",
  "New employee orientation completed for 2 subs (electrical, plumbing)",
  "Weekly safety inspection completed — no findings",
  "Confined space entry permit issued for mechanical room B",
  "Toolbox talk: silica dust exposure control for concrete cutting",
  "Heat stress protocol reviewed — water stations established",
  "Crane lift plan reviewed and approved by site safety officer",
  null,
  null,
];

export async function seedPhase3Data(): Promise<{ dailyLogs: number; rfis: number; submittals: number; changeOrders: number }> {
  const existing = await db.execute(sql`SELECT COUNT(*) as c FROM daily_logs WHERE tenant_id = ${TENANT_ID}`);
  const existingCount = Number((existing as any).rows?.[0]?.c || 0);
  if (existingCount >= 25) {
    return { dailyLogs: 0, rfis: 0, submittals: 0, changeOrders: 0 };
  }

  const dailyLogRows: Array<typeof dailyLogs.$inferInsert> = [];
  for (let dayOffset = 1; dayOffset <= 14; dayOffset++) {
    const logDate = daysAgo(dayOffset);
    if (logDate.getDay() === 0 || logDate.getDay() === 6) continue;

    const projectsForDay = TARGET_PROJECTS.slice(0, dayOffset <= 7 ? 5 : 3);
    for (const proj of projectsForDay) {
      const wi = (dayOffset + TARGET_PROJECTS.indexOf(proj)) % WORK_ACTIVITIES.length;
      const li = (dayOffset + TARGET_PROJECTS.indexOf(proj)) % LABOR_ENTRIES.length;
      const ei = (dayOffset + TARGET_PROJECTS.indexOf(proj)) % EQUIPMENT_ENTRIES.length;
      const ii = (dayOffset + TARGET_PROJECTS.indexOf(proj)) % ISSUES.length;
      const si = (dayOffset + TARGET_PROJECTS.indexOf(proj)) % SAFETY_NOTES.length;
      const weatherIdx = (dayOffset + TARGET_PROJECTS.indexOf(proj)) % WEATHER_OPTIONS.length;

      dailyLogRows.push({
        tenantId: TENANT_ID,
        projectId: proj.id,
        logDate,
        status: "submitted",
        weatherJson: WEATHER_OPTIONS[weatherIdx],
        workPerformedJson: WORK_ACTIVITIES[wi],
        laborJson: LABOR_ENTRIES[li],
        equipmentJson: EQUIPMENT_ENTRIES[ei],
        issuesJson: ISSUES[ii].length > 0 ? ISSUES[ii] : null,
        safetyNotesJson: SAFETY_NOTES[si] ? { note: SAFETY_NOTES[si] } : null,
      });
    }
  }

  if (dailyLogRows.length > 0) {
    await db.insert(dailyLogs).values(dailyLogRows);
  }

  const rfiRows: Array<typeof rfis.$inferInsert> = [
    { tenantId: TENANT_ID, projectId: TARGET_PROJECTS[0].id, rfiNumber: "RFI-101", subject: "Clarify elevator pit waterproofing detail at shaft 2", question: "Drawing A-301 shows waterproofing membrane but no drainage detail. Please clarify.", status: "open", priority: "urgent", createdAt: daysAgo(25) },
    { tenantId: TENANT_ID, projectId: TARGET_PROJECTS[0].id, rfiNumber: "RFI-102", subject: "Confirm structural loading for dock leveler pad", question: "Structural calcs show 250 PSF but dock leveler spec requires 350 PSF support. Please confirm.", status: "open", priority: "urgent", createdAt: daysAgo(22) },
    { tenantId: TENANT_ID, projectId: TARGET_PROJECTS[1].id, rfiNumber: "RFI-201", subject: "HVAC duct routing conflict at column line 6", question: "Ductwork cannot clear structural beam at grid 6-C as shown on M-201. Propose routing below beam — need approval.", status: "submitted", priority: "high", createdAt: daysAgo(18) },
    { tenantId: TENANT_ID, projectId: TARGET_PROJECTS[1].id, rfiNumber: "RFI-202", subject: "Intercom speaker model substitution", question: "Specified model Atlas IED discontinued. Proposed substitution: Bogen?"  , status: "open", priority: "normal", createdAt: daysAgo(16) },
    { tenantId: TENANT_ID, projectId: TARGET_PROJECTS[2].id, rfiNumber: "RFI-301", subject: "Window frame finish color confirmation", question: "Specs call for 'Dark Bronze' but owner mentioned preference for 'Black'. Please confirm.", status: "open", priority: "normal", createdAt: daysAgo(15) },
    { tenantId: TENANT_ID, projectId: TARGET_PROJECTS[2].id, rfiNumber: "RFI-302", subject: "Door hardware schedule missing for entries 14-18", question: "Hardware schedule on sheet A-801 does not include entries 14-18. Please provide.", status: "submitted", priority: "high", createdAt: daysAgo(21) },
    { tenantId: TENANT_ID, projectId: TARGET_PROJECTS[3].id, rfiNumber: "RFI-401", subject: "Mat lab exhaust fan CFM discrepancy", question: "Mechanical schedule shows 2000 CFM but energy model requires 1500 CFM. Which governs?", status: "open", priority: "high", createdAt: daysAgo(12) },
    { tenantId: TENANT_ID, projectId: TARGET_PROJECTS[4].id, rfiNumber: "RFI-501", subject: "Chiller pad foundation reinforcement", question: "Geotech report recommends additional rebar in chiller pad. Structural to confirm detail.", status: "submitted", priority: "urgent", createdAt: daysAgo(5) },
    { tenantId: TENANT_ID, projectId: TARGET_PROJECTS[5].id, rfiNumber: "RFI-601", subject: "Medical gas outlet height in ICU rooms", question: "Standard height is 60\" AFF but VA design guide says 54\". Which standard applies?", status: "open", priority: "urgent", createdAt: daysAgo(19) },
    { tenantId: TENANT_ID, projectId: TARGET_PROJECTS[5].id, rfiNumber: "RFI-602", subject: "Zone valve location for oxygen system", question: "Zone valve box shown in corridor wall but code requires accessible location. Confirm relocation.", status: "submitted", priority: "high", createdAt: daysAgo(3) },
  ];

  await db.insert(rfis).values(rfiRows);

  const submittalRows: Array<typeof submittals.$inferInsert> = [
    { tenantId: TENANT_ID, projectId: TARGET_PROJECTS[0].id, submittalNumber: "SUB-101", name: "Elevator cab finish samples and shop drawings", status: "rejected", revision: 2, createdAt: daysAgo(30), submittedAt: daysAgo(28) },
    { tenantId: TENANT_ID, projectId: TARGET_PROJECTS[0].id, submittalNumber: "SUB-102", name: "Dock leveler hydraulic unit specifications", status: "rejected", revision: 3, createdAt: daysAgo(35), submittedAt: daysAgo(33) },
    { tenantId: TENANT_ID, projectId: TARGET_PROJECTS[1].id, submittalNumber: "SUB-201", name: "RTU-4 rooftop unit performance data", status: "submitted", revision: 0, createdAt: daysAgo(20), submittedAt: daysAgo(18) },
    { tenantId: TENANT_ID, projectId: TARGET_PROJECTS[2].id, submittalNumber: "SUB-301", name: "Aluminum window frame shop drawings", status: "submitted", revision: 0, createdAt: daysAgo(17), submittedAt: daysAgo(15) },
    { tenantId: TENANT_ID, projectId: TARGET_PROJECTS[5].id, submittalNumber: "SUB-601", name: "Medical gas copper tube certifications", status: "approved", revision: 1, createdAt: daysAgo(25), submittedAt: daysAgo(23), approvedAt: daysAgo(2) },
  ];

  await db.insert(submittals).values(submittalRows);

  const coRows: Array<typeof changeOrders.$inferInsert> = [
    { tenantId: TENANT_ID, projectId: TARGET_PROJECTS[0].id, coNumber: "CO-101", title: "Additional waterproofing at elevator pit", description: "Unforeseen groundwater condition requires additional membrane and drainage system", changeType: "unforeseen_condition", status: "pending", amount: "28500.00", daysImpact: 5, createdAt: daysAgo(38), submittedAt: daysAgo(36) },
    { tenantId: TENANT_ID, projectId: TARGET_PROJECTS[1].id, coNumber: "CO-201", title: "Owner-directed intercom system upgrade", description: "Upgrade from analog to IP-based intercom per owner request", changeType: "owner_directive", status: "pending", amount: "45000.00", daysImpact: 8, createdAt: daysAgo(32), submittedAt: daysAgo(30) },
    { tenantId: TENANT_ID, projectId: TARGET_PROJECTS[2].id, coNumber: "CO-301", title: "Window finish change from bronze to black", description: "Owner requested color change after manufacturing started — restocking fee applies", changeType: "owner_directive", status: "pending", amount: "12800.00", daysImpact: 14, createdAt: daysAgo(40), submittedAt: daysAgo(38) },
    { tenantId: TENANT_ID, projectId: TARGET_PROJECTS[3].id, coNumber: "CO-401", title: "Exhaust fan CFM increase to meet updated energy code", description: "Updated energy model requires higher CFM — larger fan and ductwork modifications", changeType: "design_change", status: "submitted", amount: "8200.00", daysImpact: 3, createdAt: daysAgo(8), submittedAt: daysAgo(6) },
    { tenantId: TENANT_ID, projectId: TARGET_PROJECTS[4].id, coNumber: "CO-501", title: "Chiller pad rebar upgrade per geotech recommendation", description: "Additional #5 rebar at 12\" OC both ways per revised geotech recommendation", changeType: "unforeseen_condition", status: "draft", amount: "6500.00", daysImpact: 2, createdAt: daysAgo(4) },
  ];

  await db.insert(changeOrders).values(coRows);

  return {
    dailyLogs: dailyLogRows.length,
    rfis: rfiRows.length,
    submittals: submittalRows.length,
    changeOrders: coRows.length,
  };
}
