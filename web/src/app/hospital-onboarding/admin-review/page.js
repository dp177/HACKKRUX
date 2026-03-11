'use client';

import { useMemo, useState } from 'react';
import { FiEye, FiEyeOff } from 'react-icons/fi';
import {
  approveAdminOnboardingRequest,
  getAdminOnboardingRequests,
  rejectAdminOnboardingRequest
} from '../../../lib/api';

export default function AdminOnboardingReviewPage() {
  const [adminKey, setAdminKey] = useState('');
  const [showAdminKey, setShowAdminKey] = useState(false);
  const [reviewedBy, setReviewedBy] = useState('platform_admin');
  const [reviewNotes, setReviewNotes] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [requests, setRequests] = useState([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const pendingCount = useMemo(
    () => requests.filter((item) => item.status === 'pending').length,
    [requests]
  );

  async function loadRequests() {
    setError('');
    setStatus('Loading requests...');

    if (!adminKey) {
      setError('Admin onboarding key is required to continue.');
      setStatus('');
      return;
    }

    try {
      const data = await getAdminOnboardingRequests(statusFilter, adminKey);
      setRequests(data.requests || []);
      setStatus('Requests loaded');
    } catch (loadError) {
      setError(loadError.message);
      setStatus('');
    }
  }

  async function handleAction(requestId, action) {
    setError('');
    setStatus(action === 'approve' ? 'Approving request...' : 'Disapproving request...');

    if (!adminKey) {
      setError('Admin onboarding key is required.');
      setStatus('');
      return;
    }

    try {
      const payload = {
        reviewedBy,
        reviewNotes: reviewNotes || null
      };

      if (action === 'approve') {
        const data = await approveAdminOnboardingRequest(requestId, payload, adminKey);
        if (data.credentialsEmail?.sent) {
          setStatus('Approved and credentials email sent');
        } else {
          setStatus(`Approved. Email status: ${data.credentialsEmail?.reason || 'Not sent'}`);
        }
      } else {
        const data = await rejectAdminOnboardingRequest(requestId, payload, adminKey);
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
            <label className="mb-1 block text-sm font-medium text-slate-700">Admin Onboarding Key</label>
            <div className="relative">
              <input
                type={showAdminKey ? 'text' : 'password'}
                value={adminKey}
                onChange={(e) => setAdminKey(e.target.value)}
                className="pr-16"
                placeholder="x-admin-onboarding-key"
              />
              <button
                type="button"
                className="secondary absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center p-0"
                onClick={() => setShowAdminKey((prev) => !prev)}
                aria-label={showAdminKey ? 'Hide admin key' : 'Show admin key'}
                title={showAdminKey ? 'Hide admin key' : 'Show admin key'}
              >
                {showAdminKey ? <FiEyeOff size={16} /> : <FiEye size={16} />}
              </button>
            </div>
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
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">Pending: {pendingCount}</span>
        </div>

        {status && <p className="text-sm font-medium text-emerald-700">{status}</p>}
        {error && <p className="text-sm font-medium text-red-700">{error}</p>}
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
