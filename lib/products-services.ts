// lib/products-services.ts
//
// Types + helpers for the native `products_services` catalog used to
// populate invoice / recurring-schedule line items and
// to power the Products & Services admin manager.

export type ProductServiceType = 'service' | 'non_inventory' | 'inventory' | 'bundle';

export type ServiceOccurrence = 'on_demand' | 'one_time' | 'in_stages' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';
export type ServicePricing = 'fixed' | 'hourly' | 'unit' | 'range';
export const SERVICE_OCCURRENCE_LABELS: Record<ServiceOccurrence, string> = { on_demand: 'On demand', one_time: 'One-time', in_stages: 'In stages', weekly: 'Weekly', biweekly: 'Every two weeks', monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' };
export const SERVICE_PRICING_LABELS: Record<ServicePricing, string> = { fixed: 'Fixed price', hourly: 'Price per hour', unit: 'Price per unit', range: 'Price range' };

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
  billing_occurrence: ServiceOccurrence;
  pricing_type: ServicePricing;
  price_max_cents: number | null;
  discount_value: number | null;
  discount_unit: 'percent' | 'amount';
  billing_trigger: 'automatic' | 'manual';
  service_terms: string | null;
  reference_fields: string[];
  created_at: string;
  updated_at: string;
}

export const PRODUCT_SERVICE_PATCHABLE_FIELDS = [
  'name', 'sku', 'item_type', 'category', 'market',
  'price_cents', 'cost_cents',
  'income_account', 'expense_account',
  'sales_description', 'purchase_description',
  'is_active',
  'billing_occurrence', 'pricing_type', 'price_max_cents', 'discount_value', 'discount_unit',
  'billing_trigger', 'service_terms', 'reference_fields',
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
