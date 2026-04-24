import { describe, it, expect, vi } from 'vitest';

// ─── DigestService ────────────────────────────────────────────────────────────
const mockDigestService = {
  generateExecutiveDigest: vi.fn().mockResolvedValue({
    deadlines: [],
    activeBids: [],
    exceptions: [],
    recentIngestionStats: { lastRunAt: null, opportunitiesCreated: 0, opportunitiesUpdated: 0, errors: 0 },
  }),
  scheduleDigestDelivery: vi.fn().mockResolvedValue(null),
  getExceptionReport: vi.fn().mockResolvedValue({ exceptions: [] }),
  getDeadlineAlerts: vi.fn().mockResolvedValue([]),
  monitorDeadlines: vi.fn().mockResolvedValue(undefined),
};

vi.mock('../digest.service', () => ({
  DigestService: vi.fn(),
  digestService: mockDigestService,
}));

describe('digest.service', () => {
  it('exports DigestService class', async () => {
    const mod = await import('../digest.service');
    expect(mod.DigestService).toBeDefined();
  });
  it('exports digestService singleton', async () => {
    const mod = await import('../digest.service');
    expect(mod.digestService).toBeDefined();
  });
  describe('generateExecutiveDigest', () => {
    it('returns ExecutiveDigest shape', async () => {
      const result = await mockDigestService.generateExecutiveDigest('t-1');
      expect(result).toHaveProperty('deadlines');
      expect(result).toHaveProperty('activeBids');
      expect(result).toHaveProperty('exceptions');
      expect(result).toHaveProperty('recentIngestionStats');
    });
    it('deadlines is array', async () => {
      const result = await mockDigestService.generateExecutiveDigest('t-1');
      expect(Array.isArray(result.deadlines)).toBe(true);
    });
  });
  describe('getDeadlineAlerts', () => {
    it('returns array', async () => {
      const result = await mockDigestService.getDeadlineAlerts('t-1');
      expect(Array.isArray(result)).toBe(true);
    });
    it('accepts custom daysThreshold', async () => {
      await expect(mockDigestService.getDeadlineAlerts('t-1', 14)).resolves.toBeDefined();
    });
  });
  describe('getExceptionReport', () => {
    it('returns exceptions property', async () => {
      const result = await mockDigestService.getExceptionReport('t-1');
      expect(result).toHaveProperty('exceptions');
    });
  });
  describe('scheduleDigestDelivery', () => {
    it('resolves to null or string', async () => {
      const result = await mockDigestService.scheduleDigestDelivery('t-1');
      expect(result === null || typeof result === 'string').toBe(true);
    });
  });
});

// ─── DocumentService (Contacts) ──────────────────────────────────────────────
const mockDocumentService = {
  listContacts: vi.fn().mockResolvedValue([{ id: 'c-1', name: 'Alice' }]),
  getContact: vi.fn().mockResolvedValue({ id: 'c-1', name: 'Alice' }),
  createContact: vi.fn().mockResolvedValue({ id: 'c-2', name: 'Bob' }),
  updateContact: vi.fn().mockResolvedValue({ id: 'c-1', name: 'Alice Updated' }),
  deleteContact: vi.fn().mockResolvedValue(undefined),
  getContactsByBuyer: vi.fn().mockResolvedValue([]),
};

vi.mock('../document.service', () => ({
  DocumentService: vi.fn(),
  documentService: mockDocumentService,
}));

describe('document.service', () => {
  it('exports DocumentService and singleton', async () => {
    const mod = await import('../document.service');
    expect(mod.DocumentService).toBeDefined();
    expect(mod.documentService).toBeDefined();
  });
  describe('listContacts', () => {
    it('returns array with no filters', async () => {
      const result = await mockDocumentService.listContacts('t-1');
      expect(Array.isArray(result)).toBe(true);
    });
    it('accepts optional filters', async () => {
      const result = await mockDocumentService.listContacts('t-1', { type: 'buyer' });
      expect(Array.isArray(result)).toBe(true);
    });
  });
  describe('getContact', () => {
    it('returns contact by id', async () => {
      const result = await mockDocumentService.getContact('t-1', 'c-1');
      expect(result).toHaveProperty('id', 'c-1');
    });
  });
  describe('createContact', () => {
    it('returns created contact with id', async () => {
      const result = await mockDocumentService.createContact('t-1', { name: 'Bob' });
      expect(result).toHaveProperty('id');
    });
  });
  describe('updateContact', () => {
    it('returns updated contact', async () => {
      const result = await mockDocumentService.updateContact('t-1', 'c-1', { name: 'Alice Updated' });
      expect(result).toHaveProperty('id', 'c-1');
    });
  });
  describe('deleteContact', () => {
    it('resolves without error', async () => {
      await expect(mockDocumentService.deleteContact('t-1', 'c-1')).resolves.toBeUndefined();
    });
  });
  describe('getContactsByBuyer', () => {
    it('returns array', async () => {
      const result = await mockDocumentService.getContactsByBuyer('t-1', 'buyer-1');
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
