'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import SentPanel, { type SentRow } from '../_components/SentPanel';

export default function CrmSentPage() {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-[1500px] space-y-5 px-5 py-7 lg:px-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-[0.18em] text-gray-500">Admin · Sales</div>
          <h1 className="text-xl font-semibold text-gray-900">Sent emails</h1>
          <p className="text-sm text-gray-500">Search, resend, or edit and resend past outreach.</p>
        </div>
        <Link href="/admin/crm" className="inline-flex h-9 items-center rounded border border-gray-300 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50">← Back to CRM</Link>
      </div>
      <SentPanel limit={50} showFilters
        onEditResend={(row: SentRow) => {
          router.push(`/admin/crm?prefill=${encodeURIComponent(row.id)}`);
        }} />
    </div>
  );
}
