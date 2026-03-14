const { TRIAGE_AI_URL } = require('../services/triageService');
const { runRescoreForAllDepartments } = require('../services/queueService');

async function runRescorePass() {
  return runRescoreForAllDepartments();
}

function startTriageRescoreJob() {
  const hasRemoteAi = Boolean(process.env.TRIAGE_AI_URL);
  const isEnabled = (process.env.TRIAGE_RESCORE_ENABLED || (hasRemoteAi ? 'true' : 'false')).toLowerCase() === 'true';

  if (!isEnabled) {
    console.log('[TriageRescoreJob] disabled');
    return;
  }

  const intervalMs = Number(process.env.TRIAGE_RESCORE_INTERVAL_MS || 300000);
  console.log(`[TriageRescoreJob] enabled interval=${intervalMs}ms ai=${TRIAGE_AI_URL}`);

  setInterval(async () => {
    try {
      const summary = await runRescorePass();
      if (summary.scanned > 0) {
        console.log('[TriageRescoreJob] pass complete', summary);
      }
    } catch (error) {
      console.error('[TriageRescoreJob] pass failed', error?.message || error);
    }
  }, intervalMs);
}

module.exports = { startTriageRescoreJob, runRescorePass };
