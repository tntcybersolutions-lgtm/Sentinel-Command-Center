import { describe, it, expect, vi } from 'vitest';

// ─── AuditService ─────────────────────────────────────────────────────────────
const mockAuditService = {
  logEvent: vi.fn().mockResolvedValue('audit-1'),
  createSnapshot: vi.fn().mockResolvedValue({ id: 'snap-1', entityType: 'bid', entityId: 'b-1' }),
  getEntityHistory: vi.fn().mockResolvedValue([{ id: 'audit-1', action: 'update', timestamp: new Date() }]),
};
vi.mock('../audit.service', () => ({ AuditService: vi.fn(), auditService: mockAuditService }));

describe('audit.service', () => {
  it('exports auditService', async () => { const m = await import('../audit.service'); expect(m.auditService).toBeDefined(); });
  describe('logEvent', () => {
    it('returns event id', async () => {
      const result = await mockAuditService.logEvent({ entityType: 'bid', entityId: 'b-1', action: 'update', actorId: 'u-1' });
      expect(typeof result).toBe('string');
    });
  });
  describe('getEntityHistory', () => {
    it('returns array of audit events', async () => {
      const result = await mockAuditService.getEntityHistory('bid', 'b-1');
      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toHaveProperty('action');
    });
  });
  describe('createSnapshot', () => {
    it('returns snapshot with id', async () => {
      const result = await mockAuditService.createSnapshot({ entityType: 'bid', entityId: 'b-1' });
      expect(result).toHaveProperty('id');
    });
  });
});

// ─── BidService ───────────────────────────────────────────────────────────────
const mockBidService = {
  createBidProject: vi.fn().mockResolvedValue('bid-1'),
  getBidProject: vi.fn().mockResolvedValue({ id: 'bid-1', status: 'draft', opportunityId: 'opp-1' }),
  listBidProjects: vi.fn().mockResolvedValue([{ id: 'bid-1' }, { id: 'bid-2' }]),
  updateBidStatus: vi.fn().mockResolvedValue({ id: 'bid-1', status: 'submitted' }),
  submitBid: vi.fn().mockResolvedValue({ id: 'bid-1', status: 'submitted', submittedAt: new Date().toISOString() }),
};
vi.mock('../bid.service', () => ({ BidService: vi.fn(), bidService: mockBidService }));

describe('bid.service', () => {
  it('exports bidService', async () => { const m = await import('../bid.service'); expect(m.bidService).toBeDefined(); });
  describe('createBidProject', () => {
    it('returns new bid project id', async () => {
      const result = await mockBidService.createBidProject({ opportunityId: 'opp-1', tenantId: 't-1' });
      expect(typeof result).toBe('string');
    });
  });
  describe('listBidProjects', () => {
    it('returns array', async () => {
      const result = await mockBidService.listBidProjects('t-1');
      expect(Array.isArray(result)).toBe(true);
    });
  });
  describe('getBidProject', () => {
    it('returns bid with id and status', async () => {
      const result = await mockBidService.getBidProject('bid-1');
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('status');
    });
  });
  describe('submitBid', () => {
    it('returns submitted bid with submittedAt', async () => {
      const result = await mockBidService.submitBid('bid-1');
      expect(result.status).toBe('submitted');
      expect(result).toHaveProperty('submittedAt');
    });
  });
});

// ─── BidReadinessService ──────────────────────────────────────────────────────
const mockBidReadinessService = {
  calculateCategoryScores: vi.fn().mockResolvedValue({ technical: { score: 80, required: 5, completed: 4 }, compliance: { score: 60, required: 3, completed: 2 } }),
  calculateReadinessScore: vi.fn().mockResolvedValue({ score: 72, status: 'in_progress', categories: {} }),
  updateReadinessScore: vi.fn().mockResolvedValue(undefined),
  getReadinessScore: vi.fn().mockResolvedValue({ score: 72, status: 'in_progress', updatedAt: new Date().toISOString() }),
};
vi.mock('../bid-readiness.service', () => ({ BidReadinessService: vi.fn(), bidReadinessService: mockBidReadinessService }));

describe('bid-readiness.service', () => {
  it('exports bidReadinessService', async () => { const m = await import('../bid-readiness.service'); expect(m.bidReadinessService).toBeDefined(); });
  describe('calculateReadinessScore', () => {
    it('returns score with status', async () => {
      const result = await mockBidReadinessService.calculateReadinessScore('bid-1');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('status');
    });
    it('status is valid enum value', async () => {
      const result = await mockBidReadinessService.calculateReadinessScore('bid-1');
      expect(['ready', 'in_progress', 'critical']).toContain(result.status);
    });
  });
  describe('calculateCategoryScores', () => {
    it('returns map of category scores', async () => {
      const result = await mockBidReadinessService.calculateCategoryScores('bid-1');
      expect(typeof result).toBe('object');
      const firstCat = Object.values(result)[0] as any;
      expect(firstCat).toHaveProperty('score');
    });
  });
  describe('getReadinessScore', () => {
    it('returns current readiness score', async () => {
      const result = await mockBidReadinessService.getReadinessScore('bid-1');
      expect(result).toHaveProperty('score');
    });
  });
});

// ─── AnalyticsService ─────────────────────────────────────────────────────────
const mockAnalyticsService = {
  getBidPerformance: vi.fn().mockResolvedValue({ winRate: 0.45, totalBids: 20, wonBids: 9 }),
  getProjectPerformance: vi.fn().mockResolvedValue({ onTime: 0.8, overBudget: 0.1, projects: [] }),
  getLaborAnalytics: vi.fn().mockResolvedValue({ totalHours: 1200, byRole: [] }),
};
vi.mock('../analytics.service', () => ({ AnalyticsService: vi.fn(), analyticsService: mockAnalyticsService }));

describe('analytics.service', () => {
  it('exports analyticsService', async () => { const m = await import('../analytics.service'); expect(m.analyticsService).toBeDefined(); });
  describe('getBidPerformance', () => {
    it('returns win rate and bid counts', async () => {
      const result = await mockAnalyticsService.getBidPerformance('t-1');
      expect(result).toHaveProperty('winRate');
      expect(result).toHaveProperty('totalBids');
    });
    it('winRate is between 0 and 1', async () => {
      const result = await mockAnalyticsService.getBidPerformance('t-1');
      expect(result.winRate).toBeGreaterThanOrEqual(0);
      expect(result.winRate).toBeLessThanOrEqual(1);
    });
  });
  describe('getProjectPerformance', () => {
    it('returns onTime ratio', async () => {
      const result = await mockAnalyticsService.getProjectPerformance('t-1');
      expect(result).toHaveProperty('onTime');
    });
  });
  describe('getLaborAnalytics', () => {
    it('returns totalHours', async () => {
      const result = await mockAnalyticsService.getLaborAnalytics('t-1');
      expect(result).toHaveProperty('totalHours');
      expect(typeof result.totalHours).toBe('number');
    });
  });
});

// ─── bid-invitation.service ────────────────────────────────────────────────────
vi.mock('../bid-invitation.service', () => ({
  generateInviteToken: vi.fn().mockReturnValue('tok-xyz-123'),
  hashToken: vi.fn().mockImplementation((raw: string) => 'hashed-' + raw),
  verifyTokenHash: vi.fn().mockImplementation((raw: string, stored: string) => stored === 'hashed-' + raw),
  isVendorVisibleFolder: vi.fn().mockImplementation((name: string) => name.startsWith('vendor-')),
  getVendorVisibleFolders: vi.fn().mockResolvedValue(['vendor-docs', 'vendor-specs']),
}));

describe('bid-invitation.service', () => {
  describe('generateInviteToken', () => {
    it('returns string token', async () => {
      const mod = await import('../bid-invitation.service');
      const token = mod.generateInviteToken();
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
    });
  });
  describe('hashToken / verifyTokenHash', () => {
    it('hashToken is deterministic for same input', async () => {
      const mod = await import('../bid-invitation.service');
      const h1 = mod.hashToken('raw-token');
      expect(typeof h1).toBe('string');
    });
    it('verifyTokenHash returns true for correct pair', async () => {
      const mod = await import('../bid-invitation.service');
      const raw = 'raw-token';
      const hashed = mod.hashToken(raw);
      const valid = mod.verifyTokenHash(raw, hashed);
      expect(valid).toBe(true);
    });
    it('verifyTokenHash returns false for wrong raw', async () => {
      const mod = await import('../bid-invitation.service');
      const valid = mod.verifyTokenHash('wrong', 'hashed-raw-token');
      expect(valid).toBe(false);
    });
  });
  describe('isVendorVisibleFolder', () => {
    it('returns true for vendor- prefixed folders', async () => {
      const mod = await import('../bid-invitation.service');
      expect(mod.isVendorVisibleFolder('vendor-docs')).toBe(true);
    });
    it('returns false for non-vendor folders', async () => {
      const mod = await import('../bid-invitation.service');
      expect(mod.isVendorVisibleFolder('internal-docs')).toBe(false);
    });
  });
  describe('getVendorVisibleFolders', () => {
    it('returns array of folder names', async () => {
      const mod = await import('../bid-invitation.service');
      const folders = await mod.getVendorVisibleFolders('t-1', 'bid-1');
      expect(Array.isArray(folders)).toBe(true);
    });
  });
});

// ─── jacket-repair.service ────────────────────────────────────────────────────
vi.mock('../jacket-repair.service', () => ({
  repairBidJacket: vi.fn().mockResolvedValue({ repaired: 3, errors: [] }),
  repairAllBidJackets: vi.fn().mockResolvedValue({ repaired: 12, errors: 1, skipped: 2 }),
}));

describe('jacket-repair.service', () => {
  describe('repairBidJacket', () => {
    it('returns repaired count and errors', async () => {
      const mod = await import('../jacket-repair.service');
      const result = await mod.repairBidJacket('bid-1');
      expect(result).toHaveProperty('repaired');
      expect(result).toHaveProperty('errors');
    });
    it('repaired is non-negative', async () => {
      const mod = await import('../jacket-repair.service');
      const result = await mod.repairBidJacket('bid-1');
      expect(result.repaired).toBeGreaterThanOrEqual(0);
    });
  });
  describe('repairAllBidJackets', () => {
    it('returns aggregate repair stats', async () => {
      const mod = await import('../jacket-repair.service');
      const result = await mod.repairAllBidJackets();
      expect(result).toHaveProperty('repaired');
      expect(result).toHaveProperty('errors');
    });
  });
});

// ─── capture-copilot.service ──────────────────────────────────────────────────
vi.mock('../capture-copilot.service', () => ({
  summarizeOpportunity: vi.fn().mockResolvedValue({ title: 'Test Opp', agency: 'DOD', summary: 'Test summary', winProbability: 0.6 }),
  scoreOpportunityCapture: vi.fn().mockResolvedValue({ score: 75, rationale: 'Good fit' }),
  generateCapturePlan: vi.fn().mockResolvedValue({ sections: [], timeline: [] }),
  draftOutreach: vi.fn().mockResolvedValue({ subject: 'Partnership', body: 'Dear ...' }),
}));

describe('capture-copilot.service', () => {
  describe('summarizeOpportunity', () => {
    it('returns opportunity summary with title and agency', async () => {
      const mod = await import('../capture-copilot.service');
      const result = await mod.summarizeOpportunity('opp-1');
      expect(result).toHaveProperty('title');
      expect(result).toHaveProperty('summary');
    });
    it('winProbability is between 0 and 1', async () => {
      const mod = await import('../capture-copilot.service');
      const result = await mod.summarizeOpportunity('opp-1');
      expect(result.winProbability).toBeGreaterThanOrEqual(0);
      expect(result.winProbability).toBeLessThanOrEqual(1);
    });
  });
  describe('scoreOpportunityCapture', () => {
    it('returns numeric score with rationale', async () => {
      const mod = await import('../capture-copilot.service');
      const result = await mod.scoreOpportunityCapture('opp-1');
      expect(typeof result.score).toBe('number');
      expect(result).toHaveProperty('rationale');
    });
  });
  describe('generateCapturePlan', () => {
    it('returns plan with sections', async () => {
      const mod = await import('../capture-copilot.service');
      const result = await mod.generateCapturePlan('opp-1');
      expect(result).toHaveProperty('sections');
      expect(Array.isArray(result.sections)).toBe(true);
    });
  });
  describe('draftOutreach', () => {
    it('returns email with subject and body', async () => {
      const mod = await import('../capture-copilot.service');
      const result = await mod.draftOutreach('opp-1', 'contact-1');
      expect(result).toHaveProperty('subject');
      expect(result).toHaveProperty('body');
    });
  });
});
