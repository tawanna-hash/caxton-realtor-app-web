// lib/server/payment-settings.ts
//
// Editable payment settings for Get Paid: processing fees and the Stripe
// Checkout options. Stored in row id 3 of agreements_v2_settings. Never throws
// on read: any failure falls back to the built-in defaults so payments keep working.

import { getSql } from '@/lib/db';
import { DEFAULT_FEE_CONFIG, setFeeConfig, type FeeConfig } from '@/lib/payment-processing-fees';

export type CheckoutSettings = {
  billing_address_collection: 'auto' | 'required';
  collect_phone: boolean;
  collect_names: boolean;
  require_terms: boolean;
  allow_promotion_codes: boolean;
  automatic_tax: boolean;
  submit_type: 'auto' | 'pay' | 'book' | 'donate';
  save_payment_method: boolean;
  background_color: string;
  button_color: string;
  font_family: 'inter' | 'default';
  border_style: 'rounded' | 'rectangular' | 'pill';
  logo_file_id: string;
};

export type PaymentSettings = { fees: FeeConfig; checkout: CheckoutSettings };

export const DEFAULT_CHECKOUT_SETTINGS: CheckoutSettings = {
  billing_address_collection: 'auto',
  collect_phone: true,
  collect_names: true,
  require_terms: true,
  allow_promotion_codes: false,
  automatic_tax: false,
  submit_type: 'auto',
  save_payment_method: true,
  background_color: '#ffffff',
  button_color: '#6205ad',
  font_family: 'inter',
  border_style: 'rounded',
  logo_file_id: 'file_1UVKNw91yhy0NZ59W2XMbWDC',
};

export const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = {
  fees: DEFAULT_FEE_CONFIG,
  checkout: DEFAULT_CHECKOUT_SETTINGS,
};

const num = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
const oneOf = <T extends string>(v: unknown, opts: readonly T[], fallback: T): T =>
  typeof v === 'string' && (opts as readonly string[]).includes(v) ? (v as T) : fallback;
const hex = (v: unknown, fallback: string) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim()) ? v.trim().toLowerCase() : fallback);
const round4 = (n: number) => Math.round(n * 10000) / 10000;

export function sanitizeSettings(input: unknown): PaymentSettings {
  const i = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const f = (i.fees && typeof i.fees === 'object' ? i.fees : {}) as Record<string, Record<string, unknown> | undefined>;
  const c = (i.checkout && typeof i.checkout === 'object' ? i.checkout : {}) as Record<string, unknown>;
  const D = DEFAULT_PAYMENT_SETTINGS;
  const logo = typeof c.logo_file_id === 'string' ? c.logo_file_id.trim() : D.checkout.logo_file_id;
  return {
    fees: {
      card: { percent: round4(num(f.card?.percent, 0, 20, D.fees.card.percent)) },
      ach: {
        percent: round4(num(f.ach?.percent, 0, 20, D.fees.ach.percent)),
        cap_cents: Math.round(num(f.ach?.cap_cents, 0, 100000, D.fees.ach.cap_cents)),
      },
      bnpl: {
        percent: round4(num(f.bnpl?.percent, 0, 20, D.fees.bnpl.percent)),
        fixed_cents: Math.round(num(f.bnpl?.fixed_cents, 0, 1000, D.fees.bnpl.fixed_cents)),
      },
    },
    checkout: {
      billing_address_collection: oneOf(c.billing_address_collection, ['auto', 'required'] as const, D.checkout.billing_address_collection),
      collect_phone: bool(c.collect_phone, D.checkout.collect_phone),
      collect_names: bool(c.collect_names, D.checkout.collect_names),
      require_terms: bool(c.require_terms, D.checkout.require_terms),
      allow_promotion_codes: bool(c.allow_promotion_codes, D.checkout.allow_promotion_codes),
      automatic_tax: bool(c.automatic_tax, D.checkout.automatic_tax),
      submit_type: oneOf(c.submit_type, ['auto', 'pay', 'book', 'donate'] as const, D.checkout.submit_type),
      save_payment_method: bool(c.save_payment_method, D.checkout.save_payment_method),
      background_color: hex(c.background_color, D.checkout.background_color),
      button_color: hex(c.button_color, D.checkout.button_color),
      font_family: oneOf(c.font_family, ['inter', 'default'] as const, D.checkout.font_family),
      border_style: oneOf(c.border_style, ['rounded', 'rectangular', 'pill'] as const, D.checkout.border_style),
      logo_file_id: logo === '' || /^file_[A-Za-z0-9]+$/.test(logo) ? logo : D.checkout.logo_file_id,
    },
  };
}

let tableReady = false;
async function ensure(sql: ReturnType<typeof getSql>) {
  if (tableReady) return;
  await sql`CREATE TABLE IF NOT EXISTS agreements_v2_settings (id integer PRIMARY KEY DEFAULT 1, value jsonb NOT NULL DEFAULT '{}'::jsonb, updated_at timestamptz NOT NULL DEFAULT now())`;
  tableReady = true;
}

let cache: { at: number; value: PaymentSettings } | null = null;
const TTL_MS = 15_000;

/** Loads saved settings (15s cache) and applies the fee config app-wide. Never throws. */
export async function loadPaymentSettings(force = false): Promise<PaymentSettings> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) {
    setFeeConfig(cache.value.fees);
    return cache.value;
  }
  let value = DEFAULT_PAYMENT_SETTINGS;
  try {
    const sql = getSql();
    await ensure(sql);
    const rows = (await sql`SELECT value FROM agreements_v2_settings WHERE id = 3`) as unknown as Array<{ value: unknown }>;
    if (rows[0]) value = sanitizeSettings(rows[0].value);
  } catch {
    if (cache) value = cache.value;
  }
  cache = { at: Date.now(), value };
  setFeeConfig(value.fees);
  return value;
}

export async function savePaymentSettings(input: unknown): Promise<PaymentSettings> {
  const sql = getSql();
  await ensure(sql);
  const v = sanitizeSettings(input);
  await sql`INSERT INTO agreements_v2_settings (id, value) VALUES (3, ${JSON.stringify(v)}::jsonb)
            ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
  cache = { at: Date.now(), value: v };
  setFeeConfig(v.fees);
  return v;
}

/**
 * Stripe Checkout Session parameters from the saved settings. Spread into
 * stripe.checkout.sessions.create(...). `hasCustomer` gates the saved-payment-method
 * option, which Stripe only accepts when a customer is attached.
 */
export async function checkoutSessionExtras(
  mode: 'payment' | 'setup',
  opts: { hasCustomer?: boolean } = {},
): Promise<Record<string, unknown>> {
  const { checkout: c } = await loadPaymentSettings();
  const out: Record<string, unknown> = {
    ui_mode: 'hosted_page',
    billing_address_collection: c.billing_address_collection,
    integration_identifier: 'hosted_mobile_app_0001',
    origin_context: 'mobile_app',
    branding_settings: {
      background_color: c.background_color,
      button_color: c.button_color,
      font_family: c.font_family,
      border_style: c.border_style,
      ...(c.logo_file_id ? { logo: { type: 'file', file: c.logo_file_id } } : {}),
    },
  };
  if (c.require_terms) out.consent_collection = { terms_of_service: 'required' };
  if (c.collect_names) out.name_collection = { individual: { enabled: true }, business: { enabled: true } };
  if (mode === 'payment') {
    if (c.collect_phone) out.phone_number_collection = { enabled: true };
    out.automatic_tax = { enabled: c.automatic_tax };
    out.allow_promotion_codes = c.allow_promotion_codes;
    out.submit_type = c.submit_type;
    if (opts.hasCustomer && c.save_payment_method) out.saved_payment_method_options = { payment_method_save: 'enabled' };
  }
  return out;
}
