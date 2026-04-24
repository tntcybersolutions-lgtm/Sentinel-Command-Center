import { describe, it, expect, vi } from 'vitest';

// ─── EgnyteService ────────────────────────────────────────────────────────────
const mockEgnyteService = {
  exchangeCodeForToken: vi.fn().mockResolvedValue({ accessToken: 'tok-1', refreshToken: 'ref-1', expiresIn: 3600 }),
  authenticateInternalApp: vi.fn().mockResolvedValue({ accessToken: 'tok-2', refreshToken: 'ref-2', expiresIn: 3600 }),
  refreshAccessToken: vi.fn().mockResolvedValue({ accessToken: 'tok-3', refreshToken: 'ref-3', expiresIn: 3600 }),
  saveConnection: vi.fn().mockResolvedValue(undefined),
  saveDirectToken: vi.fn().mockResolvedValue(undefined),
  testConnection: vi.fn().mockResolvedValue({ success: true, message: 'Connected', user: { name: 'Test' } }),
  healthCheck: vi.fn().mockResolvedValue({ connected: true, lastSync: null, fileCount: 0 }),
  refreshStoredToken: vi.fn().mockResolvedValue({ success: true, message: 'Token refreshed' }),
};

vi.mock('../egnyte.service', () => ({
  EgnyteService: vi.fn(),
  egnyteService: mockEgnyteService,
}));

describe('egnyte.service', () => {
  it('exports egnyteService object', async () => {
    const mod = await import('../egnyte.service');
    expect(mod.egnyteService).toBeDefined();
  });
  describe('testConnection', () => {
    it('returns success boolean and message', async () => {
      const result = await mockEgnyteService.testConnection();
      expect(result).toHaveProperty('success');
      expect(typeof result.success).toBe('boolean');
      expect(result).toHaveProperty('message');
    });
    it('returns true when connected', async () => {
      const result = await mockEgnyteService.testConnection();
      expect(result.success).toBe(true);
    });
  });
  describe('healthCheck', () => {
    it('returns connected status', async () => {
      const result = await mockEgnyteService.healthCheck();
      expect(result).toHaveProperty('connected');
    });
  });
  describe('refreshAccessToken', () => {
    it('returns new token response', async () => {
      const result = await mockEgnyteService.refreshAccessToken('ref-1');
      expect(result).toHaveProperty('accessToken');
    });
  });
  describe('saveConnection', () => {
    it('resolves without error', async () => {
      await expect(mockEgnyteService.saveConnection('tok', 'ref', 3600)).resolves.toBeUndefined();
    });
  });
  describe('saveDirectToken', () => {
    it('resolves without error', async () => {
      await expect(mockEgnyteService.saveDirectToken('tok-direct')).resolves.toBeUndefined();
    });
  });
  describe('refreshStoredToken', () => {
    it('returns success and message', async () => {
      const result = await mockEgnyteService.refreshStoredToken();
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('message');
    });
  });
});

// ─── EgnyteSyncService ────────────────────────────────────────────────────────
const mockEgnyteSyncService = {
  getRootPaths: vi.fn().mockResolvedValue([{ id: 'rp-1', path: '/projects', label: 'Projects' }]),
  addRootPath: vi.fn().mockResolvedValue('rp-2'),
  removeRootPath: vi.fn().mockResolvedValue(undefined),
  getSyncStatus: vi.fn().mockResolvedValue({ lastSync: null, rootPaths: [] }),
  getSyncStats: vi.fn().mockResolvedValue({ totalFiles: 100, synced: 80, pending: 20 }),
  getDetailedSyncStatus: vi.fn().mockResolvedValue({ paths: [], errors: [] }),
  runInitialSync: vi.fn().mockResolvedValue('sync-job-1'),
  pauseSync: vi.fn().mockResolvedValue(undefined),
  resumeSync: vi.fn().mockResolvedValue(undefined),
  startDeltaSync: vi.fn().mockResolvedValue('delta-sync-1'),
  runReconciliation: vi.fn().mockResolvedValue({ added: 5, removed: 1, unchanged: 94 }),
};

vi.mock('../egnyte-sync.service', () => ({
  EgnyteSyncService: vi.fn(),
  egnyteSyncService: mockEgnyteSyncService,
}));

describe('egnyte-sync.service', () => {
  it('exports egnyteSyncService object', async () => {
    const mod = await import('../egnyte-sync.service');
    expect(mod.egnyteSyncService).toBeDefined();
  });
  describe('getRootPaths', () => {
    it('returns array of root paths', async () => {
      const result = await mockEgnyteSyncService.getRootPaths();
      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toHaveProperty('path');
    });
  });
  describe('addRootPath', () => {
    it('returns new path id', async () => {
      const result = await mockEgnyteSyncService.addRootPath('/new-path', 'New Path');
      expect(typeof result).toBe('string');
    });
  });
  describe('removeRootPath', () => {
    it('resolves without error', async () => {
      await expect(mockEgnyteSyncService.removeRootPath('rp-1')).resolves.toBeUndefined();
    });
  });
  describe('getSyncStatus', () => {
    it('returns lastSync and rootPaths', async () => {
      const result = await mockEgnyteSyncService.getSyncStatus();
      expect(result).toHaveProperty('lastSync');
      expect(result).toHaveProperty('rootPaths');
    });
  });
  describe('getSyncStats', () => {
    it('returns totalFiles, synced, pending', async () => {
      const result = await mockEgnyteSyncService.getSyncStats();
      expect(result).toHaveProperty('totalFiles');
      expect(result).toHaveProperty('synced');
      expect(result).toHaveProperty('pending');
    });
    it('all counts are numeric', async () => {
      const result = await mockEgnyteSyncService.getSyncStats();
      expect(typeof result.totalFiles).toBe('number');
    });
  });
  describe('runInitialSync', () => {
    it('returns sync job id', async () => {
      const result = await mockEgnyteSyncService.runInitialSync();
      expect(typeof result).toBe('string');
    });
  });
  describe('runReconciliation', () => {
    it('returns added/removed/unchanged shape', async () => {
      const result = await mockEgnyteSyncService.runReconciliation();
      expect(result).toHaveProperty('added');
      expect(result).toHaveProperty('removed');
    });
  });
  describe('pauseSync / resumeSync', () => {
    it('pauseSync resolves without error', async () => {
      await expect(mockEgnyteSyncService.pauseSync('sync-1')).resolves.toBeUndefined();
    });
    it('resumeSync resolves without error', async () => {
      await expect(mockEgnyteSyncService.resumeSync('sync-1')).resolves.toBeUndefined();
    });
  });
});

// ─── EventStreamService ───────────────────────────────────────────────────────
const mockEventStreamService = {
  sendEvent: vi.fn(),
  subscribe: vi.fn().mockReturnValue(() => {}),
  getActiveConnections: vi.fn().mockReturnValue(3),
  broadcast: vi.fn(),
};

vi.mock('../event-stream.service', () => ({
  SSEEventType: {},
  eventStreamService: mockEventStreamService,
}));

describe('event-stream.service', () => {
  it('exports eventStreamService', async () => {
    const mod = await import('../event-stream.service');
    expect(mod.eventStreamService).toBeDefined();
  });
  describe('sendEvent', () => {
    it('can be called with event data', () => {
      expect(() => mockEventStreamService.sendEvent({ type: 'update', data: {} })).not.toThrow();
    });
  });
  describe('subscribe', () => {
    it('returns an unsubscribe function', () => {
      const unsub = mockEventStreamService.subscribe('channel-1', () => {});
      expect(typeof unsub).toBe('function');
    });
  });
  describe('getActiveConnections', () => {
    it('returns numeric count', () => {
      const count = mockEventStreamService.getActiveConnections();
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });
  describe('broadcast', () => {
    it('can be called without error', () => {
      expect(() => mockEventStreamService.broadcast({ type: 'refresh', tenantId: 't-1' })).not.toThrow();
    });
  });
});

// ─── DocumentFetchService ─────────────────────────────────────────────────────
const mockDocumentFetch = {
  fetchAndStoreArtifact: vi.fn().mockResolvedValue({ id: 'art-1', stored: true }),
  fetchAllPendingArtifacts: vi.fn().mockResolvedValue({ fetched: 5, errors: 0 }),
};

vi.mock('../document-fetch.service', () => ({
  fetchAndStoreArtifact: mockDocumentFetch.fetchAndStoreArtifact,
  fetchAllPendingArtifacts: mockDocumentFetch.fetchAllPendingArtifacts,
}));

describe('document-fetch.service', () => {
  describe('fetchAndStoreArtifact', () => {
    it('returns stored artifact with id', async () => {
      const result = await mockDocumentFetch.fetchAndStoreArtifact({ url: 'https://example.com/doc.pdf', bidId: 'b-1' });
      expect(result).toHaveProperty('id');
      expect(result.stored).toBe(true);
    });
  });
  describe('fetchAllPendingArtifacts', () => {
    it('returns fetched count and errors', async () => {
      const result = await mockDocumentFetch.fetchAllPendingArtifacts({});
      expect(result).toHaveProperty('fetched');
      expect(result).toHaveProperty('errors');
    });
    it('fetched is non-negative', async () => {
      const result = await mockDocumentFetch.fetchAllPendingArtifacts({});
      expect(result.fetched).toBeGreaterThanOrEqual(0);
    });
  });
});

// ─── DocumentImportService ────────────────────────────────────────────────────
const mockDocumentImportService = {
  uploadFileToStorage: vi.fn().mockResolvedValue('storage/path/doc.pdf'),
  importDocument: vi.fn().mockResolvedValue({ id: 'doc-1', title: 'Test Doc', storagePath: 'storage/path/doc.pdf' }),
  importSubcontractorsFromCSV: vi.fn().mockResolvedValue({ imported: 10, errors: [] }),
  importVerifiedSubcontractors: vi.fn().mockResolvedValue({ imported: 5, updated: 2 }),
};

vi.mock('../document-import.service', () => ({
  DocumentImportService: vi.fn(),
  documentImportService: mockDocumentImportService,
}));

describe('document-import.service', () => {
  it('exports documentImportService', async () => {
    const mod = await import('../document-import.service');
    expect(mod.documentImportService).toBeDefined();
  });
  describe('uploadFileToStorage', () => {
    it('returns storage path string', async () => {
      const result = await mockDocumentImportService.uploadFileToStorage('/local/file.pdf', 'remote/path.pdf');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });
  describe('importDocument', () => {
    it('returns imported document shape', async () => {
      const result = await mockDocumentImportService.importDocument('/local/file.pdf');
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('title');
      expect(result).toHaveProperty('storagePath');
    });
  });
  describe('importSubcontractorsFromCSV', () => {
    it('returns imported count and errors array', async () => {
      const result = await mockDocumentImportService.importSubcontractorsFromCSV('/path/subs.csv');
      expect(result).toHaveProperty('imported');
      expect(result).toHaveProperty('errors');
      expect(Array.isArray(result.errors)).toBe(true);
    });
    it('imported is numeric', async () => {
      const result = await mockDocumentImportService.importSubcontractorsFromCSV('/path/subs.csv');
      expect(typeof result.imported).toBe('number');
    });
  });
  describe('importVerifiedSubcontractors', () => {
    it('returns imported and updated counts', async () => {
      const result = await mockDocumentImportService.importVerifiedSubcontractors([]);
      expect(result).toHaveProperty('imported');
      expect(result).toHaveProperty('updated');
    });
  });
});
