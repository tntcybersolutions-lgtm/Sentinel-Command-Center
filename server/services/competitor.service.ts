import { db } from "../db";
import { competitors, competitorAwards } from "@shared/schema";
import { eq, and, desc, sql, gte } from "drizzle-orm";

export const competitorService = {
  async listCompetitors(tenantId: string) {
    const allCompetitors = await db.select().from(competitors).where(eq(competitors.tenantId, tenantId));
    
    const enriched = await Promise.all(allCompetitors.map(async (c) => {
      const now = new Date();
      const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 12, now.getDate());
      const twentyFourMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 24, now.getDate());
      
      const awards = await db.select().from(competitorAwards)
        .where(and(
          eq(competitorAwards.tenantId, tenantId),
          eq(competitorAwards.competitorId, c.id)
        ));
      
      const awards12m = awards.filter(a => a.awardedAt && a.awardedAt >= twelveMonthsAgo);
      const awards24m = awards.filter(a => a.awardedAt && a.awardedAt >= twentyFourMonthsAgo);
      
      const totalValue = awards.reduce((sum, a) => sum + (Number(a.awardValue) || 0), 0);
      const value12m = awards12m.reduce((sum, a) => sum + (Number(a.awardValue) || 0), 0);
      
      const agencyCounts: Record<string, number> = {};
      const naicsCounts: Record<string, number> = {};
      awards.forEach(a => {
        if (a.agency) agencyCounts[a.agency] = (agencyCounts[a.agency] || 0) + 1;
        if (a.naicsCode) naicsCounts[a.naicsCode] = (naicsCounts[a.naicsCode] || 0) + 1;
      });
      
      const topAgencies = Object.entries(agencyCounts)
        .sort(([,a],[,b]) => b - a)
        .slice(0, 3)
        .map(([name, count]) => ({ name, count }));
      
      const topNaics = Object.entries(naicsCounts)
        .sort(([,a],[,b]) => b - a)
        .slice(0, 5)
        .map(([code, count]) => ({ code, count }));
      
      const lastAward = awards.sort((a, b) => {
        const da = a.awardedAt ? a.awardedAt.getTime() : 0;
        const db2 = b.awardedAt ? b.awardedAt.getTime() : 0;
        return db2 - da;
      })[0];
      
      const values = awards.map(a => Number(a.awardValue) || 0).filter(v => v > 0).sort((a, b) => a - b);
      const valueBand = values.length >= 2 
        ? { low: values[Math.floor(values.length * 0.25)], high: values[Math.floor(values.length * 0.75)] }
        : values.length === 1
        ? { low: values[0], high: values[0] }
        : null;
      
      return {
        ...c,
        awards12m: awards12m.length,
        awards24m: awards24m.length,
        totalAwards: awards.length,
        totalValue,
        value12m,
        topAgencies,
        topNaics,
        valueBand,
        lastAwardDate: lastAward?.awardedAt?.toISOString() || null,
      };
    }));
    
    return enriched;
  },

  async getCompetitorProfile(tenantId: string, competitorId: string) {
    const [competitor] = await db.select().from(competitors)
      .where(and(eq(competitors.tenantId, tenantId), eq(competitors.id, competitorId)));
    
    if (!competitor) return null;
    
    const awards = await db.select().from(competitorAwards)
      .where(and(
        eq(competitorAwards.tenantId, tenantId),
        eq(competitorAwards.competitorId, competitorId)
      ))
      .orderBy(desc(competitorAwards.awardedAt));
    
    const now = new Date();
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 12, now.getDate());
    const awards12m = awards.filter(a => a.awardedAt && a.awardedAt >= twelveMonthsAgo);
    
    const totalValue = awards.reduce((sum, a) => sum + (Number(a.awardValue) || 0), 0);
    const value12m = awards12m.reduce((sum, a) => sum + (Number(a.awardValue) || 0), 0);
    
    const agencyCounts: Record<string, number> = {};
    const naicsCounts: Record<string, number> = {};
    const setAsideCounts: Record<string, number> = {};
    const stateCounts: Record<string, number> = {};
    
    awards.forEach(a => {
      if (a.agency) agencyCounts[a.agency] = (agencyCounts[a.agency] || 0) + 1;
      if (a.naicsCode) naicsCounts[a.naicsCode] = (naicsCounts[a.naicsCode] || 0) + 1;
      if (a.setAside) setAsideCounts[a.setAside] = (setAsideCounts[a.setAside] || 0) + 1;
      if (a.placeOfPerformance) stateCounts[a.placeOfPerformance] = (stateCounts[a.placeOfPerformance] || 0) + 1;
    });
    
    const topAgencies = Object.entries(agencyCounts).sort(([,a],[,b]) => b - a).slice(0, 5).map(([name, count]) => ({ name, count }));
    const topNaics = Object.entries(naicsCounts).sort(([,a],[,b]) => b - a).slice(0, 5).map(([code, count]) => ({ code, count }));
    const topSetAsides = Object.entries(setAsideCounts).sort(([,a],[,b]) => b - a).map(([type, count]) => ({ type, count }));
    const topStates = Object.entries(stateCounts).sort(([,a],[,b]) => b - a).slice(0, 5).map(([state, count]) => ({ state, count }));
    
    const values = awards.map(a => Number(a.awardValue) || 0).filter(v => v > 0).sort((a, b) => a - b);
    const valueBand = values.length >= 2
      ? { low: values[Math.floor(values.length * 0.25)], high: values[Math.floor(values.length * 0.75)] }
      : values.length === 1 ? { low: values[0], high: values[0] } : null;
    
    return {
      competitor,
      awards: awards.map(a => ({
        ...a,
        awardValue: a.awardValue ? Number(a.awardValue) : null,
        awardedAt: a.awardedAt?.toISOString() || null,
        createdAt: a.createdAt.toISOString(),
      })),
      analytics: {
        totalAwards: awards.length,
        awards12m: awards12m.length,
        totalValue,
        value12m,
        valueBand,
        topAgencies,
        topNaics,
        topSetAsides,
        topStates,
      },
    };
  },

  async createCompetitor(data: { tenantId: string; name: string; dunsNumber?: string; cageCode?: string; website?: string; notes?: string; naicsCodes?: string[]; setAsideTypes?: string[]; primaryAgencies?: string[]; headquartersState?: string }) {
    const [result] = await db.insert(competitors).values(data).returning();
    return result;
  },

  async createCompetitorAward(data: { tenantId: string; competitorId: string; contractNumber?: string; agency: string; naicsCode?: string; setAside?: string; awardValue?: string; awardedAt?: Date; placeOfPerformance?: string; description?: string }) {
    const [result] = await db.insert(competitorAwards).values(data).returning();
    return result;
  },
};
