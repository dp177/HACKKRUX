const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api';

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

export async function getDoctorDashboard(doctorId, token) {
  return request(`/doctors/${doctorId}/dashboard`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function getPatientPreview(doctorId, patientId, token) {
  return request(`/doctors/${doctorId}/patient-preview/${patientId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function callNextPatient(doctorId, token) {
  return request(`/doctors/${doctorId}/call-next`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
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

export async function getAdminOnboardingRequests(status, adminKey) {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return request(`/admin/onboarding/requests${query}`, {
    headers: {
      'x-admin-onboarding-key': adminKey
    }
  });
}

export async function approveAdminOnboardingRequest(requestId, payload, adminKey) {
  return request(`/admin/onboarding/requests/${encodeURIComponent(requestId)}/approve`, {
    method: 'POST',
    headers: {
      'x-admin-onboarding-key': adminKey
    },
    body: JSON.stringify(payload)
  });
}

export async function rejectAdminOnboardingRequest(requestId, payload, adminKey) {
  return request(`/admin/onboarding/requests/${encodeURIComponent(requestId)}/reject`, {
    method: 'POST',
    headers: {
      'x-admin-onboarding-key': adminKey
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
