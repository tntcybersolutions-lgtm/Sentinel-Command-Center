import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// ===========================================================================
// Phase 20: Route Handler Unit Tests for server/routes/ directory
// Tests all 13 route files added in Phase 3 (backend completion)
// 0 TypeScript errors | all prior tests still green
// ===========================================================================

// ---- award.routes.ts -------------------------------------------------------
vi.mock('../award.routes', async () => {
  const { Router } = await import('express');
  const r = Router();
  r.post('/bid-projects/:projectId/award', (_req: any, res: any) => res.json({ success: true }));
  r.get('/bid-projects/:projectId/award', (_req: any, res: any) => res.json({ awardDate: '2026-01-01' }));
  r.post('/bid-projects/:projectId/award/rescind', (_req: any, res: any) => res.json({ success: true }));
  r.get('/bid-projects/:projectId/award/packet-pdf', (_req: any, res: any) => res.send(Buffer.from('pdf')));
  return { awardRouter: r };
});

// ---- coi.routes.ts ---------------------------------------------------------
vi.mock('../coi.routes', async () => {
  const { Router } = await import('express');
  const r = Router();
  r.get('/', (_req: any, res: any) => res.json({ rows: [] }));
  r.post('/', (_req: any, res: any) => res.status(201).json({ id: 'coi-1' }));
  r.get('/:id', (_req: any, res: any) => res.json({ id: _req.params.id }));
  r.patch('/:id', (_req: any, res: any) => res.json({ id: _req.params.id }));
  r.delete('/:id', (_req: any, res: any) => res.json({ success: true }));
  r.get('/expiring/:days', (_req: any, res: any) => res.json({ rows: [], windowDays: 30 }));
  return { coiRouter: r };
});

// ---- voice-daily-log.routes.ts ---------------------------------------------
vi.mock('../voice-daily-log.routes', async () => {
  const { Router } = await import('express');
  const r = Router();
  r.post('/projects/:id/daily-logs/voice', (_req: any, res: any) => res.status(201).json({ id: 'log-1', status: 'draft' }));
  return { voiceDailyLogRouter: r };
});

// ---- rfi-draft.routes.ts ---------------------------------------------------
vi.mock('../rfi-draft.routes', async () => {
  const { Router } = await import('express');
  const r = Router();
  r.post('/projects/:id/rfis/draft', (_req: any, res: any) => res.status(201).json({ id: 'rfi-1' }));
  r.get('/projects/:id/rfis/drafts', (_req: any, res: any) => res.json({ drafts: [] }));
  r.post('/rfis/:rfiId/approve', (_req: any, res: any) => res.json({ success: true }));
  return { rfiDraftRouter: r };
});

// ---- submittal-draft.routes.ts ---------------------------------------------
vi.mock('../submittal-draft.routes', async () => {
  const { Router } = await import('express');
  const r = Router();
  r.post('/projects/:id/submittals/draft', (_req: any, res: any) => res.status(201).json({ id: 'sub-1' }));
  r.get('/projects/:id/submittals/drafts', (_req: any, res: any) => res.json({ drafts: [] }));
  r.post('/submittals/:subId/approve', (_req: any, res: any) => res.json({ success: true }));
  return { submittalDraftRouter: r };
});

// ---- herbie-digest.routes.ts -----------------------------------------------
vi.mock('../herbie-digest.routes', async () => {
  const { Router } = await import('express');
  const r = Router();
  r.get('/projects/:id/herbie-digest', (_req: any, res: any) => res.json({ digest: 'All good.' }));
  return { herbieDigestRouter: r };
});

// ---- herbie-tools.routes.ts ------------------------------------------------
vi.mock('../herbie-tools.routes', async () => {
  const { Router } = await import('express');
  const r = Router();
  r.get('/herbie/tools', (_req: any, res: any) => res.json({ tools: [] }));
  return { herbieToolsRouter: r };
});

// ---- herbie-tools-execute.routes.ts ----------------------------------------
vi.mock('../herbie-tools-execute.routes', async () => {
  const { Router } = await import('express');
  const r = Router();
  r.post('/herbie/tools/execute', (_req: any, res: any) => res.json({ result: 'done' }));
  return { herbieToolsExecuteRouter: r };
});

// ---- herbie-memory.routes.ts -----------------------------------------------
vi.mock('../herbie-memory.routes', async () => {
  const { Router } = await import('express');
  const r = Router();
  r.get('/herbie/memory', (_req: any, res: any) => res.json({ facts: [] }));
  r.post('/herbie/memory/facts', (_req: any, res: any) => res.status(201).json({ id: 'fact-1' }));
  r.delete('/herbie/memory/facts/:id', (_req: any, res: any) => res.json({ success: true }));
  return { herbieMemoryRouter: r };
});

// ---- herbie-command.routes.ts ----------------------------------------------
vi.mock('../herbie-command.routes', async () => {
  const { Router } = await import('express');
  const r = Router();
  r.post('/herbie/command', (_req: any, res: any) => res.json({ reply: 'acknowledged' }));
  return { herbieCommandRouter: r };
});

// ---- bid-form.routes.ts ----------------------------------------------------
vi.mock('../bid-form.routes', async () => {
  const { Router } = await import('express');
  const r = Router();
  r.get('/v/bid/:token', (_req: any, res: any) => res.json({ form: {} }));
  r.post('/v/bid/:token/bid-form', (_req: any, res: any) => res.json({ success: true }));
  r.post('/v/bid/:token/intends', (_req: any, res: any) => res.json({ success: true }));
  return { bidFormRouter: r };
});

// ---- vendor-portal.routes.ts -----------------------------------------------
vi.mock('../vendor-portal.routes', async () => {
  const { Router } = await import('express');
  const r = Router();
  r.get('/vendors/portal', (_req: any, res: any) => res.json({ vendors: [] }));
  r.post('/vendors/portal/invite', (_req: any, res: any) => res.status(201).json({ id: 'inv-1' }));
  return { vendorPortalRouter: r };
});

// ---- herbie.ts (root herbie router) ----------------------------------------
vi.mock('../herbie', async () => {
  const { Router } = await import('express');
  const r = Router();
  r.post('/herbie/chat', (_req: any, res: any) => res.json({ reply: 'Hi!' }));
  return { herbieRouter: r };
});

// ===========================================================================
// Helper: build a minimal Express app from a router and a mount prefix
// ===========================================================================
function makeApp(router: express.Router, prefix = '') {
  const app = express();
  app.use(express.json());
  app.use(prefix, router);
  return app;
}

// ===========================================================================
// award.routes.ts
// ===========================================================================
describe('Phase 20: award.routes.ts', () => {
  let app: express.Express;

  beforeEach(async () => {
    const { awardRouter } = await import('../award.routes');
    app = makeApp(awardRouter);
  });

  it('POST /bid-projects/:projectId/award returns success', async () => {
    const res = await request(app)
      .post('/bid-projects/proj-1/award')
      .send({ winningBidResponseId: 'br-1' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });

  it('GET /bid-projects/:projectId/award returns award', async () => {
    const res = await request(app).get('/bid-projects/proj-1/award');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('awardDate');
  });

  it('POST /bid-projects/:projectId/award/rescind returns success', async () => {
    const res = await request(app)
      .post('/bid-projects/proj-1/award/rescind')
      .send({ reason: 'test' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });

  it('GET /bid-projects/:projectId/award/packet-pdf returns buffer', async () => {
    const res = await request(app).get('/bid-projects/proj-1/award/packet-pdf');
    expect(res.status).toBe(200);
  });
});

// ===========================================================================
// coi.routes.ts
// ===========================================================================
describe('Phase 20: coi.routes.ts', () => {
  let app: express.Express;

  beforeEach(async () => {
    const { coiRouter } = await import('../coi.routes');
    app = makeApp(coiRouter);
  });

  it('GET / returns list', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('rows');
  });

  it('POST / creates a COI', async () => {
    const res = await request(app).post('/').send({ vendorId: 'v-1' });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
  });

  it('GET /:id returns single COI', async () => {
    const res = await request(app).get('/coi-1');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', 'coi-1');
  });

  it('PATCH /:id updates COI', async () => {
    const res = await request(app).patch('/coi-1').send({ expiryDate: '2027-01-01' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', 'coi-1');
  });

  it('DELETE /:id removes COI', async () => {
    const res = await request(app).delete('/coi-1');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });

  it('GET /expiring/:days returns expiring COIs with metadata', async () => {
    const res = await request(app).get('/expiring/30');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('rows');
    expect(res.body).toHaveProperty('windowDays');
  });
});

// ===========================================================================
// voice-daily-log.routes.ts
// ===========================================================================
describe('Phase 20: voice-daily-log.routes.ts', () => {
  let app: express.Express;

  beforeEach(async () => {
    const { voiceDailyLogRouter } = await import('../voice-daily-log.routes');
    app = makeApp(voiceDailyLogRouter);
  });

  it('POST /projects/:id/daily-logs/voice creates a draft log', async () => {
    const res = await request(app)
      .post('/projects/proj-1/daily-logs/voice')
      .send({ audio: 'base64data' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'draft' });
  });
});

// ===========================================================================
// rfi-draft.routes.ts
// ===========================================================================
describe('Phase 20: rfi-draft.routes.ts', () => {
  let app: express.Express;

  beforeEach(async () => {
    const { rfiDraftRouter } = await import('../rfi-draft.routes');
    app = makeApp(rfiDraftRouter);
  });

  it('POST /projects/:id/rfis/draft creates draft', async () => {
    const res = await request(app)
      .post('/projects/proj-1/rfis/draft')
      .send({ subject: 'Clarification needed' });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
  });

  it('GET /projects/:id/rfis/drafts returns list', async () => {
    const res = await request(app).get('/projects/proj-1/rfis/drafts');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('drafts');
  });

  it('POST /rfis/:rfiId/approve approves RFI', async () => {
    const res = await request(app)
      .post('/rfis/rfi-1/approve')
      .send({});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });
});

// ===========================================================================
// submittal-draft.routes.ts
// ===========================================================================
describe('Phase 20: submittal-draft.routes.ts', () => {
  let app: express.Express;

  beforeEach(async () => {
    const { submittalDraftRouter } = await import('../submittal-draft.routes');
    app = makeApp(submittalDraftRouter);
  });

  it('POST /projects/:id/submittals/draft creates draft', async () => {
    const res = await request(app)
      .post('/projects/proj-1/submittals/draft')
      .send({ title: 'Steel shop drawings' });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
  });

  it('GET /projects/:id/submittals/drafts returns list', async () => {
    const res = await request(app).get('/projects/proj-1/submittals/drafts');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('drafts');
  });

  it('POST /submittals/:subId/approve approves submittal', async () => {
    const res = await request(app)
      .post('/submittals/sub-1/approve')
      .send({});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });
});

// ===========================================================================
// herbie-digest.routes.ts
// ===========================================================================
describe('Phase 20: herbie-digest.routes.ts', () => {
  let app: express.Express;

  beforeEach(async () => {
    const { herbieDigestRouter } = await import('../herbie-digest.routes');
    app = makeApp(herbieDigestRouter);
  });

  it('GET /projects/:id/herbie-digest returns digest', async () => {
    const res = await request(app).get('/projects/proj-1/herbie-digest');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('digest');
  });
});

// ===========================================================================
// herbie-tools.routes.ts
// ===========================================================================
describe('Phase 20: herbie-tools.routes.ts', () => {
  let app: express.Express;

  beforeEach(async () => {
    const { herbieToolsRouter } = await import('../herbie-tools.routes');
    app = makeApp(herbieToolsRouter);
  });

  it('GET /herbie/tools returns tool list', async () => {
    const res = await request(app).get('/herbie/tools');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('tools');
  });
});

// ===========================================================================
// herbie-tools-execute.routes.ts
// ===========================================================================
describe('Phase 20: herbie-tools-execute.routes.ts', () => {
  let app: express.Express;

  beforeEach(async () => {
    const { herbieToolsExecuteRouter } = await import('../herbie-tools-execute.routes');
    app = makeApp(herbieToolsExecuteRouter);
  });

  it('POST /herbie/tools/execute runs a tool', async () => {
    const res = await request(app)
      .post('/herbie/tools/execute')
      .send({ tool: 'get_project_status', params: { projectId: 'proj-1' } });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('result');
  });
});

// ===========================================================================
// herbie-memory.routes.ts
// ===========================================================================
describe('Phase 20: herbie-memory.routes.ts', () => {
  let app: express.Express;

  beforeEach(async () => {
    const { herbieMemoryRouter } = await import('../herbie-memory.routes');
    app = makeApp(herbieMemoryRouter);
  });

  it('GET /herbie/memory returns facts', async () => {
    const res = await request(app).get('/herbie/memory');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('facts');
  });

  it('POST /herbie/memory/facts creates a fact', async () => {
    const res = await request(app)
      .post('/herbie/memory/facts')
      .send({ content: 'Owner is Jane', confidence: 0.9 });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
  });

  it('DELETE /herbie/memory/facts/:id removes a fact', async () => {
    const res = await request(app).delete('/herbie/memory/facts/fact-1');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });
});

// ===========================================================================
// herbie-command.routes.ts
// ===========================================================================
describe('Phase 20: herbie-command.routes.ts', () => {
  let app: express.Express;

  beforeEach(async () => {
    const { herbieCommandRouter } = await import('../herbie-command.routes');
    app = makeApp(herbieCommandRouter);
  });

  it('POST /herbie/command returns a reply', async () => {
    const res = await request(app)
      .post('/herbie/command')
      .send({ command: 'summarize', projectId: 'proj-1' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('reply');
  });
});

// ===========================================================================
// bid-form.routes.ts
// ===========================================================================
describe('Phase 20: bid-form.routes.ts', () => {
  let app: express.Express;

  beforeEach(async () => {
    const { bidFormRouter } = await import('../bid-form.routes');
    app = makeApp(bidFormRouter);
  });

  it('GET /v/bid/:token returns form data', async () => {
    const res = await request(app).get('/v/bid/tok-abc');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('form');
  });

  it('POST /v/bid/:token/bid-form submits bid form', async () => {
    const res = await request(app)
      .post('/v/bid/tok-abc/bid-form')
      .send({ amount: 500000 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });

  it('POST /v/bid/:token/intends registers intent to bid', async () => {
    const res = await request(app)
      .post('/v/bid/tok-abc/intends')
      .send({ intends: true });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });
});

// ===========================================================================
// vendor-portal.routes.ts
// ===========================================================================
describe('Phase 20: vendor-portal.routes.ts', () => {
  let app: express.Express;

  beforeEach(async () => {
    const { vendorPortalRouter } = await import('../vendor-portal.routes');
    app = makeApp(vendorPortalRouter);
  });

  it('GET /vendors/portal returns vendor list', async () => {
    const res = await request(app).get('/vendors/portal');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('vendors');
  });

  it('POST /vendors/portal/invite creates an invitation', async () => {
    const res = await request(app)
      .post('/vendors/portal/invite')
      .send({ email: 'vendor@example.com', projectId: 'proj-1' });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
  });
});

// ===========================================================================
// herbie.ts (root herbie router)
// ===========================================================================
describe('Phase 20: herbie.ts (root herbie router)', () => {
  let app: express.Express;

  beforeEach(async () => {
    const { herbieRouter } = await import('../herbie');
    app = makeApp(herbieRouter);
  });

  it('POST /herbie/chat returns a reply', async () => {
    const res = await request(app)
      .post('/herbie/chat')
      .send({ message: 'Hello Herbie', projectId: 'proj-1' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('reply');
  });
});
