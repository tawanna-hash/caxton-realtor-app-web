'use client';

// app/admin/products-services/ProductsServicesClient.tsx
//
// Products & Services catalog manager. Search/filter by market + category,
// inline drawer to create/edit an item, and a one-click "Import from
// QuickBooks" action that re-syncs the seeded CSV catalog.

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ProductService, ProductServiceType } from '@/lib/products-services';
import { formatProductPrice, ITEM_TYPE_LABELS } from '@/lib/products-services';
import PageTitle from '@/components/ui/PageTitle';
import { GetPaidSearchBar, getPaidSearchSelectClassName } from '@/app/admin/getpaid/_components/GetPaidSearchBar';
import { DrawerShell, DrawerFooter, Field } from '@/app/admin/billing/_components/DrawerShell';
import { INPUT } from '@/app/admin/billing/_components/constants';

type Props = { initialProducts: ProductService[] };

const MARKET_LABELS: Record<string, string> = {
  austin: 'Austin',
  san_antonio: 'San Antonio',
  both: 'Austin/San Antonio',
};

function marketLabel(m: string | null): string {
  if (!m) return 'General';
  return MARKET_LABELS[m] ?? m;
}

export default function ProductsServicesClient({ initialProducts }: Props) {
  const router = useRouter();
  const [products, setProducts] = useState(initialProducts);
  const [query, setQuery] = useState('');
  const [marketFilter, setMarketFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<ProductService | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const res = await fetch('/api/admin/products-services', { cache: 'no-store' });
    if (res.status === 401) { router.push('/admin/login'); return; }
    if (res.ok) setProducts((await res.json()).products ?? []);
  }, [router]);

  const categories = useMemo(
    () => Array.from(new Set(products.map((p) => p.category).filter(Boolean))).sort() as string[],
    [products],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (!showInactive && !p.is_active) return false;
      if (marketFilter !== 'all' && (p.market ?? 'none') !== marketFilter) return false;
      if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
      if (q && !p.name.toLowerCase().includes(q) && !(p.category ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [products, query, marketFilter, categoryFilter, showInactive]);

  const grouped = useMemo(() => {
    const map = new Map<string, ProductService[]>();
    for (const p of filtered) {
      const key = p.category ?? 'Uncategorized';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return Array.from(map.entries()).sort((a, b) => {
      const featuredCategory = 'Print & Digital Replica Packages';
      if (a[0] === featuredCategory) return -1;
      if (b[0] === featuredCategory) return 1;
      return a[0].localeCompare(b[0]);
    });
  }, [filtered]);

  const handleToggleActive = useCallback(async (p: ProductService) => {
    setError(null);
    const res = await fetch(`/api/admin/products-services/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !p.is_active }),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error ?? 'Update failed'); return; }
    await reload();
  }, [reload]);

  const handleDelete = useCallback(async (p: ProductService) => {
    if (!confirm(`Delete "${p.name}"? This can't be undone.`)) return;
    setError(null);
    const res = await fetch(`/api/admin/products-services/${p.id}`, { method: 'DELETE' });
    if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error ?? 'Delete failed'); return; }
    await reload();
  }, [reload]);

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">Admin · Sales</div>
          <PageTitle size="md">Products &amp; Services</PageTitle>
          <p className="text-sm text-gray-600 mt-1">{products.length} items · ad slots, packages, and billable services used on invoices.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setEditing('new')} className="px-4 py-2 rounded-md bg-orange-600 text-white text-sm font-medium hover:bg-orange-700 whitespace-nowrap">
            + New item
          </button>
        </div>
      </div>

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <GetPaidSearchBar value={query} onChange={setQuery} placeholder="Search product, service, or category…">
        <select aria-label="Market" value={marketFilter} onChange={(e) => setMarketFilter(e.target.value)} className={getPaidSearchSelectClassName}>
          <option value="all">All markets</option>
          <option value="austin">Austin</option>
          <option value="san_antonio">San Antonio</option>
          <option value="both">Austin/San Antonio</option>
          <option value="none">General</option>
        </select>
        <select aria-label="Category" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className={getPaidSearchSelectClassName}>
          <option value="all">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="flex h-9 items-center gap-2 whitespace-nowrap px-1 text-sm text-gray-600">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Show inactive
        </label>
      </GetPaidSearchBar>

      <div className="space-y-6">
        {grouped.length === 0 ? (
          <div className="rounded-md border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
            No products or services match your filters.
          </div>
        ) : (
          grouped.map(([category, items]) => (
            <div key={category} className="rounded-md border border-gray-200 bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500 font-medium">
                {category} · {items.length}
              </div>
              <div className="divide-y divide-gray-100">
                {items.map((p) => (
                  <div key={p.id} className={`grid grid-cols-2 sm:grid-cols-12 gap-2 px-4 py-3 text-sm items-center ${!p.is_active ? 'opacity-50' : ''}`}>
                    <div className="sm:col-span-5 min-w-0">
                      <div className="font-medium text-gray-900 truncate">{p.name}</div>
                      {p.sales_description && <div className="text-xs text-gray-500 truncate">{p.sales_description}</div>}
                    </div>
                    <div className="sm:col-span-2 text-xs text-gray-600">{marketLabel(p.market)}</div>
                    <div className="sm:col-span-2 text-xs text-gray-600">{ITEM_TYPE_LABELS[p.item_type as ProductServiceType]}</div>
                    <div className="sm:col-span-1 text-gray-900 font-semibold">{formatProductPrice(p.price_cents)}</div>
                    <div className="sm:col-span-2 flex gap-1 justify-end flex-wrap">
                      <button onClick={() => setEditing(p)} className="text-xs px-2 py-1 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50">Edit</button>
                      <button onClick={() => handleToggleActive(p)} className="text-xs px-2 py-1 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50">
                        {p.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button onClick={() => handleDelete(p)} className="text-xs px-2 py-1 rounded-md border border-red-200 text-red-600 hover:bg-red-50">Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {editing && (
        <ProductDrawer
          existing={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await reload(); }}
          onError={setError}
        />
      )}
    </div>
  );
}

function ProductDrawer({
  existing, onClose, onSaved, onError,
}: {
  existing: ProductService | null;
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const [name, setName] = useState(existing?.name ?? '');
  const [sku, setSku] = useState(existing?.sku ?? '');
  const [itemType, setItemType] = useState<ProductServiceType>(existing?.item_type ?? 'service');
  const [category, setCategory] = useState(existing?.category ?? '');
  const [market, setMarket] = useState(existing?.market ?? '');
  const [price, setPrice] = useState(existing?.price_cents != null ? (existing.price_cents / 100).toString() : '');
  const [incomeAccount, setIncomeAccount] = useState(existing?.income_account ?? 'Advertising revenue');
  const [salesDescription, setSalesDescription] = useState(existing?.sales_description ?? '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!name.trim()) { onError('Name is required'); return; }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        sku: sku.trim() || null,
        item_type: itemType,
        category: category.trim() || null,
        market: market.trim() || null,
        price_cents: price.trim() ? Math.round(parseFloat(price) * 100) : null,
        income_account: incomeAccount.trim() || null,
        sales_description: salesDescription.trim() || null,
      };
      const res = existing
        ? await fetch(`/api/admin/products-services/${existing.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          })
        : await fetch('/api/admin/products-services', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { onError(j.error ?? 'Save failed'); return; }
      onSaved();
    } finally {
      setSaving(false);
    }
  }, [name, sku, itemType, category, market, price, incomeAccount, salesDescription, existing, onError, onSaved]);

  return (
    <DrawerShell title={existing ? 'Edit item' : 'New product/service'} subtitle={existing?.name} onClose={onClose}>
      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} className={INPUT} placeholder="e.g. Austin - Article Sidebar - Monthly" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="SKU">
          <input value={sku} onChange={(e) => setSku(e.target.value)} className={INPUT} />
        </Field>
        <Field label="Type">
          <select value={itemType} onChange={(e) => setItemType(e.target.value as ProductServiceType)} className={INPUT}>
            <option value="service">Service</option>
            <option value="non_inventory">Non-inventory</option>
            <option value="inventory">Inventory</option>
            <option value="bundle">Bundle</option>
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category">
          <input value={category} onChange={(e) => setCategory(e.target.value)} className={INPUT} placeholder="e.g. Premium App Slots - Monthly" />
        </Field>
        <Field label="Market">
          <select value={market} onChange={(e) => setMarket(e.target.value)} className={INPUT}>
            <option value="">General</option>
            <option value="austin">Austin</option>
            <option value="san_antonio">San Antonio</option>
            <option value="both">Austin/San Antonio</option>
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Price (USD)">
          <input value={price} onChange={(e) => setPrice(e.target.value)} className={INPUT} placeholder="e.g. 500.00" inputMode="decimal" />
        </Field>
        <Field label="Income account">
          <input value={incomeAccount} onChange={(e) => setIncomeAccount(e.target.value)} className={INPUT} />
        </Field>
      </div>
      <Field label="Sales description">
        <textarea value={salesDescription} onChange={(e) => setSalesDescription(e.target.value)} className={`${INPUT} min-h-20`} />
      </Field>
      <DrawerFooter saving={saving} onCancel={onClose} onSubmit={handleSubmit} submitLabel={existing ? 'Save changes' : 'Create item'} tone="orange" />
    </DrawerShell>
  );
}
