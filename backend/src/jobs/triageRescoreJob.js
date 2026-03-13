const { TriageRecord } = require('../models');
const { rescoreBatch, TRIAGE_AI_URL } = require('../services/triageService');

function mapRiskToPriority(score) {
  const value = Number(score || 0);
  if (value >= 90) return 'CRITICAL';
  if (value >= 75) return 'HIGH';
  if (value >= 50) return 'MODERATE';
  if (value >= 25) return 'LOW';
  return 'ROUTINE';
}

async function runRescorePass() {
  const since = new Date(Date.now() - 12 * 60 * 60 * 1000);
  const candidates = await TriageRecord.find({
    queuePosition: { $ne: null },
    createdAt: { $gte: since }
  })
    .sort({ createdAt: 1 })
    .limit(100)
    .populate('patientId', 'firstName lastName');

  if (!candidates.length) return { scanned: 0, updated: 0 };

  const patients = candidates.map((t) => ({
    triage_id: String(t._id),
    patient_id: String(t.patientId?._id || t.patientId || ''),
    risk_score: Number(t.totalRiskScore || 0),
    waiting_minutes: Math.max(0, Math.floor((Date.now() - new Date(t.createdAt).getTime()) / 60000)),
    priority_level: t.priorityLevel,
    chief_complaint: t.chiefComplaint
  }));

  const result = await rescoreBatch(patients);
  const updates = Array.isArray(result?.results) ? result.results : [];
  let updated = 0;

  for (const row of updates) {
    const triageId = row?.triage_id || row?.triageId;
    if (!triageId) continue;

    const nextScore = Number(row?.risk_score ?? row?.new_risk_score ?? row?.updated_risk_score);
    if (Number.isNaN(nextScore)) continue;

    await TriageRecord.findByIdAndUpdate(triageId, {
      totalRiskScore: nextScore,
      priorityLevel: mapRiskToPriority(nextScore)
    });
    updated += 1;
  }

  return { scanned: candidates.length, updated };
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
