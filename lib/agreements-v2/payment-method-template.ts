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
  // No agreement (client without one): drop the Agreement line and agreement wording.
  const body = fields.agreement_name_or_number?.trim()
    ? PAYMENT_METHOD_BODY
    : PAYMENT_METHOD_BODY
        .replace('Agreement: {{agreement_name_or_number}}\n', '')
        .replace('in your advertising agreement.', 'stated below.')
        .replace('for payments under agreement {{agreement_name_or_number}}, according to', 'for my advertising payments, according to');
  return { brand: b, from: `Tawanna Verock <${b.sender_email}>`, subject: fill(PAYMENT_METHOD_SUBJECT), body: fill(body) };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Branded HTML email: real button for the setup link, market brand in header and footer. */
export function renderPaymentMethodHtml(market: string | null | undefined, fields: PaymentMethodFields = {}) {
  const r = renderPaymentMethodTemplate(market, fields);
  const b = r.brand;
  const v = (k: keyof PaymentMethodFields) => (fields[k]?.trim() ? esc(fields[k]!.trim()) : `{{${k}}}`);
  const hasAg = !!fields.agreement_name_or_number?.trim();
  const url = fields.payment_setup_url?.trim();
  const safeUrl = url && /^https:\/\//i.test(url) ? esc(url) : '';
  const p = 'margin:0 0 16px;font-size:15px;line-height:1.6;color:#16132D;';
  const row = (label: string, val: string) => `<tr><td width="150" style="width:150px;padding:6px 12px 6px 0;font-size:14px;color:#4E4B66;white-space:nowrap;vertical-align:top;">${label}</td><td style="padding:6px 0;font-size:14px;color:#16132D;font-weight:600;">${val}</td></tr>`;
  const button = safeUrl
    ? `<a href="${safeUrl}" style="display:inline-block;background:#301D5D;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 28px;border-radius:10px;">Securely Add Payment Method</a>`
    : `<span style="display:inline-block;background:#301D5D;color:#ffffff;font-weight:600;font-size:15px;padding:14px 28px;border-radius:10px;opacity:.85;">Securely Add Payment Method</span><div style="margin-top:8px;font-size:12px;color:#4E4B66;">Setup link: {{payment_setup_url}}</div>`;
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#F3F4F7;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F7;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;">
<tr><td style="background:#301D5D;padding:22px 28px;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.01em;">${esc(b.brand)}</td></tr>
<tr><td style="padding:28px;">
<p style="${p}">Hi ${v('client_first_name')},</p>
<p style="${p}">Please add your preferred payment method for your ${esc(b.brand)} advertising account using the secure button below.</p>
<p style="${p}">You will not be charged during this setup. Future payments will follow the amounts and billing schedule ${hasAg ? 'in your advertising agreement' : 'stated below'}.</p>
<div style="margin:24px 0;text-align:center;">${button}</div>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border-top:1px solid #E2DFEC;border-bottom:1px solid #E2DFEC;width:100%;padding:8px 0;">
${hasAg ? row('Agreement', v('agreement_name_or_number')) : ''}${row('Payment amount', v('payment_terms'))}${row('Billing schedule', v('billing_schedule'))}
</table>
<p style="${p}">Please don't email your card or bank account details. Use the secure setup page instead.</p>
<div style="margin:0 0 20px;padding:14px 16px;background:#EEE8FD;border-radius:10px;font-size:13px;line-height:1.6;color:#16132D;"><strong>Authorization</strong><br>I authorize ${esc(b.brand)} to save my selected payment method and use it for ${hasAg ? `payments under agreement ${v('agreement_name_or_number')}` : 'my advertising payments'}, according to the payment amount or calculation and billing schedule stated above. To change my payment method or revoke authorization for future charges, I will contact <a href="mailto:${b.billing_contact_email}" style="color:#301D5D;">${b.billing_contact_email}</a>.</div>
<p style="margin:0;font-size:15px;line-height:1.6;color:#16132D;">Thank you,<br>Tawanna Verock<br>${esc(b.brand)}</p>
</td></tr>
<tr><td style="padding:16px 28px;background:#ffffff;border-top:1px solid #E2DFEC;font-size:12px;color:#4E4B66;"><a href="mailto:${b.sender_email}" style="color:#4E4B66;">${b.sender_email}</a> · <a href="https://${b.domain}" style="color:#4E4B66;">${b.domain}</a></td></tr>
</table></td></tr></table></body></html>`;
  return { ...r, html };
}
