'use client';

import { useMemo, useState } from 'react';
import { FiEye, FiEyeOff } from 'react-icons/fi';
import {
  approveAdminOnboardingRequest,
  getAdminHospitalsOverview,
  getAdminOnboardingRequests,
  rejectAdminOnboardingRequest
} from '../../../lib/api';

export default function AdminOnboardingReviewPage() {
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [reviewedBy, setReviewedBy] = useState('platform_admin');
  const [reviewNotes, setReviewNotes] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [requests, setRequests] = useState([]);
  const [hospitals, setHospitals] = useState([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const adminAuth = useMemo(
    () => ({ username: adminUsername, password: adminPassword }),
    [adminUsername, adminPassword]
  );

  const pendingCount = useMemo(
    () => requests.filter((item) => item.status === 'pending').length,
    [requests]
  );

  async function loadRequests() {
    setError('');
    setStatus('Loading requests...');

    if (!adminUsername || !adminPassword) {
      setError('Admin username and password are required.');
      setStatus('');
      return;
    }

    try {
      const [requestData, hospitalData] = await Promise.all([
        getAdminOnboardingRequests(statusFilter, adminAuth),
        getAdminHospitalsOverview(adminAuth)
      ]);

      setRequests(requestData.requests || []);
      setHospitals(hospitalData.hospitals || []);
      setStatus('Requests loaded');
      setIsAuthenticated(true);
    } catch (loadError) {
      setError(loadError.message);
      setStatus('');
      setIsAuthenticated(false);
    }
  }

  async function handleAction(requestId, action) {
    setError('');
    setStatus(action === 'approve' ? 'Approving request...' : 'Disapproving request...');

    if (!adminUsername || !adminPassword) {
      setError('Admin username and password are required.');
      setStatus('');
      return;
    }

    try {
      const payload = {
        reviewedBy,
        reviewNotes: reviewNotes || null
      };

      if (action === 'approve') {
        const data = await approveAdminOnboardingRequest(requestId, payload, adminAuth);
        if (data.credentialsEmail?.sent) {
          setStatus('Approved and credentials email sent');
        } else {
          setStatus(`Approved. Email status: ${data.credentialsEmail?.reason || 'Not sent'}`);
        }
      } else {
        const data = await rejectAdminOnboardingRequest(requestId, payload, adminAuth);
        if (data.decisionEmail?.sent) {
          setStatus('Disapproved and notification email sent');
        } else {
          setStatus(`Disapproved. Email status: ${data.decisionEmail?.reason || 'Not sent'}`);
        }
      }

      await loadRequests();
    } catch (actionError) {
      setError(actionError.message);
      setStatus('');
    }
  }

  async function handleAdminSignIn(event) {
    event.preventDefault();
    await loadRequests();
  }

  function handleAdminSignOut() {
    setIsAuthenticated(false);
    setRequests([]);
    setHospitals([]);
    setStatus('Signed out');
    setError('');
  }

  if (!isAuthenticated) {
    return (
      <main className="container">
        <section className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-8 shadow-soft">
          <p className="mb-3 inline-block rounded-full bg-accent-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-accent-800">
            Platform Admin
          </p>
          <h1 className="mb-2 text-3xl font-semibold tracking-tight text-slate-900">Admin Authentication</h1>
          <p className="mb-6 text-sm text-slate-600">
            Sign in with admin credentials to access onboarding review.
          </p>

          <form onSubmit={handleAdminSignIn} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Admin Username</label>
              <input
                value={adminUsername}
                onChange={(e) => setAdminUsername(e.target.value)}
                placeholder="admin"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Admin Password</label>
              <div className="relative">
                <input
                  type={showAdminPassword ? 'text' : 'password'}
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className="pr-16"
                  required
                />
                <button
                  type="button"
                  className="secondary absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center p-0"
                  onClick={() => setShowAdminPassword((prev) => !prev)}
                  aria-label={showAdminPassword ? 'Hide password' : 'Show password'}
                  title={showAdminPassword ? 'Hide password' : 'Show password'}
                >
                  {showAdminPassword ? <FiEyeOff size={16} /> : <FiEye size={16} />}
                </button>
              </div>
            </div>

            <button type="submit" className="w-full">Sign In</button>
          </form>

          {status && <p className="mt-4 text-sm font-medium text-emerald-700">{status}</p>}
          {error && <p className="mt-4 text-sm font-medium text-red-700">{error}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="container space-y-6">
      <section className="card overflow-hidden p-0">
        <div className="border-b border-slate-200 bg-gradient-to-r from-white via-accent-50 to-white px-6 py-8">
          <p className="mb-2 inline-block rounded-full bg-accent-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-accent-800">
            Platform Admin
          </p>
          <h1 className="mb-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Hospital Request Review</h1>
          <p className="max-w-3xl text-sm text-slate-600 sm:text-base">
            Review incoming requests and approve or disapprove. Approval sends generated credentials by email. Disapproval
            sends a notification mail so hospital can submit a fresh request.
          </p>
          <div className="mt-5 flex flex-wrap gap-3 text-sm text-slate-600">
            <a href="/hospital-onboarding" className="rounded-xl border border-accent-200 bg-white px-4 py-2 font-semibold text-accent-700 hover:bg-accent-50">Open Hospital Request Form</a>
            <a href="/" className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-700 hover:bg-slate-100">Back To Landing</a>
          </div>
        </div>
      </section>

      <section className="card space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">Admin User</label>
            <input value={adminUsername} onChange={(e) => setAdminUsername(e.target.value)} readOnly className="bg-slate-50" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Reviewed By</label>
            <input value={reviewedBy} onChange={(e) => setReviewedBy(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Filter</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Review Notes</label>
          <textarea rows={3} value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} placeholder="Optional message included in review history or disapproval email" />
        </div>

        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={loadRequests}>Load Requests</button>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">Pending: {pendingCount}</span>
            <button type="button" className="secondary" onClick={handleAdminSignOut}>Sign Out</button>
          </div>
        </div>

        {status && <p className="text-sm font-medium text-emerald-700">{status}</p>}
        {error && <p className="text-sm font-medium text-red-700">{error}</p>}
      </section>

      <section className="card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-slate-900">Hospital Overview</h2>
            <p className="text-sm text-slate-600">Hospitals with department and doctor counts.</p>
          </div>
          <span className="rounded-full bg-accent-100 px-3 py-1 text-xs font-semibold text-accent-800">
            Hospitals: {hospitals.length}
          </span>
        </div>

        {!hospitals.length ? (
          <p className="text-sm text-slate-500">No hospitals found.</p>
        ) : (
          <>
            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Total Hospitals</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{hospitals.length}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Departments</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
                  {hospitals.reduce((sum, item) => sum + (item.departmentCount || 0), 0)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Doctors</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
                  {hospitals.reduce((sum, item) => sum + (item.doctorCount || 0), 0)}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full border-collapse text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Hospital</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Code</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Location</th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-700">Departments</th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-700">Doctors</th>
                  </tr>
                </thead>
                <tbody>
                  {hospitals.map((hospital) => (
                    <tr key={hospital.id} className="border-t border-slate-200">
                      <td className="px-4 py-3 font-medium text-slate-900">{hospital.name}</td>
                      <td className="px-4 py-3 text-slate-600">{hospital.code}</td>
                      <td className="px-4 py-3 text-slate-600">{[hospital.city, hospital.state].filter(Boolean).join(', ') || '-'}</td>
                      <td className="px-4 py-3 text-center text-slate-900">{hospital.departmentCount || 0}</td>
                      <td className="px-4 py-3 text-center text-slate-900">{hospital.doctorCount || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="space-y-3">
        {!requests.length && <div className="card"><p className="text-sm text-slate-500">No requests found for the selected filter.</p></div>}
        {requests.map((item) => {
          const requestId = item.id || item._id;
          return (
          <article key={requestId} className="card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{item.hospitalName}</h2>
                <p className="text-sm text-slate-600">{item.contactName} • {item.contactEmail}</p>
                <p className="mt-1 text-xs text-slate-500">Status: {item.status}</p>
                <p className="mt-1 text-xs text-slate-500">Request ID: {requestId}</p>
              </div>
              {item.status === 'pending' && (
                <div className="flex w-full gap-2 sm:w-auto">
                  <button type="button" onClick={() => handleAction(requestId, 'approve')} className="flex-1 sm:flex-none">Approve</button>
                  <button type="button" onClick={() => handleAction(requestId, 'reject')} className="secondary flex-1 sm:flex-none">Disapprove</button>
                </div>
              )}
            </div>
          </article>
        );
        })}
      </section>
    </main>
  );
}
