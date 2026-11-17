/**
 * Local dev boot: in-memory MongoDB + backend, no external services needed.
 * Usage: node scripts/dev-local.js   (then: BASE_URL=http://localhost:5000/api node scripts/smoke-test.mjs)
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.PORT = process.env.PORT || '5000';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'localdev-secret-change-me';
process.env.TRIAGE_AI_URL = process.env.TRIAGE_AI_URL || 'http://127.0.0.1:5001';
process.env.TRIAGE_ENGINE_URL = process.env.TRIAGE_ENGINE_URL || process.env.TRIAGE_AI_URL;
process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || 'http://localhost:3000';
const path = require('path');
const { MongoMemoryServer } = require('mongodb-memory-server');
(async () => {
  const mem = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mem.getUri('jeeva_local');
  console.log('[dev-local] in-memory MongoDB up');
  require(path.join(__dirname, '..', 'backend', 'src', 'server.js'));
})().catch((e) => { console.error('[dev-local] boot failed', e); process.exit(1); });
