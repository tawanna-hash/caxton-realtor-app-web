// Built-in "Payment Method Setup" email template for Templates (Beta).
//
// The company name, sender, domain and billing contact are chosen by the
// client's market. A missing or unknown market falls back to Austin
// (RealtyLine), matching the app-wide RealtyLine fallback.

export type TemplateMarket = 'austin' | 'san_antonio';

export type MarketBrand = {
  market: TemplateMarket;
  label: string;
  brand: string;
  domain: string;
  sender_email: string;
  billing_contact_email: string;
};

export const MARKET_BRANDS: Record<TemplateMarket, MarketBrand> = {
  austin: {
    market: 'austin',
    label: 'Austin',
    brand: 'RealtyLine Austin',
    domain: 'realtyline.us',
    sender_email: 'tawanna@myrealtyline.com',
    billing_contact_email: 'tawanna@myrealtyline.com',
  },
  san_antonio: {
    market: 'san_antonio',
    label: 'San Antonio',
    brand: 'Newsline San Antonio',
    domain: 'newslinesa.com',
    sender_email: 'tawanna@newslinesa.com',
    billing_contact_email: 'tawanna@newslinesa.com',
  },
};

export function brandForMarket(market: string | null | undefined): MarketBrand {
  const m = (market ?? '').toLowerCase().replace(/[\s-]+/g, '_');
  if (m === 'san_antonio' || m === 'sa' || m === 'newsline' || m === 'sabor') return MARKET_BRANDS.san_antonio;
  return MARKET_BRANDS.austin;
}

export const PAYMENT_METHOD_TEMPLATE_ID = 'builtin-payment-method-setup';
export const PAYMENT_METHOD_TEMPLATE_NAME = 'Payment Method Setup';

export const PAYMENT_METHOD_SUBJECT = 'Add your payment method — {{BRAND}}';

export const PAYMENT_METHOD_BODY = `Hi {{client_first_name}},

Please add your preferred payment method for your {{BRAND}} advertising account using the secure button below.

You will not be charged during this setup. Future payments will follow the amounts and billing schedule in your advertising agreement.

[Securely Add Payment Method] {{payment_setup_url}}

Agreement: {{agreement_name_or_number}}
Payment amount or calculation: {{payment_terms}}
Billing schedule: {{billing_schedule}}

Please don't email your card or bank account details. Use the secure setup page instead.

Authorization:
I authorize {{BRAND}} to save my selected payment method and use it for payments under agreement {{agreement_name_or_number}}, according to the payment amount or calculation and billing schedule stated above. To change my payment method or revoke authorization for future charges, I will contact {{BILLING_CONTACT_EMAIL}}.

Thank you,
Tawanna Verock
{{BRAND}}
{{SENDER_EMAIL}} · {{BRAND_DOMAIN}}`;

export type PaymentMethodFields = {
  client_first_name?: string;
  agreement_name_or_number?: string;
  payment_terms?: string;
  billing_schedule?: string;
  payment_setup_url?: string;
};

/** Fill market tokens always; client fields only when provided (blank keeps the placeholder). */
export function renderPaymentMethodTemplate(market: string | null | undefined, fields: PaymentMethodFields = {}) {
  const b = brandForMarket(market);
  const vals: Record<string, string> = {
    BRAND: b.brand,
    BRAND_DOMAIN: b.domain,
    SENDER_EMAIL: b.sender_email,
    BILLING_CONTACT_EMAIL: b.billing_contact_email,
  };
  for (const [k, v] of Object.entries(fields)) if (typeof v === 'string' && v.trim()) vals[k] = v.trim();
  const fill = (s: string) => s.replace(/\{\{\s*([A-Za-z_]+)\s*\}\}/g, (all, k: string) => vals[k] ?? all);
  return { brand: b, from: `Tawanna Verock <${b.sender_email}>`, subject: fill(PAYMENT_METHOD_SUBJECT), body: fill(PAYMENT_METHOD_BODY) };
}
