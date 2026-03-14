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

function isPlaceholderAiUrl(raw) {
  const value = String(raw || '').toLowerCase();
  return value.includes('your-triage-engine') || value.includes('example.com') || value.includes('change-me');
}

function resolveConfiguredAiUrl() {
  const configured = process.env.TRIAGE_AI_URL  || 'https://jeet2207-triage.hf.space';
  if (!configured) return '';
  if (isPlaceholderAiUrl(configured)) {
    console.warn('[TriageService] ignoring_placeholder_ai_url', { configured });
    return '';
  }
  return configured;
}

const TRIAGE_AI_URL = normalizeAiBaseUrl(
  resolveConfiguredAiUrl()
  || 'https://jeet2207-triage.hf.space'
);

const FALLBACK_TRIAGE_AI_URL = 'https://jeet2207-triage.hf.space';

function getAiBaseCandidates() {
  const list = [TRIAGE_AI_URL, FALLBACK_TRIAGE_AI_URL]
    .map((v) => normalizeAiBaseUrl(v))
    .filter(Boolean);

  return [...new Set(list)];
}

const AI_BASE_CANDIDATES = getAiBaseCandidates();

console.log('[TriageService] ai_base_candidates', { candidates: AI_BASE_CANDIDATES });

const REQUEST_TIMEOUT_MS = Number(process.env.TRIAGE_AI_TIMEOUT_MS || 20000);

function normalizeHistory(conversationHistory) {
  if (!Array.isArray(conversationHistory)) return [];
  return conversationHistory
    .filter((m) => m && typeof m === 'object')
    .map((m) => ({ role: String(m.role || 'user'), content: String(m.content || '') }))
    .filter((m) => m.content.trim().length > 0);
}

async function postAiJson(pathCandidates, payload) {
  let lastError = null;

  for (const baseUrl of AI_BASE_CANDIDATES) {
    for (const path of pathCandidates) {
      const url = `${baseUrl}${path}`;
      try {
        console.log('[TriageService] try_json_endpoint', { url });
        const { data } = await axios.post(url, payload || {}, { timeout: REQUEST_TIMEOUT_MS });
        return data;
      } catch (error) {
        const status = error?.response?.status;
        lastError = error;

        if (status === 404) {
          console.warn('[TriageService] endpoint_404_try_next', { url, status });
          continue;
        }

        console.error('[TriageService] endpoint_call_failed', {
          url,
          status: status || null,
          message: error?.message || 'unknown error'
        });
      }
    }
  }

  const errorMessage = `No AI endpoint candidate succeeded. Tried bases: ${AI_BASE_CANDIDATES.join(', ')}`;
  if (lastError) {
    const wrapped = new Error(errorMessage);
    wrapped.cause = lastError;
    throw wrapped;
  }
  throw new Error(errorMessage);
}

async function getNextQuestions(conversationHistory) {
  const payload = { conversation_history: normalizeHistory(conversationHistory) };
  console.log('[TriageService] chat-next request', {
    historyLength: payload.conversation_history.length,
    lastRole: payload.conversation_history.length
      ? payload.conversation_history[payload.conversation_history.length - 1]?.role || null
      : null,
    aiCandidates: AI_BASE_CANDIDATES
  });
  const data = await postAiJson(['/api/v1/chat/next-questions', '/chat/next-questions'], payload);
  console.log('[TriageService] chat-next response', { questions: Array.isArray(data?.questions) ? data.questions.length : 0 });
  return data;
}

async function postAiAnalyzeMultipart(payload, file) {
  const uploadPaths = ['/api/v1/analyze-triage', '/analyze-triage'];
  let lastUploadError = null;

  for (const baseUrl of AI_BASE_CANDIDATES) {
    for (const path of uploadPaths) {
      const endpoint = `${baseUrl}${path}`;
      try {
        const form = new FormData();
        form.append('payload', JSON.stringify(payload || {}));

        if (file?.buffer?.length) {
          form.append(
            'file',
            new Blob([file.buffer], { type: file.mimetype || 'application/octet-stream' }),
            file.originalname || 'upload.bin'
          );
        }

        console.log('[TriageService] try_multipart_endpoint', {
          endpoint,
          hasFile: Boolean(file?.buffer?.length)
        });

        const response = await fetch(endpoint, {
          method: 'POST',
          body: form
        });

        if (response.ok) {
          const data = await response.json();
          console.log('[TriageService] analyze multipart response', {
            endpoint,
            riskScore: data?.risk_score ?? null,
            urgency: data?.urgency_level ?? null,
            department: data?.department ?? null
          });
          return data;
        }

        const text = await response.text();
        lastUploadError = new Error(`AI analyze failed (${response.status}) at ${endpoint}: ${text.slice(0, 300)}`);
        lastUploadError.status = response.status;

        console.error('[TriageService] analyze multipart error', {
          endpoint,
          status: response.status,
          body: text.slice(0, 500)
        });

        if (response.status !== 404) {
          throw lastUploadError;
        }
      } catch (error) {
        const status = error?.status || null;
        lastUploadError = error;
        if (status === 404) {
          continue;
        }
        throw error;
      }
    }
  }

  throw lastUploadError || new Error('AI analyze multipart request failed');
}

async function analyzeTriage(payload, file) {
  const historyLength = Array.isArray(payload?.conversation_history) ? payload.conversation_history.length : 0;
  console.log('[TriageService] analyze request', {
    aiCandidates: AI_BASE_CANDIDATES,
    hasFile: Boolean(file?.buffer?.length),
    historyLength,
    patientId: payload?.patient_id || null,
    inputMode: payload?.input_mode || null,
    contextKeys: Object.keys(payload?.context || {}),
    vitalsKeys: Object.keys(payload?.vitals || {}),
    availableDepartmentsCount: Array.isArray(payload?.available_departments) ? payload.available_departments.length : 0
  });

  try {
    // AI analyze endpoint expects multipart/form-data with a required "payload" field.
    const data = await postAiAnalyzeMultipart(payload || {}, file);
    console.log('[TriageService] analyze response', {
      riskScore: data?.risk_score ?? null,
      urgency: data?.urgency_level ?? null,
      department: data?.department ?? null
    });
    return data;
  } catch (error) {
    const shouldTryJsonFallback = [400, 415, 422].includes(Number(error?.status || 0));
    if (shouldTryJsonFallback) {
      console.warn('[TriageService] analyze_multipart_failed_try_json_fallback', {
        status: error?.status || null,
        message: error?.message || 'unknown error'
      });
      const data = await postAiJson(['/api/v1/analyze-triage', '/analyze-triage'], payload || {});
      console.log('[TriageService] analyze_json_fallback_success', {
        riskScore: data?.risk_score ?? null,
        urgency: data?.urgency_level ?? null,
        department: data?.department ?? null
      });
      return data;
    }

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
  AI_BASE_CANDIDATES,
  getNextQuestions,
  analyzeTriage,
  rescoreBatch
};
