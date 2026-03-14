import { Card } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';

export const dynamic = 'force-dynamic';

async function getVerification(hash) {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api';
  const response = await fetch(`${apiBase}/prescriptions/verify/${encodeURIComponent(hash)}`, {
    cache: 'no-store'
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    return {
      ok: false,
      payload: data || { status: 'INVALID', valid: false, reason: 'Verification request failed' }
    };
  }

  return { ok: true, payload: data };
}

export default async function VerifyPrescriptionPage({ params }) {
  const hash = String(params?.hash || '').trim().toLowerCase();
  const { payload } = await getVerification(hash);
  const isValid = Boolean(payload?.valid);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <Card className="border-violet-100/80 bg-white p-6 shadow-md shadow-violet-100/40">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-semibold text-slate-900">Prescription Verification</h1>
            <Badge variant={isValid ? 'purple' : 'slate'} className="normal-case tracking-normal">
              {isValid ? 'VALID' : 'INVALID'}
            </Badge>
          </div>

          <p className="mt-2 break-all text-xs text-slate-500">Hash: {hash || '-'}</p>

          {isValid ? (
            <div className="mt-5 space-y-2 text-sm text-slate-700">
              <p><span className="font-semibold text-slate-900">Doctor:</span> {payload?.doctor?.name || '-'}</p>
              <p><span className="font-semibold text-slate-900">Specialty:</span> {payload?.doctor?.specialty || '-'}</p>
              <p><span className="font-semibold text-slate-900">Reg No:</span> {payload?.doctor?.licenseNumber || '-'}</p>
              <p><span className="font-semibold text-slate-900">Patient:</span> {payload?.patient?.name || '-'}</p>
              <p><span className="font-semibold text-slate-900">Issued:</span> {payload?.issuedAt ? new Date(payload.issuedAt).toLocaleString('en-IN') : '-'}</p>
              <p><span className="font-semibold text-slate-900">Diagnosis:</span> {payload?.diagnosis || '-'}</p>
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {payload?.reason || 'Prescription could not be verified.'}
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
