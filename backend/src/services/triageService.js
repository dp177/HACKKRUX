const axios = require('axios');

const TRIAGE_AI_URL = (process.env.TRIAGE_AI_URL || process.env.TRIAGE_ENGINE_URL || 'http://localhost:5001').replace(/\/$/, '');

const http = axios.create({
  baseURL: TRIAGE_AI_URL,
  timeout: Number(process.env.TRIAGE_AI_TIMEOUT_MS || 20000)
});

function normalizeHistory(conversationHistory) {
  if (!Array.isArray(conversationHistory)) return [];
  return conversationHistory
    .filter((m) => m && typeof m === 'object')
    .map((m) => ({ role: String(m.role || 'user'), content: String(m.content || '') }))
    .filter((m) => m.content.trim().length > 0);
}

async function getNextQuestions(conversationHistory) {
  const payload = { conversation_history: normalizeHistory(conversationHistory) };
  console.log('[TriageService] chat-next request', { historyLength: payload.conversation_history.length, aiUrl: TRIAGE_AI_URL });
  const { data } = await http.post('/api/v1/chat/next-questions', payload);
  console.log('[TriageService] chat-next response', { questions: Array.isArray(data?.questions) ? data.questions.length : 0 });
  return data;
}

async function analyzeTriage(payload, file) {
  const historyLength = Array.isArray(payload?.conversation_history) ? payload.conversation_history.length : 0;
  console.log('[TriageService] analyze request', {
    aiUrl: TRIAGE_AI_URL,
    hasFile: Boolean(file?.buffer?.length),
    historyLength,
    patientId: payload?.patient_id || null
  });

  if (file?.buffer?.length) {
    // Use built-in fetch + FormData so no extra dependency is required.
    const form = new FormData();
    form.append('payload', JSON.stringify(payload || {}));
    form.append(
      'file',
      new Blob([file.buffer], { type: file.mimetype || 'application/octet-stream' }),
      file.originalname || 'upload.bin'
    );

    const response = await fetch(`${TRIAGE_AI_URL}/api/v1/analyze-triage`, {
      method: 'POST',
      body: form
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('[TriageService] analyze file error', { status: response.status, body: text.slice(0, 500) });
      throw new Error(`AI analyze failed (${response.status}): ${text.slice(0, 300)}`);
    }

    const data = await response.json();
    console.log('[TriageService] analyze file response', {
      riskScore: data?.risk_score ?? null,
      urgency: data?.urgency_level ?? null,
      department: data?.department ?? null
    });
    return data;
  }

  try {
    const { data } = await http.post('/api/v1/analyze-triage', payload || {});
    console.log('[TriageService] analyze response', {
      riskScore: data?.risk_score ?? null,
      urgency: data?.urgency_level ?? null,
      department: data?.department ?? null
    });
    return data;
  } catch (error) {
    console.error('[TriageService] analyze error', {
      message: error?.message || 'unknown error',
      responseData: error?.response?.data || null
    });
    throw error;
  }
}

async function rescoreBatch(patients) {
  const { data } = await http.post('/api/v1/rescore-batch', { patients: Array.isArray(patients) ? patients : [] });
  return data;
}

module.exports = {
  TRIAGE_AI_URL,
  getNextQuestions,
  analyzeTriage,
  rescoreBatch
};
