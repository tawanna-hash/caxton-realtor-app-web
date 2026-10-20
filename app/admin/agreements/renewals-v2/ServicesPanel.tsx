'use client';

// Agreements (Beta): the Products & Services catalog from Get Paid, read-only,
// in the Anchor-style Services layout. Same records, nothing is duplicated.

import { useEffect, useMemo, useState } from 'react';
import { A, EmptyState, SearchBox } from '@/components/anchor/ui';
import { ITEM_TYPE_LABELS, formatProductPrice, type ProductService } from '@/lib/products-services';

const MARKET: Record<string, string> = { austin: 'Austin', san_antonio: 'San Antonio', both: 'Both markets' };

export default function ServicesPanel() {
  const [rows, setRows] = useState<ProductService[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('all');
  const [inactive, setInactive] = useState(false);

  useEffect(() => {
    fetch('/api/admin/products-services', { credentials: 'include' })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'failed'); setRows(j.products as ProductService[]); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load services.'));
  }, []);

  const categories = useMemo(() => [...new Set((rows ?? []).map((r) => r.category).filter(Boolean) as string[])].sort(), [rows]);
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => (inactive || r.is_active) && (category === 'all' || r.category === category) && (!term || `${r.name} ${r.sku ?? ''} ${r.sales_description ?? ''}`.toLowerCase().includes(term)));
  }, [rows, q, category, inactive]);

  if (error) return <div className={A.error}>{error}</div>;
  if (!rows) return <p className="text-sm text-[#6E6A8A]">Loading services…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <SearchBox value={q} onChange={setQ} />
        <select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)} className="anchor-input rounded-full border border-[#D8D5E6] bg-white px-4 py-2 text-sm text-[#261E5A]">
          <option value="all">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-[#261E5A]"><input type="checkbox" className="h-4 w-4 accent-[#5B3FE3]" checked={inactive} onChange={(e) => setInactive(e.target.checked)} />Show inactive</label>
        <span className="text-xs text-[#6E6A8A]">{shown.length} of {rows.length} items</span>
        <a href="/admin/getpaid/product&services" className={`${A.outline} ml-auto`}>Manage in Get Paid</a>
      </div>
      {shown.length === 0 ? <EmptyState title="No services found" body="Try a different search or category." /> : (
        <div className="overflow-x-auto">
          <table className={A.table}>
            <thead><tr><th>Name</th><th>Type</th><th>Category</th><th>Market</th><th className="text-right">Price</th><th>Status</th></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td><div className="font-medium text-[#261E5A]">{r.name}</div>{r.sales_description && <div className="line-clamp-1 text-xs text-[#6E6A8A]">{r.sales_description}</div>}</td>
                  <td>{ITEM_TYPE_LABELS[r.item_type] ?? r.item_type}</td>
                  <td className="min-w-[140px]">{r.category ?? '—'}</td>
                  <td className="whitespace-nowrap">{r.market ? MARKET[r.market] ?? r.market : '—'}</td>
                  <td className="whitespace-nowrap text-right">{formatProductPrice(r.price_cents)}</td>
                  <td><span className={`rounded-full border px-2.5 py-0.5 text-xs ${r.is_active ? 'border-green-600 text-green-700' : 'border-[#9A97B3] text-[#6E6A8A]'}`}>{r.is_active ? 'Active' : 'Inactive'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
