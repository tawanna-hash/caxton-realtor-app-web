// app/portal/reset/page.tsx — choose a new password from the emailed link.

import PageTitle from '@/components/ui/PageTitle';
import ResetForm from './ResetForm';

export const dynamic = 'force-dynamic';

export default async function PortalResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <div className="max-w-md mx-auto rounded-md border border-gray-200 bg-white p-8">
      <PageTitle size="md">Choose a new password</PageTitle>
      <p className="text-gray-600 text-sm mb-6">Use at least 10 characters. You will sign in with it right after.</p>
      <ResetForm token={token ?? ''} />
    </div>
  );
}
