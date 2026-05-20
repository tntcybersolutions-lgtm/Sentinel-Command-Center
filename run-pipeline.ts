import { runAutoCreate, productionAutoCreateDeps } from './server/services/samgov-auto-create.service';
const TENANT='8e06fd74-d9c8-45da-ac93-d8f36b7a52fb';
(async () => {
  console.log('[pipeline] runAutoCreate starting…');
  const auto = await runAutoCreate(TENANT, productionAutoCreateDeps);
  console.log('[pipeline] runAutoCreate DONE:', JSON.stringify(auto));
  console.log('[pipeline] runHerbieAutonomous starting…');
  const { getHerbieAutonomousAgent } = await import('./server/agents/herbie.autonomous');
  const herbie = getHerbieAutonomousAgent(TENANT);
  const stats = await herbie.runAutonomousCycle();
  console.log('[pipeline] HERBIE DONE:', JSON.stringify(stats));
  process.exit(0);
})().catch(e => { console.error('[pipeline] FAILED:', e); process.exit(2); });
