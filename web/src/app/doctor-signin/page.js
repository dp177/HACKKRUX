'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FiEye, FiEyeOff } from 'react-icons/fi';
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
    <main className="container">
      <section className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-8 shadow-soft">
        <p className="mb-3 inline-block rounded-full bg-accent-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-accent-800">
          Doctor Access
        </p>
        <h1 className="mb-2 text-3xl font-semibold tracking-tight text-slate-900">Doctor Sign In</h1>
        <p className="mb-6 text-sm text-slate-600">
          Use your hospital-issued credentials to access live triage queue, schedule, and patient context.
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

          <button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="mt-5 flex flex-wrap gap-3 text-sm">
          <a href="/" className="font-semibold text-slate-600 hover:text-slate-700">Back to Home</a>
          <a href="/hospital-onboarding" className="font-semibold text-accent-700 hover:text-accent-800">Hospital Onboarding</a>
        </div>
      </section>
    </main>
  );
}
