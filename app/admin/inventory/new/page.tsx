'use client';

import Link from 'next/link';
import AdminInventoryCreateForm from '@/components/admin/AdminInventoryCreateForm';

import PageTitle from '@/components/ui/PageTitle';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function NewPageInner() {
  const search = useSearchParams();
  const kind = search.get('kind') === 'promotion' ? 'promotion' : 'listing';
  const isPromo = kind === 'promotion';
  const backHref = isPromo ? '/admin/inventory/promotions' : '/admin/inventory';
  const backLabel = isPromo ? 'Promotions' : 'Inventory';
  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="mb-6 flex items-center gap-2 text-sm text-gray-600">
        <Link href={backHref} className="hover:text-gray-900 transition-colors">
          ← {backLabel}
        </Link>
        <span className="text-gray-400">/</span>
        <span className="text-gray-900">New</span>
      </div>
      <div className="mb-8">
        <PageTitle size="md">
          {isPromo ? 'Create promotion' : 'Create listing'}
        </PageTitle>
        <p className="mt-2 text-sm text-gray-600 font-light max-w-2xl">
          Admin-side creation form. Submissions are published immediately —
          they skip the pending queue. Use an image for the card thumbnail; PDF
          is optional. Attach a flyer PDF and click &ldquo;Auto-fill from flyer&rdquo; to
          pre-populate fields.
        </p>
      </div>
      <AdminInventoryCreateForm />
    </div>
  );
}

export default function AdminInventoryNewPage() {
  return (
    <Suspense>
      <NewPageInner />
    </Suspense>
  );
}
