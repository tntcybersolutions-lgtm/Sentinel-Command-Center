import * as fs from "fs";
import type { HerbieChangeSet } from "@shared/schema";

const changeSets = new Map<string, HerbieChangeSet>();

let counter = 0;
function nextId(): string {
  counter += 1;
  return `cs-${Date.now()}-${counter}`;
}

export function createChangeSet(title: string, plan: string, createdBy: string): string {
  const id = nextId();
  const cs: HerbieChangeSet = {
    id,
    title,
    plan,
    diffsApplied: [],
    createdBy,
    createdAt: new Date().toISOString(),
    status: "proposed",
  };
  changeSets.set(id, cs);
  return id;
}

export function addDiff(changeSetId: string, path: string, before: string, after: string): void {
  const cs = changeSets.get(changeSetId);
  if (!cs) throw new Error(`ChangeSet ${changeSetId} not found`);
  cs.diffsApplied.push({ path, before, after });
  cs.status = "applied";
}

export function getChangeSet(id: string): HerbieChangeSet | null {
  return changeSets.get(id) || null;
}

export function listChangeSets(): HerbieChangeSet[] {
  return Array.from(changeSets.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function rollbackChangeSet(id: string): { restored: string[]; errors: string[] } {
  const cs = changeSets.get(id);
  if (!cs) throw new Error(`ChangeSet ${id} not found`);
  if (cs.status === "rolled_back") throw new Error("Already rolled back");

  const restored: string[] = [];
  const errors: string[] = [];

  for (const diff of cs.diffsApplied.reverse()) {
    try {
      const fullPath = `${process.cwd()}/${diff.path}`;
      if (fs.existsSync(fullPath)) {
        const current = fs.readFileSync(fullPath, "utf-8");
        if (current.includes(diff.after)) {
          fs.writeFileSync(fullPath, current.replace(diff.after, diff.before));
          restored.push(diff.path);
        } else {
          const bakFiles = fs.readdirSync(require("path").dirname(fullPath))
            .filter((f: string) => f.startsWith(require("path").basename(fullPath) + ".bak."))
            .sort()
            .reverse();
          if (bakFiles.length > 0) {
            const bakContent = fs.readFileSync(require("path").join(require("path").dirname(fullPath), bakFiles[0]), "utf-8");
            fs.writeFileSync(fullPath, bakContent);
            restored.push(diff.path);
          } else {
            errors.push(`${diff.path}: content changed, no backup found`);
          }
        }
      } else {
        errors.push(`${diff.path}: file not found`);
      }
    } catch (e: any) {
      errors.push(`${diff.path}: ${e.message}`);
    }
  }

  cs.status = "rolled_back";
  return { restored, errors };
}
