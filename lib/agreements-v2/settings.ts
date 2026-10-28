// lib/agreements-v2/settings.ts
//
// Agreements (Beta): default settings and agreement templates. Own tables,
// created lazily; nothing in the live agreement flow reads them.

import { PUBLICATION_LABELS, type PublicationId } from '@/lib/publications';
import { getSql } from '@/lib/db';

type Sql = ReturnType<typeof getSql>;

/** 'start' = same day as the agreement start date, or a fixed day 1-28. */
export type BillingDay = 'start' | number;

export type AgreementDefaults = {
  due_days: number;
  billing_day: BillingDay;
  proposal_expiry_days: number | null;
  intro_new: string;
  intro_renewal: string;
};

export const DEFAULT_INTRO_NEW =
  'Welcome to {market}! We\u2019re excited to partner with you and promote your business to our real estate community. This Print Advertising Agreement outlines your selected publication(s), ad placement, issue schedule, pricing, and payment terms. Thank you for choosing {market}\u2014we look forward to supporting your marketing goals and building a lasting partnership.';
export const DEFAULT_INTRO_RENEWAL =
  'Thank you for continuing your advertising partnership with {market}. This Print Advertising Renewal Agreement outlines your selected publication(s), advertising placement, insertion schedule, rates, and payment terms for the upcoming advertising period.';

export const FALLBACK_DEFAULTS: AgreementDefaults = {
  due_days: 20,
  billing_day: 'start',
  proposal_expiry_days: null,
  intro_new: DEFAULT_INTRO_NEW,
  intro_renewal: DEFAULT_INTRO_RENEWAL,
};

export type AgreementTemplate = {
  id: string;
  name: string;
  ad_size: string | null;
  frequency: string | null;
  ad_rate_cents: number | null;
  updated_at: string;
};

let ready = false;
async function ensure(sql: Sql) {
  if (ready) return;
  await sql`CREATE TABLE IF NOT EXISTS agreements_v2_settings (id integer PRIMARY KEY DEFAULT 1, value jsonb NOT NULL DEFAULT '{}'::jsonb, updated_at timestamptz NOT NULL DEFAULT now())`;
  // Saved rates were retired; drop their table.
  await sql`DROP TABLE IF EXISTS agreements_v2_templates`;
  ready = true;
}

function parseBillingDay(v: unknown): BillingDay {
  if (v === 'first') return 1;
  if (v === 'fifteenth') return 15;
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 28 ? n : 'start';
}

export function sanitizeDefaults(input: Record<string, unknown>): AgreementDefaults {
  const base = FALLBACK_DEFAULTS;
  const due = Number(input.due_days);
  const exp = input.proposal_expiry_days;
  const expN = exp === null || exp === '' || exp === undefined ? null : Number(exp);
  return {
    due_days: Number.isInteger(due) && due >= 0 && due <= 120 ? due : base.due_days,
    billing_day: parseBillingDay(input.billing_day),
    proposal_expiry_days: expN !== null && Number.isInteger(expN) && expN > 0 && expN <= 365 ? expN : null,
    intro_new: typeof input.intro_new === 'string' && input.intro_new.trim() ? input.intro_new.trim().slice(0, 1200) : base.intro_new,
    intro_renewal: typeof input.intro_renewal === 'string' && input.intro_renewal.trim() ? input.intro_renewal.trim().slice(0, 1200) : base.intro_renewal,
  };
}

/** Never throws: falls back to built-in defaults so emails and billing keep working. */
export async function getDefaults(sql: Sql = getSql()): Promise<AgreementDefaults> {
  try {
    await ensure(sql);
    const rows = await sql`SELECT value FROM agreements_v2_settings WHERE id = 1` as unknown as Array<{ value: Record<string, unknown> }>;
    return sanitizeDefaults(rows[0]?.value ?? {});
  } catch {
    return FALLBACK_DEFAULTS;
  }
}

export async function saveDefaults(input: Record<string, unknown>, sql: Sql = getSql()): Promise<AgreementDefaults> {
  await ensure(sql);
  const v = sanitizeDefaults(input);
  await sql`INSERT INTO agreements_v2_settings (id, value) VALUES (1, ${JSON.stringify(v)}::jsonb)
            ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
  return v;
}

/** Fill {first_name}, {company} and {market} in an intro message. */
export function renderIntro(text: string, ag: { rep_name?: string | null; company_name?: string | null; publication?: string | null }): string {
  const first = (ag.rep_name ?? '').trim().split(/\s+/)[0] || 'there';
  const market = ag.publication && ag.publication in PUBLICATION_LABELS ? PUBLICATION_LABELS[ag.publication as PublicationId] : 'RealtyLine';
  return text.replace(/\{first_name\}/g, first).replace(/\{company\}/g, ag.company_name ?? 'your company').replace(/\{market\}/g, market);
}

/* ---------- Notification settings ---------- */

export const NOTIFICATION_EVENTS = [
  { key: 'client_new_partner_invite', audience: 'client', label: 'Agreement sent to a new partner', recipients: 'Partner contact' },
  { key: 'client_renewal_invite', audience: 'client', label: 'Renewal link sent', recipients: 'Partner contact' },
  { key: 'client_renewal_reminder', audience: 'client', label: 'Renewal reminder (7, 3 and 1 day before expiry)', recipients: 'Partner contact' },
  { key: 'team_check_request', audience: 'team', label: 'A partner asks to pay by check (needs your approval)', recipients: 'You' },
] as const;
export type NotificationKey = (typeof NOTIFICATION_EVENTS)[number]['key'];
export type NotificationSettings = Record<NotificationKey, boolean>;

function defaultNotifications(): NotificationSettings {
  return Object.fromEntries(NOTIFICATION_EVENTS.map((e) => [e.key, true])) as NotificationSettings;
}

/** Stored in row id 2 of agreements_v2_settings. Never throws: everything defaults to on. */
export async function getNotifications(sql: Sql = getSql()): Promise<NotificationSettings> {
  const out = defaultNotifications();
  try {
    await ensure(sql);
    const rows = (await sql`SELECT value FROM agreements_v2_settings WHERE id = 2`) as Array<{ value: Record<string, unknown> }>;
    const v = rows[0]?.value ?? {};
    for (const e of NOTIFICATION_EVENTS) if (typeof v[e.key] === 'boolean') out[e.key] = v[e.key] as boolean;
  } catch { /* defaults */ }
  return out;
}

export async function saveNotifications(input: Record<string, unknown>, sql: Sql = getSql()): Promise<NotificationSettings> {
  await ensure(sql);
  const current = await getNotifications(sql);
  for (const e of NOTIFICATION_EVENTS) if (typeof input[e.key] === 'boolean') current[e.key] = input[e.key] as boolean;
  await sql`INSERT INTO agreements_v2_settings (id, value, updated_at) VALUES (2, ${JSON.stringify(current)}::jsonb, now())
    ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
  return current;
}
