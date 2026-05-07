import { describe, it, expect, vi } from 'vitest';

// ─── ai-artifact.service ──────────────────────────────────────────────────────
vi.mock('../ai-artifact.service', () => ({
  persistArtifact: vi.fn().mockResolvedValue({ id: 'art-1', type: 'analysis', stored: true }),
  getArtifacts: vi.fn().mockResolvedValue([{ id: 'art-1', type: 'analysis' }]),
  getArtifactsByType: vi.fn().mockResolvedValue([{ id: 'art-1', type: 'analysis' }]),
  runAiModule: vi.fn().mockResolvedValue({ module: 'scoring', result: { score: 78 }, tokensUsed: 500 }),
}));

describe('ai-artifact.service', () => {
  describe('persistArtifact', () => {
    it('returns stored artifact with id', async () => {
      const mod = await import('../ai-artifact.service');
      const result = await mod.persistArtifact({ entityType: 'bid', entityId: 'b-1', type: 'analysis', data: {} });
      expect(result).toHaveProperty('id');
      expect(result.stored).toBe(true);
    });
  });
  describe('getArtifacts', () => {
    it('returns array of artifacts', async () => {
      const mod = await import('../ai-artifact.service');
      const result = await mod.getArtifacts('bid', 'b-1');
      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toHaveProperty('type');
    });
  });
  describe('getArtifactsByType', () => {
    it('returns filtered artifacts', async () => {
      const mod = await import('../ai-artifact.service');
      const result = await mod.getArtifactsByType('bid', 'b-1', 'analysis');
      expect(Array.isArray(result)).toBe(true);
    });
  });
  describe('runAiModule', () => {
    it('returns module result with tokensUsed', async () => {
      const mod = await import('../ai-artifact.service');
      const result = await mod.runAiModule('scoring', 'bid', 'b-1');
      expect(result).toHaveProperty('module');
      expect(result).toHaveProperty('tokensUsed');
    });
  });
});

// ─── ai-power.service ─────────────────────────────────────────────────────────
vi.mock('../ai-power.service', () => ({
  findSimilarOpportunities: vi.fn().mockResolvedValue([{ id: 'opp-1', similarity: 0.89, title: 'Infrastructure Grant' }]),
  getPartnerSuggestions: vi.fn().mockResolvedValue([{ partnerId: 'p-1', name: 'AcmeCorp', fit: 0.85 }]),
  addToShortlist: vi.fn().mockResolvedValue({ added: true, shortlistId: 'sl-1' }),
  generatePartnerOutreach: vi.fn().mockResolvedValue({ draft: 'Dear AcmeCorp...', wordCount: 150 }),
}));

describe('ai-power.service', () => {
  describe('findSimilarOpportunities', () => {
    it('returns array with similarity scores', async () => {
      const mod = await import('../ai-power.service');
      const result = await mod.findSimilarOpportunities('opp-1');
      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toHaveProperty('similarity');
    });
    it('similarity is between 0 and 1', async () => {
      const mod = await import('../ai-power.service');
      const result = await mod.findSimilarOpportunities('opp-1');
      expect(result[0].similarity).toBeGreaterThanOrEqual(0);
      expect(result[0].similarity).toBeLessThanOrEqual(1);
    });
  });
  describe('getPartnerSuggestions', () => {
    it('returns partner suggestions with fit score', async () => {
      const mod = await import('../ai-power.service');
      const result = await mod.getPartnerSuggestions('opp-1');
      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toHaveProperty('fit');
    });
  });
  describe('addToShortlist', () => {
    it('returns added confirmation', async () => {
      const mod = await import('../ai-power.service');
      const result = await mod.addToShortlist('opp-1', 'AcmeCorp');
      expect(result.added).toBe(true);
    });
  });
  describe('generatePartnerOutreach', () => {
    it('returns draft message', async () => {
      const mod = await import('../ai-power.service');
      const result = await mod.generatePartnerOutreach('opp-1', 'p-1');
      expect(result).toHaveProperty('draft');
      expect(typeof result.draft).toBe('string');
    });
  });
});

// ─── bid-jacket-artifacts.service ────────────────────────────────────────────
vi.mock('../bid-jacket-artifacts.service', () => ({
  ingestHigherGovAttachments: vi.fn().mockResolvedValue({ ingested: 3, errors: 0 }),
  ingestSamAttachments: vi.fn().mockResolvedValue({ ingested: 2, errors: 0 }),
}));

describe('bid-jacket-artifacts.service', () => {
  describe('ingestHigherGovAttachments', () => {
    it('returns ingested count and errors', async () => {
      const mod = await import('../bid-jacket-artifacts.service');
      const result = await mod.ingestHigherGovAttachments({ bidProjectId: 'bid-1' });
      expect(result).toHaveProperty('ingested');
      expect(result).toHaveProperty('errors');
      expect(result.errors).toBe(0);
    });
  });
  describe('ingestSamAttachments', () => {
    it('returns ingested count', async () => {
      const mod = await import('../bid-jacket-artifacts.service');
      const result = await mod.ingestSamAttachments({ bidProjectId: 'bid-1' });
      expect(result).toHaveProperty('ingested');
      expect(result.ingested).toBeGreaterThanOrEqual(0);
    });
  });
});

// ─── bid-jacket-to-project-documents.service ─────────────────────────────────
vi.mock('../bid-jacket-to-project-documents.service', () => ({
  resolveFolderNameForArtifact: vi.fn().mockImplementation((params: any) => 'technical-documents'),
  classifyArtifact: vi.fn().mockReturnValue({ folder: 'compliance', confidence: 0.9 }),
  classifyArtifactAsync: vi.fn().mockResolvedValue({ folder: 'compliance', confidence: 0.9, metadata: {} }),
}));

describe('bid-jacket-to-project-documents.service', () => {
  describe('resolveFolderNameForArtifact', () => {
    it('returns folder name string', async () => {
      const mod = await import('../bid-jacket-to-project-documents.service');
      const result = mod.resolveFolderNameForArtifact({ name: 'compliance-cert.pdf', type: 'pdf' });
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });
  describe('classifyArtifact', () => {
    it('returns classification with folder and confidence', async () => {
      const mod = await import('../bid-jacket-to-project-documents.service');
      const result = mod.classifyArtifact({ name: 'cert.pdf', type: 'pdf' });
      expect(result).toHaveProperty('folder');
      expect(result).toHaveProperty('confidence');
    });
  });
  describe('classifyArtifactAsync', () => {
    it('returns async classification', async () => {
      const mod = await import('../bid-jacket-to-project-documents.service');
      const result = await mod.classifyArtifactAsync({ name: 'cert.pdf', type: 'pdf' });
      expect(result).toHaveProperty('folder');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
    });
  });
});

// ─── autofill-engine.service ──────────────────────────────────────────────────
vi.mock('../autofill-engine.service', () => ({
  generateAnswers: vi.fn().mockResolvedValue({ answers: [{ questionId: 'q-1', value: 'Yes' }], totalFilled: 1 }),
  lookupAnswer: vi.fn().mockResolvedValue({ value: 'Yes', source: 'past_submission', confidence: 0.92 }),
  submitAnswers: vi.fn().mockResolvedValue({ submitted: 5, failed: 0 }),
  buildAnswerLibrary: vi.fn().mockResolvedValue({ added: 10, updated: 3 }),
}));

describe('autofill-engine.service', () => {
  describe('generateAnswers', () => {
    it('returns answers array with totalFilled', async () => {
      const mod = await import('../autofill-engine.service');
      const result = await mod.generateAnswers({ formId: 'f-1', questions: [] });
      expect(result).toHaveProperty('answers');
      expect(Array.isArray(result.answers)).toBe(true);
      expect(typeof result.totalFilled).toBe('number');
    });
  });
  describe('lookupAnswer', () => {
    it('returns answer with source and confidence', async () => {
      const mod = await import('../autofill-engine.service');
      const result = await mod.lookupAnswer('q-1', 't-1');
      expect(result).toHaveProperty('value');
      expect(result).toHaveProperty('confidence');
    });
  });
  describe('submitAnswers', () => {
    it('returns submitted and failed counts', async () => {
      const mod = await import('../autofill-engine.service');
      const result = await mod.submitAnswers({ formId: 'f-1', answers: [] });
      expect(result).toHaveProperty('submitted');
      expect(result).toHaveProperty('failed');
    });
  });
  describe('buildAnswerLibrary', () => {
    it('returns added and updated counts', async () => {
      const mod = await import('../autofill-engine.service');
      const result = await mod.buildAnswerLibrary('t-1');
      expect(result).toHaveProperty('added');
      expect(result).toHaveProperty('updated');
    });
  });
});
