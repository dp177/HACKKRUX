'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FiEye, FiEyeOff } from 'react-icons/fi';
import { RiArrowRightLine, RiStethoscopeLine } from 'react-icons/ri';
import { Button } from '../../components/ui/button';
import { patientSignup } from '../../lib/api';

const GENDERS = ['Male', 'Female', 'Other'];
const BLOOD_TYPES = ['Unknown', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const initialForm = {
  firstName: '',
  lastName: '',
  dateOfBirth: '',
  gender: '',
  phone: '',
  email: '',
  password: '',
  bloodType: 'Unknown',
  emergencyContactName: '',
  emergencyContactPhone: '',
  emergencyContactRelation: ''
};

export default function PatientSignUpPage() {
  const router = useRouter();
  const [form, setForm] = useState(initialForm);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  function update(field) {
    return (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));
  }

  async function handleSignUp(event) {
    event.preventDefault();
    setLoading(true);

    const payload = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      dateOfBirth: form.dateOfBirth,
      gender: form.gender,
      phone: form.phone.trim(),
      email: form.email.trim(),
      password: form.password,
      bloodType: form.bloodType,
      ...(form.emergencyContactName.trim()
        ? {
            emergencyContactName: form.emergencyContactName.trim(),
            emergencyContactPhone: form.emergencyContactPhone.trim(),
            emergencyContactRelation: form.emergencyContactRelation.trim()
          }
        : {})
    };

    try {
      const data = await patientSignup(payload);
      localStorage.setItem('patientToken', data.token);
      localStorage.setItem('patientProfile', JSON.stringify(data.patient));
      toast.success('Account created');
      router.push('/');
    } catch (error) {
      toast.error(error.message || 'Sign up failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <section className="mx-auto max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-soft sm:p-8">
        <a href="/" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-violet-100 text-violet-700">
            <RiStethoscopeLine className="h-3.5 w-3.5" />
          </span>
          Jeeva
        </a>

        <h1 className="mt-6 text-3xl font-semibold tracking-tight text-slate-900">Create your patient account</h1>
        <p className="mb-6 mt-2 text-sm text-slate-600">
          Register once to sign in on the web and in the app with the same phone number.
        </p>

        <form onSubmit={handleSignUp} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">First name</label>
              <input value={form.firstName} onChange={update('firstName')} autoComplete="given-name" required />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Last name</label>
              <input value={form.lastName} onChange={update('lastName')} autoComplete="family-name" required />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Date of birth</label>
              <input type="date" value={form.dateOfBirth} onChange={update('dateOfBirth')} autoComplete="bday" required />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Gender</label>
              <select value={form.gender} onChange={update('gender')} required>
                <option value="" disabled>Select</option>
                {GENDERS.map((gender) => (
                  <option key={gender} value={gender}>{gender}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Phone number</label>
            <input type="tel" value={form.phone} onChange={update('phone')} autoComplete="tel" required />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
            <input type="email" value={form.email} onChange={update('email')} autoComplete="email" required />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={update('password')}
                className="pr-12"
                autoComplete="new-password"
                minLength={6}
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

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Blood type (optional)</label>
            <select value={form.bloodType} onChange={update('bloodType')}>
              {BLOOD_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <details className="rounded-xl border border-slate-200 px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium text-slate-700">Emergency contact (optional)</summary>
            <div className="mt-3 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Name</label>
                <input value={form.emergencyContactName} onChange={update('emergencyContactName')} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Phone</label>
                <input type="tel" value={form.emergencyContactPhone} onChange={update('emergencyContactPhone')} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Relation</label>
                <input value={form.emergencyContactRelation} onChange={update('emergencyContactRelation')} />
              </div>
            </div>
          </details>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Creating account...' : 'Create account'}
            {!loading && <RiArrowRightLine className="h-4 w-4" />}
          </Button>
        </form>

        <p className="mt-4 text-sm text-slate-600">
          Already registered?{' '}
          <a href="/patient-signin" className="font-semibold text-violet-700 hover:text-violet-800">
            Sign in
          </a>
        </p>
      </section>
    </main>
  );
}
