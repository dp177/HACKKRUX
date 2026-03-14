const { TRIAGE_AI_URL } = require('../services/triageService');
const { runRescoreForAllDepartments } = require('../services/queueService');

async function runRescorePass() {
  return runRescoreForAllDepartments();
}

function startTriageRescoreJob() {
  const isEnabled = (process.env.TRIAGE_RESCORE_ENABLED || 'true').toLowerCase() === 'true';

  if (!isEnabled) {
    console.log('[TriageRescoreJob] disabled');
    return;
  }

  const intervalMs = Number(process.env.TRIAGE_RESCORE_INTERVAL_MS || 300000);
  console.log(`[TriageRescoreJob] enabled interval=${intervalMs}ms ai=${TRIAGE_AI_URL}`);

  let isRunning = false;

  const runPass = async (trigger) => {
    if (isRunning) {
      console.log('[TriageRescoreJob] skip_overlap', { trigger });
      return;
    }

    isRunning = true;
    try {
      const summary = await runRescorePass();
      if (summary.scanned > 0) {
        console.log('[TriageRescoreJob] pass complete', { trigger, ...summary });
      }
    } catch (error) {
      console.error('[TriageRescoreJob] pass failed', { trigger, error: error?.message || error });
    } finally {
      isRunning = false;
    }
  };

  // Run once immediately on startup, then every 5 minutes.
  runPass('startup');

  setInterval(async () => {
    await runPass('interval');
  }, intervalMs);
}

module.exports = { startTriageRescoreJob, runRescorePass };
