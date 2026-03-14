'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { FiEye, FiEyeOff } from 'react-icons/fi';
import {
  RiArrowRightLine,
  RiBrainLine,
  RiPulseLine,
  RiShieldCheckLine,
  RiStethoscopeLine
} from 'react-icons/ri';
import { Button } from '../../components/ui/button';
import { doctorLogin } from '../../lib/api';

export default function DoctorSignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSignIn(event) {
    event.preventDefault();
    setLoading(true);

    try {
      const data = await doctorLogin(email, password);
      localStorage.setItem('doctorPortalToken', data.token);
      localStorage.setItem('doctorPortalDoctor', JSON.stringify(data.doctor));
      toast.success('Signed in as doctor');
      router.push('/doctor-portal');
    } catch (error) {
      toast.error(error.message || 'Sign in failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-soft">
        <div className="grid lg:grid-cols-2">
          <aside className="relative hidden min-h-[620px] overflow-hidden bg-slate-900 p-8 lg:block">
            <div className="absolute inset-0">
              <motion.div
                animate={{ x: [0, 14, -10, 0], y: [0, -10, 10, 0] }}
                transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute -top-24 -left-12 h-72 w-72 rounded-full bg-violet-500/30 blur-3xl"
              />
              <motion.div
                animate={{ x: [0, -12, 14, 0], y: [0, 8, -10, 0] }}
                transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute bottom-6 right-0 h-80 w-80 rounded-full bg-fuchsia-500/22 blur-3xl"
              />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_20%,rgba(168,85,247,0.26),transparent_58%)]" />
            </div>

            <div className="relative z-10 flex h-full flex-col justify-between">
              <div>
                <a href="/" className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-white/15">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-white/20 text-white">
                    <RiStethoscopeLine className="h-3.5 w-3.5" />
                  </span>
                  Jeeva
                </a>

                <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-white/90">
                  Doctor Portal
                </div>

                <h1 className="mt-6 max-w-md text-4xl font-semibold leading-tight tracking-tight text-white">
                  Precision triage and smarter consults for every doctor
                </h1>
                <p className="mt-4 max-w-md text-sm leading-relaxed text-white/80">
                  Access real-time queue, AI-assisted context, and prescribing workflow from one focused clinical screen.
                </p>
              </div>

              <div className="space-y-3">
                {[
                  { icon: RiShieldCheckLine, text: 'Secure role-based doctor access' },
                  { icon: RiPulseLine, text: 'Live patient and triage visibility' },
                  { icon: RiBrainLine, text: 'AI decision support at consultation time' }
                ].map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white/90 backdrop-blur-sm">
                    <Icon className="h-4 w-4 text-violet-200" />
                    <span>{text}</span>
                  </div>
                ))}
              </div>
            </div>
          </aside>

          <section className="p-6 sm:p-8 lg:p-10">
            <p className="mb-3 inline-block rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-violet-800">
              Doctor Access
            </p>
            <h2 className="mb-2 text-3xl font-semibold tracking-tight text-slate-900">Welcome back, Doctor</h2>
            <p className="mb-6 text-sm text-slate-600">
              Sign in with your hospital-issued credentials to open your clinical workspace.
            </p>

            <form onSubmit={handleSignIn} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="pr-12"
                    required
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <FiEyeOff size={16} /> : <FiEye size={16} />}
                  </button>
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Signing in...' : 'Sign In'}
                {!loading && <RiArrowRightLine className="h-4 w-4" />}
              </Button>
            </form>

            <p className="mt-4 text-sm text-slate-600">
              Not affiliated with a registered hospital?{' '}
              <a href="/hospital-onboarding" className="font-semibold text-violet-700 hover:text-violet-800">
                Onboard hospital
              </a>
            </p>

            <div className="mt-3 text-sm">
              <a href="/hospital-portal" className="font-semibold text-slate-600 hover:text-slate-700">Hospital Sign In</a>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
