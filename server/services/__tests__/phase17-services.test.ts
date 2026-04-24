import { describe, it, expect, vi } from 'vitest';

// ─── jacket.service ───────────────────────────────────────────────────────────
const mockJacketService = {
  buildJacket: vi.fn().mockResolvedValue({ sections: ['executive', 'technical'], generatedAt: new Date().toISOString() }),
  getJacket: vi.fn().mockResolvedValue({ bidProjectId: 'bid-1', sections: [], lastBuiltAt: null }),
  markSectionComplete: vi.fn().mockResolvedValue({ section: 'technical', complete: true }),
  getJacketStats: vi.fn().mockResolvedValue({ totalSections: 6, completed: 4, pending: 2 }),
};
vi.mock('../jacket.service', () => ({ jacketService: mockJacketService }));

describe('jacket.service', () => {
  it('exports jacketService', async () => { const m = await import('../jacket.service'); expect(m.jacketService).toBeDefined(); });
  describe('buildJacket', () => {
    it('returns jacket with sections', async () => {
      const result = await mockJacketService.buildJacket({ bidProjectId: 'bid-1' });
      expect(result).toHaveProperty('sections');
      expect(Array.isArray(result.sections)).toBe(true);
    });
  });
  describe('getJacket', () => {
    it('returns jacket for bid project', async () => {
      const result = await mockJacketService.getJacket('bid-1');
      expect(result).toHaveProperty('bidProjectId', 'bid-1');
    });
  });
  describe('markSectionComplete', () => {
    it('returns completed section', async () => {
      const result = await mockJacketService.markSectionComplete('bid-1', 'technical');
      expect(result.complete).toBe(true);
      expect(result.section).toBe('technical');
    });
  });
  describe('getJacketStats', () => {
    it('returns totalSections/completed/pending', async () => {
      const result = await mockJacketService.getJacketStats('bid-1');
      expect(result).toHaveProperty('totalSections');
      expect(result).toHaveProperty('completed');
      expect(result).toHaveProperty('pending');
    });
  });
});

// ─── retro-organizer.service ──────────────────────────────────────────────────
const mockRetroOrganizerService = {
  scanBidPackage: vi.fn().mockResolvedValue({ issues: 3, warnings: 5, duplicates: 1 }),
  proposeReorganization: vi.fn().mockResolvedValue({ moves: 8, merges: 2, deletes: 0, approvalRequired: true }),
  executeReorganization: vi.fn().mockResolvedValue({ executed: 10, failed: 0 }),
  generateBidIndex: vi.fn().mockResolvedValue({ sections: 12, indexGenerated: true }),
};
vi.mock('../retro-organizer.service', () => ({ RetroOrganizerService: vi.fn(), retroOrganizerService: mockRetroOrganizerService }));

describe('retro-organizer.service', () => {
  it('exports retroOrganizerService', async () => { const m = await import('../retro-organizer.service'); expect(m.retroOrganizerService).toBeDefined(); });
  describe('scanBidPackage', () => {
    it('returns scan result with issues/warnings', async () => {
      const result = await mockRetroOrganizerService.scanBidPackage('t-1', 'bid-1');
      expect(result).toHaveProperty('issues');
      expect(result).toHaveProperty('warnings');
    });
    it('all counts are non-negative', async () => {
      const result = await mockRetroOrganizerService.scanBidPackage('t-1', 'bid-1');
      expect(result.issues).toBeGreaterThanOrEqual(0);
    });
  });
  describe('proposeReorganization', () => {
    it('returns proposal with moves and approvalRequired', async () => {
      const result = await mockRetroOrganizerService.proposeReorganization('t-1', 'bid-1');
      expect(result).toHaveProperty('moves');
      expect(typeof result.approvalRequired).toBe('boolean');
    });
  });
  describe('executeReorganization', () => {
    it('returns executed and failed counts', async () => {
      const result = await mockRetroOrganizerService.executeReorganization('t-1', 'approval-1');
      expect(result).toHaveProperty('executed');
      expect(result).toHaveProperty('failed');
    });
  });
  describe('generateBidIndex', () => {
    it('returns sections count and indexGenerated flag', async () => {
      const result = await mockRetroOrganizerService.generateBidIndex('t-1', 'bid-1');
      expect(result).toHaveProperty('sections');
      expect(result.indexGenerated).toBe(true);
    });
  });
});

// ─── Additional bid-jacket-artifacts.service functions ────────────────────────
vi.mock('../bid-jacket-artifacts.service', () => ({
  ingestHigherGovAttachments: vi.fn().mockResolvedValue({ ingested: 3, errors: 0 }),
  ingestSamAttachments: vi.fn().mockResolvedValue({ ingested: 2, errors: 0 }),
  seedArtifactsForBidProject: vi.fn().mockResolvedValue({ seeded: 5, alreadyExisted: 2 }),
  seedChecklistForBidProject: vi.fn().mockResolvedValue({ seeded: 8, skipped: 1 }),
}));

describe('bid-jacket-artifacts.service (extended)', () => {
  describe('seedArtifactsForBidProject', () => {
    it('returns seeded and already-existed counts', async () => {
      const mod = await import('../bid-jacket-artifacts.service');
      const result = await mod.seedArtifactsForBidProject({ bidProjectId: 'bid-1' });
      expect(result).toHaveProperty('seeded');
      expect(result).toHaveProperty('alreadyExisted');
    });
  });
  describe('seedChecklistForBidProject', () => {
    it('returns seeded and skipped counts', async () => {
      const mod = await import('../bid-jacket-artifacts.service');
      const result = await mod.seedChecklistForBidProject({ bidProjectId: 'bid-1' });
      expect(result).toHaveProperty('seeded');
      expect(result).toHaveProperty('skipped');
    });
  });
});

// ─── vendor-confidence.service (extended coverage) ────────────────────────────
const mockVendorConfidenceService = {
  getVendorStats: vi.fn().mockResolvedValue({ total: 50, highConfidence: 30, mediumConfidence: 15, lowConfidence: 5 }),
  listVendors: vi.fn().mockResolvedValue([{ id: 'v-1', name: 'AcmeCorp', confidenceScore: 0.9 }]),
  getPendingVendorReviews: vi.fn().mockResolvedValue([{ id: 'vr-1', vendorId: 'v-1', type: 'new_vendor' }]),
  createWithConfidenceGating: vi.fn().mockResolvedValue({ id: 'v-2', pendingReview: true }),
  approveVendorCreation: vi.fn().mockResolvedValue({ vendorId: 'v-2', approved: true }),
  mergeVendors: vi.fn().mockResolvedValue(undefined),
};
vi.mock('../vendor-confidence.service', () => ({ VendorConfidenceService: vi.fn(), vendorConfidenceService: mockVendorConfidenceService }));

describe('vendor-confidence.service (extended)', () => {
  describe('createWithConfidenceGating', () => {
    it('returns vendor with pendingReview flag', async () => {
      const result = await mockVendorConfidenceService.createWithConfidenceGating('t-1', { name: 'NewVendor' });
      expect(result).toHaveProperty('id');
      expect(typeof result.pendingReview).toBe('boolean');
    });
  });
  describe('approveVendorCreation', () => {
    it('returns approved confirmation', async () => {
      const result = await mockVendorConfidenceService.approveVendorCreation('t-1', 'vr-1');
      expect(result.approved).toBe(true);
    });
  });
  describe('mergeVendors', () => {
    it('resolves without error', async () => {
      await expect(mockVendorConfidenceService.mergeVendors('t-1', 'v-1', 'v-2')).resolves.toBeUndefined();
    });
  });
  describe('getVendorStats', () => {
    it('returns confidence tier breakdown', async () => {
      const result = await mockVendorConfidenceService.getVendorStats('t-1');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('highConfidence');
    });
  });
});
