const axios = require('axios');

function normalizeAiBaseUrl(raw) {
  const cleaned = String(raw || '').trim().replace(/\/$/, '');
  if (!cleaned) return 'http://localhost:5001';

  // Accept env values like:
  // - https://host
  // - https://host/api
  // - https://host/api/v1
  // and normalize all of them to https://host
  return cleaned.replace(/\/api(?:\/v1)?$/i, '');
}

const TRIAGE_AI_URL = normalizeAiBaseUrl(
  process.env.TRIAGE_AI_URL
  || process.env.TRIAGE_ENGINE_URL
  || 'https://jeet2207-triage.hf.space'
);

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

async function postAiJson(pathCandidates, payload) {
  let lastError = null;

  for (const path of pathCandidates) {
    try {
      console.log('[TriageService] try_json_endpoint', { aiUrl: TRIAGE_AI_URL, path });
      const { data } = await http.post(path, payload || {});
      return data;
    } catch (error) {
      const status = error?.response?.status;
      lastError = error;
      // If endpoint path is wrong on this deployment, try next candidate.
      if (status === 404) {
        console.warn('[TriageService] endpoint_404_try_next', { path, status });
        continue;
      }
      throw error;
    }
  }

  throw lastError || new Error('No AI endpoint candidate succeeded');
}

async function getNextQuestions(conversationHistory) {
  const payload = { conversation_history: normalizeHistory(conversationHistory) };
  console.log('[TriageService] chat-next request', { historyLength: payload.conversation_history.length, aiUrl: TRIAGE_AI_URL });
  const data = await postAiJson(['/api/v1/chat/next-questions', '/chat/next-questions'], payload);
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

    const uploadCandidates = [
      `${TRIAGE_AI_URL}/api/v1/analyze-triage`,
      `${TRIAGE_AI_URL}/analyze-triage`
    ];

    let lastUploadError = null;
    for (const endpoint of uploadCandidates) {
      console.log('[TriageService] try_file_endpoint', { endpoint });
      const response = await fetch(endpoint, {
        method: 'POST',
        body: form
      });

      if (response.ok) {
        const data = await response.json();
        console.log('[TriageService] analyze file response', {
          riskScore: data?.risk_score ?? null,
          urgency: data?.urgency_level ?? null,
          department: data?.department ?? null
        });
        return data;
      }

      const text = await response.text();
      lastUploadError = new Error(`AI analyze failed (${response.status}) at ${endpoint}: ${text.slice(0, 300)}`);
      console.error('[TriageService] analyze file error', {
        endpoint,
        status: response.status,
        body: text.slice(0, 500)
      });

      if (response.status !== 404) {
        throw lastUploadError;
      }
    }

    throw lastUploadError || new Error('AI analyze upload failed');
  }

  try {
    const data = await postAiJson(['/api/v1/analyze-triage', '/analyze-triage'], payload || {});
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
  const data = await postAiJson(
    ['/api/v1/rescore-batch', '/rescore-batch'],
    { patients: Array.isArray(patients) ? patients : [] }
  );
  return data;
}

module.exports = {
  TRIAGE_AI_URL,
  getNextQuestions,
  analyzeTriage,
  rescoreBatch
};
