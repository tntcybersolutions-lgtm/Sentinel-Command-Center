/**
 * HERBIE Sub-Recommendation Engine
 *
 * Given a CSI division/trade, returns top-N subcontractors ranked by composite score.
 * Cold-start friendly: falls back to alphabetical order when no historical data.
 * Excludes vendors with expired licenses, inactive status, or NULL email.
 *
 * tenantId is OPTIONAL — when omitted, scans across all tenants
 * (intended for global search; callers with auth context should pass tenantId).
 */

import { sql } from "drizzle-orm";
import { db } from "../db";

export interface RecommendOpts {
  tenantId?: string;
  csiDivision?: string;
  trade?: string;
  csiSection?: string | null;
  limit?: number;
  projectId?: string;
  excludeVendorIds?: string[];
}

export interface RecommendedSub {
  id: string;
  vendorNumber: string | null;
  companyName: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  csiDivision: string | null;
  csiSection: string | null;
  performanceRating: number | null;
  safetyRating: number | null;
  qualityRating: number | null;
  prequalificationStatus: string | null;
  licenseExpiresAt: Date | null;
  score: number;
  scoreReasons: string[];
}

export async function recommendSubsForTrade(opts: RecommendOpts): Promise<RecommendedSub[]> {
  const limit = Math.min(Math.max(opts.limit || 5, 1), 50);
  const csiDivision = (opts.csiDivision || opts.trade || "").trim();
  const excludeList = (opts.excludeVendorIds || []).filter(Boolean);

  const tenantClause = opts.tenantId
    ? sql`AND s.tenant_id = ${opts.tenantId}`
    : sql``;
  const divisionClause = csiDivision
    ? sql`AND s.csi_division = ${csiDivision}`
    : sql``;
  const excludeClause = excludeList.length > 0
    ? sql`AND s.id NOT IN (${sql.join(excludeList.map(id => sql`${id}`), sql`, `)})`
    : sql``;
  const sectionFilter = opts.csiSection
    ? sql`AND (s.csi_section = ${opts.csiSection} OR s.csi_section IS NULL)`
    : sql``;

  let rows: any[] = [];
  try {
    const r: any = await db.execute(sql`
      SELECT
        s.id, s.vendor_number, s.company_name, s.contact_name, s.email, s.phone,
        s.csi_division, s.csi_section,
        s.performance_rating, s.safety_rating, s.quality_rating,
        s.prequalification_status, s.license_expires_at, s.status
      FROM subcontractors s
      WHERE 1=1
        ${tenantClause}
        ${divisionClause}
        AND (s.status IS NULL OR LOWER(s.status) IN ('active','approved','prequalified'))
        AND (s.license_expires_at IS NULL OR s.license_expires_at > now())
        AND s.email IS NOT NULL
        ${sectionFilter}
        ${excludeClause}
      LIMIT 200
    `);
    rows = r.rows || r || [];
  } catch (e: any) {
    console.warn("[sub-recommendations] query failed, returning empty:", e?.message);
    return [];
  }

  const scored: RecommendedSub[] = rows.map((row: any) => {
    const reasons: string[] = [];
    let score = 0;
    const perf = Number(row.performance_rating) || 0;
    const safety = Number(row.safety_rating) || 0;
    const quality = Number(row.quality_rating) || 0;
    if (perf > 0) { score += perf * 1.5; reasons.push(`perf=${perf}`); }
    if (safety > 0) { score += safety * 1.2; reasons.push(`safety=${safety}`); }
    if (quality > 0) { score += quality * 1.2; reasons.push(`quality=${quality}`); }
    const pq = String(row.prequalification_status || "").toLowerCase();
    if (pq === "approved" || pq === "prequalified") { score += 3; reasons.push("prequalified"); }
    else if (pq === "pending") { score += 0.5; reasons.push("pq-pending"); }
    if (row.csi_section && row.csi_section === opts.csiSection) {
      score += 2; reasons.push("section-match");
    }
    if (row.email) { score += 0.5; reasons.push("emailable"); }
    return {
      id: row.id,
      vendorNumber: row.vendor_number,
      companyName: row.company_name,
      contactName: row.contact_name,
      email: row.email,
      phone: row.phone,
      csiDivision: row.csi_division,
      csiSection: row.csi_section,
      performanceRating: row.performance_rating,
      safetyRating: row.safety_rating,
      qualityRating: row.quality_rating,
      prequalificationStatus: row.prequalification_status,
      licenseExpiresAt: row.license_expires_at,
      score,
      scoreReasons: reasons,
    };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (a.companyName || "").localeCompare(b.companyName || "");
  });
  return scored.slice(0, limit);
}

export async function recommendForBidProjectTrades(p: {
  tenantId?: string;
  bidProjectId?: string;
  trades?: any;
  perTradeLimit?: number;
  limitPerTrade?: number;
}): Promise<{ csiDivision: string; csiSection?: string | null; subs: RecommendedSub[] }[]> {
  const out: { csiDivision: string; csiSection?: string | null; subs: RecommendedSub[] }[] = [];
  const perLimit = p.perTradeLimit || p.limitPerTrade || 3;
  const trades = p.trades || [];
  for (const t of trades as any[]) {
    const csiDivision = typeof t === "string" ? t : t.csiDivision;
    const csiSection = typeof t === "string" ? null : (t.csiSection || null);
    const subs = await recommendSubsForTrade({
      tenantId: p.tenantId,
      csiDivision,
      csiSection,
      limit: perLimit,
    });
    out.push({ csiDivision, csiSection, subs });
  }
  return out;
}
