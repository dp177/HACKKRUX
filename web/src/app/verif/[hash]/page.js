import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function LegacyVerifyPage({ params }) {
  const resolvedParams = await Promise.resolve(params);
  const hash = String(resolvedParams?.hash || '').trim().toLowerCase();
  redirect(`/verify/${encodeURIComponent(hash)}`);
}
