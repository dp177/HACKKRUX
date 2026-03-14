import { Platform } from 'react-native';

const REMOTE_API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL || 'https://jeeva-hackcrux.onrender.com/api').replace(/\/$/, '');

function parseCsvEnv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.replace(/\/$/, ''));
}

const DEFAULT_API_BASE_URL = Platform.select({
  android: REMOTE_API_BASE_URL,
  ios: REMOTE_API_BASE_URL,
  default: REMOTE_API_BASE_URL
});

const API_BASE_URL = REMOTE_API_BASE_URL || DEFAULT_API_BASE_URL;
const ENABLE_LOCAL_TRIAGE_FALLBACK = String(process.env.EXPO_PUBLIC_ENABLE_LOCAL_TRIAGE_FALLBACK || '').toLowerCase() === 'true';
const LOCAL_API_BASE_CANDIDATES = parseCsvEnv(process.env.EXPO_PUBLIC_LOCAL_API_BASE_URLS);

async function request(path, options = {}) {
  const url = `${API_BASE_URL}${path}`;
  console.log('[MobileAPI] request_start', {
    method: options.method || 'GET',
    path,
    url,
    hasAuth: Boolean(options?.headers?.Authorization)
  });

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    console.log('[MobileAPI] request_error', {
      method: options.method || 'GET',
      path,
      url,
      status: response.status,
      message: data?.error || `Request failed: ${response.status}`,
      traceId: data?.traceId || null,
      details: data?.details || null
    });
    throw new Error(data?.error || `Request failed: ${response.status}`);
  }

  console.log('[MobileAPI] request_success', {
    method: options.method || 'GET',
    path,
    url,
    status: response.status
  });

  return data;
}

export function registerPatient(payload) {
  return request('/auth/register/patient', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function loginPatient(phone, password) {
  return request('/auth/login/patient', {
    method: 'POST',
    body: JSON.stringify({ phone, password })
  });
}

export function getPatientDashboard(patientId, token) {
  return request(`/patients/${patientId}/dashboard`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export function submitQuickTriage(payload, token) {
  return request('/v1/triage/complete-single', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export function bookAppointment(payload, token) {
  return request('/appointments/book', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export function getUpcomingAppointments(token) {
  return request('/appointments/upcoming', {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export function getAppointmentHistory(token) {
  return request('/appointments/history', {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export function cancelAppointment(appointmentId, token, reason = 'Cancelled by patient') {
  return request('/appointments/cancel', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ appointmentId, reason })
  });
}

export function searchDoctors(query = '') {
  const queryParam = encodeURIComponent(query);
  return request(`/doctors/search?query=${queryParam}`);
}

export function searchDepartments(query = '') {
  const queryParam = encodeURIComponent(query);
  return request(`/departments/search?query=${queryParam}`);
}

export function getHospitals() {
  return request('/hospitals');
}

export function getHospitalDetails(hospitalId) {
  return request(`/hospitals/${hospitalId}`);
}

export function getHospitalByQrIdentifier(hospitalId) {
  return request(`/hospitals/${encodeURIComponent(hospitalId)}`);
}

export function getDepartmentDetails(departmentId) {
  return request(`/departments/${departmentId}`);
}

export function getDoctorsByDepartment(departmentId, query = '') {
  const queryParam = encodeURIComponent(query);
  return request(`/doctors/search?departmentId=${encodeURIComponent(departmentId)}&query=${queryParam}`);
}

export function getDoctorAvailableSlots(doctorId, date) {
  const normalizedDoctorId = encodeURIComponent(doctorId);
  const normalizedDate = encodeURIComponent(date);

  const candidatePaths = [
    `/doctors/${normalizedDoctorId}/slots?date=${normalizedDate}`,
    `/appointments/available-slots/${normalizedDoctorId}?date=${normalizedDate}`,
    `/available-slots/${normalizedDoctorId}?date=${normalizedDate}`
  ];

  console.log('[MobileAPI] slots_fetch_start', {
    doctorId: normalizedDoctorId,
    date: normalizedDate,
    apiBaseUrl: API_BASE_URL,
    candidatePaths
  });

  async function tryPath(index, lastError) {
    if (index >= candidatePaths.length) {
      throw lastError || new Error('Unable to fetch slots');
    }

    const path = candidatePaths[index];

    try {
      const payload = await request(path);
      const count = (payload?.availableSlots || payload?.slots || []).length;
      console.log('[MobileAPI] slots_fetch_success', {
        path,
        source: 'endpoint',
        count,
        hasMessage: Boolean(payload?.message)
      });
      return payload;
    } catch (error) {
      console.log('[MobileAPI] slots_fallback_next', {
        fromPath: path,
        nextIndex: index + 1,
        reason: error?.message || 'unknown'
      });
      return tryPath(index + 1, error);
    }
  }

  function generateTimeSlots(startTime, endTime, durationMinutes) {
    const slots = [];
    const [startHour, startMin] = String(startTime || '').split(':').map(Number);
    const [endHour, endMin] = String(endTime || '').split(':').map(Number);

    if (!Number.isInteger(startHour) || !Number.isInteger(startMin) || !Number.isInteger(endHour) || !Number.isInteger(endMin)) {
      return slots;
    }

    let currentHour = startHour;
    let currentMin = startMin;

    while (currentHour < endHour || (currentHour === endHour && currentMin < endMin)) {
      const time = `${String(currentHour).padStart(2, '0')}:${String(currentMin).padStart(2, '0')}`;
      slots.push({
        time,
        startTime: time,
        status: 'AVAILABLE',
        available: true
      });

      currentMin += durationMinutes;
      if (currentMin >= 60) {
        currentHour += Math.floor(currentMin / 60);
        currentMin = currentMin % 60;
      }
    }

    return slots;
  }

  function generateSyntheticDaySlots(durationMinutes = 15) {
    return generateTimeSlots('09:00', '17:00', durationMinutes);
  }

  function deriveSlotsFromDoctorProfile(doctorProfile, selectedDate) {
    const parsedDate = new Date(`${selectedDate}T00:00:00`);
    if (Number.isNaN(parsedDate.getTime())) {
      return [];
    }

    const weekday = parsedDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const daySchedule = doctorProfile?.availableSlots?.[weekday];

    if (!daySchedule?.available || !daySchedule?.startTime || !daySchedule?.endTime) {
      return [];
    }

    const duration = Number(doctorProfile?.consultationDuration) || 15;
    return generateTimeSlots(daySchedule.startTime, daySchedule.endTime, duration);
  }

  async function requestFromBase(baseUrl, path) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok) {
      throw new Error(data?.error || `Request failed: ${response.status}`);
    }

    return data;
  }

  async function tryLocalFallbacks() {
    const localBases = [
      DEFAULT_API_BASE_URL,
      ...LOCAL_API_BASE_CANDIDATES
    ];

    const uniqueBases = [...new Set(localBases.filter(Boolean))];
    const localPath = `/doctors/${normalizedDoctorId}/slots?date=${normalizedDate}`;

    let lastError = null;
    for (const base of uniqueBases) {
      try {
        console.log('[MobileAPI] slots_local_fallback_try', { base, path: localPath });
        return await requestFromBase(base, localPath);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error('Local slot fallback failed');
  }

  return tryPath(0, null)
    .catch(async (error) => {
      console.log('[MobileAPI] slots_profile_fallback_start', {
        doctorId: normalizedDoctorId,
        date: normalizedDate,
        reason: error?.message || 'unknown'
      });

      const profile = await request(`/doctors/${normalizedDoctorId}`);
      const fallbackSlots = deriveSlotsFromDoctorProfile(profile, date);

      console.log('[MobileAPI] slots_profile_fallback_result', {
        doctorId: normalizedDoctorId,
        date: normalizedDate,
        availableSlotsKeys: Object.keys(profile?.availableSlots || {}),
        derivedCount: fallbackSlots.length
      });

      if (fallbackSlots.length) {
        return {
          doctorId,
          date,
          availableSlots: fallbackSlots,
          source: 'profile-fallback'
        };
      }

      throw error;
    })
    .catch(async (error) => {
      const usingRemoteBase = String(API_BASE_URL).includes('onrender.com');
      if (!usingRemoteBase) {
        const syntheticSlots = generateSyntheticDaySlots(15);
        return {
          doctorId,
          date,
          availableSlots: syntheticSlots,
          source: 'synthetic-fallback',
          message: 'Live slots are temporarily unavailable. Showing temporary slots.'
        };
      }

      console.log('[MobileAPI] slots_remote_to_local_fallback_start', {
        remoteBase: API_BASE_URL,
        reason: error?.message || 'unknown'
      });

      try {
        const localPayload = await tryLocalFallbacks();
        const count = (localPayload?.availableSlots || localPayload?.slots || []).length;
        console.log('[MobileAPI] slots_local_fallback_success', { count });
        return localPayload;
      } catch {
        const syntheticSlots = generateSyntheticDaySlots(15);
        console.log('[MobileAPI] slots_synthetic_fallback_used', {
          count: syntheticSlots.length,
          reason: 'remote+local slot endpoints unavailable'
        });
        return {
          doctorId,
          date,
          availableSlots: syntheticSlots,
          source: 'synthetic-fallback',
          message: 'Live slots are temporarily unavailable on server. Showing temporary slots.'
        };
      }
    });
}

export function setDoctorSchedule(payload, token) {
  return request('/doctors/schedule', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export function addDoctorBreak(payload, token) {
  return request('/doctors/break', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export function getDoctorSlotsForDate(doctorId, date) {
  return request(`/doctors/${encodeURIComponent(doctorId)}/slots?date=${encodeURIComponent(date)}`);
}

export function submitCompleteSingleTriage(payload) {
  return request('/v1/triage/complete-single', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function selfWalkinCheckin(payload) {
  return request('/walkins/self-checkin', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function receptionistWalkinCheckin(payload) {
  return request('/walkins/receptionist-checkin', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function authenticateWithGoogle(idToken) {
  return request('/auth/google', {
    method: 'POST',
    body: JSON.stringify({ idToken })
  });
}

export function getCurrentUser(token) {
  return request('/auth/me', {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export function logoutAuth(token) {
  return request('/auth/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  });
}

export function registerPushToken(expoPushToken, token) {
  return request('/auth/push-token', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ expoPushToken })
  });
}

// ── Triage AI ──────────────────────────────────────────────────────────────

// HuggingFace triage AI service (chat questions — no auth needed, no DB write)
const TRIAGE_AI_BASE = (process.env.EXPO_PUBLIC_TRIAGE_AI_URL || 'https://jeet2207-triage.hf.space').replace(/\/$/, '');

/**
 * Step 1 of the chat loop.
 * Calls the HuggingFace AI directly: POST /api/v1/chat/next-questions
 * Returns the next 1-2 follow-up questions based on the conversation so far.
 *
 * @param {Array<{role: 'user'|'assistant', content: string}>} conversationHistory
 * @returns {Promise<{ questions: string[] }>}
 */
export async function triageChatNext(conversationHistory) {
  const url = `${TRIAGE_AI_BASE}/api/v1/chat/next-questions`;
  console.log('[MobileAPI] triage_chat_next_start', {
    url,
    historyLength: Array.isArray(conversationHistory) ? conversationHistory.length : 0
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversation_history: conversationHistory })
  });

  let data = null;
  try { data = await response.json(); } catch { data = null; }

  if (!response.ok) {
    console.log('[MobileAPI] triage_chat_next_error', {
      url,
      status: response.status,
      message: data?.detail?.[0]?.msg || data?.error || `chat/next-questions failed: ${response.status}`
    });
    throw new Error(data?.detail?.[0]?.msg || data?.error || `chat/next-questions failed: ${response.status}`);
  }
  console.log('[MobileAPI] triage_chat_next_success', {
    url,
    questions: Array.isArray(data?.questions) ? data.questions.length : 0
  });
  return data; // { questions: string[] }
}

/**
 * Upload recorded audio and receive a transcript from backend.
 */
export async function triageTranscribeAudio({ fileUri, token, languageCode = 'en-US', mimeType = 'audio/m4a' }) {
  const traceId = `mtranscribe_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const url = `${API_BASE_URL}/v1/triage/transcribe`;

  console.log('[MobileAPI] triage_transcribe_start', {
    traceId,
    url,
    hasToken: Boolean(token),
    languageCode,
    fileUri: fileUri ? String(fileUri).slice(0, 80) : null
  });

  const formData = new FormData();
  formData.append('language_code', languageCode);
  formData.append('file', {
    uri: fileUri,
    name: `voice_${Date.now()}.m4a`,
    type: mimeType
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-trace-id': traceId
    },
    body: formData
  });

  let data = null;
  try { data = await response.json(); } catch { data = null; }

  if (!response.ok) {
    console.log('[MobileAPI] triage_transcribe_error', {
      traceId,
      url,
      status: response.status,
      message: data?.error || `Request failed: ${response.status}`,
      details: data?.details || null
    });
    throw new Error(data?.error || `Request failed: ${response.status}`);
  }

  console.log('[MobileAPI] triage_transcribe_success', {
    traceId,
    transcriptLength: String(data?.transcript || '').length,
    confidence: data?.confidence ?? null
  });

  return data;
}

/**
 * Calls the HuggingFace multi-agent triage AI directly.
 * POST /api/v1/analyze-triage  (multipart/form-data)
 *
 * payload shape:
 * {
 *   patient_id: string,
 *   conversation_history: [{role, content}],
 *   available_departments: string[],
 *   context: { is_conscious, breathing_difficulty, age, comorbidities, recent_trauma_or_surgery },
 *   vitals?: { heart_rate, blood_pressure, temperature, o2_sat, respiratory_rate }
 * }
 * file (optional): { uri, name, type } from document/image picker
 *
 * Returns the standard { triage, queue, aiRaw } shape the app expects.
 */
export async function triageAnalyze(payload, token, file = null) {
  const traceId = `mtriage_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  console.log('[MobileAPI] triage_analyze_start', {
    traceId,
    hasFile: Boolean(file),
    hasToken: Boolean(token),
    patientId: payload?.patient_id || null,
    departmentId: payload?.department_id || null,
    historyLength: Array.isArray(payload?.conversation_history) ? payload.conversation_history.length : 0
  });

  if (file) {
    const formData = new FormData();
    Object.entries(payload || {}).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      if (typeof value === 'object') {
        formData.append(key, JSON.stringify(value));
      } else {
        formData.append(key, String(value));
      }
    });

    formData.append('file', {
      uri: file.uri,
      name: file.name || 'medical_record',
      type: file.type || 'application/octet-stream'
    });

    const analyzeUrl = `${API_BASE_URL}/v1/triage/analyze`;
    console.log('[MobileAPI] triage_analyze_file_request', { traceId, url: analyzeUrl });

    const response = await fetch(analyzeUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-trace-id': traceId
      },
      body: formData
    });

    let data = null;
    try { data = await response.json(); } catch { data = null; }
    if (!response.ok) {
      console.log('[MobileAPI] triage_analyze_error', {
        traceId,
        url: analyzeUrl,
        status: response.status,
        message: data?.error || `Request failed: ${response.status}`,
        serverTraceId: data?.traceId || null,
        details: data?.details || null
      });
      throw new Error(data?.error || `Request failed: ${response.status}`);
    }
    console.log('[MobileAPI] triage_analyze_success', {
      traceId,
      serverTraceId: data?.traceId || null,
      riskScore: data?.triage?.risk_score ?? null,
      urgency: data?.triage?.urgency_level ?? null,
      queuePosition: data?.queue?.queuePosition ?? null
    });
    return data;
  }

  async function postAnalyzeToBase(baseUrl) {
    const url = `${baseUrl}/v1/triage/analyze`;
    console.log('[MobileAPI] triage_analyze_request', { traceId, url });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-trace-id': traceId,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    let data = null;
    try { data = await response.json(); } catch { data = null; }
    if (!response.ok) {
      const err = new Error(data?.error || `Request failed: ${response.status}`);
      err.status = response.status;
      err.details = data?.details || null;
      err.traceId = data?.traceId || null;
      err.url = url;
      throw err;
    }
    console.log('[MobileAPI] triage_analyze_response_ok', { traceId, url, status: response.status });
    return data;
  }

  try {
    const data = await postAnalyzeToBase(API_BASE_URL);

    console.log('[MobileAPI] triage_analyze_success', {
      traceId,
      serverTraceId: data?.traceId || null,
      riskScore: data?.triage?.risk_score ?? null,
      urgency: data?.triage?.urgency_level ?? null,
      queuePosition: data?.queue?.queuePosition ?? null
    });

    return data;
  } catch (error) {
    const detailsText = String(error?.details || '').toLowerCase();
    const messageText = String(error?.message || '').toLowerCase();
    const shouldTryLocalFallback =
      ENABLE_LOCAL_TRIAGE_FALLBACK
      &&
      String(API_BASE_URL).includes('onrender.com')
      && (messageText.includes('failed to analyze triage') || detailsText.includes('not found'));

    if (shouldTryLocalFallback) {
      const localBases = [...LOCAL_API_BASE_CANDIDATES];
      for (const base of localBases) {
        try {
          console.log('[MobileAPI] triage_analyze_local_fallback_try', { traceId, base });
          const data = await postAnalyzeToBase(base);
          console.log('[MobileAPI] triage_analyze_local_fallback_success', { traceId, base, serverTraceId: data?.traceId || null });
          return data;
        } catch {
          // try next local candidate
        }
      }

      console.log('[MobileAPI] triage_analyze_local_fallback_exhausted', {
        traceId,
        candidates: localBases.length
      });
    } else {
      console.log('[MobileAPI] triage_analyze_local_fallback_skipped', {
        traceId,
        enabled: ENABLE_LOCAL_TRIAGE_FALLBACK,
        apiBaseUrl: API_BASE_URL,
        localCandidateCount: LOCAL_API_BASE_CANDIDATES.length
      });
    }

    console.log('[MobileAPI] triage_analyze_failure', {
      traceId,
      message: error?.message || 'unknown error',
      serverTraceId: error?.traceId || null,
      details: error?.details || null
    });
    throw error;
  }
}


/**
 * Re-score a batch of waiting patients (used internally / by queue screens).
 * Each patient: { patient_id, risk_score, urgency_level, wait_time_minutes }
 *
 * @param {Array<{patient_id:string, risk_score:number, urgency_level:string, wait_time_minutes:number}>} patients
 * @param {string} token
 * @returns {Promise<{ results: Array<{patient_id:string, risk_score:number, urgency_level:string, message:string}> }>}
 */
export function triageRescoreBatch(patients, token) {
  return request('/v1/triage/rescore-batch', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ patients })
  });
}

/**
 * Get current queue position and estimated wait for a patient.
 *
 * @param {string} patientId
 * @param {string} token
 * @returns {Promise<{ position: number, estimatedWaitMinutes: number, priority: string }>}
 */
export function getPatientQueueStatus(patientId, token) {
  return request(`/v1/queue/patient/${encodeURIComponent(patientId)}/status`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export function getMyQueueStatus(token) {
  return request('/v1/queue/my-status', {
    headers: { Authorization: `Bearer ${token}` }
  });
}
