/**
 * Mock Document Storage Provider
 * For automated testing only - NOT for production use
 */

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

interface MockFileSystem {
  [path: string]: {
    item: DocumentItem;
    content?: Buffer;
    versions: FileVersion[];
  };
}

export class MockProvider implements IDocumentStorageProvider {
  readonly providerName = "mock";
  
  private connected = false;
  private fileSystem: MockFileSystem = {};
  private eventLog: SyncEvent[] = [];
  private eventCursor = 0;

  constructor() {
    this.initializeMockData();
  }

  private initializeMockData(): void {
    const mockStructure = [
      { path: "/Shared", name: "Shared", isFolder: true },
      { path: "/Shared/Company Jackets", name: "Company Jackets", isFolder: true },
      { path: "/Shared/Company Jackets/Acme Construction", name: "Acme Construction", isFolder: true },
      { path: "/Shared/Company Jackets/Acme Construction/Bids", name: "Bids", isFolder: true },
      { path: "/Shared/Company Jackets/Acme Construction/Contracts", name: "Contracts", isFolder: true },
      { path: "/Shared/Company Jackets/Acme Construction/Invoices", name: "Invoices", isFolder: true },
      { path: "/Shared/Company Jackets/Acme Construction/Bids/Federal Building Renovation.pdf", name: "Federal Building Renovation.pdf", isFolder: false, sizeBytes: 245000 },
      { path: "/Shared/Company Jackets/Acme Construction/Contracts/Master Agreement 2024.docx", name: "Master Agreement 2024.docx", isFolder: false, sizeBytes: 89000 },
      { path: "/Shared/Company Jackets/BlackHawk Construction", name: "BlackHawk Construction", isFolder: true },
      { path: "/Shared/Company Jackets/BlackHawk Construction/Projects", name: "Projects", isFolder: true },
      { path: "/Shared/Company Jackets/BlackHawk Construction/Projects/HVAC Modernization", name: "HVAC Modernization", isFolder: true },
      { path: "/Shared/Company Jackets/BlackHawk Construction/Projects/HVAC Modernization/Specs.pdf", name: "Specs.pdf", isFolder: false, sizeBytes: 1500000 },
    ];

    mockStructure.forEach((item, index) => {
      const ext = item.name.split('.').pop()?.toLowerCase();
      const parentPath = item.path.split('/').slice(0, -1).join('/') || '/';
      
      this.fileSystem[item.path] = {
        item: {
          entryId: `mock-${index + 1}`,
          path: item.path,
          name: item.name,
          isFolder: item.isFolder,
          parentId: parentPath !== '/' ? `mock-${mockStructure.findIndex(m => m.path === parentPath) + 1}` : undefined,
          fileType: item.isFolder ? undefined : ext,
          mimeType: item.isFolder ? undefined : this.getMimeType(ext || ""),
          sizeBytes: item.sizeBytes,
          lastModified: new Date(),
          createdAt: new Date(),
        },
        content: item.isFolder ? undefined : Buffer.from(`Mock content for ${item.name}`),
        versions: item.isFolder ? [] : [{
          versionId: `v1-mock-${index + 1}`,
          versionNumber: 1,
          sizeBytes: item.sizeBytes,
          uploadedAt: new Date(),
        }],
      };
    });
  }

  private getMimeType(ext: string): string {
    const mimeTypes: Record<string, string> = {
      pdf: "application/pdf",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      jpg: "image/jpeg",
      png: "image/png",
      txt: "text/plain",
    };
    return mimeTypes[ext] || "application/octet-stream";
  }

  async isConnected(): Promise<boolean> {
    return this.connected;
  }

  async getConnectionStatus(): Promise<ConnectionStatus> {
    return {
      connected: this.connected,
      provider: this.providerName,
      domain: "mock.local",
      user: this.connected ? "test@mock.local" : undefined,
      lastChecked: new Date(),
    };
  }

  async connect(): Promise<boolean> {
    this.connected = true;
    return true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async listFolder(path: string = "/Shared", cursor?: string, pageSize: number = 100): Promise<FolderListing> {
    const offset = cursor ? parseInt(cursor, 10) : 0;
    
    const items: DocumentItem[] = [];
    for (const [itemPath, data] of Object.entries(this.fileSystem)) {
      const parentPath = itemPath.split('/').slice(0, -1).join('/') || '/';
      if (parentPath === path) {
        items.push(data.item);
      }
    }

    const paginatedItems = items.slice(offset, offset + pageSize);
    const hasMore = offset + pageSize < items.length;

    return {
      path,
      name: path.split('/').pop() || path,
      folderId: `mock-folder-${path}`,
      items: paginatedItems,
      totalCount: items.length,
      hasMore,
      cursor: hasMore ? String(offset + pageSize) : undefined,
    };
  }

  async createFolder(parentPath: string, name: string): Promise<DocumentItem> {
    const fullPath = `${parentPath}/${name}`;
    const entryId = `mock-${Date.now()}`;
    
    const item: DocumentItem = {
      entryId,
      path: fullPath,
      name,
      isFolder: true,
      createdAt: new Date(),
    };

    this.fileSystem[fullPath] = { item, versions: [] };
    this.addEvent('create', entryId, fullPath);

    return item;
  }

  async deleteFolder(path: string): Promise<boolean> {
    const entry = this.fileSystem[path];
    if (!entry) return false;

    for (const key of Object.keys(this.fileSystem)) {
      if (key.startsWith(path)) {
        delete this.fileSystem[key];
      }
    }
    
    this.addEvent('delete', entry.item.entryId, path);
    return true;
  }

  async moveFolder(sourcePath: string, destPath: string): Promise<DocumentItem> {
    const entry = this.fileSystem[sourcePath];
    if (!entry) throw new Error("Folder not found");

    const updatedItem = { ...entry.item, path: destPath };
    this.fileSystem[destPath] = { ...entry, item: updatedItem };
    delete this.fileSystem[sourcePath];

    this.addEvent('move', entry.item.entryId, destPath, sourcePath);
    return updatedItem;
  }

  async getFile(path: string): Promise<DocumentItem | null> {
    const entry = this.fileSystem[path];
    return entry?.item || null;
  }

  async downloadFile(path: string): Promise<FileContent | null> {
    const entry = this.fileSystem[path];
    if (!entry || entry.item.isFolder) return null;

    return {
      buffer: entry.content || Buffer.from("Mock file content"),
      contentType: entry.item.mimeType || "application/octet-stream",
      fileName: entry.item.name,
    };
  }

  async uploadFile(parentPath: string, fileName: string, content: Buffer, contentType: string): Promise<UploadResult> {
    const fullPath = `${parentPath}/${fileName}`;
    const entryId = `mock-${Date.now()}`;
    const ext = fileName.split('.').pop()?.toLowerCase();

    const item: DocumentItem = {
      entryId,
      path: fullPath,
      name: fileName,
      isFolder: false,
      fileType: ext,
      mimeType: contentType,
      sizeBytes: content.length,
      lastModified: new Date(),
      createdAt: new Date(),
    };

    this.fileSystem[fullPath] = {
      item,
      content,
      versions: [{
        versionId: `v1-${entryId}`,
        versionNumber: 1,
        sizeBytes: content.length,
        uploadedAt: new Date(),
      }],
    };

    this.addEvent('create', entryId, fullPath);

    return {
      entryId,
      path: fullPath,
      versionId: `v1-${entryId}`,
    };
  }

  async deleteFile(path: string): Promise<boolean> {
    return this.deleteFolder(path);
  }

  async moveFile(sourcePath: string, destPath: string): Promise<DocumentItem> {
    return this.moveFolder(sourcePath, destPath);
  }

  async copyFile(sourcePath: string, destPath: string): Promise<DocumentItem> {
    const entry = this.fileSystem[sourcePath];
    if (!entry) throw new Error("File not found");

    const newEntryId = `mock-${Date.now()}`;
    const copiedItem = { ...entry.item, entryId: newEntryId, path: destPath };
    
    this.fileSystem[destPath] = {
      item: copiedItem,
      content: entry.content ? Buffer.from(entry.content) : undefined,
      versions: [...entry.versions],
    };

    this.addEvent('create', newEntryId, destPath);
    return copiedItem;
  }

  async getVersions(path: string): Promise<FileVersion[]> {
    const entry = this.fileSystem[path];
    return entry?.versions || [];
  }

  async search(query: string): Promise<SearchResult> {
    const queryLower = query.toLowerCase();
    const items: DocumentItem[] = [];

    for (const entry of Object.values(this.fileSystem)) {
      if (
        entry.item.name.toLowerCase().includes(queryLower) ||
        entry.item.path.toLowerCase().includes(queryLower)
      ) {
        items.push(entry.item);
      }
    }

    return {
      items,
      totalCount: items.length,
      hasMore: false,
    };
  }

  async getChanges(cursor?: SyncCursor): Promise<{ events: SyncEvent[]; cursor: SyncCursor }> {
    const startIndex = cursor ? parseInt(cursor.cursor, 10) : 0;
    const events = this.eventLog.slice(startIndex);

    return {
      events,
      cursor: {
        cursor: String(this.eventLog.length),
        timestamp: new Date(),
      },
    };
  }

  private addEvent(
    eventType: SyncEvent['eventType'],
    entryId: string,
    path: string,
    oldPath?: string
  ): void {
    this.eventLog.push({
      eventType,
      entryId,
      path,
      oldPath,
      timestamp: new Date(),
    });
  }

  async generateStreamUrl(path: string): Promise<string | null> {
    return `mock://stream/${encodeURIComponent(path)}?token=mock-token`;
  }

  reset(): void {
    this.fileSystem = {};
    this.eventLog = [];
    this.connected = false;
    this.initializeMockData();
  }
}

export const mockProvider = new MockProvider();
