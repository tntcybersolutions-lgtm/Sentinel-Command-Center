import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { opportunities, sourceItemsRaw, sourceSystems } from "@shared/schema";
import { logIngestionEvent } from "./ingestion-events.service";

export type DiscoveredAttachment = {
  title: string;
  url: string;
  sourceType: "samgov";
  hint?: string | null;
};

function s(x: unknown): string | null {
  return typeof x === "string" && x.trim() ? x.trim() : null;
}

function add(out: DiscoveredAttachment[], seen: Set<string>, title: string, url: string, hint?: string | null) {
  const u = url.trim();
  if (!u || seen.has(u)) return;
  seen.add(u);
  out.push({
    title: title?.trim() || u.split("?")[0].split("/").pop() || "SAM.gov Document",
    url: u,
    sourceType: "samgov",
    hint: hint ?? null,
  });
}

export async function discoverSamAttachments(params: {
  tenantId: string;
  opportunityId: string;
  runId?: string;
}): Promise<DiscoveredAttachment[]> {
  const { tenantId, opportunityId, runId } = params;

  const rows = await db
    .select({
      id: opportunities.id,
      url: opportunities.url,
      externalId: opportunities.externalId,
      rawRefId: opportunities.rawRefId,
      sourceSystemKey: sourceSystems.key,
      sourceSystemName: sourceSystems.name,
      rawJson: sourceItemsRaw.rawJson,
    })
    .from(opportunities)
    .leftJoin(sourceSystems, eq(opportunities.sourceSystemId, sourceSystems.id))
    .leftJoin(sourceItemsRaw, eq(opportunities.rawRefId, sourceItemsRaw.id))
    .where(and(eq(opportunities.tenantId, tenantId), eq(opportunities.id, opportunityId)))
    .limit(1);

  if (!rows.length) return [];
  const o = rows[0]!;

  const sysKey = (o.sourceSystemKey || "").toLowerCase();
  const sysName = (o.sourceSystemName || "").toLowerCase();
  const isSam = !sysKey || sysKey === "samgov" || sysName.includes("sam");
  if (!isSam) return [];

  const out: DiscoveredAttachment[] = [];
  const seen = new Set<string>();

  const oppUrl = s(o.url);
  if (oppUrl) add(out, seen, "SAM Opportunity", oppUrl, "opportunity");

  const raw: any = o.rawJson ?? null;

  const resourceLinks =
    (Array.isArray(raw?.resourceLinks) && raw.resourceLinks) ||
    (Array.isArray(raw?.resource_links) && raw.resource_links) ||
    (Array.isArray(raw?.attachments) && raw.attachments) ||
    (Array.isArray(raw?.documents) && raw.documents) ||
    null;

  if (Array.isArray(resourceLinks)) {
    for (const item of resourceLinks) {
      const href = s(item?.url) || s(item?.href) || s(item?.link) || s(item?.downloadUrl);
      if (!href) continue;
      const title = s(item?.name) || s(item?.title) || s(item?.label) || "SAM Attachment";
      const hint = s(item?.type) || s(item?.category) || null;
      add(out, seen, title, href, hint);
    }
  }

  if (Array.isArray(raw?.links)) {
    for (const l of raw.links) {
      const href = s(l?.href) || s(l?.url);
      if (!href) continue;
      add(out, seen, s(l?.title) || s(l?.rel) || "SAM Link", href, "link");
    }
  }

  const addl = s(raw?.additionalInfoLink) || s(raw?.additional_info_link);
  if (addl) add(out, seen, "Additional Info", addl, "additional_info");

  await logIngestionEvent({
    tenantId,
    projectId: null,
    bidProjectId: null,
    runId: runId ?? null,
    eventType: out.length ? "discover.sam.found" : "discover.sam.none",
    entityType: "opportunity",
    entityId: o.id,
    message: out.length
      ? `SAM Tier-1 discovered ${out.length} link(s) via rawRefId→source_items_raw.raw_json`
      : "SAM Tier-1 found no links in opportunity.url or stored raw_json",
    detailsJson: {
      sourceSystemKey: o.sourceSystemKey ?? null,
      hasUrl: !!oppUrl,
      hasRawRefId: !!o.rawRefId,
      hasRawJson: !!raw,
      externalId: o.externalId ?? null,
    },
  });

  return out;
}
