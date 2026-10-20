// lib/agreements-v2/settings.ts
//
// Agreements (Beta): default settings and agreement templates. Own tables,
// created lazily; nothing in the live agreement flow reads them.

import { getSql } from '@/lib/db';

type Sql = ReturnType<typeof getSql>;

export type BillingDay = 'start' | 'first' | 'fifteenth';

export type AgreementDefaults = {
  due_days: number;
  billing_day: BillingDay;
  proposal_expiry_days: number | null;
  intro_new: string;
  intro_renewal: string;
};

export const DEFAULT_INTRO_NEW =
  'Your advertising agreement is ready. Review the details, choose how to pay, and sign. It takes about two minutes.';
export const DEFAULT_INTRO_RENEWAL =
  'Your advertising agreement is coming up for renewal. We pre-filled everything, so renewing takes about a minute.';

export const FALLBACK_DEFAULTS: AgreementDefaults = {
  due_days: 15,
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
  await sql`CREATE TABLE IF NOT EXISTS agreements_v2_templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    ad_size text,
    frequency text,
    ad_rate_cents integer,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now())`;
  ready = true;
}

export function sanitizeDefaults(input: Record<string, unknown>): AgreementDefaults {
  const base = FALLBACK_DEFAULTS;
  const due = Number(input.due_days);
  const exp = input.proposal_expiry_days;
  const expN = exp === null || exp === '' || exp === undefined ? null : Number(exp);
  return {
    due_days: Number.isInteger(due) && due >= 0 && due <= 120 ? due : base.due_days,
    billing_day: input.billing_day === 'first' || input.billing_day === 'fifteenth' ? input.billing_day : 'start',
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

/** Fill {first_name} and {company} in an intro message. */
export function renderIntro(text: string, ag: { rep_name?: string | null; company_name?: string | null }): string {
  const first = (ag.rep_name ?? '').trim().split(/\s+/)[0] || 'there';
  return text.replace(/\{first_name\}/g, first).replace(/\{company\}/g, ag.company_name ?? 'your company');
}

export async function listTemplates(sql: Sql = getSql()): Promise<AgreementTemplate[]> {
  await ensure(sql);
  return await sql`SELECT id, name, ad_size, frequency, ad_rate_cents, updated_at FROM agreements_v2_templates ORDER BY updated_at DESC` as unknown as AgreementTemplate[];
}

export async function createTemplate(
  t: { name: string; ad_size?: string | null; frequency?: string | null; ad_rate_cents?: number | null },
  sql: Sql = getSql(),
): Promise<AgreementTemplate> {
  await ensure(sql);
  const rows = await sql`INSERT INTO agreements_v2_templates (name, ad_size, frequency, ad_rate_cents)
    VALUES (${t.name}, ${t.ad_size ?? null}, ${t.frequency ?? null}, ${t.ad_rate_cents ?? null})
    RETURNING id, name, ad_size, frequency, ad_rate_cents, updated_at` as unknown as AgreementTemplate[];
  return rows[0];
}

export async function deleteTemplate(id: string, sql: Sql = getSql()): Promise<void> {
  await ensure(sql);
  await sql`DELETE FROM agreements_v2_templates WHERE id = ${id}`;
}
