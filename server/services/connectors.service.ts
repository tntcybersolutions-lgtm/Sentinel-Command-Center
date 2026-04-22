import { db } from "../db";
import { connectorStatus, featureFlags, auditEvents } from "@shared/schema";
import { eq, and } from "drizzle-orm";

export type ConnectorType = "procore" | "smartbid" | "fpds" | "sam_gov" | "o365" | "egnyte" | "quickbooks" | "teams";

export interface ConnectorConfig {
  apiKey?: string;
  apiUrl?: string;
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  webhookUrl?: string;
  syncInterval?: number;
}

export interface SyncResult {
  success: boolean;
  recordsSynced: number;
  message: string;
  errors?: string[];
}

export abstract class BaseConnector {
  protected tenantId: string;
  protected connectorType: ConnectorType;
  protected config: ConnectorConfig;

  constructor(tenantId: string, connectorType: ConnectorType) {
    this.tenantId = tenantId;
    this.connectorType = connectorType;
    this.config = {};
  }

  async isEnabled(): Promise<boolean> {
    const [flag] = await db
      .select()
      .from(featureFlags)
      .where(and(
        eq(featureFlags.tenantId, this.tenantId),
        eq(featureFlags.flagKey, `connector_${this.connectorType}`)
      ));
    return flag?.enabled ?? false;
  }

  async getStatus(): Promise<{
    connected: boolean;
    lastSync: Date | null;
    lastSyncStatus: string | null;
    recordsSynced: number;
    enabled: boolean;
  }> {
    const [status] = await db
      .select()
      .from(connectorStatus)
      .where(and(
        eq(connectorStatus.tenantId, this.tenantId),
        eq(connectorStatus.connectorType, this.connectorType)
      ));

    if (!status) {
      return {
        connected: false,
        lastSync: null,
        lastSyncStatus: null,
        recordsSynced: 0,
        enabled: false,
      };
    }

    return {
      connected: status.connectionStatus === "connected",
      lastSync: status.lastSyncAt,
      lastSyncStatus: status.lastSyncStatus,
      recordsSynced: status.recordsSynced || 0,
      enabled: status.enabled,
    };
  }

  async updateStatus(updates: {
    connectionStatus?: string;
    lastSyncStatus?: string;
    lastSyncMessage?: string;
    recordsSynced?: number;
  }): Promise<void> {
    const [existing] = await db
      .select()
      .from(connectorStatus)
      .where(and(
        eq(connectorStatus.tenantId, this.tenantId),
        eq(connectorStatus.connectorType, this.connectorType)
      ));

    if (existing) {
      await db
        .update(connectorStatus)
        .set({
          ...updates,
          lastSyncAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(connectorStatus.id, existing.id));
    } else {
      await db.insert(connectorStatus).values({
        tenantId: this.tenantId,
        connectorType: this.connectorType,
        connectionStatus: updates.connectionStatus || "not_connected",
        lastSyncStatus: updates.lastSyncStatus,
        lastSyncMessage: updates.lastSyncMessage,
        recordsSynced: updates.recordsSynced || 0,
        enabled: false,
      });
    }
  }

  async logAudit(action: string, details: Record<string, unknown>): Promise<void> {
    await db.insert(auditEvents).values({
      tenantId: this.tenantId,
      eventType: `connector_${this.connectorType}_${action}`,
      entityType: "connector",
      entityId: this.connectorType,
      actorId: "system",
      actorType: "system",
      metadata: details,
    } as any);
  }

  abstract testConnection(): Promise<boolean>;
  abstract sync(): Promise<SyncResult>;
}

export class ProcoreConnector extends BaseConnector {
  constructor(tenantId: string) {
    super(tenantId, "procore");
  }

  async testConnection(): Promise<boolean> {
    const enabled = await this.isEnabled();
    if (!enabled) {
      await this.updateStatus({ connectionStatus: "not_connected", lastSyncMessage: "Connector not enabled" });
      return false;
    }

    await this.updateStatus({ connectionStatus: "connected", lastSyncMessage: "Connection test successful (stub)" });
    await this.logAudit("test_connection", { success: true });
    return true;
  }

  async sync(): Promise<SyncResult> {
    const enabled = await this.isEnabled();
    if (!enabled) {
      return { success: false, recordsSynced: 0, message: "Connector not enabled" };
    }

    await this.updateStatus({ 
      connectionStatus: "syncing", 
      lastSyncStatus: "in_progress",
      lastSyncMessage: "Syncing projects and contacts..." 
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    const mockRecordCount = Math.floor(Math.random() * 50) + 10;
    
    await this.updateStatus({ 
      connectionStatus: "connected", 
      lastSyncStatus: "success",
      lastSyncMessage: `Synced ${mockRecordCount} records`,
      recordsSynced: mockRecordCount,
    });

    await this.logAudit("sync", { recordsSynced: mockRecordCount });

    return { success: true, recordsSynced: mockRecordCount, message: `Synced ${mockRecordCount} Procore records` };
  }

  async getProjects(): Promise<Array<{ id: string; name: string; status: string }>> {
    return [
      { id: "proj-1", name: "Highway 101 Expansion", status: "active" },
      { id: "proj-2", name: "Federal Building Renovation", status: "active" },
      { id: "proj-3", name: "Airport Terminal C", status: "planning" },
    ];
  }

  async getRFIs(): Promise<Array<{ id: string; subject: string; status: string; projectId: string }>> {
    return [
      { id: "rfi-1", subject: "Concrete mix specifications", status: "open", projectId: "proj-1" },
      { id: "rfi-2", subject: "Steel beam dimensions", status: "closed", projectId: "proj-1" },
    ];
  }
}

export class SmartBidConnector extends BaseConnector {
  constructor(tenantId: string) {
    super(tenantId, "smartbid");
  }

  async testConnection(): Promise<boolean> {
    const enabled = await this.isEnabled();
    if (!enabled) {
      await this.updateStatus({ connectionStatus: "not_connected", lastSyncMessage: "Connector not enabled" });
      return false;
    }

    await this.updateStatus({ connectionStatus: "connected", lastSyncMessage: "Connection test successful (stub)" });
    await this.logAudit("test_connection", { success: true });
    return true;
  }

  async sync(): Promise<SyncResult> {
    const enabled = await this.isEnabled();
    if (!enabled) {
      return { success: false, recordsSynced: 0, message: "Connector not enabled" };
    }

    await this.updateStatus({ 
      connectionStatus: "syncing", 
      lastSyncStatus: "in_progress",
      lastSyncMessage: "Syncing subcontractor data..." 
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    const mockRecordCount = Math.floor(Math.random() * 30) + 5;
    
    await this.updateStatus({ 
      connectionStatus: "connected", 
      lastSyncStatus: "success",
      lastSyncMessage: `Synced ${mockRecordCount} subcontractors`,
      recordsSynced: mockRecordCount,
    });

    await this.logAudit("sync", { recordsSynced: mockRecordCount });

    return { success: true, recordsSynced: mockRecordCount, message: `Synced ${mockRecordCount} SmartBid records` };
  }

  async getSubcontractors(): Promise<Array<{ id: string; name: string; trade: string; rating: number }>> {
    return [
      { id: "sub-1", name: "ACE Electrical", trade: "Electrical", rating: 5 },
      { id: "sub-2", name: "Prime Plumbing", trade: "Plumbing", rating: 4 },
      { id: "sub-3", name: "Steel Masters", trade: "Structural Steel", rating: 5 },
    ];
  }
}

export class FPDSConnector extends BaseConnector {
  constructor(tenantId: string) {
    super(tenantId, "fpds");
  }

  async testConnection(): Promise<boolean> {
    const enabled = await this.isEnabled();
    if (!enabled) {
      await this.updateStatus({ connectionStatus: "not_connected", lastSyncMessage: "Connector not enabled" });
      return false;
    }

    await this.updateStatus({ connectionStatus: "connected", lastSyncMessage: "Connection test successful (stub)" });
    await this.logAudit("test_connection", { success: true });
    return true;
  }

  async sync(): Promise<SyncResult> {
    const enabled = await this.isEnabled();
    if (!enabled) {
      return { success: false, recordsSynced: 0, message: "Connector not enabled" };
    }

    await this.updateStatus({ 
      connectionStatus: "syncing", 
      lastSyncStatus: "in_progress",
      lastSyncMessage: "Syncing award data from FPDS..." 
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    const mockRecordCount = Math.floor(Math.random() * 100) + 20;
    
    await this.updateStatus({ 
      connectionStatus: "connected", 
      lastSyncStatus: "success",
      lastSyncMessage: `Synced ${mockRecordCount} award records`,
      recordsSynced: mockRecordCount,
    });

    await this.logAudit("sync", { recordsSynced: mockRecordCount });

    return { success: true, recordsSynced: mockRecordCount, message: `Synced ${mockRecordCount} FPDS award records` };
  }

  async getAwards(naicsCode?: string): Promise<Array<{ id: string; title: string; vendor: string; value: number; agency: string }>> {
    return [
      { id: "award-1", title: "Base Infrastructure Support", vendor: "BuildCo Inc", value: 2500000, agency: "US Army Corps of Engineers" },
      { id: "award-2", title: "Facility Maintenance", vendor: "MaintainPro", value: 850000, agency: "GSA" },
    ];
  }
}

export class ConnectorService {
  private tenantId: string;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
  }

  getConnector(type: ConnectorType): BaseConnector {
    switch (type) {
      case "procore":
        return new ProcoreConnector(this.tenantId);
      case "smartbid":
        return new SmartBidConnector(this.tenantId);
      case "fpds":
        return new FPDSConnector(this.tenantId);
      default:
        throw new Error(`Unknown connector type: ${type}`);
    }
  }

  async getAllConnectorStatuses(): Promise<Array<{ type: ConnectorType; status: Awaited<ReturnType<BaseConnector["getStatus"]>> }>> {
    const types: ConnectorType[] = ["procore", "smartbid", "fpds", "sam_gov", "o365", "egnyte", "quickbooks", "teams"];
    
    const statuses = await Promise.all(
      types.map(async (type) => {
        const [status] = await db
          .select()
          .from(connectorStatus)
          .where(and(
            eq(connectorStatus.tenantId, this.tenantId),
            eq(connectorStatus.connectorType, type)
          ));

        return {
          type,
          status: {
            connected: status?.connectionStatus === "connected",
            lastSync: status?.lastSyncAt || null,
            lastSyncStatus: status?.lastSyncStatus || null,
            recordsSynced: status?.recordsSynced || 0,
            enabled: status?.enabled || false,
          },
        };
      })
    );

    return statuses;
  }

  async enableConnector(type: ConnectorType): Promise<void> {
    const [existing] = await db
      .select()
      .from(featureFlags)
      .where(and(
        eq(featureFlags.tenantId, this.tenantId),
        eq(featureFlags.flagKey, `connector_${type}`)
      ));

    if (existing) {
      await db
        .update(featureFlags)
        .set({ enabled: true, updatedAt: new Date() })
        .where(eq(featureFlags.id, existing.id));
    } else {
      await db.insert(featureFlags).values({
        tenantId: this.tenantId,
        flagKey: `connector_${type}`,
        enabled: true,
        description: `Enable ${type} connector`,
      });
    }

    await db
      .update(connectorStatus)
      .set({ enabled: true, updatedAt: new Date() })
      .where(and(
        eq(connectorStatus.tenantId, this.tenantId),
        eq(connectorStatus.connectorType, type)
      ));
  }

  async disableConnector(type: ConnectorType): Promise<void> {
    await db
      .update(featureFlags)
      .set({ enabled: false, updatedAt: new Date() })
      .where(and(
        eq(featureFlags.tenantId, this.tenantId),
        eq(featureFlags.flagKey, `connector_${type}`)
      ));

    await db
      .update(connectorStatus)
      .set({ enabled: false, connectionStatus: "not_connected", updatedAt: new Date() })
      .where(and(
        eq(connectorStatus.tenantId, this.tenantId),
        eq(connectorStatus.connectorType, type)
      ));
  }
}

export const createConnectorService = (tenantId: string) => new ConnectorService(tenantId);
