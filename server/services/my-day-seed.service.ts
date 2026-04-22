import { db } from "../db";
import { sql } from "drizzle-orm";
import * as schema from "@shared/schema";

const DEFAULT_TENANT_ID = "blackhawk-default";

export async function seedMyDayScoringRules() {
  const defaultWeights = {
    urgencyWeight: 1.0,
    impactWeight: 1.0,
    riskWeight: 1.0,
    agingWeight: 1.0,
    meetingWeight: 1.0,
    behavioralWeight: 1.0,
  };

  await db
    .insert(schema.myDayScoringRules)
    .values({
      tenantId: DEFAULT_TENANT_ID,
      name: "default",
      weightsJson: defaultWeights,
    })
    .onConflictDoNothing();

  console.log("[my-day-seed] Scoring rules seeded (idempotent)");
}
