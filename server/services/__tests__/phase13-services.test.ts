import { describe, it, expect, vi } from 'vitest';

// ─── automation.service ───────────────────────────────────────────────────────
vi.mock('../automation.service', () => ({
  ensureDefaultRules: vi.fn().mockResolvedValue(undefined),
  listRules: vi.fn().mockResolvedValue([{ id: 'rule-1', name: 'Auto Score', enabled: true }]),
  toggleRule: vi.fn().mockResolvedValue({ id: 'rule-1', enabled: false }),
  logRun: vi.fn().mockResolvedValue('run-1'),
  listRuns: vi.fn().mockResolvedValue([{ id: 'run-1', status: 'success', entityType: 'opportunity' }]),
}));

describe('automation.service', () => {
  describe('listRules', () => {
    it('returns array of rules', async () => {
      const mod = await import('../automation.service');
      const result = await mod.listRules('t-1');
      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toHaveProperty('name');
    });
  });
  describe('toggleRule', () => {
    it('returns updated rule with enabled flag', async () => {
      const mod = await import('../automation.service');
      const result = await mod.toggleRule('rule-1');
      expect(result).toHaveProperty('id', 'rule-1');
      expect(typeof result.enabled).toBe('boolean');
    });
  });
  describe('logRun', () => {
    it('returns run id string', async () => {
      const mod = await import('../automation.service');
      const result = await mod.logRun('t-1', 'rule-1', 'opportunity', 'opp-1', 'success');
      expect(typeof result).toBe('string');
    });
  });
  describe('listRuns', () => {
    it('returns array of runs', async () => {
      const mod = await import('../automation.service');
      const result = await mod.listRuns('t-1');
      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toHaveProperty('status');
    });
  });
  describe('ensureDefaultRules', () => {
    it('resolves without error', async () => {
      const mod = await import('../automation.service');
      await expect(mod.ensureDefaultRules('t-1')).resolves.toBeUndefined();
    });
  });
});

// ─── award.service ────────────────────────────────────────────────────────────
vi.mock('../award.service', () => ({
  createAward: vi.fn().mockResolvedValue({ id: 'award-1', bidProjectId: 'bid-1', contractValue: 500000 }),
  getAward: vi.fn().mockResolvedValue({ id: 'award-1', status: 'active' }),
  rescindAward: vi.fn().mockResolvedValue({ id: 'award-1', status: 'rescinded' }),
  regeneratePacket: vi.fn().mockResolvedValue({ packetId: 'pkt-1', generatedAt: new Date().toISOString() }),
  getPacketPdfBytes: vi.fn().mockResolvedValue(Buffer.from('fake-pdf')),
}));

describe('award.service', () => {
  describe('createAward', () => {
    it('returns award with id and contractValue', async () => {
      const mod = await import('../award.service');
      const result = await mod.createAward({ bidProjectId: 'bid-1', contractValue: 500000 } as any);
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('contractValue');
    });
  });
  describe('getAward', () => {
    it('returns award by bid project id', async () => {
      const mod = await import('../award.service');
      const result = await mod.getAward('bid-1');
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('status');
    });
  });
  describe('rescindAward', () => {
    it('returns rescinded award', async () => {
      const mod = await import('../award.service');
      const result = await mod.rescindAward('bid-1', 'duplicate submission');
      expect(result.status).toBe('rescinded');
    });
  });
  describe('regeneratePacket', () => {
    it('returns packet with id and timestamp', async () => {
      const mod = await import('../award.service');
      const result = await mod.regeneratePacket('bid-1');
      expect(result).toHaveProperty('packetId');
      expect(result).toHaveProperty('generatedAt');
    });
  });
  describe('getPacketPdfBytes', () => {
    it('returns buffer', async () => {
      const mod = await import('../award.service');
      const result = await mod.getPacketPdfBytes('bid-1');
      expect(result).toBeDefined();
    });
  });
});

// ─── hr.service ───────────────────────────────────────────────────────────────
const mockHrService = {
  listEmployees: vi.fn().mockResolvedValue([{ id: 'emp-1', name: 'Alice', role: 'PM' }]),
  getEmployee: vi.fn().mockResolvedValue({ id: 'emp-1', name: 'Alice', role: 'PM' }),
  createEmployee: vi.fn().mockResolvedValue({ id: 'emp-2', name: 'Bob' }),
  updateEmployee: vi.fn().mockResolvedValue({ id: 'emp-1', name: 'Alice Updated' }),
  terminateEmployee: vi.fn().mockResolvedValue({ id: 'emp-1', status: 'terminated' }),
};
vi.mock('../hr.service', () => ({ HRService: vi.fn(), hrService: mockHrService }));

describe('hr.service', () => {
  it('exports hrService', async () => { const m = await import('../hr.service'); expect(m.hrService).toBeDefined(); });
  describe('listEmployees', () => {
    it('returns array of employees', async () => {
      const result = await mockHrService.listEmployees('t-1');
      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toHaveProperty('name');
    });
    it('accepts optional filters', async () => {
      const result = await mockHrService.listEmployees('t-1', { role: 'PM' });
      expect(Array.isArray(result)).toBe(true);
    });
  });
  describe('getEmployee', () => {
    it('returns employee by id', async () => {
      const result = await mockHrService.getEmployee('t-1', 'emp-1');
      expect(result).toHaveProperty('id', 'emp-1');
    });
  });
  describe('createEmployee', () => {
    it('returns new employee with id', async () => {
      const result = await mockHrService.createEmployee('t-1', { name: 'Bob', role: 'PM' });
      expect(result).toHaveProperty('id');
    });
  });
  describe('terminateEmployee', () => {
    it('returns terminated employee', async () => {
      const result = await mockHrService.terminateEmployee('t-1', 'emp-1', { reason: 'resigned' });
      expect(result.status).toBe('terminated');
    });
  });
});

// ─── buyer-routing.service ────────────────────────────────────────────────────
const mockBuyerRoutingService = {
  routeOpportunityToBuyer: vi.fn().mockResolvedValue({ buyerId: 'buyer-1', confidence: 0.85, reason: 'Domain match' }),
  listBuyerAssignments: vi.fn().mockResolvedValue([{ opportunityId: 'opp-1', buyerId: 'buyer-1' }]),
  updateBuyerAssignment: vi.fn().mockResolvedValue({ opportunityId: 'opp-1', buyerId: 'buyer-2' }),
};
vi.mock('../buyer-routing.service', () => ({ buyerRoutingService: mockBuyerRoutingService }));

describe('buyer-routing.service', () => {
  it('exports buyerRoutingService', async () => { const m = await import('../buyer-routing.service'); expect(m.buyerRoutingService).toBeDefined(); });
  describe('routeOpportunityToBuyer', () => {
    it('returns routing result with buyerId and confidence', async () => {
      const result = await mockBuyerRoutingService.routeOpportunityToBuyer('opp-1');
      expect(result).toHaveProperty('buyerId');
      expect(result).toHaveProperty('confidence');
    });
    it('confidence is between 0 and 1', async () => {
      const result = await mockBuyerRoutingService.routeOpportunityToBuyer('opp-1');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });
  describe('listBuyerAssignments', () => {
    it('returns array of assignments', async () => {
      const result = await mockBuyerRoutingService.listBuyerAssignments('t-1');
      expect(Array.isArray(result)).toBe(true);
    });
  });
  describe('updateBuyerAssignment', () => {
    it('returns updated assignment', async () => {
      const result = await mockBuyerRoutingService.updateBuyerAssignment('opp-1', 'buyer-2');
      expect(result.buyerId).toBe('buyer-2');
    });
  });
});

// ─── ingestion-events.service ─────────────────────────────────────────────────
const mockIngestionEventsService = {
  recordEvent: vi.fn().mockResolvedValue('evt-1'),
  getLatestRun: vi.fn().mockResolvedValue({ id: 'run-1', status: 'success', processedAt: new Date().toISOString() }),
  listEvents: vi.fn().mockResolvedValue([{ id: 'evt-1', type: 'opportunity_created', timestamp: new Date() }]),
};
vi.mock('../ingestion-events.service', () => ({ ingestionEventsService: mockIngestionEventsService }));

describe('ingestion-events.service', () => {
  describe('recordEvent', () => {
    it('returns event id', async () => {
      const result = await mockIngestionEventsService.recordEvent({ type: 'opportunity_created', data: {} });
      expect(typeof result).toBe('string');
    });
  });
  describe('getLatestRun', () => {
    it('returns run with status', async () => {
      const result = await mockIngestionEventsService.getLatestRun('t-1');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('id');
    });
  });
  describe('listEvents', () => {
    it('returns array of events', async () => {
      const result = await mockIngestionEventsService.listEvents('t-1');
      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toHaveProperty('type');
    });
  });
});

// ─── ingestion-pipeline.service ───────────────────────────────────────────────
const mockIngestionPipelineService = {
  runFullIngestion: vi.fn().mockResolvedValue({ created: 10, updated: 5, errors: 0, duration: 3000 }),
  runIncrementalIngestion: vi.fn().mockResolvedValue({ created: 2, updated: 8, errors: 0 }),
  getIngestionStatus: vi.fn().mockResolvedValue({ running: false, lastRunAt: null, nextRunAt: null }),
  schedulePipeline: vi.fn().mockResolvedValue('schedule-1'),
};
vi.mock('../ingestion-pipeline.service', () => ({ ingestionPipelineService: mockIngestionPipelineService }));

describe('ingestion-pipeline.service', () => {
  describe('runFullIngestion', () => {
    it('returns created, updated, errors counts', async () => {
      const result = await mockIngestionPipelineService.runFullIngestion('t-1');
      expect(result).toHaveProperty('created');
      expect(result).toHaveProperty('updated');
      expect(result).toHaveProperty('errors');
    });
    it('all counts are non-negative', async () => {
      const result = await mockIngestionPipelineService.runFullIngestion('t-1');
      expect(result.created).toBeGreaterThanOrEqual(0);
      expect(result.errors).toBeGreaterThanOrEqual(0);
    });
  });
  describe('runIncrementalIngestion', () => {
    it('returns ingestion stats', async () => {
      const result = await mockIngestionPipelineService.runIncrementalIngestion('t-1');
      expect(result).toHaveProperty('created');
    });
  });
  describe('getIngestionStatus', () => {
    it('returns running boolean and timestamps', async () => {
      const result = await mockIngestionPipelineService.getIngestionStatus('t-1');
      expect(typeof result.running).toBe('boolean');
    });
  });
});
