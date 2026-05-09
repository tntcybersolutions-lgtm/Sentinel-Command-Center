/**
 * server/services/herbie-domains/construction/stubs.ts
 *
 * Stub factories. The composer calls these when a dedicated module file
 * does not exist yet for a given role/trade/sector. Stub modules emit a
 * dev-log warning on first load and render a generic prompt so Herbie
 * stays useful for users with un-populated roles.
 */

import type {
  RoleId,
  TradeId,
  SectorId,
} from "../../../../shared/construction-taxonomy";
import type { DomainModule } from "./types";

const warnedKeys = new Set<string>();

function warnOnce(key: string, label: string) {
  if (warnedKeys.has(key)) return;
  warnedKeys.add(key);
  // eslint-disable-next-line no-console
  console.warn(
    `[herbie-domains] using stub for ${key} ("${label}"). Populate the dedicated module file when this audience becomes a priority.`,
  );
}

function humanizeLabel(id: string): string {
  const slug = id.split(".").pop() ?? id;
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function makeRoleStub(id: RoleId): DomainModule {
  const label = humanizeLabel(id);
  warnOnce(id, label);
  return {
    id,
    axis: "role",
    label: `${label} (stub)`,
    prompt: `# Role context: ${label}\n\nYou are speaking with a ${label} on a construction project. Treat them as a domain professional with day-to-day specifics that aren't yet captured in this stub.\n\nDefaults until the dedicated module is populated:\n- Match their vocabulary; if they use jargon you don't know, ask once and remember.\n- Lead with the action item; explain only when asked.\n- Cite source documents when answering factual questions.`,
    glossary: {},
    stub: true,
  };
}

export function makeTradeStub(id: TradeId): DomainModule {
  const label = humanizeLabel(id);
  warnOnce(id, label);
  return {
    id,
    axis: "trade",
    label: `${label} (stub)`,
    prompt: `# Trade context: ${label}\n\nYou are working with a ${label} contractor or sub. Treat them as the trade authority on their scope.\n\nDefaults until the dedicated module is populated:\n- Defer to their judgment on means-and-methods.\n- Recognize their scope-of-work specs (CSI division applicable to ${label}).\n- Track their submittals, RFIs, and CO requests with extra care since they're the trade authority.`,
    glossary: {},
    stub: true,
  };
}

export function makeSectorStub(id: SectorId): DomainModule {
  const label = humanizeLabel(id);
  warnOnce(id, label);
  return {
    id,
    axis: "sector",
    label: `${label} (stub)`,
    prompt: `# Sector context: ${label}\n\nThis project sits in the ${label} sector.\n\nDefaults until the dedicated module is populated:\n- Apply the standard construction-core rules (see core module).\n- Watch for sector-specific compliance flags and ask the PM if you're unsure which apply.`,
    glossary: {},
    stub: true,
  };
}
