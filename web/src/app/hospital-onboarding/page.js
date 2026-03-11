'use client';

import { useState } from 'react';
import { submitHospitalOnboardingRequest } from '../../lib/api';

const initialForm = {
  hospitalName: '',
  preferredHospitalCode: '',
  address: '',
  city: '',
  state: '',
  phone: '',
  contactName: '',
  contactEmail: '',
  contactPhone: ''
};

export default function HospitalOnboardingPage() {
  const [form, setForm] = useState(initialForm);
  const [requestStatus, setRequestStatus] = useState('');
  const [requestError, setRequestError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmitRequest(event) {
    event.preventDefault();
    setRequestError('');
    setRequestStatus('Submitting onboarding request...');
    setIsSubmitting(true);

    try {
      const data = await submitHospitalOnboardingRequest(form);
      const requestId = data?.request?.id || data?.request?._id || 'generated';
      setRequestStatus(`Request submitted successfully (ID: ${requestId})`);
      setForm(initialForm);
    } catch (error) {
      setRequestError(error.message);
      setRequestStatus('');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="container space-y-6">
      <section className="card overflow-hidden p-0">
        <div className="border-b border-slate-200 bg-gradient-to-r from-white via-accent-50 to-white px-6 py-8">
          <p className="mb-2 inline-block rounded-full bg-accent-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-accent-800">
            Hospital Sign Up
          </p>
          <h1 className="mb-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Hospital Onboarding</h1>
          <p className="max-w-3xl text-sm text-slate-600 sm:text-base">
            Share your hospital basics to request onboarding. Platform admin reviews your request and sends email for
            both outcomes. If approved, you receive generated credentials; if disapproved, you can edit and submit again.
          </p>
          <div className="mt-5 flex flex-wrap gap-3 text-sm text-slate-600">
            <a href="/hospital-portal" className="rounded-xl border border-accent-200 bg-white px-4 py-2 font-semibold text-accent-700 hover:bg-accent-50">Open Hospital Portal</a>
            <a href="/" className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-700 hover:bg-slate-100">Back To Landing</a>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <article className="card">
          <h2 className="text-xl font-semibold text-slate-900">Hospital Request Form</h2>
          <p className="mb-5 text-sm text-slate-500">Provide core hospital and primary contact information.</p>

          <form onSubmit={handleSubmitRequest} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">Hospital Name</label>
                <input value={form.hospitalName} onChange={(e) => setForm((p) => ({ ...p, hospitalName: e.target.value }))} required />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Preferred Code</label>
                <input value={form.preferredHospitalCode} onChange={(e) => setForm((p) => ({ ...p, preferredHospitalCode: e.target.value }))} placeholder="Optional" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Phone</label>
                <input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">Address</label>
                <input value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">City</label>
                <input value={form.city} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">State</label>
                <input value={form.state} onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Contact Person</label>
                <input value={form.contactName} onChange={(e) => setForm((p) => ({ ...p, contactName: e.target.value }))} required />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Contact Email</label>
                <input type="email" value={form.contactEmail} onChange={(e) => setForm((p) => ({ ...p, contactEmail: e.target.value }))} required />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Contact Phone</label>
                <input value={form.contactPhone} onChange={(e) => setForm((p) => ({ ...p, contactPhone: e.target.value }))} required />
              </div>
            </div>

            <button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? 'Submitting...' : 'Submit Onboarding Request'}
            </button>
          </form>

          {requestStatus && <p className="mt-4 text-sm font-medium text-emerald-700">{requestStatus}</p>}
          {requestError && <p className="mt-4 text-sm font-medium text-red-700">{requestError}</p>}
        </article>

        <article className="card">
          <h2 className="text-xl font-semibold text-slate-900">What Happens Next</h2>
          <div className="mt-4 space-y-3 text-sm text-slate-600">
            <p><span className="font-semibold text-slate-800">1.</span> Admin reviews your request details.</p>
            <p><span className="font-semibold text-slate-800">2.</span> You receive an email for approval or disapproval.</p>
            <p><span className="font-semibold text-slate-800">3.</span> On approval, login credentials are emailed automatically.</p>
            <p><span className="font-semibold text-slate-800">4.</span> On disapproval, update details and submit again from this page.</p>
          </div>

          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Already Approved?</p>
            <p className="mt-1 text-sm text-slate-600">Use your issued credentials to access your hospital workspace.</p>
            <a href="/hospital-portal" className="mt-3 inline-block rounded-xl bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700">
              Go To Hospital Sign In
            </a>
          </div>
        </article>
      </section>
    </main>
  );
}
