// app/admin/inventory/[id]/page.tsx
//
// Admin detail/edit page for a single builder_inventory row.
// Reached by clicking "Review →" from the queue page.
//
// Server component: fetches the row and 404s if missing. Auth is inherited
// from the admin layout (page-level auth). The client component handles
// action buttons and edits via PATCH/DELETE to /api/admin/inventory/[id]
// which has its own inline auth check.

import { notFound } from 'next/navigation';
import { getBuilderInventoryById } from '@/lib/builder-inventory';
import AdminInventoryDetail from '@/components/inventory/AdminInventoryDetail';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Review submission — Admin — Realty News Now',
};

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function Page({ params }: PageProps) {
  const { id: idParam } = await params;
  const id = parseInt(idParam, 10);
  if (!Number.isFinite(id) || id <= 0) {
    notFound();
  }

  const row = await getBuilderInventoryById(id);
  if (!row) {
    notFound();
  }

  return <AdminInventoryDetail row={row} />;
}
