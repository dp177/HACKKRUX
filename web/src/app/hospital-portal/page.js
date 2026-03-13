'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { FiEye, FiEyeOff } from 'react-icons/fi';
import {
  getDepartmentsByHospital,
  getHospitalQrDownloadUrl,
  hospitalPortalCreateDepartment,
  hospitalPortalCreateDoctor,
  hospitalPortalGetDoctors,
  hospitalPortalLogin
} from '../../lib/api';

const initialDepartment = {
  name: '',
  code: '',
  description: '',
  floor: '',
  capacity: ''
};

const initialDoctor = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  specialty: '',
  licenseNumber: '',
  departmentId: '',
  qualifications: '',
  yearsOfExperience: '',
  consultationDuration: '15'
};

export default function HospitalPortalPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [token, setToken] = useState('');
  const [staff, setStaff] = useState(null);
  const [hospital, setHospital] = useState(null);

  const [departmentForm, setDepartmentForm] = useState(initialDepartment);
  const [doctorForm, setDoctorForm] = useState(initialDoctor);
  const [departments, setDepartments] = useState([]);
  const [doctors, setDoctors] = useState([]);

  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const isAuthenticated = useMemo(() => Boolean(token && staff && hospital), [token, staff, hospital]);

  useEffect(() => {
    const savedToken = localStorage.getItem('hospitalPortalToken');
    const savedStaff = localStorage.getItem('hospitalPortalStaff');
    const savedHospital = localStorage.getItem('hospitalPortalHospital');

    if (savedToken && savedStaff && savedHospital) {
      setToken(savedToken);
      setStaff(JSON.parse(savedStaff));
      setHospital(JSON.parse(savedHospital));
    }
  }, []);

  useEffect(() => {
    if (hospital?.id && token) {
      loadDepartments(hospital.id);
      loadDoctors();
    }
  }, [hospital?.id, token]);

  async function handleLogin(event) {
    event.preventDefault();
    setError('');
    setStatus('Signing in...');

    try {
      const data = await hospitalPortalLogin(email, password);
      setToken(data.token);
      setStaff(data.staff);
      setHospital(data.hospital);

      localStorage.setItem('hospitalPortalToken', data.token);
      localStorage.setItem('hospitalPortalStaff', JSON.stringify(data.staff));
      localStorage.setItem('hospitalPortalHospital', JSON.stringify(data.hospital));

      setStatus('Login successful');
      toast.success('Signed in successfully');
    } catch (loginError) {
      setError(loginError.message);
      setStatus('');
      toast.error(loginError.message || 'Login failed');
    }
  }

  async function loadDepartments(hospitalId) {
    setError('');

    try {
      const data = await getDepartmentsByHospital(hospitalId);
      const list = data.departments || [];
      setDepartments(list);
      if (list.length && !doctorForm.departmentId) {
        setDoctorForm((prev) => ({ ...prev, departmentId: list[0].id }));
      }
    } catch (loadError) {
      setError(loadError.message);
      setDepartments([]);
      toast.error(loadError.message || 'Failed to load departments');
    }
  }

  async function loadDoctors() {
    if (!token) {
      return;
    }

    setError('');

    try {
      const data = await hospitalPortalGetDoctors(token);
      setDoctors(data.doctors || []);
    } catch (loadError) {
      setError(loadError.message);
      setDoctors([]);
      toast.error(loadError.message || 'Failed to load doctors');
    }
  }

  async function handleCreateDepartment(event) {
    event.preventDefault();
    setError('');
    setStatus('Creating department...');

    try {
      await hospitalPortalCreateDepartment({
        ...departmentForm,
        capacity: departmentForm.capacity ? Number(departmentForm.capacity) : undefined
      }, token);

      setDepartmentForm(initialDepartment);
      setStatus('Department created');
      await loadDepartments(hospital.id);
      toast.success('Department created');
    } catch (createError) {
      setError(createError.message);
      setStatus('');
      toast.error(createError.message || 'Failed to create department');
    }
  }

  async function handleCreateDoctor(event) {
    event.preventDefault();
    setError('');
    setStatus('Onboarding doctor...');

    try {
      const payload = {
        ...doctorForm,
        yearsOfExperience: doctorForm.yearsOfExperience ? Number(doctorForm.yearsOfExperience) : 0,
        consultationDuration: doctorForm.consultationDuration ? Number(doctorForm.consultationDuration) : 15
      };

      const data = await hospitalPortalCreateDoctor(payload, token);
      setDoctorForm((prev) => ({ ...initialDoctor, departmentId: prev.departmentId }));
      await loadDoctors();

      if (data.credentialsEmail?.sent) {
        setStatus('Doctor onboarded and credentials email sent');
        toast.success('Doctor created. Credentials sent to doctor email.');
      } else {
        setStatus(`Doctor onboarded. Email status: ${data.credentialsEmail?.reason || 'Not sent'}`);
        toast.warning(`Doctor created. Email status: ${data.credentialsEmail?.reason || 'Not sent'}`);
      }
    } catch (createError) {
      setError(createError.message);
      setStatus('');
      toast.error(createError.message || 'Failed to onboard doctor');
    }
  }

  async function handleRefreshDepartments() {
    await loadDepartments(hospital.id);
    toast.success('Departments refreshed');
  }

  async function handleRefreshDoctors() {
    await loadDoctors();
    toast.success('Doctors refreshed');
  }

  function handleLogout() {
    localStorage.removeItem('hospitalPortalToken');
    localStorage.removeItem('hospitalPortalStaff');
    localStorage.removeItem('hospitalPortalHospital');

    setToken('');
    setStaff(null);
    setHospital(null);
    setDepartments([]);
    setDoctors([]);
    setStatus('Logged out');
    setError('');
    toast.success('Logged out');
  }

  function handleDownloadQr() {
    if (!hospital?.id) return;
    const url = getHospitalQrDownloadUrl(hospital.id);
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function handlePrintQrPoster() {
    if (!hospital?.qrCodeUrl) return;

    const printWindow = window.open('', '_blank', 'width=700,height=900');
    if (!printWindow) return;

    const html = `
      <!doctype html>
      <html>
      <head>
        <title>${hospital.name} QR Poster</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 40px; text-align: center; }
          .title { font-size: 28px; font-weight: 700; margin-bottom: 14px; }
          .subtitle { font-size: 16px; color: #475569; margin-bottom: 24px; }
          .qr { width: 320px; height: 320px; margin: 0 auto 20px auto; border: 1px solid #d1d5db; padding: 14px; border-radius: 16px; }
          .hint { font-size: 15px; color: #0f766e; }
        </style>
      </head>
      <body>
        <div class="title">${hospital.name}</div>
        <div class="subtitle">Scan this code at the hospital entrance to join the triage queue.</div>
        <img class="qr" src="${hospital.qrCodeUrl}" alt="Hospital QR" />
        <div class="hint">Entrance | Reception | Waiting Area</div>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 350);
  }

  if (!isAuthenticated) {
    return (
      <main className="container">
        <section className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-8 shadow-soft">
          <p className="mb-3 inline-block rounded-full bg-accent-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-accent-800">Hospital Operations</p>
          <h1 className="mb-2 text-3xl font-semibold tracking-tight text-slate-900">Hospital Portal Login</h1>
          <p className="mb-6 text-sm text-slate-600">Sign in with approved credentials, or choose sign up to submit a new onboarding request.</p>

          <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
            <a href="/hospital-portal" className="rounded-lg bg-white px-3 py-2 text-center text-sm font-semibold text-slate-800">Sign In</a>
            <a href="/hospital-onboarding" className="rounded-lg px-3 py-2 text-center text-sm font-semibold text-accent-700 hover:bg-white">Sign Up</a>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="pr-16"
                  required
                />
                <button
                  type="button"
                  className="secondary absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center p-0"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <FiEyeOff size={16} /> : <FiEye size={16} />}
                </button>
              </div>
            </div>
            <button type="submit" className="w-full">Sign In</button>
          </form>

          <div className="mt-5 flex flex-wrap gap-3 text-sm">
            <a href="/hospital-onboarding" className="font-semibold text-accent-700 hover:text-accent-800">Sign Up Hospital</a>
            <a href="/" className="font-semibold text-slate-600 hover:text-slate-700">Go to Doctor Dashboard</a>
          </div>

          {status && <p className="mt-4 text-sm font-medium text-emerald-700">{status}</p>}
          {error && <p className="mt-4 text-sm font-medium text-red-700">{error}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="container space-y-6">
      <section className="card">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="mb-2 inline-block rounded-full bg-accent-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-accent-800">Logged In</p>
            <h1 className="mb-1 text-3xl font-semibold tracking-tight text-slate-900">{hospital.name} Portal</h1>
            <p className="text-sm text-slate-600">{staff.fullName}</p>
          </div>
          <div className="flex gap-2">
            <button className="secondary" type="button" onClick={handleRefreshDepartments}>Refresh Departments</button>
            <button className="secondary" type="button" onClick={handleRefreshDoctors}>Refresh Doctors</button>
            <button type="button" onClick={handleLogout}>Logout</button>
          </div>
        </div>
        {status && <p className="mt-4 text-sm font-medium text-emerald-700">{status}</p>}
        {error && <p className="mt-4 text-sm font-medium text-red-700">{error}</p>}
      </section>

      <section className="card">
        <h2 className="text-xl font-semibold text-slate-900">Hospital QR Code</h2>
        <p className="mt-1 text-sm text-slate-500">Scan this code at the hospital entrance to join the queue.</p>

        <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            {hospital?.qrCodeUrl ? (
              <img src={hospital.qrCodeUrl} alt="Hospital QR" className="h-56 w-56 rounded-xl object-contain" />
            ) : (
              <div className="flex h-56 w-56 items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500">
                QR not generated yet
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <button type="button" onClick={handleDownloadQr} disabled={!hospital?.id}>Download QR</button>
            <button type="button" className="secondary" onClick={handlePrintQrPoster} disabled={!hospital?.qrCodeUrl}>Print QR Poster</button>
            <p className="text-xs text-slate-500">Recommended placement: entrance, reception desk, waiting area.</p>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <article className="card">
          <h2 className="text-xl font-semibold text-slate-900">Create Department</h2>
          <p className="mb-5 text-sm text-slate-500">Department will be added to your hospital profile.</p>

          <form onSubmit={handleCreateDepartment} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">Department Name</label>
                <input value={departmentForm.name} onChange={(e) => setDepartmentForm((p) => ({ ...p, name: e.target.value }))} required />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Code</label>
                <input value={departmentForm.code} onChange={(e) => setDepartmentForm((p) => ({ ...p, code: e.target.value }))} required />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Floor</label>
                <input value={departmentForm.floor} onChange={(e) => setDepartmentForm((p) => ({ ...p, floor: e.target.value }))} />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">Description</label>
                <input value={departmentForm.description} onChange={(e) => setDepartmentForm((p) => ({ ...p, description: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Capacity</label>
                <input value={departmentForm.capacity} onChange={(e) => setDepartmentForm((p) => ({ ...p, capacity: e.target.value }))} />
              </div>
            </div>

            <button type="submit" className="w-full">Create Department</button>
          </form>

          <div className="mt-5 space-y-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Department List</h3>
            {!departments.length && <p className="text-sm text-slate-500">No departments found yet.</p>}
            {departments.map((department) => (
              <div key={department.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-sm font-semibold text-slate-800">{department.name} ({department.code})</p>
                <p className="text-xs text-slate-500">ID: {department.id}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="card">
          <h2 className="text-xl font-semibold text-slate-900">Onboard Doctor</h2>
          <p className="mb-5 text-sm text-slate-500">Create doctor account and email credentials directly.</p>

          <form onSubmit={handleCreateDoctor} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">First Name</label>
                <input value={doctorForm.firstName} onChange={(e) => setDoctorForm((p) => ({ ...p, firstName: e.target.value }))} required />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Last Name</label>
                <input value={doctorForm.lastName} onChange={(e) => setDoctorForm((p) => ({ ...p, lastName: e.target.value }))} required />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Doctor Email</label>
                <input type="email" value={doctorForm.email} onChange={(e) => setDoctorForm((p) => ({ ...p, email: e.target.value }))} required />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Phone</label>
                <input value={doctorForm.phone} onChange={(e) => setDoctorForm((p) => ({ ...p, phone: e.target.value }))} required />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Specialty</label>
                <input value={doctorForm.specialty} onChange={(e) => setDoctorForm((p) => ({ ...p, specialty: e.target.value }))} required />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">License Number</label>
                <input value={doctorForm.licenseNumber} onChange={(e) => setDoctorForm((p) => ({ ...p, licenseNumber: e.target.value }))} required />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Department</label>
                <select value={doctorForm.departmentId} onChange={(e) => setDoctorForm((p) => ({ ...p, departmentId: e.target.value }))} required>
                  <option value="">Select Department</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>{department.name} ({department.code})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Experience (years)</label>
                <input value={doctorForm.yearsOfExperience} onChange={(e) => setDoctorForm((p) => ({ ...p, yearsOfExperience: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Consultation Duration (min)</label>
                <input value={doctorForm.consultationDuration} onChange={(e) => setDoctorForm((p) => ({ ...p, consultationDuration: e.target.value }))} />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">Qualifications</label>
                <input value={doctorForm.qualifications} onChange={(e) => setDoctorForm((p) => ({ ...p, qualifications: e.target.value }))} />
              </div>
            </div>

            <button type="submit" className="w-full">Onboard Doctor</button>
          </form>

          <div className="mt-5 space-y-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Doctor List</h3>
            {!doctors.length && <p className="text-sm text-slate-500">No doctors found yet.</p>}
            {doctors.map((doctor) => (
              <div key={doctor.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-sm font-semibold text-slate-800">{doctor.name} - {doctor.specialty}</p>
                <p className="text-xs text-slate-500">{doctor.email}</p>
                <p className="text-xs text-slate-500">
                  Department: {doctor.department?.name || 'Unassigned'}
                </p>
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
