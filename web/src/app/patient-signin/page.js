'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FiEye, FiEyeOff } from 'react-icons/fi';
import { RiArrowRightLine, RiStethoscopeLine } from 'react-icons/ri';
import { Button } from '../../components/ui/button';
import { patientLogin } from '../../lib/api';

export default function PatientSignInPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSignIn(event) {
    event.preventDefault();
    setLoading(true);

    try {
      const data = await patientLogin(phone.trim(), password);
      localStorage.setItem('patientToken', data.token);
      localStorage.setItem('patientProfile', JSON.stringify(data.patient));
      toast.success('Signed in');
      router.push('/');
    } catch (error) {
      toast.error(error.message || 'Sign in failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <section className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-soft sm:p-8">
        <a href="/" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-violet-100 text-violet-700">
            <RiStethoscopeLine className="h-3.5 w-3.5" />
          </span>
          Jeeva
        </a>

        <h1 className="mt-6 text-3xl font-semibold tracking-tight text-slate-900">Patient sign in</h1>
        <p className="mb-6 mt-2 text-sm text-slate-600">
          Sign in with the phone number and password from your registration.
        </p>

        <form onSubmit={handleSignIn} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Phone number</label>
            <input
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              autoComplete="tel"
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
                autoComplete="current-password"
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
          New here?{' '}
          <a href="/patient-signup" className="font-semibold text-violet-700 hover:text-violet-800">
            Create a patient account
          </a>
        </p>
      </section>
    </main>
  );
}
