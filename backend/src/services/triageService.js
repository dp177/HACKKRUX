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
  const { data } = await http.post('/api/v1/chat/next-questions', payload);
  return data;
}

async function analyzeTriage(payload, file) {
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
      throw new Error(`AI analyze failed (${response.status}): ${text.slice(0, 300)}`);
    }

    return response.json();
  }

  const { data } = await http.post('/api/v1/analyze-triage', payload || {});
  return data;
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
