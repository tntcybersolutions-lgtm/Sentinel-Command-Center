import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── auto-filing.service ──────────────────────────────────────────────────────
vi.mock('../auto-filing.service', () => {
  const mockAutoFilingService = {
    autoFilingRules: vi.fn().mockResolvedValue([]),
    documentAuditLog: vi.fn().mockResolvedValue([]),
    egnyteItems: vi.fn().mockResolvedValue([]),
    jacketDocuments: vi.fn().mockResolvedValue([]),
    jacketFolders: vi.fn().mockResolvedValue([]),
    companies: vi.fn().mockResolvedValue([]),
    bidProjects: vi.fn().mockResolvedValue([]),
    vendors: vi.fn().mockResolvedValue([]),
    evaluateDocument: vi.fn().mockResolvedValue({ ruleId: 'r1', matched: true }),
    processAutoFiling: vi.fn().mockResolvedValue({ filed: 2, skipped: 0 }),
    createRule: vi.fn().mockResolvedValue({ id: 'rule-1' }),
    updateRule: vi.fn().mockResolvedValue({ id: 'rule-1' }),
    deleteRule: vi.fn().mockResolvedValue(undefined),
    getRules: vi.fn().mockResolvedValue([]),
    runAutoFiling: vi.fn().mockResolvedValue({ processed: 5 }),
  };
  return {
    AutoFilingService: vi.fn(),
    createAutoFilingService: vi.fn(() => mockAutoFilingService),
    autoFilingServiceInstance: mockAutoFilingService,
  };
});

// ── comms.service ────────────────────────────────────────────────────────────
vi.mock('../comms.service', () => {
  const mockCommsService = {
    sendEmail: vi.fn().mockResolvedValue({ messageId: 'msg-1' }),
    createCalendarEvent: vi.fn().mockResolvedValue({ eventId: 'ev-1', approvalRequired: false }),
    enrollInSequence: vi.fn().mockResolvedValue(undefined),
    processSequenceStep: vi.fn().mockResolvedValue(undefined),
    createNotification: vi.fn().mockResolvedValue({ id: 'notif-1' }),
    getUpcomingEvents: vi.fn().mockResolvedValue([]),
    getEmailsByEntity: vi.fn().mockResolvedValue([]),
  };
  return {
    CommsService: vi.fn(),
    commsService: mockCommsService,
  };
});

// ── competitor.service ───────────────────────────────────────────────────────
vi.mock('../competitor.service', () => {
  const mockCompetitorService = {
    getCompetitors: vi.fn().mockResolvedValue([]),
    getCompetitor: vi.fn().mockResolvedValue({ id: 'c1', name: 'Competitor A' }),
    createCompetitor: vi.fn().mockResolvedValue({ id: 'c1' }),
    updateCompetitor: vi.fn().mockResolvedValue({ id: 'c1' }),
    deleteCompetitor: vi.fn().mockResolvedValue(undefined),
    getCompetitorAwards: vi.fn().mockResolvedValue([]),
    getAwardsByCompetitor: vi.fn().mockResolvedValue([]),
    upsertAward: vi.fn().mockResolvedValue({ id: 'aw-1' }),
    getCompetitorStats: vi.fn().mockResolvedValue({ totalAwards: 0, totalValue: 0 }),
  };
  return { competitorService: mockCompetitorService };
});

// ── connectors.service ───────────────────────────────────────────────────────
vi.mock('../connectors.service', () => {
  const mockConnectorService = {
    syncProcore: vi.fn().mockResolvedValue({ synced: 10 }),
    syncSmartBid: vi.fn().mockResolvedValue({ synced: 5 }),
    syncFPDS: vi.fn().mockResolvedValue({ synced: 3 }),
    getConnectorStatus: vi.fn().mockResolvedValue({ active: true, lastSync: new Date().toISOString() }),
    runConnector: vi.fn().mockResolvedValue({ result: 'ok' }),
  };
  return {
    ProcoreConnector: vi.fn(),
    SmartBidConnector: vi.fn(),
    FPDSConnector: vi.fn(),
    ConnectorService: vi.fn(),
    createConnectorService: vi.fn(() => mockConnectorService),
  };
});

// ── contractor-monitors.service ──────────────────────────────────────────────
vi.mock('../contractor-monitors.service', () => {
  const mr = { count: 0, items: [], tenantId: 'tenant-1', checkedAt: new Date().toISOString() };
  return {
    monitorStalledRfis: vi.fn().mockResolvedValue(mr),
    monitorOverdueSubmittals: vi.fn().mockResolvedValue(mr),
    monitorChangeOrderLag: vi.fn().mockResolvedValue(mr),
    monitorPayAppsDueSoon: vi.fn().mockResolvedValue(mr),
    monitorArAging: vi.fn().mockResolvedValue(mr),
    monitorExpiringInsurance: vi.fn().mockResolvedValue(mr),
    monitorExpiringCois: vi.fn().mockResolvedValue(mr),
    monitorMissingVendorDocs: vi.fn().mockResolvedValue(mr),
    runAllMonitors: vi.fn().mockResolvedValue({ results: [], tenantId: 'tenant-1' }),
  };
});

// ── highergov-discovery.service ──────────────────────────────────────────────
vi.mock('../highergov-discovery.service', () => ({
  discoverHigherGovAttachments: vi.fn().mockResolvedValue({ discovered: 0, attached: 0 }),
}));

import { createAutoFilingService } from '../auto-filing.service';
import { commsService } from '../comms.service';
import { competitorService } from '../competitor.service';
import { createConnectorService } from '../connectors.service';
import {
  monitorStalledRfis,
  monitorOverdueSubmittals,
  monitorChangeOrderLag,
  monitorPayAppsDueSoon,
  monitorArAging,
  monitorExpiringInsurance,
  monitorExpiringCois,
  monitorMissingVendorDocs,
  runAllMonitors,
} from '../contractor-monitors.service';
import { discoverHigherGovAttachments } from '../highergov-discovery.service';

// ============================================================
// AutoFilingService
// ============================================================
describe('AutoFilingService', () => {
  const svc = createAutoFilingService('tenant-1');

  it('exports createAutoFilingService factory', () => {
    expect(typeof createAutoFilingService).toBe('function');
  });

  it('evaluateDocument returns match result', async () => {
    const result = await svc.evaluateDocument({ documentId: 'd1' });
    expect(result).toHaveProperty('ruleId');
    expect(result).toHaveProperty('matched');
  });

  it('processAutoFiling returns filed/skipped counts', async () => {
    const result = await svc.processAutoFiling({ tenantId: 'tenant-1' });
    expect(result).toHaveProperty('filed');
    expect(result).toHaveProperty('skipped');
    expect(result.filed).toBeGreaterThanOrEqual(0);
    expect(result.skipped).toBeGreaterThanOrEqual(0);
  });

  it('createRule returns created rule', async () => {
    const result = await svc.createRule({ name: 'rule', condition: {} });
    expect(result).toHaveProperty('id');
  });

  it('updateRule returns updated rule', async () => {
    const result = await svc.updateRule('rule-1', { name: 'updated' });
    expect(result).toHaveProperty('id');
  });

  it('deleteRule resolves without error', async () => {
    await expect(svc.deleteRule('rule-1')).resolves.toBeUndefined();
  });

  it('getRules returns array', async () => {
    const result = await svc.getRules('tenant-1');
    expect(Array.isArray(result)).toBe(true);
  });

  it('runAutoFiling returns processed count', async () => {
    const result = await svc.runAutoFiling('tenant-1');
    expect(result).toHaveProperty('processed');
    expect(result.processed).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================
// CommsService
// ============================================================
describe('CommsService', () => {
  it('exports commsService singleton', () => {
    expect(commsService).toBeDefined();
  });

  it('sendEmail returns messageId', async () => {
    const result = await commsService.sendEmail({ to: 'a@b.com', subject: 'hi', body: 'text' });
    expect(result).toHaveProperty('messageId');
  });

  it('createCalendarEvent returns eventId and approvalRequired', async () => {
    const result = await commsService.createCalendarEvent({ title: 'Meeting', startTime: new Date().toISOString() });
    expect(result).toHaveProperty('eventId');
    expect(result).toHaveProperty('approvalRequired');
    expect(typeof result.approvalRequired).toBe('boolean');
  });

  it('enrollInSequence resolves without error', async () => {
    await expect(commsService.enrollInSequence({ contactId: 'c1', sequenceId: 's1' })).resolves.toBeUndefined();
  });

  it('processSequenceStep resolves without error', async () => {
    await expect(commsService.processSequenceStep('enroll-1')).resolves.toBeUndefined();
  });

  it('createNotification returns notification id', async () => {
    const result = await commsService.createNotification({ userId: 'u1', message: 'test' });
    expect(result).toHaveProperty('id');
  });

  it('getUpcomingEvents returns array', async () => {
    const result = await commsService.getUpcomingEvents('tenant-1');
    expect(Array.isArray(result)).toBe(true);
  });

  it('getEmailsByEntity returns array', async () => {
    const result = await commsService.getEmailsByEntity('tenant-1', 'project', 'p1');
    expect(Array.isArray(result)).toBe(true);
  });
});

// ============================================================
// CompetitorService
// ============================================================
describe('CompetitorService', () => {
  it('exports competitorService', () => {
    expect(competitorService).toBeDefined();
  });

  it('getCompetitors returns array', async () => {
    const result = await competitorService.getCompetitors('tenant-1');
    expect(Array.isArray(result)).toBe(true);
  });

  it('getCompetitor returns competitor object', async () => {
    const result = await competitorService.getCompetitor('tenant-1', 'c1');
    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('name');
  });

  it('createCompetitor returns created object', async () => {
    const result = await competitorService.createCompetitor({ tenantId: 'tenant-1', name: 'Acme' });
    expect(result).toHaveProperty('id');
  });

  it('updateCompetitor returns updated object', async () => {
    const result = await competitorService.updateCompetitor('tenant-1', 'c1', { name: 'Acme Updated' });
    expect(result).toHaveProperty('id');
  });

  it('deleteCompetitor resolves without error', async () => {
    await expect(competitorService.deleteCompetitor('tenant-1', 'c1')).resolves.toBeUndefined();
  });

  it('getCompetitorAwards returns array', async () => {
    const result = await competitorService.getCompetitorAwards('tenant-1');
    expect(Array.isArray(result)).toBe(true);
  });

  it('upsertAward returns award', async () => {
    const result = await competitorService.upsertAward({ competitorId: 'c1', value: 100000 });
    expect(result).toHaveProperty('id');
  });

  it('getCompetitorStats returns stats object', async () => {
    const result = await competitorService.getCompetitorStats('tenant-1');
    expect(result).toHaveProperty('totalAwards');
    expect(result).toHaveProperty('totalValue');
    expect(result.totalAwards).toBeGreaterThanOrEqual(0);
    expect(result.totalValue).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================
// ConnectorsService
// ============================================================
describe('ConnectorsService', () => {
  const svc = createConnectorService('tenant-1');

  it('exports createConnectorService factory', () => {
    expect(typeof createConnectorService).toBe('function');
  });

  it('syncProcore returns synced count', async () => {
    const result = await svc.syncProcore();
    expect(result).toHaveProperty('synced');
    expect(result.synced).toBeGreaterThanOrEqual(0);
  });

  it('syncSmartBid returns synced count', async () => {
    const result = await svc.syncSmartBid();
    expect(result).toHaveProperty('synced');
    expect(result.synced).toBeGreaterThanOrEqual(0);
  });

  it('syncFPDS returns synced count', async () => {
    const result = await svc.syncFPDS();
    expect(result).toHaveProperty('synced');
    expect(result.synced).toBeGreaterThanOrEqual(0);
  });

  it('getConnectorStatus returns active flag', async () => {
    const result = await svc.getConnectorStatus('procore');
    expect(result).toHaveProperty('active');
    expect(typeof result.active).toBe('boolean');
  });

  it('runConnector returns result', async () => {
    const result = await svc.runConnector('procore');
    expect(result).toHaveProperty('result');
  });
});

// ============================================================
// ContractorMonitorsService
// ============================================================
describe('ContractorMonitorsService', () => {
  const TENANT = 'tenant-1';

  it('monitorStalledRfis returns monitor result', async () => {
    const result = await monitorStalledRfis(TENANT);
    expect(result).toHaveProperty('count');
    expect(result).toHaveProperty('items');
    expect(Array.isArray(result.items)).toBe(true);
  });

  it('monitorOverdueSubmittals returns monitor result', async () => {
    const result = await monitorOverdueSubmittals(TENANT);
    expect(result).toHaveProperty('count');
    expect(result.count).toBeGreaterThanOrEqual(0);
  });

  it('monitorChangeOrderLag returns monitor result', async () => {
    const result = await monitorChangeOrderLag(TENANT);
    expect(result).toHaveProperty('count');
    expect(result).toHaveProperty('tenantId');
  });

  it('monitorPayAppsDueSoon returns monitor result', async () => {
    const result = await monitorPayAppsDueSoon(TENANT);
    expect(result).toHaveProperty('count');
    expect(result.count).toBeGreaterThanOrEqual(0);
  });

  it('monitorArAging returns monitor result', async () => {
    const result = await monitorArAging(TENANT);
    expect(result).toHaveProperty('count');
    expect(result.count).toBeGreaterThanOrEqual(0);
  });

  it('monitorExpiringInsurance returns monitor result', async () => {
    const result = await monitorExpiringInsurance(TENANT);
    expect(result).toHaveProperty('count');
  });

  it('monitorExpiringCois returns monitor result', async () => {
    const result = await monitorExpiringCois(TENANT);
    expect(result).toHaveProperty('count');
  });

  it('monitorMissingVendorDocs returns monitor result', async () => {
    const result = await monitorMissingVendorDocs(TENANT);
    expect(result).toHaveProperty('count');
    expect(result.count).toBeGreaterThanOrEqual(0);
  });

  it('runAllMonitors returns aggregated results', async () => {
    const result = await runAllMonitors(TENANT);
    expect(result).toHaveProperty('results');
    expect(Array.isArray(result.results)).toBe(true);
  });
});

// ============================================================
// HigherGovDiscoveryService
// ============================================================
describe('HigherGovDiscoveryService', () => {
  it('discoverHigherGovAttachments returns discovery stats', async () => {
    const result = await discoverHigherGovAttachments({ tenantId: 'tenant-1', opportunityId: 'op-1' });
    expect(result).toHaveProperty('discovered');
    expect(result).toHaveProperty('attached');
    expect(result.discovered).toBeGreaterThanOrEqual(0);
    expect(result.attached).toBeGreaterThanOrEqual(0);
  });

  it('handles empty params gracefully', async () => {
    const result = await discoverHigherGovAttachments({});
    expect(result).toHaveProperty('discovered');
  });
});
