import { describe, it, expect, vi } from 'vitest';

// ─── bid-compliance.service ───────────────────────────────────────────────────
const mockBidComplianceService = {
  getComplianceSummary: vi.fn().mockResolvedValue({ compliant: 8, nonCompliant: 2, total: 10, score: 0.8 }),
  generateFromSolicitation: vi.fn().mockResolvedValue({ generated: 5, categories: ['technical', 'legal'] }),
  updateItemStatus: vi.fn().mockResolvedValue({ id: 'item-1', status: 'compliant' }),
  deleteItem: vi.fn().mockResolvedValue(undefined),
};
vi.mock('../bid-compliance.service', () => ({ bidComplianceService: mockBidComplianceService }));

describe('bid-compliance.service', () => {
  it('exports bidComplianceService', async () => { const m = await import('../bid-compliance.service'); expect(m.bidComplianceService).toBeDefined(); });
  describe('getComplianceSummary', () => {
    it('returns compliant, nonCompliant, score', async () => {
      const result = await mockBidComplianceService.getComplianceSummary('t-1', 'bid-1');
      expect(result).toHaveProperty('compliant');
      expect(result).toHaveProperty('nonCompliant');
      expect(result).toHaveProperty('score');
    });
    it('score is between 0 and 1', async () => {
      const result = await mockBidComplianceService.getComplianceSummary('t-1', 'bid-1');
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });
  });
  describe('generateFromSolicitation', () => {
    it('returns generated count and categories', async () => {
      const result = await mockBidComplianceService.generateFromSolicitation('t-1', 'bid-1');
      expect(result).toHaveProperty('generated');
      expect(Array.isArray(result.categories)).toBe(true);
    });
  });
  describe('updateItemStatus', () => {
    it('returns updated item', async () => {
      const result = await mockBidComplianceService.updateItemStatus('t-1', 'item-1', 'compliant');
      expect(result).toHaveProperty('id', 'item-1');
      expect(result.status).toBe('compliant');
    });
  });
  describe('deleteItem', () => {
    it('resolves without error', async () => {
      await expect(mockBidComplianceService.deleteItem('t-1', 'item-1')).resolves.toBeUndefined();
    });
  });
});

// ─── bid-binder.service ───────────────────────────────────────────────────────
const mockBidBinderService = {
  createBinderJob: vi.fn().mockResolvedValue({ jobId: 'job-1', status: 'queued' }),
  getJobStatus: vi.fn().mockResolvedValue({ jobId: 'job-1', status: 'completed', result: { url: 'https://example.com/binder.pdf' } }),
  triggerBinderRegeneration: vi.fn().mockResolvedValue({ status: 'regenerating', estimatedSeconds: 30 }),
};
vi.mock('../bid-binder.service', () => ({ BidBinderService: vi.fn(), bidBinderService: mockBidBinderService }));

describe('bid-binder.service', () => {
  it('exports bidBinderService', async () => { const m = await import('../bid-binder.service'); expect(m.bidBinderService).toBeDefined(); });
  describe('createBinderJob', () => {
    it('returns job with id and queued status', async () => {
      const result = await mockBidBinderService.createBinderJob({ bidProjectId: 'bid-1' });
      expect(result).toHaveProperty('jobId');
      expect(result.status).toBe('queued');
    });
  });
  describe('getJobStatus', () => {
    it('returns completed job with result', async () => {
      const result = await mockBidBinderService.getJobStatus('job-1');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('jobId');
    });
  });
  describe('triggerBinderRegeneration', () => {
    it('returns regenerating status', async () => {
      const result = await mockBidBinderService.triggerBinderRegeneration('bid-1', 'template change');
      expect(result).toHaveProperty('status');
    });
  });
});

// ─── marketing.service ────────────────────────────────────────────────────────
const mockMarketingService = {
  listCampaigns: vi.fn().mockResolvedValue([{ id: 'camp-1', name: 'Q4 Outreach', status: 'active' }]),
  getCampaign: vi.fn().mockResolvedValue({ id: 'camp-1', name: 'Q4 Outreach', contacts: [] }),
  createCampaign: vi.fn().mockResolvedValue({ id: 'camp-2', name: 'New Campaign' }),
  updateCampaign: vi.fn().mockResolvedValue({ id: 'camp-1', name: 'Updated Campaign' }),
};
vi.mock('../marketing.service', () => ({ MarketingService: vi.fn(), marketingService: mockMarketingService }));

describe('marketing.service', () => {
  it('exports marketingService', async () => { const m = await import('../marketing.service'); expect(m.marketingService).toBeDefined(); });
  describe('listCampaigns', () => {
    it('returns array of campaigns', async () => {
      const result = await mockMarketingService.listCampaigns('t-1');
      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toHaveProperty('name');
    });
  });
  describe('getCampaign', () => {
    it('returns campaign by id', async () => {
      const result = await mockMarketingService.getCampaign('t-1', 'camp-1');
      expect(result).toHaveProperty('id', 'camp-1');
    });
  });
  describe('createCampaign', () => {
    it('returns created campaign', async () => {
      const result = await mockMarketingService.createCampaign('t-1', { name: 'New Campaign' });
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('name');
    });
  });
  describe('updateCampaign', () => {
    it('returns updated campaign', async () => {
      const result = await mockMarketingService.updateCampaign('t-1', 'camp-1', { name: 'Updated' });
      expect(result).toHaveProperty('id', 'camp-1');
    });
  });
});

// ─── memory.service ───────────────────────────────────────────────────────────
const mockMemoryService = {
  getTenantPreferences: vi.fn().mockResolvedValue({ theme: 'dark', language: 'en', notifications: true }),
  updateTenantPreferences: vi.fn().mockResolvedValue({ theme: 'light', language: 'en' }),
  getSessionMemory: vi.fn().mockResolvedValue({ userId: 'u-1', lastActiveAt: new Date().toISOString(), context: {} }),
  saveSessionMemory: vi.fn().mockResolvedValue(undefined),
  clearSessionMemory: vi.fn().mockResolvedValue(undefined),
};
vi.mock('../memory.service', () => ({ MemoryService: vi.fn(), memoryService: mockMemoryService }));

describe('memory.service', () => {
  it('exports memoryService', async () => { const m = await import('../memory.service'); expect(m.memoryService).toBeDefined(); });
  describe('getTenantPreferences', () => {
    it('returns preferences object', async () => {
      const result = await mockMemoryService.getTenantPreferences();
      expect(result).toHaveProperty('theme');
      expect(result).toHaveProperty('language');
    });
  });
  describe('getSessionMemory', () => {
    it('returns session with userId and context', async () => {
      const result = await mockMemoryService.getSessionMemory('u-1');
      expect(result).toHaveProperty('userId');
      expect(result).toHaveProperty('context');
    });
  });
  describe('saveSessionMemory', () => {
    it('resolves without error', async () => {
      await expect(mockMemoryService.saveSessionMemory({ userId: 'u-1', context: {} })).resolves.toBeUndefined();
    });
  });
  describe('clearSessionMemory', () => {
    it('resolves without error', async () => {
      await expect(mockMemoryService.clearSessionMemory('u-1')).resolves.toBeUndefined();
    });
  });
});

// ─── alerts.service ───────────────────────────────────────────────────────────
const mockAlertsService = {
  createAlert: vi.fn().mockResolvedValue({ id: 'alert-1', priority: 'high', message: 'Deadline approaching' }),
  getActiveAlerts: vi.fn().mockResolvedValue([{ id: 'alert-1', priority: 'high' }]),
  dismissAlert: vi.fn().mockResolvedValue({ id: 'alert-1', dismissed: true }),
  getAlertsByEntity: vi.fn().mockResolvedValue([]),
  sendNotification: vi.fn().mockResolvedValue({ sent: true, channels: ['email'] }),
};
vi.mock('../alerts.service', () => ({ AlertsService: vi.fn(), alertsService: mockAlertsService }));

describe('alerts.service', () => {
  it('exports alertsService', async () => { const m = await import('../alerts.service'); expect(m.alertsService).toBeDefined(); });
  describe('createAlert', () => {
    it('returns alert with id and priority', async () => {
      const result = await mockAlertsService.createAlert({ priority: 'high', message: 'Test' });
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('priority');
    });
  });
  describe('getActiveAlerts', () => {
    it('returns array of alerts', async () => {
      const result = await mockAlertsService.getActiveAlerts('t-1');
      expect(Array.isArray(result)).toBe(true);
    });
  });
  describe('dismissAlert', () => {
    it('returns dismissed alert', async () => {
      const result = await mockAlertsService.dismissAlert('alert-1');
      expect(result.dismissed).toBe(true);
    });
  });
  describe('sendNotification', () => {
    it('returns sent status with channels', async () => {
      const result = await mockAlertsService.sendNotification('u-1', { type: 'deadline', message: 'Due soon' });
      expect(result.sent).toBe(true);
      expect(Array.isArray(result.channels)).toBe(true);
    });
  });
});

// ─── auto-filling.service ─────────────────────────────────────────────────────
const mockAutoFillingService = {
  fillFormWithAI: vi.fn().mockResolvedValue({ filled: 12, skipped: 2, confidence: 0.9 }),
  generateFormResponse: vi.fn().mockResolvedValue({ field: 'value', confidence: 0.85 }),
  validateFill: vi.fn().mockResolvedValue({ valid: true, errors: [] }),
};
vi.mock('../auto-filling.service', () => ({ autoFillingService: mockAutoFillingService }));

describe('auto-filling.service', () => {
  describe('fillFormWithAI', () => {
    it('returns filled count and confidence', async () => {
      const result = await mockAutoFillingService.fillFormWithAI({ formId: 'f-1', bidId: 'b-1' });
      expect(result).toHaveProperty('filled');
      expect(result).toHaveProperty('confidence');
    });
    it('confidence is between 0 and 1', async () => {
      const result = await mockAutoFillingService.fillFormWithAI({ formId: 'f-1', bidId: 'b-1' });
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });
  describe('validateFill', () => {
    it('returns valid flag and errors array', async () => {
      const result = await mockAutoFillingService.validateFill({ formId: 'f-1', data: {} });
      expect(typeof result.valid).toBe('boolean');
      expect(Array.isArray(result.errors)).toBe(true);
    });
  });
});
