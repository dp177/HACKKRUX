import { Platform } from 'react-native';

const DEFAULT_API_BASE_URL = Platform.select({
  android: 'http://10.0.2.2:5000/api',
  ios: 'http://localhost:5000/api',
  default: 'http://localhost:5000/api'
});

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || DEFAULT_API_BASE_URL;

async function request(path, options = {}) {
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
    throw new Error(data?.error || `Request failed: ${response.status}`);
  }

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
