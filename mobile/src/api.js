import { Platform } from 'react-native';

const DEFAULT_API_BASE_URL = Platform.select({
  android: 'http://10.0.2.2:5000/api',
  ios: 'http://localhost:5000/api',
  default: 'http://localhost:5000/api'
});

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || DEFAULT_API_BASE_URL;

async function request(path, options = {}) {
  console.log('[MobileAPI] request_start', {
    method: options.method || 'GET',
    path,
    hasAuth: Boolean(options?.headers?.Authorization)
  });

  const response = await fetch(`${API_BASE_URL}${path}`, {
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
      status: response.status,
      message: data?.error || `Request failed: ${response.status}`
    });
    throw new Error(data?.error || `Request failed: ${response.status}`);
  }

  console.log('[MobileAPI] request_success', {
    method: options.method || 'GET',
    path,
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
  return request('/triage/complete-single', {
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

  async function tryPath(index, lastError) {
    if (index >= candidatePaths.length) {
      throw lastError || new Error('Unable to fetch slots');
    }

    const path = candidatePaths[index];

    try {
      return await request(path);
    } catch (error) {
      console.log('[MobileAPI] slots_fallback_next', { fromPath: path, nextIndex: index + 1 });
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
      'http://10.0.2.2:5000/api',
      'http://localhost:5000/api'
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
        return await tryLocalFallbacks();
      } catch {
        const syntheticSlots = generateSyntheticDaySlots(15);
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
  return request('/triage/complete-single', {
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
