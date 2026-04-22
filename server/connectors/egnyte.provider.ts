/**
 * Egnyte Document Storage Provider
 * Real implementation using Egnyte API
 */

import { db } from "../db";
import { integrationHealth } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import type {
  IDocumentStorageProvider,
  DocumentItem,
  FolderListing,
  FileVersion,
  FileContent,
  UploadResult,
  SyncEvent,
  SyncCursor,
  SearchResult,
  ConnectionStatus,
} from "./document-storage.interface";

const TENANT_ID = "blackhawk-default";

interface EgnyteTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
}

interface EgnyteConnectionMeta {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  domain: string;
}

interface EgnyteApiFile {
  path: string;
  name: string;
  is_folder: boolean;
  size?: number;
  last_modified?: string;
  entry_id?: string;
  checksum?: string;
  uploaded_by?: string;
  uploaded?: string;
}

interface EgnyteApiFolderListing {
  path: string;
  name: string;
  folder_id: string;
  is_folder: boolean;
  files?: EgnyteApiFile[];
  folders?: EgnyteApiFile[];
  total_count?: number;
  offset?: number;
  count?: number;
}

interface EgnyteApiVersion {
  entry_id: string;
  checksum?: string;
  size?: number;
  uploaded_by?: string;
  last_modified?: string;
}

export class EgnyteProvider implements IDocumentStorageProvider {
  readonly providerName = "egnyte";
  
  private domain: string;
  private clientId: string;
  private clientSecret: string;
  private baseUrl: string;

  constructor() {
    this.domain = process.env.EGNYTE_DOMAIN || "";
    this.clientId = process.env.EGNYTE_CLIENT_ID || "";
    this.clientSecret = process.env.EGNYTE_CLIENT_SECRET || "";
    this.baseUrl = `https://${this.domain}.egnyte.com`;
  }

  private isConfigured(): boolean {
    return !!(this.clientId && this.clientSecret && this.domain);
  }

  private async getConnection(): Promise<{ accessToken: string; refreshToken: string } | null> {
    const [connection] = await db.select().from(integrationHealth)
      .where(and(
        eq(integrationHealth.tenantId, TENANT_ID),
        eq(integrationHealth.integrationKey, "egnyte"),
        eq(integrationHealth.status, "connected")
      ))
      .limit(1);

    if (!connection || !connection.metaJson) return null;

    const meta = connection.metaJson as EgnyteConnectionMeta;
    
    if (new Date(meta.expiresAt) < new Date() && meta.refreshToken) {
      try {
        const newTokens = await this.refreshAccessToken(meta.refreshToken);
        await this.saveConnection(newTokens.access_token, newTokens.refresh_token || meta.refreshToken, newTokens.expires_in);
        return { accessToken: newTokens.access_token, refreshToken: newTokens.refresh_token || meta.refreshToken };
      } catch (error) {
        console.error("Failed to refresh Egnyte token:", error);
        return null;
      }
    }

    return { accessToken: meta.accessToken, refreshToken: meta.refreshToken };
  }

  private async refreshAccessToken(refreshToken: string): Promise<EgnyteTokenResponse> {
    const response = await fetch(`${this.baseUrl}/puboauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Egnyte token refresh failed: ${error}`);
    }

    return response.json();
  }

  private async saveConnection(accessToken: string, refreshToken: string, expiresIn: number): Promise<void> {
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    
    const meta: EgnyteConnectionMeta = {
      accessToken,
      refreshToken,
      expiresAt,
      domain: this.domain,
    };

    const existing = await db.select().from(integrationHealth)
      .where(and(
        eq(integrationHealth.tenantId, TENANT_ID),
        eq(integrationHealth.integrationKey, "egnyte")
      ))
      .limit(1);

    if (existing.length > 0) {
      await db.update(integrationHealth)
        .set({
          status: "connected",
          lastSuccessAt: new Date(),
          metaJson: meta,
        })
        .where(eq(integrationHealth.id, existing[0].id));
    } else {
      await db.insert(integrationHealth).values({
        tenantId: TENANT_ID,
        integrationKey: "egnyte",
        status: "connected",
        lastSuccessAt: new Date(),
        metaJson: meta,
      });
    }
  }

  private async apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T | null> {
    const connection = await this.getConnection();
    if (!connection) return null;

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`Egnyte API error (${endpoint}):`, error);
      return null;
    }

    if (response.headers.get("content-type")?.includes("application/json")) {
      return response.json();
    }
    
    return null;
  }

  private mapApiFileToDocumentItem(file: EgnyteApiFile): DocumentItem {
    const ext = file.name.split('.').pop()?.toLowerCase();
    return {
      entryId: file.entry_id || file.path,
      path: file.path,
      name: file.name,
      isFolder: file.is_folder,
      fileType: file.is_folder ? undefined : ext,
      mimeType: file.is_folder ? undefined : this.getMimeType(ext || ""),
      sizeBytes: file.size,
      checksum: file.checksum,
      lastModified: file.last_modified ? new Date(file.last_modified) : undefined,
      uploadedBy: file.uploaded_by,
    };
  }

  private getMimeType(ext: string): string {
    const mimeTypes: Record<string, string> = {
      pdf: "application/pdf",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xls: "application/vnd.ms-excel",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ppt: "application/vnd.ms-powerpoint",
      pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      txt: "text/plain",
      csv: "text/csv",
    };
    return mimeTypes[ext] || "application/octet-stream";
  }

  async isConnected(): Promise<boolean> {
    if (!this.isConfigured()) return false;
    const connection = await this.getConnection();
    return connection !== null;
  }

  async getConnectionStatus(): Promise<ConnectionStatus> {
    const connected = await this.isConnected();
    
    let user: string | undefined;
    if (connected) {
      const connection = await this.getConnection();
      if (connection) {
        const userInfo = await this.apiRequest<{ username: string; email: string }>("/pubapi/v1/userinfo");
        user = userInfo?.email || userInfo?.username;
      }
    }

    return {
      connected,
      provider: this.providerName,
      domain: this.domain,
      user,
      lastChecked: new Date(),
      error: !this.isConfigured() ? "Egnyte credentials not configured" : undefined,
    };
  }

  async connect(credentials?: Record<string, string>): Promise<boolean> {
    if (credentials?.code && credentials?.redirectUri) {
      const response = await fetch(`${this.baseUrl}/puboauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          redirect_uri: credentials.redirectUri,
          code: credentials.code,
          grant_type: "authorization_code",
        }),
      });

      if (!response.ok) {
        console.error("Egnyte connection failed:", await response.text());
        return false;
      }

      const tokens: EgnyteTokenResponse = await response.json();
      await this.saveConnection(tokens.access_token, tokens.refresh_token || "", tokens.expires_in);
      return true;
    }
    
    return false;
  }

  async disconnect(): Promise<void> {
    await db.update(integrationHealth)
      .set({ status: "disconnected" })
      .where(and(
        eq(integrationHealth.tenantId, TENANT_ID),
        eq(integrationHealth.integrationKey, "egnyte")
      ));
  }

  async listFolder(path: string = "/Shared", cursor?: string, pageSize: number = 100): Promise<FolderListing> {
    const offset = cursor ? parseInt(cursor, 10) : 0;
    const data = await this.apiRequest<EgnyteApiFolderListing>(
      `/pubapi/v1/fs${path}?list_content=true&offset=${offset}&count=${pageSize}`
    );

    if (!data) {
      return {
        path,
        name: path.split('/').pop() || path,
        folderId: path,
        items: [],
        totalCount: 0,
        hasMore: false,
      };
    }

    const items: DocumentItem[] = [
      ...(data.folders || []).map(f => this.mapApiFileToDocumentItem(f)),
      ...(data.files || []).map(f => this.mapApiFileToDocumentItem(f)),
    ];

    const totalCount = data.total_count || items.length;
    const hasMore = offset + items.length < totalCount;

    return {
      path: data.path,
      name: data.name,
      folderId: data.folder_id,
      items,
      totalCount,
      hasMore,
      cursor: hasMore ? String(offset + pageSize) : undefined,
    };
  }

  async createFolder(parentPath: string, name: string): Promise<DocumentItem> {
    const fullPath = `${parentPath}/${name}`;
    const response = await fetch(`${this.baseUrl}/pubapi/v1/fs${fullPath}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${(await this.getConnection())?.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "add_folder" }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create folder: ${await response.text()}`);
    }

    return {
      entryId: fullPath,
      path: fullPath,
      name,
      isFolder: true,
      createdAt: new Date(),
    };
  }

  async deleteFolder(path: string): Promise<boolean> {
    const connection = await this.getConnection();
    if (!connection) return false;

    const response = await fetch(`${this.baseUrl}/pubapi/v1/fs${path}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${connection.accessToken}` },
    });

    return response.ok;
  }

  async moveFolder(sourcePath: string, destPath: string): Promise<DocumentItem> {
    const connection = await this.getConnection();
    if (!connection) throw new Error("Not connected to Egnyte");

    const response = await fetch(`${this.baseUrl}/pubapi/v1/fs${sourcePath}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "move", destination: destPath }),
    });

    if (!response.ok) {
      throw new Error(`Failed to move folder: ${await response.text()}`);
    }

    return {
      entryId: destPath,
      path: destPath,
      name: destPath.split('/').pop() || destPath,
      isFolder: true,
    };
  }

  async getFile(path: string): Promise<DocumentItem | null> {
    const data = await this.apiRequest<EgnyteApiFile>(`/pubapi/v1/fs${path}`);
    return data ? this.mapApiFileToDocumentItem(data) : null;
  }

  async downloadFile(path: string, versionId?: string): Promise<FileContent | null> {
    const connection = await this.getConnection();
    if (!connection) return null;

    let url = `${this.baseUrl}/pubapi/v1/fs-content${path}`;
    if (versionId) {
      url += `?entry_id=${versionId}`;
    }

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${connection.accessToken}` },
    });

    if (!response.ok) {
      console.error("Egnyte file download failed:", await response.text());
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") || "application/octet-stream";
    const fileName = path.split('/').pop() || "download";

    return { buffer, contentType, fileName };
  }

  async uploadFile(parentPath: string, fileName: string, content: Buffer, contentType: string): Promise<UploadResult> {
    const connection = await this.getConnection();
    if (!connection) throw new Error("Not connected to Egnyte");

    const fullPath = `${parentPath}/${fileName}`;
    const response = await fetch(`${this.baseUrl}/pubapi/v1/fs-content${fullPath}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
        "Content-Type": contentType,
      },
      body: content,
    });

    if (!response.ok) {
      throw new Error(`Failed to upload file: ${await response.text()}`);
    }

    const data = await response.json();
    
    return {
      entryId: data.entry_id || fullPath,
      path: fullPath,
      versionId: data.entry_id,
      checksum: data.checksum,
    };
  }

  async deleteFile(path: string): Promise<boolean> {
    const connection = await this.getConnection();
    if (!connection) return false;

    const response = await fetch(`${this.baseUrl}/pubapi/v1/fs${path}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${connection.accessToken}` },
    });

    return response.ok;
  }

  async moveFile(sourcePath: string, destPath: string): Promise<DocumentItem> {
    return this.moveFolder(sourcePath, destPath);
  }

  async copyFile(sourcePath: string, destPath: string): Promise<DocumentItem> {
    const connection = await this.getConnection();
    if (!connection) throw new Error("Not connected to Egnyte");

    const response = await fetch(`${this.baseUrl}/pubapi/v1/fs${sourcePath}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "copy", destination: destPath }),
    });

    if (!response.ok) {
      throw new Error(`Failed to copy file: ${await response.text()}`);
    }

    return {
      entryId: destPath,
      path: destPath,
      name: destPath.split('/').pop() || destPath,
      isFolder: false,
    };
  }

  async getVersions(path: string): Promise<FileVersion[]> {
    const data = await this.apiRequest<{ versions: EgnyteApiVersion[] }>(`/pubapi/v1/fs${path}/versions`);
    
    if (!data?.versions) return [];

    return data.versions.map((v, index) => ({
      versionId: v.entry_id,
      versionNumber: data.versions.length - index,
      sizeBytes: v.size,
      checksum: v.checksum,
      uploadedBy: v.uploaded_by,
      uploadedAt: v.last_modified ? new Date(v.last_modified) : undefined,
    }));
  }

  async search(query: string, path?: string, fileTypes?: string[]): Promise<SearchResult> {
    let url = `/pubapi/v1/search?query=${encodeURIComponent(query)}`;
    if (path) url += `&folder=${encodeURIComponent(path)}`;
    if (fileTypes?.length) url += `&file_type=${fileTypes.join(',')}`;

    const data = await this.apiRequest<{ results: EgnyteApiFile[]; total_count: number }>(`${url}&count=50`);

    if (!data) {
      return { items: [], totalCount: 0, hasMore: false };
    }

    return {
      items: data.results.map(r => this.mapApiFileToDocumentItem(r)),
      totalCount: data.total_count || data.results.length,
      hasMore: data.results.length >= 50,
    };
  }

  async getChanges(cursor?: SyncCursor): Promise<{ events: SyncEvent[]; cursor: SyncCursor }> {
    const connection = await this.getConnection();
    if (!connection) {
      return { events: [], cursor: { cursor: "", timestamp: new Date() } };
    }

    let url = `/pubapi/v1/events`;
    if (cursor?.cursor) {
      url += `?id=${cursor.cursor}`;
    }

    const data = await this.apiRequest<{ events: any[]; latest_event_id: string }>(`${url}&count=100`);

    if (!data) {
      return { events: [], cursor: cursor || { cursor: "", timestamp: new Date() } };
    }

    const events: SyncEvent[] = data.events.map((e: any) => ({
      eventType: this.mapEventType(e.action),
      entryId: e.target_id || e.path,
      path: e.target_path || e.path,
      oldPath: e.source_path,
      timestamp: new Date(e.timestamp),
      data: e,
    }));

    return {
      events,
      cursor: {
        cursor: data.latest_event_id,
        timestamp: new Date(),
      },
    };
  }

  private mapEventType(action: string): SyncEvent['eventType'] {
    const mapping: Record<string, SyncEvent['eventType']> = {
      create: 'create',
      upload: 'create',
      delete: 'delete',
      move: 'move',
      rename: 'rename',
      copy: 'create',
    };
    return mapping[action] || 'update';
  }

  async generateStreamUrl(path: string, expiresIn: number = 3600): Promise<string | null> {
    const connection = await this.getConnection();
    if (!connection) return null;

    const response = await fetch(`${this.baseUrl}/pubapi/v1/links`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        path,
        type: "file",
        accessibility: "anyone",
        expiry_date: new Date(Date.now() + expiresIn * 1000).toISOString().split('T')[0],
      }),
    });

    if (!response.ok) {
      console.error("Failed to generate Egnyte link:", await response.text());
      return null;
    }

    const data = await response.json();
    return data.links?.[0]?.url || null;
  }

  getAuthorizationUrl(redirectUri: string, state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      state: state,
    });
    return `${this.baseUrl}/puboauth/authorize?${params.toString()}`;
  }
}

export const egnyteProvider = new EgnyteProvider();
