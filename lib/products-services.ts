// lib/products-services.ts
//
// Types + helpers for the `products_services` table — a QuickBooks-style
// item list used to populate invoice / recurring-schedule line items and
// to power the Products & Services admin manager.

export type ProductServiceType = 'service' | 'non_inventory' | 'inventory' | 'bundle';

export interface ProductService {
  id: string;
  name: string;
  sku: string | null;
  item_type: ProductServiceType;
  category: string | null;
  market: string | null; // 'austin' | 'san_antonio' | 'both' | null
  price_cents: number | null;
  cost_cents: number | null;
  income_account: string | null;
  expense_account: string | null;
  sales_description: string | null;
  purchase_description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const PRODUCT_SERVICE_PATCHABLE_FIELDS = [
  'name', 'sku', 'item_type', 'category', 'market',
  'price_cents', 'cost_cents',
  'income_account', 'expense_account',
  'sales_description', 'purchase_description',
  'is_active',
] as const;

export const PRODUCT_SERVICE_TYPE_VALUES = new Set<ProductServiceType>([
  'service', 'non_inventory', 'inventory', 'bundle',
]);

/** Infer market from a "Austin - ..." / "Austin/San Antonio - ..." / "San Antonio - ..." name prefix. */
export function inferMarketFromName(name: string): string | null {
  if (name.startsWith('Austin/San Antonio')) return 'both';
  if (name.startsWith('Austin')) return 'austin';
  if (name.startsWith('San Antonio')) return 'san_antonio';
  return null;
}

export function formatProductPrice(cents: number | null): string {
  if (cents == null) return 'Varies';
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const ITEM_TYPE_LABELS: Record<ProductServiceType, string> = {
  service: 'Service',
  non_inventory: 'Non-inventory',
  inventory: 'Inventory',
  bundle: 'Bundle',
};
