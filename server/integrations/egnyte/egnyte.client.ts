import { auditService } from "../../services/audit.service";
import { approvalService } from "../../services/approval.service";

interface EgnyteTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
}

interface EgnyteFile {
  path: string;
  name: string;
  lastModified: string;
  size: number;
  checksum: string;
  entryId: string;
  groupId: string;
  uploadedBy: string;
  numVersions: number;
  isFolderRoot: boolean;
}

interface EgnyteFolder {
  path: string;
  name: string;
  folderId: string;
  isFolder: boolean;
  files?: EgnyteFile[];
  folders?: EgnyteFolder[];
  count: number;
  offset: number;
  totalCount: number;
}

interface EgnyteLink {
  links: Array<{
    id: string;
    url: string;
    path: string;
    type: string;
    accessibility: string;
    creationDate: string;
    expiryDate?: string;
  }>;
}

export class EgnyteClient {
  private domain: string;
  private accessToken: string;
  private baseUrl: string;

  constructor(domain: string, accessToken: string) {
    this.domain = domain;
    this.accessToken = accessToken;
    this.baseUrl = `https://${domain}.egnyte.com/pubapi/v1`;
  }

  private async makeRequest(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const url = `${this.baseUrl}${endpoint}`;
    
    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
    });
  }

  async listFolder(path: string = "/"): Promise<EgnyteFolder> {
    const encodedPath = encodeURIComponent(path);
    const response = await this.makeRequest(`/fs${encodedPath}`);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to list folder: ${error}`);
    }

    return response.json();
  }

  async getFileMetadata(path: string): Promise<EgnyteFile> {
    const encodedPath = encodeURIComponent(path);
    const response = await this.makeRequest(`/fs${encodedPath}`);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get file metadata: ${error}`);
    }

    return response.json();
  }

  async downloadFile(path: string): Promise<ArrayBuffer> {
    const encodedPath = encodeURIComponent(path);
    const response = await fetch(
      `${this.baseUrl}/fs-content${encodedPath}`,
      {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to download file: ${error}`);
    }

    return response.arrayBuffer();
  }

  async uploadFile(
    folderPath: string,
    fileName: string,
    content: Buffer | ArrayBuffer,
    contentType: string = "application/octet-stream"
  ): Promise<{ checksum: string; groupId: string; entryId: string }> {
    const path = folderPath.endsWith("/")
      ? `${folderPath}${fileName}`
      : `${folderPath}/${fileName}`;
    const encodedPath = encodeURIComponent(path);

    const response = await fetch(
      `${this.baseUrl}/fs-content${encodedPath}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": contentType,
        },
        body: content,
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to upload file: ${error}`);
    }

    return response.json();
  }

  async createFolder(path: string): Promise<void> {
    const encodedPath = encodeURIComponent(path);
    const response = await this.makeRequest(`/fs${encodedPath}`, {
      method: "POST",
      body: JSON.stringify({ action: "add_folder" }),
    });

    if (!response.ok && response.status !== 405) {
      const error = await response.text();
      throw new Error(`Failed to create folder: ${error}`);
    }
  }

  async deleteItem(path: string): Promise<void> {
    const encodedPath = encodeURIComponent(path);
    const response = await this.makeRequest(`/fs${encodedPath}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to delete item: ${error}`);
    }
  }

  async moveItem(sourcePath: string, destinationPath: string): Promise<void> {
    const encodedSource = encodeURIComponent(sourcePath);
    const response = await this.makeRequest(`/fs${encodedSource}`, {
      method: "POST",
      body: JSON.stringify({
        action: "move",
        destination: destinationPath,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to move item: ${error}`);
    }
  }

  async copyItem(sourcePath: string, destinationPath: string): Promise<void> {
    const encodedSource = encodeURIComponent(sourcePath);
    const response = await this.makeRequest(`/fs${encodedSource}`, {
      method: "POST",
      body: JSON.stringify({
        action: "copy",
        destination: destinationPath,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to copy item: ${error}`);
    }
  }

  async createLink(
    path: string,
    type: "file" | "folder" = "file",
    options: {
      accessibility?: "anyone" | "password" | "domain" | "recipients";
      expiryDate?: string;
      password?: string;
      sendEmail?: boolean;
      recipients?: string[];
    } = {}
  ): Promise<EgnyteLink> {
    const response = await this.makeRequest("/links", {
      method: "POST",
      body: JSON.stringify({
        path,
        type,
        accessibility: options.accessibility || "anyone",
        expiry_date: options.expiryDate,
        password: options.password,
        send_email: options.sendEmail || false,
        recipients: options.recipients,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create link: ${error}`);
    }

    return response.json();
  }

  async listLinks(path?: string): Promise<EgnyteLink> {
    const queryParams = path ? `?path=${encodeURIComponent(path)}` : "";
    const response = await this.makeRequest(`/links${queryParams}`);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to list links: ${error}`);
    }

    return response.json();
  }

  async deleteLink(linkId: string): Promise<void> {
    const response = await this.makeRequest(`/links/${linkId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to delete link: ${error}`);
    }
  }

  async searchFiles(query: string, path?: string): Promise<{ results: EgnyteFile[]; totalCount: number }> {
    const params = new URLSearchParams({ query });
    if (path) params.append("folder", path);
    
    const response = await this.makeRequest(`/search?${params.toString()}`);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to search files: ${error}`);
    }

    return response.json();
  }
}

export class EgnyteService {
  private client: EgnyteClient | null = null;
  private appTenantId: string;

  constructor(appTenantId: string) {
    this.appTenantId = appTenantId;

    const domain = process.env.EGNYTE_DOMAIN;
    const accessToken = process.env.EGNYTE_ACCESS_TOKEN;

    if (domain && accessToken) {
      this.client = new EgnyteClient(domain, accessToken);
    }
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async listProjectFolder(projectId: string, subPath: string = ""): Promise<EgnyteFolder | null> {
    if (!this.client) {
      console.warn("Egnyte client not configured");
      return null;
    }

    const basePath = `/Shared/Projects/${projectId}${subPath ? `/${subPath}` : ""}`;
    
    try {
      const folder = await this.client.listFolder(basePath);
      
      await auditService.logEvent({
        tenantId: this.appTenantId,
        eventType: "egnyte_folder_listed",
        actor: "system",
        entityType: "project",
        entityId: projectId,
        afterJson: { path: basePath, count: folder.count },
      });

      return folder;
    } catch (error) {
      console.error("Error listing Egnyte folder:", error);
      return null;
    }
  }

  async uploadProjectDocument(
    projectId: string,
    fileName: string,
    content: Buffer | ArrayBuffer,
    contentType: string,
    actor: string,
    subPath: string = ""
  ): Promise<{ success: boolean; entryId?: string; approvalRequired?: boolean; requestId?: string }> {
    const approval = await approvalService.checkApproval(
      this.appTenantId,
      "project",
      projectId,
      "document_upload"
    );

    if (!approval.approved) {
      const requestId = await approvalService.createRequest({
        tenantId: this.appTenantId,
        entityType: "project",
        entityId: projectId,
        actionType: "document_upload",
        requestedBy: actor,
        metadata: { fileName, contentType, subPath },
      });

      return { success: false, approvalRequired: true, requestId };
    }

    if (!this.client) {
      throw new Error("Egnyte client not configured");
    }

    const folderPath = `/Shared/Projects/${projectId}${subPath ? `/${subPath}` : ""}`;
    
    try {
      await this.client.createFolder(folderPath);
    } catch {
    }

    const result = await this.client.uploadFile(folderPath, fileName, content, contentType);

    await auditService.logEvent({
      tenantId: this.appTenantId,
      eventType: "egnyte_document_uploaded",
      actor,
      entityType: "project",
      entityId: projectId,
      afterJson: { fileName, path: folderPath, entryId: result.entryId },
    });

    return { success: true, entryId: result.entryId };
  }

  async downloadProjectDocument(
    projectId: string,
    filePath: string,
    actor: string
  ): Promise<ArrayBuffer | null> {
    if (!this.client) {
      console.warn("Egnyte client not configured");
      return null;
    }

    const fullPath = `/Shared/Projects/${projectId}/${filePath}`;
    
    try {
      const content = await this.client.downloadFile(fullPath);

      await auditService.logEvent({
        tenantId: this.appTenantId,
        eventType: "egnyte_document_downloaded",
        actor,
        entityType: "project",
        entityId: projectId,
        afterJson: { path: fullPath },
      });

      return content;
    } catch (error) {
      console.error("Error downloading from Egnyte:", error);
      return null;
    }
  }

  async createShareLink(
    projectId: string,
    filePath: string,
    actor: string,
    options: {
      accessibility?: "anyone" | "password" | "domain" | "recipients";
      expiryDays?: number;
      password?: string;
    } = {}
  ): Promise<{ url?: string; linkId?: string; approvalRequired?: boolean; requestId?: string }> {
    const approval = await approvalService.checkApproval(
      this.appTenantId,
      "project",
      projectId,
      "share_link_create"
    );

    if (!approval.approved) {
      const requestId = await approvalService.createRequest({
        tenantId: this.appTenantId,
        entityType: "project",
        entityId: projectId,
        actionType: "share_link_create",
        requestedBy: actor,
        metadata: { filePath, ...options },
      });

      return { approvalRequired: true, requestId };
    }

    if (!this.client) {
      throw new Error("Egnyte client not configured");
    }

    const fullPath = `/Shared/Projects/${projectId}/${filePath}`;
    
    const expiryDate = options.expiryDays
      ? new Date(Date.now() + options.expiryDays * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
      : undefined;

    const result = await this.client.createLink(fullPath, "file", {
      accessibility: options.accessibility,
      expiryDate,
      password: options.password,
    });

    const link = result.links[0];

    await auditService.logEvent({
      tenantId: this.appTenantId,
      eventType: "egnyte_share_link_created",
      actor,
      entityType: "project",
      entityId: projectId,
      afterJson: { path: fullPath, linkId: link.id, url: link.url },
    });

    return { url: link.url, linkId: link.id };
  }

  async deleteProjectDocument(
    projectId: string,
    filePath: string,
    actor: string
  ): Promise<{ success: boolean; approvalRequired?: boolean; requestId?: string }> {
    const approval = await approvalService.checkApproval(
      this.appTenantId,
      "project",
      projectId,
      "document_delete"
    );

    if (!approval.approved) {
      const requestId = await approvalService.createRequest({
        tenantId: this.appTenantId,
        entityType: "project",
        entityId: projectId,
        actionType: "document_delete",
        requestedBy: actor,
        metadata: { filePath, priority: "high" },
      });

      return { success: false, approvalRequired: true, requestId };
    }

    if (!this.client) {
      throw new Error("Egnyte client not configured");
    }

    const fullPath = `/Shared/Projects/${projectId}/${filePath}`;
    await this.client.deleteItem(fullPath);

    await auditService.logEvent({
      tenantId: this.appTenantId,
      eventType: "egnyte_document_deleted",
      actor,
      entityType: "project",
      entityId: projectId,
      afterJson: { path: fullPath },
    });

    return { success: true };
  }

  async searchProjectDocuments(
    projectId: string,
    query: string,
    actor: string
  ): Promise<EgnyteFile[]> {
    if (!this.client) {
      console.warn("Egnyte client not configured");
      return [];
    }

    const basePath = `/Shared/Projects/${projectId}`;
    
    try {
      const result = await this.client.searchFiles(query, basePath);

      await auditService.logEvent({
        tenantId: this.appTenantId,
        eventType: "egnyte_search_performed",
        actor,
        entityType: "project",
        entityId: projectId,
        afterJson: { query, resultCount: result.totalCount },
      });

      return result.results;
    } catch (error) {
      console.error("Error searching Egnyte:", error);
      return [];
    }
  }

  async createProjectFolder(
    projectId: string,
    folderName: string,
    actor: string,
    parentPath: string = ""
  ): Promise<{ success: boolean }> {
    if (!this.client) {
      throw new Error("Egnyte client not configured");
    }

    const fullPath = `/Shared/Projects/${projectId}${parentPath ? `/${parentPath}` : ""}/${folderName}`;
    await this.client.createFolder(fullPath);

    await auditService.logEvent({
      tenantId: this.appTenantId,
      eventType: "egnyte_folder_created",
      actor,
      entityType: "project",
      entityId: projectId,
      afterJson: { path: fullPath },
    });

    return { success: true };
  }
}

export function createEgnyteService(appTenantId: string): EgnyteService {
  return new EgnyteService(appTenantId);
}
