'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import SentPanel, { type SentRow } from '../_components/SentPanel';

export default function CrmSentPage() {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Sent emails</h1>
          <p className="text-sm text-gray-500">Search, resend, or edit and resend past outreach.</p>
        </div>
        <Link href="/admin/crm" className="text-sm text-purple-700 hover:underline">← Back to CRM</Link>
      </div>
      <SentPanel limit={50} showFilters
        onEditResend={(row: SentRow) => {
          router.push(`/admin/crm?prefill=${encodeURIComponent(row.id)}`);
        }} />
    </div>
  );
}
