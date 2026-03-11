'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  callNextPatient,
  doctorLogin,
  getDoctorDashboard,
  getPatientPreview
} from '../lib/api';

export default function HomePage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [dashboard, setDashboard] = useState(null);
  const [patientId, setPatientId] = useState('');
  const [patientPreview, setPatientPreview] = useState(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    const savedToken = localStorage.getItem('doctorToken');
    const savedDoctorId = localStorage.getItem('doctorId');
    const savedDoctorName = localStorage.getItem('doctorName');
    if (savedToken && savedDoctorId) {
      setToken(savedToken);
      setDoctorId(savedDoctorId);
      setDoctorName(savedDoctorName || 'Doctor');
    }
  }, []);

  async function handleLogin(event) {
    event.preventDefault();
    setError('');
    setStatus('Logging in...');

    try {
      const data = await doctorLogin(email, password);
      setToken(data.token);
      setDoctorId(data.doctor.id);
      setDoctorName(data.doctor.name);
      localStorage.setItem('doctorToken', data.token);
      localStorage.setItem('doctorId', data.doctor.id);
      localStorage.setItem('doctorName', data.doctor.name);
      setStatus('Login successful');
    } catch (loginError) {
      setError(loginError.message);
      setStatus('');
    }
  }

  async function loadDashboard() {
    setError('');
    setStatus('Loading dashboard...');
    try {
      const data = await getDoctorDashboard(doctorId, token);
      setDashboard(data);
      setStatus('Dashboard updated');
    } catch (dashboardError) {
      setError(dashboardError.message);
      setStatus('');
    }
  }

  async function loadPatientPreview() {
    if (!patientId) {
      setError('Enter patient ID first');
      return;
    }

    setError('');
    setStatus('Loading patient preview...');
    try {
      const data = await getPatientPreview(doctorId, patientId, token);
      setPatientPreview(data);
      setStatus('Patient preview loaded');
    } catch (previewError) {
      setError(previewError.message);
      setStatus('');
    }
  }

  async function handleCallNext() {
    setError('');
    setStatus('Calling next patient...');
    try {
      const data = await callNextPatient(doctorId, token);
      setStatus(data.message || 'Called next patient');
      await loadDashboard();
    } catch (callError) {
      setError(callError.message);
      setStatus('');
    }
  }

  function handleLogout() {
    localStorage.removeItem('doctorToken');
    localStorage.removeItem('doctorId');
    localStorage.removeItem('doctorName');
    setToken('');
    setDoctorId('');
    setDoctorName('');
    setDashboard(null);
    setPatientPreview(null);
    setStatus('Logged out');
    setError('');
  }

  const isAuthenticated = useMemo(() => Boolean(token && doctorId), [token, doctorId]);

  if (!isAuthenticated) {
    return (
      <main className="container">
        <h1>Doctor Dashboard Login</h1>
        <p style={{ marginTop: -8, marginBottom: 16 }}>
          <a href="/hospital-onboarding" style={{ color: '#2f7d5b', textDecoration: 'none', fontWeight: 600, marginRight: 16 }}>Hospital Onboarding</a>
          <a href="/hospital-portal" style={{ color: '#2f7d5b', textDecoration: 'none', fontWeight: 600 }}>Hospital Portal</a>
        </p>
        <div className="card" style={{ maxWidth: 420 }}>
          <form onSubmit={handleLogin} className="row">
            <div>
              <label>Email</label>
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="dr.smith@hospital.com"
                required
              />
            </div>
            <div>
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <button type="submit">Login</button>
          </form>
          {status && <p className="success" style={{ marginTop: 12 }}>{status}</p>}
          {error && <p className="error" style={{ marginTop: 12 }}>{error}</p>}
        </div>
      </main>
    );
  }

  return (
    <main className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Welcome, {doctorName}</h1>
          <span className="badge">Doctor ID: {doctorId}</span>
          <p style={{ marginTop: 8 }}>
            <a href="/admin" style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}>Open Admin Console</a>
            {' | '}
            <a href="/hospital-onboarding" style={{ color: '#2f7d5b', textDecoration: 'none', fontWeight: 600 }}>Hospital Onboarding</a>
            {' | '}
            <a href="/hospital-portal" style={{ color: '#2f7d5b', textDecoration: 'none', fontWeight: 600 }}>Hospital Portal</a>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="secondary" onClick={loadDashboard}>Refresh Dashboard</button>
          <button onClick={handleCallNext}>Call Next Patient</button>
          <button className="secondary" onClick={handleLogout}>Logout</button>
        </div>
      </div>

      {status && <p className="success">{status}</p>}
      {error && <p className="error">{error}</p>}

      <section className="row row-2" style={{ marginTop: 16 }}>
        <div className="card">
          <h2>Today Schedule</h2>
          {!dashboard?.todaySchedule?.appointments?.length && <p>No appointments loaded yet.</p>}
          {dashboard?.todaySchedule?.appointments?.map((appointment) => (
            <div key={appointment.id} style={{ borderTop: '1px solid #e5e7eb', paddingTop: 10, marginTop: 10 }}>
              <strong>{appointment.time}</strong> - {appointment.patient.name}
              <p style={{ margin: '6px 0 0' }}>Complaint: {appointment.chiefComplaint || 'N/A'}</p>
              <p style={{ margin: '6px 0 0' }}>Status: {appointment.status}</p>
            </div>
          ))}
        </div>

        <div className="card">
          <h2>Queue</h2>
          {!dashboard?.currentQueue?.patients?.length && <p>No queued patients loaded yet.</p>}
          {dashboard?.currentQueue?.patients?.map((queuedPatient, index) => (
            <div key={`${queuedPatient.patient_id || index}`} style={{ borderTop: '1px solid #e5e7eb', paddingTop: 10, marginTop: 10 }}>
              <strong>#{index + 1}</strong> Patient: {queuedPatient.patient_id || 'N/A'}
              <p style={{ margin: '6px 0 0' }}>Priority: {queuedPatient.priority_level || queuedPatient.priority || 'N/A'}</p>
              <p style={{ margin: '6px 0 0' }}>Risk: {queuedPatient.risk_score ?? 'N/A'}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Patient Preview</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={patientId}
            onChange={(event) => setPatientId(event.target.value)}
            placeholder="Enter patient ID"
          />
          <button onClick={loadPatientPreview}>Load Preview</button>
        </div>

        {patientPreview && (
          <div style={{ marginTop: 16 }}>
            <h3>{patientPreview.basicInfo?.name} ({patientPreview.basicInfo?.age})</h3>
            <p>Blood Type: {patientPreview.basicInfo?.bloodType || 'N/A'}</p>
            <p>Chief Complaint: {patientPreview.todayTriage?.chiefComplaint || 'N/A'}</p>
            <p>Priority: {patientPreview.todayTriage?.priorityLevel || 'N/A'}</p>
            <p>Risk Score: {patientPreview.todayTriage?.totalRiskScore || 'N/A'}</p>
            <p>Critical Allergies: {(patientPreview.criticalAlerts?.allergies || []).length}</p>
            <p>Active Conditions: {(patientPreview.criticalAlerts?.activeConditions || []).length}</p>
            <p>Current Medications: {(patientPreview.currentMedications || []).length}</p>
          </div>
        )}
      </section>
    </main>
  );
}
