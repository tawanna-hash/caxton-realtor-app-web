'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import type { ProductService } from '@/lib/products-services';
import { formatCents } from '@/lib/invoices';
import { INPUT } from './constants';

export function ProductServiceSearch({
  value,
  onChange,
  onSelect,
  className = '',
  placeholder = 'Start typing a product or service',
}: {
  value: string;
  onChange: (value: string) => void;
  onSelect: (item: ProductService) => void;
  className?: string;
  placeholder?: string;
}) {
  const [products, setProducts] = useState<ProductService[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const listboxId = useId();

  useEffect(() => {
    fetch('/api/admin/products-services?active=1', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error ?? 'Products and services could not be loaded.');
        }
        return response.json();
      })
      .then((data) => setProducts(data.products ?? []))
      .catch((error) => {
        setProducts([]);
        setLoadError(error instanceof Error ? error.message : 'Products and services could not be loaded.');
      })
      .finally(() => setLoading(false));
  }, []);

  const matches = useMemo(() => {
    const query = value.trim().toLowerCase();
    if (!query) return products.slice(0, 8);
    const tokens = query.split(/\s+/).filter(Boolean);
    return products
      .filter((item) => {
        const searchable = [
          item.name,
          item.sales_description,
          item.category,
          item.sku,
          item.market,
        ].filter(Boolean).join(' ').toLowerCase();
        return tokens.every((token) => searchable.includes(token));
      })
      .slice(0, 8);
  }, [products, value]);

  return (
    <div className={`relative ${className}`}>
      <input
        className={INPUT}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={listboxId}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
      />
      {open && (
        <div id={listboxId} role="listbox" className="absolute left-0 right-0 top-full z-[70] mt-1 max-h-64 overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-xl">
          {loading && <div className="px-3 py-3 text-sm text-gray-500">Loading products and services…</div>}
          {!loading && loadError && <div className="px-3 py-3 text-sm text-red-600">{loadError}</div>}
          {!loading && !loadError && matches.length === 0 && (
            <div className="px-3 py-3 text-sm text-gray-500">No matching product or service.</div>
          )}
          {!loading && !loadError && matches.map((item) => (
            <button
              type="button"
              role="option"
              aria-selected="false"
              key={item.id}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onSelect(item);
                setOpen(false);
              }}
              className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left hover:bg-gray-50"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-gray-900">{item.name}</span>
                <span className="block truncate text-xs text-gray-500">{item.category ?? item.sales_description ?? 'Service'}</span>
              </span>
              <span className="shrink-0 text-sm font-medium text-gray-700">{formatCents(item.price_cents)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
