'use client';

import { useEffect, useMemo, useState } from 'react';
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

  useEffect(() => {
    fetch('/api/admin/products-services?active=1', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : { products: [] })
      .then((data) => setProducts(data.products ?? []))
      .catch(() => setProducts([]));
  }, []);

  const matches = useMemo(() => {
    const query = value.trim().toLowerCase();
    if (!query) return products.slice(0, 8);
    return products
      .filter((item) =>
        item.name.toLowerCase().includes(query)
        || (item.sales_description ?? '').toLowerCase().includes(query)
        || (item.category ?? '').toLowerCase().includes(query)
        || (item.sku ?? '').toLowerCase().includes(query))
      .slice(0, 8);
  }, [products, value]);

  return (
    <div className={`relative ${className}`}>
      <input
        className={INPUT}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
      />
      {open && matches.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-64 overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-xl">
          {matches.map((item) => (
            <button
              type="button"
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
