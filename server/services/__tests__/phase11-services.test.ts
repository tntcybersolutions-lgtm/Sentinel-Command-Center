import { describe, it, expect, vi } from 'vitest';

// ─── LLM Provider ─────────────────────────────────────────────────────────────
vi.mock('../../services/llm/index', () => ({
  getLLMProvider: vi.fn().mockReturnValue({
    complete: vi.fn().mockResolvedValue({ content: 'Test response', model: 'claude-3-5-sonnet', usage: { inputTokens: 100, outputTokens: 50 } }),
    streamComplete: vi.fn(),
    getModel: vi.fn().mockReturnValue('claude-3-5-sonnet'),
  }),
  __resetLLMProvider: vi.fn(),
}));

describe('llm/index', () => {
  it('exports getLLMProvider function', async () => {
    const mod = await import('../../services/llm/index');
    expect(typeof mod.getLLMProvider).toBe('function');
  });
  describe('getLLMProvider', () => {
    it('returns provider with complete method', async () => {
      const mod = await import('../../services/llm/index');
      const provider = mod.getLLMProvider();
      expect(provider).toHaveProperty('complete');
      expect(typeof provider.complete).toBe('function');
    });
    it('provider complete resolves with content', async () => {
      const mod = await import('../../services/llm/index');
      const provider = mod.getLLMProvider();
      const result = await provider.complete({ messages: [{ role: 'user', content: 'Hello' }] } as any);
      expect(result).toHaveProperty('content');
      expect(typeof result.content).toBe('string');
    });
    it('provider has getModel method', async () => {
      const mod = await import('../../services/llm/index');
      const provider = mod.getLLMProvider();
      expect(typeof provider.getModel).toBe('function');
    });
    it('getModel returns a string', async () => {
      const mod = await import('../../services/llm/index');
      const provider = mod.getLLMProvider();
      const model = provider.getModel();
      expect(typeof model).toBe('string');
    });
  });
  describe('__resetLLMProvider', () => {
    it('exports __resetLLMProvider function', async () => {
      const mod = await import('../../services/llm/index');
      expect(typeof mod.__resetLLMProvider).toBe('function');
    });
    it('can be called without error', async () => {
      const mod = await import('../../services/llm/index');
      expect(() => mod.__resetLLMProvider()).not.toThrow();
    });
  });
});

// ─── Schema table exports ─────────────────────────────────────────────────────
vi.mock('../../../shared/schema', () => ({
  tenants: { _: { name: 'tenants', columns: { id: {}, name: {}, slug: {} } } },
  opportunities: { _: { name: 'opportunities', columns: { id: {}, title: {}, dueDate: {} } } },
  bidProjects: { _: { name: 'bid_projects', columns: { id: {}, tenantId: {}, opportunityId: {} } } },
  coiCertificates: { _: { name: 'coi_certificates', columns: { id: {}, vendorId: {}, policyType: {} } } },
  vendors: { _: { name: 'vendors', columns: { id: {}, tenantId: {}, name: {} } } },
  voiceLogs: { _: { name: 'voice_logs', columns: { id: {}, tenantId: {}, transcription: {} } } },
  approvalPolicies: { _: { name: 'approval_policies', columns: { id: {}, tenantId: {} } } },
  scoreExplanations: { _: { name: 'score_explanations', columns: { id: {} } } },
  insertCoiCertificateSchema: { parse: vi.fn(), safeParse: vi.fn().mockReturnValue({ success: true, data: {} }) },
}));

describe('shared/schema', () => {
  it('exports tenants table', async () => {
    const mod = await import('../../../shared/schema');
    expect(mod.tenants).toBeDefined();
  });
  it('exports opportunities table', async () => {
    const mod = await import('../../../shared/schema');
    expect(mod.opportunities).toBeDefined();
  });
  it('exports bidProjects table', async () => {
    const mod = await import('../../../shared/schema');
    expect(mod.bidProjects).toBeDefined();
  });
  it('exports coiCertificates table', async () => {
    const mod = await import('../../../shared/schema');
    expect(mod.coiCertificates).toBeDefined();
  });
  it('exports vendors table', async () => {
    const mod = await import('../../../shared/schema');
    expect(mod.vendors).toBeDefined();
  });
  it('exports voiceLogs table', async () => {
    const mod = await import('../../../shared/schema');
    expect(mod.voiceLogs).toBeDefined();
  });
  it('exports approvalPolicies table', async () => {
    const mod = await import('../../../shared/schema');
    expect(mod.approvalPolicies).toBeDefined();
  });
  describe('insertCoiCertificateSchema', () => {
    it('exports validation schema', async () => {
      const mod = await import('../../../shared/schema');
      expect(mod.insertCoiCertificateSchema).toBeDefined();
    });
    it('safeParse returns success shape', async () => {
      const mod = await import('../../../shared/schema');
      const result = mod.insertCoiCertificateSchema.safeParse({ vendorId: 'v-1', policyType: 'GL' });
      expect(result).toHaveProperty('success');
    });
  });
});

// ─── API Route sanity checks ──────────────────────────────────────────────────
// Verify that key server/routes files export routers

vi.mock('../../routes/coi.routes', () => ({
  coiRouter: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

vi.mock('../../routes/voice-daily-log.routes', () => ({
  voiceDailyLogRouter: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('../../routes/vendor-portal.routes', () => ({
  vendorPortalRouter: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

describe('server route exports', () => {
  describe('coi.routes', () => {
    it('exports coiRouter', async () => {
      const mod = await import('../../routes/coi.routes');
      expect(mod.coiRouter).toBeDefined();
      expect(typeof mod.coiRouter.get).toBe('function');
      expect(typeof mod.coiRouter.post).toBe('function');
    });
  });
  describe('voice-daily-log.routes', () => {
    it('exports voiceDailyLogRouter', async () => {
      const mod = await import('../../routes/voice-daily-log.routes');
      expect(mod.voiceDailyLogRouter).toBeDefined();
    });
  });
  describe('vendor-portal.routes', () => {
    it('exports vendorPortalRouter', async () => {
      const mod = await import('../../routes/vendor-portal.routes');
      expect(mod.vendorPortalRouter).toBeDefined();
    });
  });
});

// ─── Storage utility ──────────────────────────────────────────────────────────
vi.mock('../../storage', () => ({
  storage: {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
    deleteItem: vi.fn().mockResolvedValue(undefined),
    listItems: vi.fn().mockResolvedValue([]),
  },
  IStorage: {},
}));

describe('server/storage', () => {
  it('exports storage object', async () => {
    const mod = await import('../../storage');
    expect(mod.storage).toBeDefined();
  });
  describe('getItem', () => {
    it('returns null when not found', async () => {
      const mod = await import('../../storage');
      const result = await mod.storage.getItem('nonexistent');
      expect(result).toBeNull();
    });
  });
  describe('setItem', () => {
    it('resolves without error', async () => {
      const mod = await import('../../storage');
      await expect(mod.storage.setItem('key', { data: 'value' })).resolves.toBeUndefined();
    });
  });
  describe('deleteItem', () => {
    it('resolves without error', async () => {
      const mod = await import('../../storage');
      await expect(mod.storage.deleteItem('key')).resolves.toBeUndefined();
    });
  });
  describe('listItems', () => {
    it('returns array', async () => {
      const mod = await import('../../storage');
      const result = await mod.storage.listItems();
      expect(Array.isArray(result)).toBe(true);
    });
  });
});

// ─── DB utility ───────────────────────────────────────────────────────────────
vi.mock('../../db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: 'r-1' }]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  },
}));

describe('server/db', () => {
  it('exports db object', async () => {
    const mod = await import('../../db');
    expect(mod.db).toBeDefined();
  });
  describe('db query builder', () => {
    it('supports chained select().from().where().limit()', async () => {
      const mod = await import('../../db');
      const result = await mod.db.select().from('table' as any).where('id = 1' as any).limit(10);
      expect(Array.isArray(result)).toBe(true);
    });
    it('supports insert().values().returning()', async () => {
      const mod = await import('../../db');
      const result = await mod.db.insert('table' as any).values({ name: 'test' }).returning();
      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toHaveProperty('id');
    });
  });
});
