/**
 * server/services/herbie-domains/construction/index.ts
 *
 * Registry + composer. Loads role x trade x sector modules and concatenates
 * them deterministically into a single cacheable system-prompt block.
 *
 * Cache key: role|trade|sector. Population strategy: only populated modules
 * are registered in the loader tables; everything else falls through to
 * stubs (./stubs.ts) so the build stays green even with thin coverage.
 */

import type {
  RoleId,
  TradeId,
  SectorId,
} from "../../../../shared/construction-taxonomy";
import {
  isRoleId,
  isTradeId,
  isSectorId,
  ALL_ROLE_IDS,
  ALL_TRADE_IDS,
  ALL_SECTOR_IDS,
} from "../../../../shared/construction-taxonomy";
import type {
  CompositionRequest,
  CompositionResult,
  DomainModule,
  ProactiveTrigger,
  ToolHint,
  VoiceNudge,
} from "./types";

import coreModule from "./core";
import { makeRoleStub, makeTradeStub, makeSectorStub } from "./stubs";

type Loader = () => Promise<{ default: DomainModule }>;

// Populated modules. Add entries as dedicated module files ship.
// Anything NOT in these maps gets a stub from ./stubs.ts.
const roleLoaders: Partial<Record<RoleId, Loader>> = {
  "role.bid-pursuit.capture-manager": () => import("./roles/bid-pursuit/capture-manager"),
  "role.bid-pursuit.proposal-writer": () => import("./roles/bid-pursuit/proposal-writer"),
  "role.bid-pursuit.bd-federal": () => import("./roles/bid-pursuit/bd-federal"),
  "role.bid-pursuit.past-performance-manager": () => import("./roles/bid-pursuit/past-performance-manager"),
  "role.bid-pursuit.contracts-compliance": () => import("./roles/bid-pursuit/contracts-compliance"),
  "role.bid-pursuit.pricing-strategist": () => import("./roles/bid-pursuit/pricing-strategist"),
  "role.bid-pursuit.teaming-coordinator": () => import("./roles/bid-pursuit/teaming-coordinator"),
  "role.bid-pursuit.small-business-liaison": () => import("./roles/bid-pursuit/small-business-liaison"),
};

const tradeLoaders: Partial<Record<TradeId, Loader>> = {
  // populate as trade module files are added
};

const sectorLoaders: Partial<Record<SectorId, Loader>> = {
  // populate as sector module files are added
};

const moduleCache = new Map<string, DomainModule>();

async function loadOrStub<K extends string>(
  key: K,
  loader: Loader | undefined,
  stubFactory: (id: K) => DomainModule,
): Promise<DomainModule> {
  const cached = moduleCache.get(key);
  if (cached) return cached;

  let mod: DomainModule;
  if (loader) {
    try {
      mod = (await loader()).default;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        `[herbie-domains] failed to load populated module ${key}; falling back to stub.`,
        err,
      );
      mod = stubFactory(key);
    }
  } else {
    mod = stubFactory(key);
  }

  moduleCache.set(key, mod);
  return mod;
}

export async function composeDomain(
  req: CompositionRequest,
): Promise<CompositionResult> {
  if (req.userRole !== null && !isRoleId(req.userRole)) {
    throw new Error(
      `composeDomain: unknown role "${req.userRole}". Add it to shared/construction-taxonomy.ts and create the matching module.`,
    );
  }
  if (!isTradeId(req.primaryTrade)) {
    throw new Error(`composeDomain: unknown trade "${req.primaryTrade}".`);
  }
  if (!isSectorId(req.projectSector)) {
    throw new Error(`composeDomain: unknown sector "${req.projectSector}".`);
  }

  const modules: DomainModule[] = [coreModule];

  if (req.userRole !== null) {
    modules.push(
      await loadOrStub(req.userRole, roleLoaders[req.userRole], makeRoleStub),
    );
  }
  modules.push(
    await loadOrStub(req.primaryTrade, tradeLoaders[req.primaryTrade], makeTradeStub),
  );
  modules.push(
    await loadOrStub(req.projectSector, sectorLoaders[req.projectSector], makeSectorStub),
  );

  const ordered = modules.sort((a, b) => axisOrder(a.axis) - axisOrder(b.axis));

  const prompt = ordered
    .map((m) => `<!-- module:${m.id} -->\n${m.prompt}`)
    .join("\n\n---\n\n");

  const glossary: Record<string, string> = {};
  for (const m of ordered) Object.assign(glossary, m.glossary);

  const triggerMap = new Map<string, ProactiveTrigger>();
  for (const m of ordered) {
    for (const t of m.proactiveTriggers ?? []) triggerMap.set(t.id, t);
  }

  const voiceNudges: VoiceNudge[] = ordered.flatMap((m) => m.voiceNudges ?? []);

  const weightRank: Record<ToolHint["weight"], number> = {
    primary: 3,
    secondary: 2,
    rarely: 1,
  };
  const hintMap = new Map<string, ToolHint>();
  for (const m of ordered) {
    for (const h of m.toolHints ?? []) {
      const existing = hintMap.get(h.tool);
      if (!existing || weightRank[h.weight] > weightRank[existing.weight]) {
        hintMap.set(h.tool, h);
      }
    }
  }

  return {
    prompt,
    glossary,
    proactiveTriggers: [...triggerMap.values()],
    voiceNudges,
    toolHints: [...hintMap.values()],
    loaded: ordered.map((m) => String(m.id)),
    hasStubs: ordered.some((m) => m.stub === true),
  };
}

function axisOrder(axis: DomainModule["axis"]): number {
  switch (axis) {
    case "core": return 0;
    case "role": return 1;
    case "trade": return 2;
    case "sector": return 3;
  }
}

/** Stable cache key for the composed prompt. */
export function composeCacheKey(req: CompositionRequest): string {
  return `${req.userRole ?? "none"}|${req.primaryTrade}|${req.projectSector}`;
}

export function _populationCoverage() {
  return {
    populated: {
      roles: Object.keys(roleLoaders).length,
      trades: Object.keys(tradeLoaders).length,
      sectors: Object.keys(sectorLoaders).length,
    },
    total: {
      roles: ALL_ROLE_IDS.length,
      trades: ALL_TRADE_IDS.length,
      sectors: ALL_SECTOR_IDS.length,
    },
  };
}
