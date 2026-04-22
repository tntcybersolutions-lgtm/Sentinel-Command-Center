import { db } from "../db";
import { companies, companySynonyms, unmatchedBuyers } from "@shared/schema";
import { eq, and, ilike } from "drizzle-orm";
import crypto from "crypto";

const SUFFIX_PATTERN = /\b(llc|inc|incorporated|corp|corporation|co|company|ltd|limited|lp|llp|pllc|pc|pa|plc|gmbh|sa|srl|pty|pvt)\b\.?/gi;
const EXTRA_WHITESPACE = /\s+/g;

function normalizeBuyerName(name: string): string {
  return name
    .replace(SUFFIX_PATTERN, "")
    .replace(/[.,;:!?'"()\-\/\\]/g, " ")
    .replace(EXTRA_WHITESPACE, " ")
    .toLowerCase()
    .trim();
}

interface BuyerMatch {
  companyId: string;
  companyName: string;
  confidence: number;
  matchType: "exact" | "synonym" | "fuzzy";
}

async function matchBuyerToCompany(
  tenantId: string,
  buyerName: string
): Promise<BuyerMatch | null> {
  const normalizedInput = normalizeBuyerName(buyerName);

  const allCompanies = await db
    .select()
    .from(companies)
    .where(eq(companies.tenantId, tenantId));

  for (const company of allCompanies) {
    const normalizedCompany = normalizeBuyerName(company.name);
    if (normalizedCompany === normalizedInput) {
      return {
        companyId: company.id,
        companyName: company.name,
        confidence: 1.0,
        matchType: "exact",
      };
    }
    if (company.legalName) {
      const normalizedLegal = normalizeBuyerName(company.legalName);
      if (normalizedLegal === normalizedInput) {
        return {
          companyId: company.id,
          companyName: company.name,
          confidence: 1.0,
          matchType: "exact",
        };
      }
    }
    if (company.dba) {
      const normalizedDba = normalizeBuyerName(company.dba);
      if (normalizedDba === normalizedInput) {
        return {
          companyId: company.id,
          companyName: company.name,
          confidence: 1.0,
          matchType: "exact",
        };
      }
    }
  }

  const synonyms = await db
    .select()
    .from(companySynonyms)
    .where(eq(companySynonyms.tenantId, tenantId));

  for (const syn of synonyms) {
    if (syn.normalizedKey === normalizedInput) {
      const company = allCompanies.find((c) => c.id === syn.companyId);
      return {
        companyId: syn.companyId,
        companyName: company?.name || buyerName,
        confidence: Number(syn.confidence) || 0.9,
        matchType: "synonym",
      };
    }
  }

  for (const company of allCompanies) {
    const normalizedCompany = normalizeBuyerName(company.name);
    if (
      normalizedInput.length >= 4 &&
      normalizedCompany.length >= 4 &&
      (normalizedCompany.includes(normalizedInput) || normalizedInput.includes(normalizedCompany))
    ) {
      const shorter = Math.min(normalizedInput.length, normalizedCompany.length);
      const longer = Math.max(normalizedInput.length, normalizedCompany.length);
      const ratio = shorter / longer;
      const confidence = Math.max(0.5, Math.min(0.8, ratio));
      return {
        companyId: company.id,
        companyName: company.name,
        confidence,
        matchType: "fuzzy",
      };
    }
  }

  return null;
}

async function routeOrQueue(
  tenantId: string,
  buyerName: string,
  opportunityId?: string
): Promise<{
  action: "auto_routed" | "queued_for_review";
  match: BuyerMatch | null;
  unmatchedId?: string;
}> {
  const match = await matchBuyerToCompany(tenantId, buyerName);

  if (match && match.confidence >= 0.85) {
    return { action: "auto_routed", match };
  }

  const normalizedKey = normalizeBuyerName(buyerName);

  const existing = await db
    .select()
    .from(unmatchedBuyers)
    .where(
      and(
        eq(unmatchedBuyers.tenantId, tenantId),
        eq(unmatchedBuyers.normalizedKey, normalizedKey),
        eq(unmatchedBuyers.status, "pending")
      )
    );

  if (existing.length > 0) {
    return {
      action: "queued_for_review",
      match,
      unmatchedId: existing[0].id,
    };
  }

  const [inserted] = await db
    .insert(unmatchedBuyers)
    .values({
      id: crypto.randomUUID(),
      tenantId,
      buyerName,
      normalizedKey,
      suggestedCompanyId: match?.companyId || null,
      matchConfidence: match ? String(match.confidence) : null,
      status: "pending",
    })
    .returning();

  return {
    action: "queued_for_review",
    match,
    unmatchedId: inserted.id,
  };
}

export const buyerRoutingService = {
  normalizeBuyerName,
  matchBuyerToCompany,
  routeOrQueue,
};
