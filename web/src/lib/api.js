const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api';

export function getHospitalQrDownloadUrl(hospitalId) {
  return `${API_BASE_URL}/hospitals/${encodeURIComponent(hospitalId)}/qr`;
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    cache: 'no-store'
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

export async function doctorLogin(email, password) {
  return request('/auth/login/doctor', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
}

export async function getDoctorDashboard(doctorId, token, search = '') {
  const query = new URLSearchParams({
    ...(search ? { search: String(search) } : {})
  });

  return request(`/doctors/${doctorId}/dashboard${query.toString() ? `?${query.toString()}` : ''}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function setDoctorSchedule(payload, token) {
  return request('/doctors/schedule', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export async function getDoctorScheduleForDate(doctorId, date, token) {
  return request(`/doctors/${encodeURIComponent(doctorId)}/schedule?date=${encodeURIComponent(date)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function deleteDoctorScheduleForDate(doctorId, date, token) {
  return request(`/doctors/${encodeURIComponent(doctorId)}/schedule?date=${encodeURIComponent(date)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function addDoctorBreak(payload, token) {
  return request('/doctors/break', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export async function getDoctorBreaksForDate(doctorId, date, token) {
  return request(`/doctors/${encodeURIComponent(doctorId)}/breaks?date=${encodeURIComponent(date)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function updateDoctorBreak(breakId, payload, token) {
  return request(`/doctors/break/${encodeURIComponent(breakId)}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export async function deleteDoctorBreak(breakId, token) {
  return request(`/doctors/break/${encodeURIComponent(breakId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function getDoctorSlotsForDate(doctorId, date) {
  return request(`/doctors/${encodeURIComponent(doctorId)}/slots?date=${encodeURIComponent(date)}`);
}

export async function addDoctorSlot(payload, token) {
  return request('/doctors/slot', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export async function updateDoctorSlot(slotId, payload, token) {
  return request(`/doctors/slot/${encodeURIComponent(slotId)}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export async function deleteDoctorSlot(slotId, token) {
  return request(`/doctors/slot/${encodeURIComponent(slotId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function getPatientPreview(doctorId, patientId, token) {
  return request(`/doctors/${doctorId}/patient-preview/${patientId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function getDoctorPatientHistory(doctorId, token, limit = 100) {
  return request(`/doctors/${doctorId}/patients/history?limit=${encodeURIComponent(limit)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function callNextPatient(doctorId, token) {
  return request(`/doctors/${doctorId}/call-next`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function endConsultationPatient(doctorId, token) {
  return request(`/doctors/${doctorId}/end-consultation`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function getDoctorProfile(token) {
  return request('/auth/me/doctor', {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function searchMedicines(search, token, limit = 20) {
  const query = new URLSearchParams({
    ...(search ? { search: String(search) } : {}),
    limit: String(limit)
  });

  return request(`/medicines?${query.toString()}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function getPatientPrescriptions(patientId, token) {
  return request(`/prescriptions/patient/${encodeURIComponent(patientId)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function createPrescription(payload, token) {
  return request('/prescriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export async function getDepartments() {
  return request('/departments');
}

export async function getHospitals() {
  return request('/hospitals');
}

export async function createHospital(payload) {
  return request('/hospitals', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function getDepartmentsByHospital(hospitalId) {
  const query = hospitalId ? `?hospitalId=${encodeURIComponent(hospitalId)}` : '';
  return request(`/departments${query}`);
}

export async function createDepartment(payload) {
  return request('/departments', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function registerDoctorAdmin(payload) {
  return request('/auth/register/doctor', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function registerPatientAdmin(payload) {
  return request('/auth/register/patient', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function submitHospitalOnboardingRequest(payload) {
  return request('/hospital-onboarding/requests', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

function toAdminAuthHeader(auth) {
  const username = String(auth?.username || '').trim();
  const password = String(auth?.password || '').trim();

  if (!username || !password) {
    throw new Error('Admin username and password are required');
  }

  return `Basic ${btoa(`${username}:${password}`)}`;
}

export async function getAdminOnboardingRequests(status, auth) {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return request(`/admin/onboarding/requests${query}`, {
    headers: {
      Authorization: toAdminAuthHeader(auth)
    }
  });
}

export async function getAdminHospitalsOverview(auth) {
  return request('/admin/hospitals/overview', {
    headers: {
      Authorization: toAdminAuthHeader(auth)
    }
  });
}

export async function approveAdminOnboardingRequest(requestId, payload, auth) {
  return request(`/admin/onboarding/requests/${encodeURIComponent(requestId)}/approve`, {
    method: 'POST',
    headers: {
      Authorization: toAdminAuthHeader(auth)
    },
    body: JSON.stringify(payload)
  });
}

export async function rejectAdminOnboardingRequest(requestId, payload, auth) {
  return request(`/admin/onboarding/requests/${encodeURIComponent(requestId)}/reject`, {
    method: 'POST',
    headers: {
      Authorization: toAdminAuthHeader(auth)
    },
    body: JSON.stringify(payload)
  });
}

export async function hospitalPortalLogin(email, password) {
  return request('/hospital-portal/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
}

export async function hospitalPortalCreateDepartment(payload, token) {
  return request('/hospital-portal/departments', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
}

export async function hospitalPortalCreateDoctor(payload, token) {
  return request('/hospital-portal/doctors', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
}

export async function hospitalPortalGetDoctors(token) {
  return request('/hospital-portal/doctors', {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
}
