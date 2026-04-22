import { db } from "../db";
import { conversationMemory, tenantSettings } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";

export interface TenantPreferences {
  bondingMax?: number;
  naicsExclusions?: string[];
  preferredSetAsides?: string[];
  defaultApprovers?: Record<string, string>;
  geographicPreferences?: string[];
  minimumContractValue?: number;
  maximumContractValue?: number;
}

export interface SessionMemory {
  recentQueries: string[];
  currentContext?: {
    opportunityId?: string;
    bidProjectId?: string;
    topic?: string;
  };
  conversationSummary?: string;
}

export class MemoryService {
  private tenantId: string;
  private userId: string;
  private sessionMemory: SessionMemory;

  constructor(tenantId: string, userId: string) {
    this.tenantId = tenantId;
    this.userId = userId;
    this.sessionMemory = { recentQueries: [] };
  }

  async getTenantPreferences(): Promise<TenantPreferences> {
    const settings = await db
      .select()
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantId, this.tenantId));

    const prefs: TenantPreferences = {};
    
    for (const setting of settings) {
      switch (setting.key) {
        case "bonding_max":
          prefs.bondingMax = (setting.valueJson as { value: number })?.value;
          break;
        case "naics_exclusions":
          prefs.naicsExclusions = (setting.valueJson as { value: string[] })?.value;
          break;
        case "preferred_set_asides":
          prefs.preferredSetAsides = (setting.valueJson as { value: string[] })?.value;
          break;
        case "default_approvers":
          prefs.defaultApprovers = (setting.valueJson as { value: Record<string, string> })?.value;
          break;
        case "geographic_preferences":
          prefs.geographicPreferences = (setting.valueJson as { value: string[] })?.value;
          break;
        case "minimum_contract_value":
          prefs.minimumContractValue = (setting.valueJson as { value: number })?.value;
          break;
        case "maximum_contract_value":
          prefs.maximumContractValue = (setting.valueJson as { value: number })?.value;
          break;
      }
    }

    return prefs;
  }

  async setTenantPreference(key: string, value: unknown): Promise<void> {
    const existing = await db
      .select()
      .from(tenantSettings)
      .where(and(
        eq(tenantSettings.tenantId, this.tenantId),
        eq(tenantSettings.key, key)
      ));

    if (existing.length > 0) {
      await db
        .update(tenantSettings)
        .set({ valueJson: { value } })
        .where(and(
          eq(tenantSettings.tenantId, this.tenantId),
          eq(tenantSettings.key, key)
        ));
    } else {
      await db.insert(tenantSettings).values({
        tenantId: this.tenantId,
        key,
        valueJson: { value },
      });
    }
  }

  async getLearnedFacts(): Promise<Array<{ key: string; value: unknown; context: string | null }>> {
    const memories = await db
      .select()
      .from(conversationMemory)
      .where(and(
        eq(conversationMemory.tenantId, this.tenantId),
        eq(conversationMemory.memoryType, "learned_fact")
      ))
      .orderBy(desc(conversationMemory.createdAt));

    return memories.map(m => ({
      key: m.memoryKey,
      value: m.memoryValue,
      context: m.context,
    }));
  }

  async learnFact(key: string, value: unknown, context: string): Promise<void> {
    await db.insert(conversationMemory).values({
      tenantId: this.tenantId,
      userId: this.userId,
      memoryType: "learned_fact",
      memoryKey: key,
      memoryValue: { value },
      context,
    });
  }

  async getUserPreferences(): Promise<Record<string, unknown>> {
    const memories = await db
      .select()
      .from(conversationMemory)
      .where(and(
        eq(conversationMemory.tenantId, this.tenantId),
        eq(conversationMemory.userId, this.userId),
        eq(conversationMemory.memoryType, "user_preference")
      ));

    const prefs: Record<string, unknown> = {};
    for (const m of memories) {
      prefs[m.memoryKey] = m.memoryValue;
    }
    return prefs;
  }

  async setUserPreference(key: string, value: unknown): Promise<void> {
    const existing = await db
      .select()
      .from(conversationMemory)
      .where(and(
        eq(conversationMemory.tenantId, this.tenantId),
        eq(conversationMemory.userId, this.userId),
        eq(conversationMemory.memoryType, "user_preference"),
        eq(conversationMemory.memoryKey, key)
      ));

    if (existing.length > 0) {
      await db
        .update(conversationMemory)
        .set({ memoryValue: { value }, updatedAt: new Date() })
        .where(eq(conversationMemory.id, existing[0].id));
    } else {
      await db.insert(conversationMemory).values({
        tenantId: this.tenantId,
        userId: this.userId,
        memoryType: "user_preference",
        memoryKey: key,
        memoryValue: { value },
      });
    }
  }

  addToSession(query: string): void {
    this.sessionMemory.recentQueries.push(query);
    if (this.sessionMemory.recentQueries.length > 10) {
      this.sessionMemory.recentQueries.shift();
    }
  }

  setSessionContext(context: SessionMemory["currentContext"]): void {
    this.sessionMemory.currentContext = context;
  }

  getSessionContext(): SessionMemory["currentContext"] {
    return this.sessionMemory.currentContext;
  }

  getRecentQueries(): string[] {
    return this.sessionMemory.recentQueries;
  }

  async getContextForPrompt(): Promise<string> {
    const tenantPrefs = await this.getTenantPreferences();
    const learnedFacts = await this.getLearnedFacts();
    const userPrefs = await this.getUserPreferences();

    const contextParts: string[] = [];

    if (tenantPrefs.bondingMax) {
      contextParts.push(`Company bonding limit: $${tenantPrefs.bondingMax.toLocaleString()}`);
    }
    if (tenantPrefs.naicsExclusions?.length) {
      contextParts.push(`Excluded NAICS codes: ${tenantPrefs.naicsExclusions.join(", ")}`);
    }
    if (tenantPrefs.preferredSetAsides?.length) {
      contextParts.push(`Preferred set-asides: ${tenantPrefs.preferredSetAsides.join(", ")}`);
    }
    if (tenantPrefs.geographicPreferences?.length) {
      contextParts.push(`Geographic preferences: ${tenantPrefs.geographicPreferences.join(", ")}`);
    }

    for (const fact of learnedFacts.slice(0, 10)) {
      contextParts.push(`Learned: ${fact.key} = ${JSON.stringify(fact.value)}`);
    }

    if (this.sessionMemory.currentContext) {
      if (this.sessionMemory.currentContext.opportunityId) {
        contextParts.push(`Current opportunity context: ${this.sessionMemory.currentContext.opportunityId}`);
      }
      if (this.sessionMemory.currentContext.bidProjectId) {
        contextParts.push(`Current bid project context: ${this.sessionMemory.currentContext.bidProjectId}`);
      }
      if (this.sessionMemory.currentContext.topic) {
        contextParts.push(`Current topic: ${this.sessionMemory.currentContext.topic}`);
      }
    }

    return contextParts.join("\n");
  }

  async getAllMemory(): Promise<{
    tenantPreferences: TenantPreferences;
    learnedFacts: Array<{ key: string; value: unknown; context: string | null }>;
    userPreferences: Record<string, unknown>;
    sessionMemory: SessionMemory;
  }> {
    return {
      tenantPreferences: await this.getTenantPreferences(),
      learnedFacts: await this.getLearnedFacts(),
      userPreferences: await this.getUserPreferences(),
      sessionMemory: this.sessionMemory,
    };
  }
}

export const createMemoryService = (tenantId: string, userId: string) => new MemoryService(tenantId, userId);
