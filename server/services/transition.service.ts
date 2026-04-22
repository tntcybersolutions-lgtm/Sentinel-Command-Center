import { db } from "../db";
import { postAwardTransitions, transitionTasks } from "@shared/schema";
import { eq, and, asc } from "drizzle-orm";

const KICKOFF_TASKS = [
  { title: "Clone Bid Jacket to Project Structure", assignedRole: "project_manager", orderIndex: 0 },
  { title: "Generate Notice to Proceed Letter", assignedRole: "project_manager", orderIndex: 1 },
  { title: "Create Project Manager Kickoff Checklist", assignedRole: "project_manager", orderIndex: 2 },
  { title: "Build Subcontractor Outreach Queue", assignedRole: "estimator", orderIndex: 3 },
  { title: "Notify Bonding Agent", assignedRole: "project_director", orderIndex: 4 },
  { title: "Schedule Kickoff Meeting", assignedRole: "project_manager", orderIndex: 5 },
  { title: "Generate Executive Funding Summary", assignedRole: "project_director", orderIndex: 6 },
  { title: "Create Cash Flow Forecast Draft", assignedRole: "estimator", orderIndex: 7 },
  { title: "Push Initial Documents to SharePoint", assignedRole: "project_manager", orderIndex: 8 },
  { title: "Verify Insurance and Compliance Documents", assignedRole: "project_director", orderIndex: 9 },
];

async function createTransition(tenantId: string, bidProjectId: string) {
  const existing = await db
    .select()
    .from(postAwardTransitions)
    .where(and(eq(postAwardTransitions.tenantId, tenantId), eq(postAwardTransitions.bidProjectId, bidProjectId)))
    .limit(1);

  if (existing.length > 0) {
    const tasks = await db
      .select()
      .from(transitionTasks)
      .where(and(eq(transitionTasks.tenantId, tenantId), eq(transitionTasks.transitionId, existing[0].id)))
      .orderBy(asc(transitionTasks.orderIndex));
    return { ...existing[0], tasks };
  }

  const [transition] = await db
    .insert(postAwardTransitions)
    .values({ tenantId, bidProjectId, status: "draft" })
    .returning();

  await generateKickoffTasks(tenantId, transition.id);

  const tasks = await db
    .select()
    .from(transitionTasks)
    .where(and(eq(transitionTasks.tenantId, tenantId), eq(transitionTasks.transitionId, transition.id)))
    .orderBy(asc(transitionTasks.orderIndex));

  return { ...transition, tasks };
}

async function generateKickoffTasks(tenantId: string, transitionId: string) {
  const existingTasks = await db
    .select()
    .from(transitionTasks)
    .where(and(eq(transitionTasks.tenantId, tenantId), eq(transitionTasks.transitionId, transitionId)));

  if (existingTasks.length > 0) return;

  await db.insert(transitionTasks).values(
    KICKOFF_TASKS.map((t) => ({
      tenantId,
      transitionId,
      title: t.title,
      assignedRole: t.assignedRole,
      orderIndex: t.orderIndex,
      status: "pending",
    }))
  );
}

async function getTransition(tenantId: string, bidProjectId: string) {
  const [transition] = await db
    .select()
    .from(postAwardTransitions)
    .where(and(eq(postAwardTransitions.tenantId, tenantId), eq(postAwardTransitions.bidProjectId, bidProjectId)))
    .limit(1);

  if (!transition) return null;

  const tasks = await db
    .select()
    .from(transitionTasks)
    .where(and(eq(transitionTasks.tenantId, tenantId), eq(transitionTasks.transitionId, transition.id)))
    .orderBy(asc(transitionTasks.orderIndex));

  return { ...transition, tasks };
}

async function updateTaskStatus(tenantId: string, taskId: string, status: string) {
  const completedAt = status === "completed" ? new Date() : null;

  const [updated] = await db
    .update(transitionTasks)
    .set({ status, completedAt })
    .where(and(eq(transitionTasks.tenantId, tenantId), eq(transitionTasks.id, taskId)))
    .returning();

  if (!updated) return null;

  const [transition] = await db
    .select()
    .from(postAwardTransitions)
    .where(eq(postAwardTransitions.id, updated.transitionId));

  if (transition && transition.status === "draft") {
    await db
      .update(postAwardTransitions)
      .set({ status: "in_progress" })
      .where(eq(postAwardTransitions.id, transition.id));
  }

  return updated;
}

async function finalizeTransition(tenantId: string, bidProjectId: string) {
  const [updated] = await db
    .update(postAwardTransitions)
    .set({ status: "finalized", finalizedAt: new Date() })
    .where(and(eq(postAwardTransitions.tenantId, tenantId), eq(postAwardTransitions.bidProjectId, bidProjectId)))
    .returning();

  if (!updated) return null;

  const tasks = await db
    .select()
    .from(transitionTasks)
    .where(and(eq(transitionTasks.tenantId, tenantId), eq(transitionTasks.transitionId, updated.id)))
    .orderBy(asc(transitionTasks.orderIndex));

  return { ...updated, tasks };
}

export const transitionService = {
  createTransition,
  getTransition,
  updateTaskStatus,
  finalizeTransition,
};
