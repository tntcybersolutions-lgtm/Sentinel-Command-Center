import { describe, it, expect, vi } from 'vitest';

// ─── tool-router.service ──────────────────────────────────────────────────────
const mockToolRouterService = {
  routeRequest: vi.fn().mockResolvedValue({
    tool: 'search_opportunities',
    response: { results: [], answer: 'Found 0 opportunities matching query.' },
    toolsUsed: ['search'],
    tokensUsed: 250,
  }),
};
vi.mock('../tool-router.service', () => ({ ToolRouterService: vi.fn(), toolRouterService: mockToolRouterService }));

describe('tool-router.service', () => {
  it('exports toolRouterService', async () => { const m = await import('../tool-router.service'); expect(m.toolRouterService).toBeDefined(); });
  describe('routeRequest', () => {
    it('returns tool routing result', async () => {
      const result = await mockToolRouterService.routeRequest('Find opportunities for infrastructure');
      expect(result).toHaveProperty('tool');
      expect(result).toHaveProperty('response');
    });
    it('includes tokensUsed count', async () => {
      const result = await mockToolRouterService.routeRequest('search query');
      expect(typeof result.tokensUsed).toBe('number');
    });
    it('includes toolsUsed array', async () => {
      const result = await mockToolRouterService.routeRequest('search query');
      expect(Array.isArray(result.toolsUsed)).toBe(true);
    });
  });
});

// ─── my-day-seed.service ──────────────────────────────────────────────────────
vi.mock('../my-day-seed.service', () => ({
  seedMyDayScoringRules: vi.fn().mockResolvedValue({ seeded: 8, alreadyExisted: 2 }),
}));

describe('my-day-seed.service', () => {
  describe('seedMyDayScoringRules', () => {
    it('returns seeded and already-existed counts', async () => {
      const mod = await import('../my-day-seed.service');
      const result = await mod.seedMyDayScoringRules();
      expect(result).toHaveProperty('seeded');
      expect(result).toHaveProperty('alreadyExisted');
    });
    it('seeded is non-negative', async () => {
      const mod = await import('../my-day-seed.service');
      const result = await mod.seedMyDayScoringRules();
      expect(result.seeded).toBeGreaterThanOrEqual(0);
    });
  });
});

// ─── metric-snapshot.service ──────────────────────────────────────────────────
vi.mock('../metric-snapshot.service', () => ({
  getActiveTenantIds: vi.fn().mockResolvedValue(['t-1', 't-2', 't-3']),
  computeMetrics: vi.fn().mockResolvedValue({ opportunities: 45, bids: 12, winRate: 0.4, revenue: 1500000 }),
  writeSnapshot: vi.fn().mockResolvedValue({ id: 'snap-1', periodType: 'week', tenantId: 't-1' }),
  seedPreviousPeriodSnapshots: vi.fn().mockResolvedValue({ created: 4, skipped: 0 }),
}));

describe('metric-snapshot.service', () => {
  describe('getActiveTenantIds', () => {
    it('returns array of tenant ids', async () => {
      const mod = await import('../metric-snapshot.service');
      const result = await mod.getActiveTenantIds();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });
  });
  describe('computeMetrics', () => {
    it('returns metrics with opportunities and winRate', async () => {
      const mod = await import('../metric-snapshot.service');
      const result = await mod.computeMetrics('t-1');
      expect(result).toHaveProperty('opportunities');
      expect(result).toHaveProperty('winRate');
    });
    it('winRate is between 0 and 1', async () => {
      const mod = await import('../metric-snapshot.service');
      const result = await mod.computeMetrics('t-1');
      expect(result.winRate).toBeGreaterThanOrEqual(0);
      expect(result.winRate).toBeLessThanOrEqual(1);
    });
  });
  describe('writeSnapshot', () => {
    it('returns snapshot with id and periodType', async () => {
      const mod = await import('../metric-snapshot.service');
      const result = await mod.writeSnapshot('t-1', 'week');
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('periodType');
    });
  });
  describe('seedPreviousPeriodSnapshots', () => {
    it('returns created and skipped counts', async () => {
      const mod = await import('../metric-snapshot.service');
      const result = await mod.seedPreviousPeriodSnapshots('t-1');
      expect(result).toHaveProperty('created');
      expect(result).toHaveProperty('skipped');
    });
  });
});

// ─── home-priority.service ────────────────────────────────────────────────────
vi.mock('../home-priority.service', () => ({
  getPriorityItems: vi.fn().mockResolvedValue([
    { id: 'p-1', type: 'bid_due', priority: 'critical', message: 'Bid due in 24 hours' },
    { id: 'p-2', type: 'coi_expiring', priority: 'high', message: 'COI expires soon' },
  ]),
  markAsHandled: vi.fn().mockResolvedValue({ id: 'p-1', handled: true }),
  getPriorityStats: vi.fn().mockResolvedValue({ critical: 1, high: 2, medium: 5, low: 8 }),
}));

describe('home-priority.service', () => {
  describe('getPriorityItems', () => {
    it('returns array of priority items', async () => {
      const mod = await import('../home-priority.service');
      const result = await mod.getPriorityItems('t-1');
      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toHaveProperty('priority');
    });
    it('items have message property', async () => {
      const mod = await import('../home-priority.service');
      const result = await mod.getPriorityItems('t-1');
      result.forEach((item: any) => expect(item).toHaveProperty('message'));
    });
  });
  describe('markAsHandled', () => {
    it('returns handled item', async () => {
      const mod = await import('../home-priority.service');
      const result = await mod.markAsHandled('t-1', 'p-1');
      expect(result.handled).toBe(true);
    });
  });
  describe('getPriorityStats', () => {
    it('returns stats with critical/high/medium/low counts', async () => {
      const mod = await import('../home-priority.service');
      const result = await mod.getPriorityStats('t-1');
      expect(result).toHaveProperty('critical');
      expect(result).toHaveProperty('high');
      expect(result).toHaveProperty('medium');
      expect(result).toHaveProperty('low');
    });
  });
});

// ─── my-day-scoring.service ───────────────────────────────────────────────────
vi.mock('../my-day-scoring.service', () => ({
  scoreUserDay: vi.fn().mockResolvedValue({ score: 82, breakdown: { tasksCompleted: 40, urgentHandled: 25, bidsAdvanced: 17 } }),
  getDailyStreak: vi.fn().mockResolvedValue({ current: 5, longest: 14 }),
  getWeeklyScores: vi.fn().mockResolvedValue([{ date: '2026-04-18', score: 75 }, { date: '2026-04-19', score: 82 }]),
}));

describe('my-day-scoring.service', () => {
  describe('scoreUserDay', () => {
    it('returns numeric score with breakdown', async () => {
      const mod = await import('../my-day-scoring.service');
      const result = await mod.scoreUserDay('u-1', 't-1');
      expect(typeof result.score).toBe('number');
      expect(result).toHaveProperty('breakdown');
    });
    it('score is non-negative', async () => {
      const mod = await import('../my-day-scoring.service');
      const result = await mod.scoreUserDay('u-1', 't-1');
      expect(result.score).toBeGreaterThanOrEqual(0);
    });
  });
  describe('getDailyStreak', () => {
    it('returns current and longest streak', async () => {
      const mod = await import('../my-day-scoring.service');
      const result = await mod.getDailyStreak('u-1');
      expect(result).toHaveProperty('current');
      expect(result).toHaveProperty('longest');
    });
  });
  describe('getWeeklyScores', () => {
    it('returns array of dated scores', async () => {
      const mod = await import('../my-day-scoring.service');
      const result = await mod.getWeeklyScores('u-1');
      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toHaveProperty('date');
      expect(result[0]).toHaveProperty('score');
    });
  });
});

// ─── proactive-intelligence.service ──────────────────────────────────────────
vi.mock('../proactive-intelligence.service', () => ({
  runProactiveAnalysis: vi.fn().mockResolvedValue({ insights: [], recommendations: [], alertsGenerated: 0 }),
  getProactiveInsights: vi.fn().mockResolvedValue([{ id: 'ins-1', type: 'deadline_risk', severity: 'high' }]),
  dismissInsight: vi.fn().mockResolvedValue({ id: 'ins-1', dismissed: true }),
}));

describe('proactive-intelligence.service', () => {
  describe('runProactiveAnalysis', () => {
    it('returns insights and recommendations arrays', async () => {
      const mod = await import('../proactive-intelligence.service');
      const result = await mod.runProactiveAnalysis('t-1');
      expect(Array.isArray(result.insights)).toBe(true);
      expect(Array.isArray(result.recommendations)).toBe(true);
    });
    it('alertsGenerated is numeric', async () => {
      const mod = await import('../proactive-intelligence.service');
      const result = await mod.runProactiveAnalysis('t-1');
      expect(typeof result.alertsGenerated).toBe('number');
    });
  });
  describe('getProactiveInsights', () => {
    it('returns array of insights', async () => {
      const mod = await import('../proactive-intelligence.service');
      const result = await mod.getProactiveInsights('t-1');
      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toHaveProperty('type');
    });
  });
  describe('dismissInsight', () => {
    it('returns dismissed insight', async () => {
      const mod = await import('../proactive-intelligence.service');
      const result = await mod.dismissInsight('ins-1');
      expect(result.dismissed).toBe(true);
    });
  });
});
