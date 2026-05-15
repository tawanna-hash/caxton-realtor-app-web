'use client';

import Link from 'next/link';
import AdminInventoryCreateForm from '@/components/admin/AdminInventoryCreateForm';

export default function AdminInventoryNewPage() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="mb-6 flex items-center gap-2 text-sm text-gray-600">
        <Link href="/admin/inventory" className="hover:text-gray-900 transition-colors">
          ← Inventory
        </Link>
        <span className="text-gray-400">/</span>
        <span className="text-gray-900">New</span>
      </div>
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-semibold text-gray-900 tracking-tight">
          Create promotion or listing
        </h1>
        <p className="mt-2 text-sm text-gray-600 font-light max-w-2xl">
          Admin-side creation form. Submissions are published immediately —
          they skip the pending queue. Use an image for the card thumbnail; PDF
          is optional.
        </p>
      </div>
      <AdminInventoryCreateForm />
    </div>
  );
}
