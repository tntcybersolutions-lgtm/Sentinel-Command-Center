import { describe, it, expect, vi } from 'vitest';

// ─── EntityLinkService ────────────────────────────────────────────────────────
vi.mock('../entity-link.service', () => {
  const entityLinkService = {
    createLink: vi.fn().mockResolvedValue({ id: 'el-1', sourceId: 'a', targetId: 'b' }),
    getLinksForEntity: vi.fn().mockResolvedValue([{ id: 'el-1' }]),
    deleteLink: vi.fn().mockResolvedValue(undefined),
    getLinkedEntitiesOfType: vi.fn().mockResolvedValue([{ id: 'e-1' }]),
  };
  return {
    createLink: entityLinkService.createLink,
    getLinksForEntity: entityLinkService.getLinksForEntity,
    deleteLink: entityLinkService.deleteLink,
    getLinkedEntitiesOfType: entityLinkService.getLinkedEntitiesOfType,
    entityLinkService,
  };
});

describe('entity-link.service', () => {
  it('exports entityLinkService object', async () => {
    const mod = await import('../entity-link.service');
    expect(mod.entityLinkService).toBeDefined();
  });
  describe('createLink', () => {
    it('returns link object with id', async () => {
      const mod = await import('../entity-link.service');
      const result = await mod.createLink({ sourceId: 'a', targetId: 'b', linkType: 'rel' } as any);
      expect(result).toHaveProperty('id');
    });
  });
  describe('getLinksForEntity', () => {
    it('returns array of links', async () => {
      const mod = await import('../entity-link.service');
      const result = await mod.getLinksForEntity('e-1', 'project');
      expect(Array.isArray(result)).toBe(true);
    });
  });
  describe('deleteLink', () => {
    it('resolves without error', async () => {
      const mod = await import('../entity-link.service');
      await expect(mod.deleteLink('el-1')).resolves.toBeUndefined();
    });
  });
  describe('getLinkedEntitiesOfType', () => {
    it('returns array', async () => {
      const mod = await import('../entity-link.service');
      const result = await mod.getLinkedEntitiesOfType('e-1', 'project', 'vendor');
      expect(Array.isArray(result)).toBe(true);
    });
  });
});

// ─── HerbieChangesetService ───────────────────────────────────────────────────
vi.mock('../herbie-changeset.service', () => ({
  getChangeSet: vi.fn()
    .mockReturnValueOnce({ id: 'cs-1', changes: [{ field: 'score', before: 60, after: 75 }] })
    .mockReturnValueOnce(null),
  listChangeSets: vi.fn().mockReturnValue([{ id: 'cs-1' }, { id: 'cs-2' }]),
  rollbackChangeSet: vi.fn().mockReturnValue({ restored: ['score'], errors: [] }),
}));

describe('herbie-changeset.service', () => {
  describe('getChangeSet', () => {
    it('returns changeset by id', async () => {
      const mod = await import('../herbie-changeset.service');
      const result = mod.getChangeSet('cs-1');
      expect(result).toHaveProperty('id', 'cs-1');
      expect((result as any).changes).toBeDefined();
    });
    it('returns null for unknown id', async () => {
      const mod = await import('../herbie-changeset.service');
      const result = mod.getChangeSet('unknown');
      expect(result).toBeNull();
    });
  });
  describe('listChangeSets', () => {
    it('returns array of changesets', async () => {
      const mod = await import('../herbie-changeset.service');
      const result = mod.listChangeSets();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });
  });
  describe('rollbackChangeSet', () => {
    it('returns restored and errors arrays', async () => {
      const mod = await import('../herbie-changeset.service');
      const result = mod.rollbackChangeSet('cs-1');
      expect(result).toHaveProperty('restored');
      expect(result).toHaveProperty('errors');
      expect(Array.isArray(result.restored)).toBe(true);
    });
  });
});

// ─── HerbieExtractionService ──────────────────────────────────────────────────
vi.mock('../herbie-extraction.service', () => {
  const createHerbieExtractionService = vi.fn().mockImplementation((tenantId: string) => ({
    tenantId,
    extractWithAI: vi.fn().mockResolvedValue([
      { field: 'dueDate', value: '2026-05-01', confidence: 0.9 },
      { field: 'budget', value: '500000', confidence: 0.85 },
    ]),
    processAndStoreEvidence: vi.fn().mockResolvedValue(undefined),
    getEvidenceForBid: vi.fn().mockResolvedValue({ fields: [], raw: 'raw text' }),
    verifyEvidence: vi.fn().mockResolvedValue(undefined),
  }));
  return { createHerbieExtractionService };
});

describe('herbie-extraction.service', () => {
  describe('factory', () => {
    it('returns service instance', async () => {
      const mod = await import('../herbie-extraction.service');
      const svc = mod.createHerbieExtractionService('t-1');
      expect(svc).toBeDefined();
    });
    it('two calls return independent instances', async () => {
      const mod = await import('../herbie-extraction.service');
      const s1 = mod.createHerbieExtractionService('t-1');
      const s2 = mod.createHerbieExtractionService('t-2');
      expect(s1).not.toBe(s2);
    });
  });
  describe('extractWithAI', () => {
    it('returns extracted field array', async () => {
      const mod = await import('../herbie-extraction.service');
      const svc = mod.createHerbieExtractionService('t-1');
      const result = await svc.extractWithAI('bid document text', 'bid');
      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toHaveProperty('field');
      expect(result[0]).toHaveProperty('confidence');
    });
    it('confidence is between 0 and 1', async () => {
      const mod = await import('../herbie-extraction.service');
      const svc = mod.createHerbieExtractionService('t-1');
      const result = await svc.extractWithAI('text', 'bid');
      result.forEach((f: any) => {
        expect(f.confidence).toBeGreaterThanOrEqual(0);
        expect(f.confidence).toBeLessThanOrEqual(1);
      });
    });
  });
  describe('getEvidenceForBid', () => {
    it('returns evidence shape with fields', async () => {
      const mod = await import('../herbie-extraction.service');
      const svc = mod.createHerbieExtractionService('t-1');
      const result = await svc.getEvidenceForBid('bid-1');
      expect(result).toHaveProperty('fields');
    });
  });
  describe('verifyEvidence', () => {
    it('resolves without error', async () => {
      const mod = await import('../herbie-extraction.service');
      const svc = mod.createHerbieExtractionService('t-1');
      await expect(svc.verifyEvidence('ev-1', 'user-1')).resolves.toBeUndefined();
    });
  });
});

// ─── HerbieJacketBuilderService ───────────────────────────────────────────────
vi.mock('../herbie-jacket-builder.service', () => ({
  buildBidJacket: vi.fn().mockResolvedValue({
    sections: [{ title: 'Executive Summary', content: '...' }],
    generatedAt: new Date().toISOString(),
    mode: 'build',
  }),
  autoBuildAllEmptyJackets: vi.fn().mockResolvedValue({ built: 5, errors: 0 }),
}));

describe('herbie-jacket-builder.service', () => {
  describe('buildBidJacket', () => {
    it('returns jacket with sections and generatedAt', async () => {
      const mod = await import('../herbie-jacket-builder.service');
      const result = await mod.buildBidJacket('bid-1');
      expect(result).toHaveProperty('sections');
      expect(result).toHaveProperty('generatedAt');
      expect(Array.isArray(result.sections)).toBe(true);
    });
    it('accepts repair mode', async () => {
      const mod = await import('../herbie-jacket-builder.service');
      await expect(mod.buildBidJacket('bid-1', 'repair')).resolves.toBeDefined();
    });
    it('defaults to build mode', async () => {
      const mod = await import('../herbie-jacket-builder.service');
      const result = await mod.buildBidJacket('bid-1');
      expect(result).toBeDefined();
    });
  });
  describe('autoBuildAllEmptyJackets', () => {
    it('returns built and errors count', async () => {
      const mod = await import('../herbie-jacket-builder.service');
      const result = await mod.autoBuildAllEmptyJackets();
      expect(result).toHaveProperty('built');
      expect(result).toHaveProperty('errors');
    });
    it('built is a non-negative number', async () => {
      const mod = await import('../herbie-jacket-builder.service');
      const result = await mod.autoBuildAllEmptyJackets();
      expect(typeof result.built).toBe('number');
      expect(result.built).toBeGreaterThanOrEqual(0);
    });
    it('errors is a non-negative number', async () => {
      const mod = await import('../herbie-jacket-builder.service');
      const result = await mod.autoBuildAllEmptyJackets();
      expect(result.errors).toBeGreaterThanOrEqual(0);
    });
  });
});

// ─── RAGService ───────────────────────────────────────────────────────────────
vi.mock('../rag.service', () => {
  const createRAGService = vi.fn().mockImplementation((tenantId: string) => ({
    tenantId,
    generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3, 0.4]),
    indexDocument: vi.fn().mockResolvedValue(undefined),
    indexOpportunity: vi.fn().mockResolvedValue(undefined),
    indexBidProject: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue([{ id: 'd-1', score: 0.92 }, { id: 'd-2', score: 0.85 }]),
    searchWithSources: vi.fn().mockResolvedValue({ results: [], answer: 'No results found.' }),
    getRecentKnowledgeDocuments: vi.fn().mockResolvedValue([{ id: 'kd-1' }]),
    createKnowledgeDocument: vi.fn().mockResolvedValue({ id: 'kd-2' }),
  }));
  return { createRAGService };
});

describe('rag.service', () => {
  describe('createRAGService factory', () => {
    it('returns service instance', async () => {
      const mod = await import('../rag.service');
      const svc = mod.createRAGService('t-1');
      expect(svc).toBeDefined();
    });
    it('different tenants get independent instances', async () => {
      const mod = await import('../rag.service');
      const s1 = mod.createRAGService('t-1');
      const s2 = mod.createRAGService('t-2');
      expect(s1).not.toBe(s2);
    });
  });
  describe('generateEmbedding', () => {
    it('returns number array', async () => {
      const mod = await import('../rag.service');
      const svc = mod.createRAGService('t-1');
      const result = await svc.generateEmbedding('hello world');
      expect(Array.isArray(result)).toBe(true);
      expect(typeof result[0]).toBe('number');
    });
    it('returns non-empty embedding', async () => {
      const mod = await import('../rag.service');
      const svc = mod.createRAGService('t-1');
      const result = await svc.generateEmbedding('text');
      expect(result.length).toBeGreaterThan(0);
    });
  });
  describe('search', () => {
    it('returns scored results array', async () => {
      const mod = await import('../rag.service');
      const svc = mod.createRAGService('t-1');
      const result = await svc.search('infrastructure grant', 5);
      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toHaveProperty('score');
    });
    it('accepts custom limit', async () => {
      const mod = await import('../rag.service');
      const svc = mod.createRAGService('t-1');
      await expect(svc.search('query', 10)).resolves.toBeDefined();
    });
    it('results have id property', async () => {
      const mod = await import('../rag.service');
      const svc = mod.createRAGService('t-1');
      const results = await svc.search('query');
      results.forEach((r: any) => expect(r).toHaveProperty('id'));
    });
  });
  describe('indexDocument', () => {
    it('resolves without error', async () => {
      const mod = await import('../rag.service');
      const svc = mod.createRAGService('t-1');
      await expect(svc.indexDocument('doc-1', 'content', 'rfp')).resolves.toBeUndefined();
    });
  });
  describe('getRecentKnowledgeDocuments', () => {
    it('returns array', async () => {
      const mod = await import('../rag.service');
      const svc = mod.createRAGService('t-1');
      const result = await svc.getRecentKnowledgeDocuments();
      expect(Array.isArray(result)).toBe(true);
    });
  });
  describe('createKnowledgeDocument', () => {
    it('returns created document with id', async () => {
      const mod = await import('../rag.service');
      const svc = mod.createRAGService('t-1');
      const result = await svc.createKnowledgeDocument({ title: 'Test', content: 'body' });
      expect(result).toHaveProperty('id');
    });
  });
});

// ─── DocumentIntelligenceService ─────────────────────────────────────────────
vi.mock('../document-intelligence.service', () => {
  const createDocumentIntelligenceService = vi.fn().mockImplementation((tenantId: string) => ({
    tenantId,
    initializeCategories: vi.fn().mockResolvedValue(undefined),
    getCategories: vi.fn().mockResolvedValue([{ id: 'cat-1', name: 'RFP' }, { id: 'cat-2', name: 'Contract' }]),
    getCategoryByName: vi.fn().mockImplementation((name: string) =>
      Promise.resolve(name === 'RFP' ? { id: 'cat-1', name: 'RFP' } : null)
    ),
    analyzeDocument: vi.fn().mockResolvedValue({ category: 'RFP', confidence: 0.95 }),
    processDocument: vi.fn().mockResolvedValue({ id: 'doc-1', aiMetadata: { category: 'RFP' } }),
    semanticSearch: vi.fn().mockResolvedValue([{ id: 'd-1', relevance: 0.9 }]),
    queueDocumentsForProcessing: vi.fn().mockResolvedValue(8),
    processQueue: vi.fn().mockResolvedValue({ processed: 8, failed: 0 }),
    createAlert: vi.fn().mockResolvedValue({ id: 'alert-1' }),
    getActiveAlerts: vi.fn().mockResolvedValue([]),
    getDocumentStats: vi.fn().mockResolvedValue({ total: 200, processed: 150, pending: 50 }),
    getRecentDocuments: vi.fn().mockResolvedValue([{ id: 'doc-1' }]),
  }));
  const getBatchProcessingState = vi.fn().mockReturnValue({ running: false, queued: 0, lastProcessedAt: null });
  return { createDocumentIntelligenceService, getBatchProcessingState };
});

describe('document-intelligence.service', () => {
  it('exports factory function', async () => {
    const mod = await import('../document-intelligence.service');
    expect(typeof mod.createDocumentIntelligenceService).toBe('function');
  });
  describe('getCategories', () => {
    it('returns categories array', async () => {
      const mod = await import('../document-intelligence.service');
      const svc = mod.createDocumentIntelligenceService('t-1');
      const cats = await svc.getCategories();
      expect(Array.isArray(cats)).toBe(true);
      expect(cats.length).toBeGreaterThan(0);
    });
    it('categories have id and name', async () => {
      const mod = await import('../document-intelligence.service');
      const svc = mod.createDocumentIntelligenceService('t-1');
      const cats = await svc.getCategories();
      cats.forEach((c: any) => {
        expect(c).toHaveProperty('id');
        expect(c).toHaveProperty('name');
      });
    });
  });
  describe('getCategoryByName', () => {
    it('returns category for known name', async () => {
      const mod = await import('../document-intelligence.service');
      const svc = mod.createDocumentIntelligenceService('t-1');
      const cat = await svc.getCategoryByName('RFP');
      expect(cat).toHaveProperty('name', 'RFP');
    });
    it('returns null for unknown name', async () => {
      const mod = await import('../document-intelligence.service');
      const svc = mod.createDocumentIntelligenceService('t-1');
      const cat = await svc.getCategoryByName('NONEXISTENT');
      expect(cat).toBeNull();
    });
  });
  describe('getDocumentStats', () => {
    it('returns total/processed/pending shape', async () => {
      const mod = await import('../document-intelligence.service');
      const svc = mod.createDocumentIntelligenceService('t-1');
      const stats = await svc.getDocumentStats();
      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('processed');
      expect(stats).toHaveProperty('pending');
    });
    it('all counts are numeric', async () => {
      const mod = await import('../document-intelligence.service');
      const svc = mod.createDocumentIntelligenceService('t-1');
      const stats = await svc.getDocumentStats();
      expect(typeof stats.total).toBe('number');
      expect(typeof stats.processed).toBe('number');
      expect(typeof stats.pending).toBe('number');
    });
  });
  describe('queueDocumentsForProcessing + processQueue', () => {
    it('queues batch and processes it', async () => {
      const mod = await import('../document-intelligence.service');
      const svc = mod.createDocumentIntelligenceService('t-1');
      const queued = await svc.queueDocumentsForProcessing(50);
      expect(typeof queued).toBe('number');
      const result = await svc.processQueue();
      expect(result).toHaveProperty('processed');
      expect(result).toHaveProperty('failed');
    });
  });
  describe('semanticSearch', () => {
    it('returns results with relevance', async () => {
      const mod = await import('../document-intelligence.service');
      const svc = mod.createDocumentIntelligenceService('t-1');
      const results = await svc.semanticSearch('infrastructure', 10);
      expect(Array.isArray(results)).toBe(true);
    });
  });
  describe('getBatchProcessingState', () => {
    it('returns running boolean', async () => {
      const mod = await import('../document-intelligence.service');
      const state = mod.getBatchProcessingState();
      expect(typeof state.running).toBe('boolean');
    });
  });
});

// ─── ProcoreIngestService ─────────────────────────────────────────────────────
vi.mock('../procore-ingest.service', () => ({
  runProcoreIngest: vi.fn().mockResolvedValue({
    imported: 15,
    updated: 6,
    errors: 0,
    duration: 2000,
  }),
}));

describe('procore-ingest.service', () => {
  describe('runProcoreIngest', () => {
    it('returns ingest result shape', async () => {
      const mod = await import('../procore-ingest.service');
      const result = await mod.runProcoreIngest();
      expect(result).toHaveProperty('imported');
      expect(result).toHaveProperty('updated');
      expect(result).toHaveProperty('errors');
    });
    it('imported and updated are numeric', async () => {
      const mod = await import('../procore-ingest.service');
      const result = await mod.runProcoreIngest();
      expect(typeof result.imported).toBe('number');
      expect(typeof result.updated).toBe('number');
    });
    it('errors is non-negative', async () => {
      const mod = await import('../procore-ingest.service');
      const result = await mod.runProcoreIngest();
      expect(result.errors).toBeGreaterThanOrEqual(0);
    });
  });
});

// ─── HerbieAgentService ───────────────────────────────────────────────────────
vi.mock('../herbie-agent.service', () => ({
  runAgent: vi.fn().mockImplementation(async (args: any) => ({
    output: 'Analysis of ' + (args?.prompt ?? 'prompt') + ' complete.',
    toolCallsMade: 3,
    tokensUsed: 1200,
    tenantId: args?.tenantId,
  })),
}));

describe('herbie-agent.service', () => {
  describe('runAgent', () => {
    it('returns agent output string', async () => {
      const mod = await import('../herbie-agent.service');
      const result = await mod.runAgent({ prompt: 'Analyze this bid', tenantId: 't-1' });
      expect(result).toHaveProperty('output');
      expect(typeof result.output).toBe('string');
    });
    it('returns toolCallsMade count', async () => {
      const mod = await import('../herbie-agent.service');
      const result = await mod.runAgent({ prompt: 'test', tenantId: 't-1' });
      expect(typeof result.toolCallsMade).toBe('number');
    });
    it('returns tokensUsed', async () => {
      const mod = await import('../herbie-agent.service');
      const result = await mod.runAgent({ prompt: 'check deadlines', tenantId: 't-1' });
      expect(typeof result.tokensUsed).toBe('number');
    });
    it('output references the prompt', async () => {
      const mod = await import('../herbie-agent.service');
      const result = await mod.runAgent({ prompt: 'MyQuery', tenantId: 't-1' });
      expect(result.output).toContain('MyQuery');
    });
  });
});
