'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { submitHospitalOnboardingRequest } from '../../lib/api';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import {
  RiArrowRightLine,
  RiBarChartBoxLine,
  RiBuildingLine,
  RiCheckLine,
  RiHospitalLine,
  RiMailLine,
  RiMapPin2Line,
  RiPhoneLine,
  RiShieldCheckLine,
  RiTimeLine,
  RiUserLine,
} from 'react-icons/ri';

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

function Field({ label, icon: Icon, required, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.1em] text-slate-500">
        {label}
        {required ? ' *' : ''}
      </label>
      <div className="relative">
        {Icon ? (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
        {children}
      </div>
    </div>
  );
}

export default function HospitalOnboardingPage() {
  const [form, setForm] = useState(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  async function handleSubmitRequest(event) {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      const recipientEmail = form.contactEmail;
      await submitHospitalOnboardingRequest(form);
      toast.success(`Request submitted successfully. Email sent to ${recipientEmail}`);
      setForm(initialForm);
    } catch (error) {
      toast.error(error.message || 'Failed to submit onboarding request');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:py-14">
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.04 }}
        className="mb-6 grid gap-4 sm:grid-cols-3"
      >
        {[
          {
            icon: RiHospitalLine,
            title: 'Institution Verification',
            text: 'We verify legal and operational details before approval.',
          },
          {
            icon: RiMapPin2Line,
            title: 'Workspace Activation',
            text: 'After approval, your hospital workspace is enabled.',
          },
          {
            icon: RiUserLine,
            title: 'Credential Delivery',
            text: 'Primary contact receives secure sign-in details by email.',
          },
        ].map(({ icon: Icon, title, text }) => (
          <Card key={title} className="rounded-2xl border-slate-200 bg-white p-5">
            <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-accent-100 text-accent-700">
              <Icon className="h-4.5 w-4.5" />
            </div>
            <h3 className="text-base font-semibold tracking-tight text-slate-900">{title}</h3>
            <p className="mt-1 text-sm text-slate-600">{text}</p>
          </Card>
        ))}
      </motion.section>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
      >
        <Card className="overflow-hidden rounded-3xl border-slate-200 p-0">
          <div className="grid lg:grid-cols-2">
            <aside className="relative hidden min-h-[680px] overflow-hidden bg-slate-900 p-8 lg:block">
              <div className="absolute inset-0">
                <motion.div
                  animate={{ x: [0, 10, -8, 0], y: [0, -8, 8, 0] }}
                  transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute -top-24 -left-12 h-72 w-72 rounded-full bg-emerald-400/30 blur-3xl"
                />
                <motion.div
                  animate={{ x: [0, -10, 12, 0], y: [0, 8, -8, 0] }}
                  transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute bottom-10 right-0 h-80 w-80 rounded-full bg-emerald-500/24 blur-3xl"
                />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(16,185,129,0.25),transparent_56%)]" />
              </div>

              <div className="relative z-10 flex h-full flex-col justify-between">
                <div>
                  <a href="/" className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-white/15">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-white/20 text-white">
                      <RiHospitalLine className="h-3.5 w-3.5" />
                    </span>
                    Jeeva
                  </a>

                  <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-white/90">
                    Hospital Onboarding
                  </div>

                  <h1 className="mt-6 max-w-md text-4xl font-semibold leading-tight tracking-tight text-white">
                    Launch your hospital workspace with Jeeva
                  </h1>
                  <p className="mt-4 max-w-md text-sm leading-relaxed text-white/80">
                    Submit your institution details once. We verify, approve, and activate your hospital for operations.
                  </p>
                </div>

                <div className="space-y-3">
                  {[
                    { icon: RiShieldCheckLine, text: 'Admin-reviewed and secure onboarding' },
                    { icon: RiBarChartBoxLine, text: 'Ready for departments and doctor operations' },
                    { icon: RiMailLine, text: 'Credentials are shared via official email' }
                  ].map(({ icon: Icon, text }) => (
                    <div key={text} className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white/90 backdrop-blur-sm">
                      <Icon className="h-4 w-4 text-accent-200" />
                      <span>{text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </aside>

            <section className="bg-white p-6 sm:p-8 lg:p-10">
              <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">Registration Form</p>
                  <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Hospital details</h2>
                  <p className="mt-1 text-sm text-slate-500">Use official information for accurate verification.</p>
                </div>
                <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                  <RiCheckLine className="h-4 w-4" /> Encrypted submission
                </div>
              </div>

              <form onSubmit={handleSubmitRequest} className="space-y-7">
                <div>
                  <h3 className="mb-3 text-sm font-semibold tracking-tight text-slate-900">Institution</h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Field label="Hospital Name" icon={RiBuildingLine} required>
                        <input
                          value={form.hospitalName}
                          onChange={(event) => updateField('hospitalName', event.target.value)}
                          className="pl-10"
                          placeholder="CityCare Multispeciality Hospital"
                          required
                        />
                      </Field>
                    </div>

                    <Field label="Preferred Hospital Code" icon={RiHospitalLine}>
                      <input
                        value={form.preferredHospitalCode}
                        onChange={(event) => updateField('preferredHospitalCode', event.target.value)}
                        className="pl-10"
                        placeholder="Optional"
                      />
                    </Field>

                    <Field label="Main Phone" icon={RiPhoneLine}>
                      <input
                        value={form.phone}
                        onChange={(event) => updateField('phone', event.target.value)}
                        className="pl-10"
                        placeholder="+91 98765 43210"
                      />
                    </Field>

                    <div className="sm:col-span-2">
                      <Field label="Registered Address" icon={RiMapPin2Line}>
                        <input
                          value={form.address}
                          onChange={(event) => updateField('address', event.target.value)}
                          className="pl-10"
                          placeholder="Street, locality, landmark"
                        />
                      </Field>
                    </div>

                    <Field label="City" icon={RiMapPin2Line}>
                      <input
                        value={form.city}
                        onChange={(event) => updateField('city', event.target.value)}
                        className="pl-10"
                        placeholder="Hyderabad"
                      />
                    </Field>

                    <Field label="State" icon={RiMapPin2Line}>
                      <input
                        value={form.state}
                        onChange={(event) => updateField('state', event.target.value)}
                        className="pl-10"
                        placeholder="Telangana"
                      />
                    </Field>
                  </div>
                </div>

                <div>
                  <h3 className="mb-3 text-sm font-semibold tracking-tight text-slate-900">Primary Contact</h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Contact Person" icon={RiUserLine} required>
                      <input
                        value={form.contactName}
                        onChange={(event) => updateField('contactName', event.target.value)}
                        className="pl-10"
                        placeholder="Full name"
                        required
                      />
                    </Field>

                    <Field label="Contact Email" icon={RiMailLine} required>
                      <input
                        type="email"
                        value={form.contactEmail}
                        onChange={(event) => updateField('contactEmail', event.target.value)}
                        className="pl-10"
                        placeholder="name@hospital.com"
                        required
                      />
                    </Field>

                    <div className="sm:col-span-2">
                      <Field label="Contact Phone" icon={RiPhoneLine} required>
                        <input
                          value={form.contactPhone}
                          onChange={(event) => updateField('contactPhone', event.target.value)}
                          className="pl-10"
                          placeholder="+91 98xxxxxx"
                          required
                        />
                      </Field>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <Button type="submit" size="md" disabled={isSubmitting}>
                    {isSubmitting ? 'Submitting request...' : 'Submit onboarding request'}
                    {!isSubmitting && <RiArrowRightLine className="h-4 w-4" />}
                  </Button>
                  <a
                    href="/hospital-portal"
                    className="inline-flex items-center rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                  >
                    Already approved? Sign in
                  </a>
                </div>

                <p className="text-sm text-slate-600">
                  Already have hospital credentials?{' '}
                  <a href="/hospital-portal" className="font-semibold text-accent-700 hover:text-accent-800">
                    Sign in now
                  </a>
                </p>
              </form>

            </section>
          </div>
        </Card>
      </motion.div>
    </main>
  );
}
