'use client';

// app/admin/products-services/ProductsServicesClient.tsx
//
// Products & Services catalog manager. Search/filter by market + category
// and use the inline drawer to create or edit an item.

import { Fragment, useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, PackagePlus, Search } from 'lucide-react';
import type { ProductService, ProductServiceType } from '@/lib/products-services';
import { formatProductPrice, ITEM_TYPE_LABELS } from '@/lib/products-services';
import PageTitle from '@/components/ui/PageTitle';
import { DrawerShell, DrawerFooter, Field } from '@/app/admin/billing/_components/DrawerShell';
import { INPUT } from '@/app/admin/billing/_components/constants';
import { sparsePatch } from '@/lib/sparse-patch';

type Props = { initialProducts: ProductService[] };

const MARKET_LABELS: Record<string, string> = {
  austin: 'Austin',
  san_antonio: 'San Antonio',
  both: 'Austin/San Antonio',
};

const CONTROL =
  'h-9 rounded border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100';
const FEATURED_CATEGORY = 'Print & Digital Replica Packages';

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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

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
    return products
      .filter((p) => {
        if (!showInactive && !p.is_active) return false;
        if (marketFilter !== 'all' && (p.market ?? 'none') !== marketFilter) return false;
        if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
        if (
          q &&
          ![p.name, p.sku, p.category, p.sales_description, p.income_account]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(q)
        ) return false;
        return true;
      })
      .sort((a, b) => {
        const aCategory = a.category ?? 'Uncategorized';
        const bCategory = b.category ?? 'Uncategorized';
        if (aCategory === FEATURED_CATEGORY && bCategory !== FEATURED_CATEGORY) return -1;
        if (bCategory === FEATURED_CATEGORY && aCategory !== FEATURED_CATEGORY) return 1;
        return aCategory.localeCompare(bCategory) || a.name.localeCompare(b.name);
      });
  }, [products, query, marketFilter, categoryFilter, showInactive]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const grouped = useMemo(() => {
    const map = new Map<string, ProductService[]>();
    for (const p of pageRows) {
      const key = p.category ?? 'Uncategorized';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return Array.from(map.entries());
  }, [pageRows]);

  const summary = useMemo(() => {
    const active = products.filter((product) => product.is_active);
    const priced = active.filter((product) => product.price_cents != null);
    return {
      active: active.length,
      inactive: products.length - active.length,
      categories: new Set(products.map((product) => product.category ?? 'Uncategorized')).size,
      packages: products.filter((product) => product.category === FEATURED_CATEGORY).length,
      averagePrice: priced.length
        ? Math.round(priced.reduce((sum, product) => sum + (product.price_cents ?? 0), 0) / priced.length)
        : null,
    };
  }, [products]);

  const updateFilter = (callback: () => void) => {
    callback();
    setPage(1);
  };

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
    <div className="mx-auto max-w-[1500px] space-y-5 px-5 py-7 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-[0.18em] text-gray-500">Admin · Sales</div>
          <PageTitle size="md">Products &amp; Services</PageTitle>
          <p className="mt-1 text-sm text-gray-600">Ad inventory, packages, and billable services used on invoices.</p>
        </div>
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded border border-orange-700 bg-orange-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-300"
        >
          <PackagePlus className="h-4 w-4" aria-hidden="true" />
          New item
        </button>
      </div>

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <section aria-label="Catalog summary" className="bg-white">
        <div className="grid grid-cols-2 divide-x divide-gray-200 lg:grid-cols-4">
          <div className="min-w-0 pr-4">
            <div className="text-lg font-semibold leading-tight text-gray-900">{summary.active.toLocaleString()}</div>
            <div className="mt-0.5 text-xs text-gray-600">active items</div>
          </div>
          <div className="min-w-0 px-4">
            <div className="text-lg font-semibold leading-tight text-gray-900">{summary.packages.toLocaleString()}</div>
            <div className="mt-0.5 truncate text-xs text-gray-600">print &amp; digital packages</div>
          </div>
          <div className="min-w-0 px-4">
            <div className="text-lg font-semibold leading-tight text-gray-900">{summary.categories.toLocaleString()}</div>
            <div className="mt-0.5 text-xs text-gray-600">categories</div>
          </div>
          <div className="min-w-0 pl-4">
            <div className="text-lg font-semibold leading-tight text-gray-900">{formatProductPrice(summary.averagePrice)}</div>
            <div className="mt-0.5 text-xs text-gray-600">average active price · {summary.inactive} inactive</div>
          </div>
        </div>
        <div className="mt-3 flex h-4 overflow-hidden rounded-sm bg-gray-200" aria-hidden="true">
          <div
            className="bg-orange-600"
            style={{ width: `${products.length ? (summary.active / products.length) * 100 : 0}%` }}
          />
          <div className="flex-1 bg-gray-300" />
        </div>
      </section>

      <section aria-label="Catalog filters" className="flex flex-wrap items-end gap-2">
        <label className="min-w-60 flex-1 space-y-1">
          <span className="block text-xs text-gray-500">Search catalog</span>
          <span className="relative block">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => updateFilter(() => setQuery(event.target.value))}
              placeholder="Search name, SKU, category, or account"
              className={`${CONTROL} w-full pl-9`}
            />
          </span>
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-gray-500">Market</span>
          <select aria-label="Market" value={marketFilter} onChange={(event) => updateFilter(() => setMarketFilter(event.target.value))} className={`${CONTROL} min-w-40`}>
            <option value="all">All markets</option>
            <option value="austin">Austin</option>
            <option value="san_antonio">San Antonio</option>
            <option value="both">Austin/San Antonio</option>
            <option value="none">General</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-gray-500">Category</span>
          <select aria-label="Category" value={categoryFilter} onChange={(event) => updateFilter(() => setCategoryFilter(event.target.value))} className={`${CONTROL} max-w-64`}>
            <option value="all">All categories</option>
            {categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
        </label>
        <label className="flex h-9 items-center gap-2 whitespace-nowrap px-1 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(event) => updateFilter(() => setShowInactive(event.target.checked))}
          />
          Show inactive
        </label>
      </section>

      <section className="overflow-hidden rounded border border-gray-200 bg-white shadow-sm">
        {grouped.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-sm font-medium text-gray-800">No products or services found</div>
            <p className="mt-1 text-xs text-gray-500">Try changing your search or filters.</p>
            <button type="button" onClick={() => setEditing('new')} className="mt-4 text-sm font-semibold text-orange-700 hover:underline">
              Create a new item
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] table-fixed text-left text-xs">
              <thead className="border-b border-gray-300 bg-white text-gray-700">
                <tr>
                  <th className="w-[32%] px-4 py-3 font-semibold">Name</th>
                  <th className="w-32 px-3 py-3 font-semibold">SKU</th>
                  <th className="w-36 px-3 py-3 font-semibold">Market</th>
                  <th className="w-32 px-3 py-3 font-semibold">Type</th>
                  <th className="w-28 px-3 py-3 text-right font-semibold">Price</th>
                  <th className="w-24 px-3 py-3 font-semibold">Status</th>
                  <th className="w-56 px-4 py-3 text-right font-semibold"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {grouped.map(([category, items]) => (
                  <Fragment key={category}>
                    <tr className="bg-gray-50">
                      <th colSpan={7} scope="colgroup" className="px-4 py-2 text-xs font-semibold text-gray-700">
                        {category} <span className="ml-1 font-normal text-gray-500">· {items.length} on this page</span>
                      </th>
                    </tr>
                    {items.map((product) => (
                      <tr key={product.id} className={`hover:bg-orange-50/40 ${!product.is_active ? 'bg-gray-50/60 text-gray-500' : ''}`}>
                        <td className="px-4 py-2.5">
                          <button
                            type="button"
                            onClick={() => setEditing(product)}
                            className="block max-w-full text-left font-medium text-orange-700 hover:underline"
                          >
                            <span className="block truncate">{product.name}</span>
                          </button>
                          {product.sales_description && <div className="mt-0.5 truncate text-xs text-gray-500" title={product.sales_description}>{product.sales_description}</div>}
                        </td>
                        <td className="truncate px-3 py-2.5 font-mono text-gray-600" title={product.sku ?? undefined}>{product.sku ?? '—'}</td>
                        <td className="px-3 py-2.5 text-gray-700">{marketLabel(product.market)}</td>
                        <td className="px-3 py-2.5 text-gray-700">{ITEM_TYPE_LABELS[product.item_type as ProductServiceType]}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold text-gray-900">{formatProductPrice(product.price_cents)}</td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${product.is_active ? 'text-gray-700' : 'text-gray-500'}`}>
                            <span className={`h-2 w-2 rounded-full ${product.is_active ? 'bg-emerald-600' : 'bg-gray-400'}`} />
                            {product.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right">
                          <button type="button" onClick={() => setEditing(product)} className="font-medium text-orange-700 hover:underline">Edit</button>
                          <button type="button" onClick={() => void handleToggleActive(product)} className="ml-3 font-medium text-orange-700 hover:underline">
                            {product.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                          <button type="button" onClick={() => void handleDelete(product)} className="ml-3 font-medium text-red-600 hover:underline">Delete</button>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-300 bg-gray-50 px-4 py-3 text-xs text-gray-700">
          <div className="font-semibold">
            Showing {filtered.length.toLocaleString()} of {products.length.toLocaleString()} items
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1">
              Rows
              <select
                value={pageSize}
                onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}
                className="rounded border border-gray-300 bg-white px-1 py-1"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
            <span>
              {filtered.length
                ? `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, filtered.length)} of ${filtered.length}`
                : '0 results'}
            </span>
            <button type="button" disabled={currentPage === 1} onClick={() => setPage(1)} className="rounded p-1 hover:bg-gray-200 disabled:opacity-40">First</button>
            <button type="button" aria-label="Previous page" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded p-1 hover:bg-gray-200 disabled:opacity-40">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" aria-label="Next page" disabled={currentPage === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} className="rounded p-1 hover:bg-gray-200 disabled:opacity-40">
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" disabled={currentPage === totalPages} onClick={() => setPage(totalPages)} className="rounded p-1 hover:bg-gray-200 disabled:opacity-40">Last</button>
          </div>
        </div>
      </section>

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
  const [incomeAccount, setIncomeAccount] = useState(
    existing ? (existing.income_account ?? '') : 'Advertising revenue',
  );
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
      const requestBody = existing ? sparsePatch(payload, {
        name: existing.name.trim(),
        sku: existing.sku?.trim() || null,
        item_type: existing.item_type,
        category: existing.category?.trim() || null,
        market: existing.market?.trim() || null,
        price_cents: existing.price_cents,
        income_account: existing.income_account?.trim() || null,
        sales_description: existing.sales_description?.trim() || null,
      }) : payload;
      if (existing && Object.keys(requestBody).length === 0) {
        onSaved();
        return;
      }
      const res = existing
        ? await fetch(`/api/admin/products-services/${existing.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody),
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
