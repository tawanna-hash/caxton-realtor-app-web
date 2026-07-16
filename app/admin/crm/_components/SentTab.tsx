'use client';

import Link from 'next/link';
import SentPanel, { type SentRow } from './SentPanel';

export default function SentTab({ onEditResend }: { onEditResend?: (row: SentRow) => void }) {
  return (
    <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Recent sends</h2>
        <Link href="/admin/crm/sent" className="text-sm text-purple-700 hover:underline">View full history →</Link>
      </div>
      <SentPanel limit={20} showFilters={false} onEditResend={onEditResend} />
    </div>
  );
}
