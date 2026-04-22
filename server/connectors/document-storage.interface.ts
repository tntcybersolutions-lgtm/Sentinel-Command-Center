/**
 * Document Storage Connector Interface
 * Provides a unified abstraction layer for document storage providers (Egnyte, local mock, etc.)
 */

export interface DocumentItem {
  entryId: string;
  path: string;
  name: string;
  isFolder: boolean;
  parentId?: string;
  fileType?: string;
  mimeType?: string;
  sizeBytes?: number;
  checksum?: string;
  lastModified?: Date;
  createdAt?: Date;
  uploadedBy?: string;
}

export interface FolderListing {
  path: string;
  name: string;
  folderId: string;
  items: DocumentItem[];
  totalCount: number;
  hasMore: boolean;
  cursor?: string;
}

export interface FileVersion {
  versionId: string;
  versionNumber: number;
  sizeBytes?: number;
  checksum?: string;
  uploadedBy?: string;
  uploadedAt?: Date;
}

export interface FileContent {
  buffer: Buffer;
  contentType: string;
  fileName: string;
}

export interface UploadResult {
  entryId: string;
  path: string;
  versionId?: string;
  checksum?: string;
}

export interface SyncEvent {
  eventType: 'create' | 'update' | 'delete' | 'move' | 'rename' | 'version';
  entryId: string;
  path: string;
  oldPath?: string;
  timestamp: Date;
  data?: Record<string, unknown>;
}

export interface SyncCursor {
  cursor: string;
  timestamp: Date;
}

export interface SearchResult {
  items: DocumentItem[];
  totalCount: number;
  hasMore: boolean;
}

export interface ConnectionStatus {
  connected: boolean;
  provider: string;
  domain?: string;
  user?: string;
  lastChecked: Date;
  error?: string;
}

/**
 * Document Storage Provider Interface
 * All storage providers (Egnyte, mock, etc.) must implement this interface
 */
export interface IDocumentStorageProvider {
  readonly providerName: string;
  
  // Connection management
  isConnected(): Promise<boolean>;
  getConnectionStatus(): Promise<ConnectionStatus>;
  connect(credentials?: Record<string, string>): Promise<boolean>;
  disconnect(): Promise<void>;
  
  // Folder operations
  listFolder(path: string, cursor?: string, pageSize?: number): Promise<FolderListing>;
  createFolder(parentPath: string, name: string): Promise<DocumentItem>;
  deleteFolder(path: string): Promise<boolean>;
  moveFolder(sourcePath: string, destPath: string): Promise<DocumentItem>;
  
  // File operations
  getFile(path: string): Promise<DocumentItem | null>;
  downloadFile(path: string, versionId?: string): Promise<FileContent | null>;
  uploadFile(parentPath: string, fileName: string, content: Buffer, contentType: string): Promise<UploadResult>;
  deleteFile(path: string): Promise<boolean>;
  moveFile(sourcePath: string, destPath: string): Promise<DocumentItem>;
  copyFile(sourcePath: string, destPath: string): Promise<DocumentItem>;
  
  // Version operations
  getVersions(path: string): Promise<FileVersion[]>;
  
  // Search
  search(query: string, path?: string, fileTypes?: string[]): Promise<SearchResult>;
  
  // Sync operations
  getChanges(cursor?: SyncCursor): Promise<{ events: SyncEvent[]; cursor: SyncCursor }>;
  
  // Utility
  generateStreamUrl(path: string, expiresIn?: number): Promise<string | null>;
}

/**
 * Document Storage Connector
 * Factory that provides the appropriate storage provider based on configuration
 */
export interface IDocumentStorageConnector {
  getProvider(): IDocumentStorageProvider;
  getProviderName(): string;
  isProduction(): boolean;
}
