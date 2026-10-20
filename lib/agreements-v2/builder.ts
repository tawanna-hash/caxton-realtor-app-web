// lib/agreements-v2/builder.ts
//
// Agreements (Beta) builder storage: autosaved drafts and templates, plus the
// per-agreement details the standard agreement record has no place for
// (intro override, note, expiry, reference fields, service descriptions).
// Own tables, created on first use. Nothing here touches live agreement tables.

import { getSql } from '@/lib/db';
import type { BuilderDoc } from '@/lib/agreements-v2/builder-doc';
import type { PaymentSettings, ServiceBilling } from '@/lib/agreements-v2/service-billing';

type Sql = ReturnType<typeof getSql>;

let ready = false;
async function ensure(sql: Sql) {
  if (ready) return;
  await sql`CREATE TABLE IF NOT EXISTS agreements_v2_builder_drafts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind text NOT NULL DEFAULT 'draft',
    name text NOT NULL DEFAULT '',
    doc jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS agreements_v2_meta (
    agreement_id uuid PRIMARY KEY,
    name text,
    intro text,
    note text,
    expires_at date,
    ask_address boolean NOT NULL DEFAULT false,
    refs jsonb NOT NULL DEFAULT '[]'::jsonb,
    services jsonb NOT NULL DEFAULT '[]'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now())`;
  await sql`ALTER TABLE agreements_v2_meta ADD COLUMN IF NOT EXISTS payment jsonb`;
  ready = true;
}

export type DraftRow = { id: string; kind: 'draft' | 'template'; name: string; updated_at: string };

export async function listDrafts(kind: 'draft' | 'template', sql: Sql = getSql()): Promise<DraftRow[]> {
  await ensure(sql);
  return await sql`SELECT id, kind, name, updated_at FROM agreements_v2_builder_drafts WHERE kind = ${kind} ORDER BY updated_at DESC LIMIT 100` as unknown as DraftRow[];
}

export async function getDraft(id: string, sql: Sql = getSql()): Promise<(DraftRow & { doc: BuilderDoc }) | null> {
  await ensure(sql);
  const rows = await sql`SELECT id, kind, name, doc, updated_at FROM agreements_v2_builder_drafts WHERE id = ${id}` as unknown as Array<DraftRow & { doc: BuilderDoc }>;
  return rows[0] ?? null;
}

export async function saveDraft(input: { id?: string | null; kind: 'draft' | 'template'; name: string; doc: BuilderDoc }, sql: Sql = getSql()): Promise<string> {
  await ensure(sql);
  const name = (input.name || input.doc.name || '').slice(0, 160);
  if (input.id) {
    const rows = await sql`UPDATE agreements_v2_builder_drafts SET name = ${name}, doc = ${JSON.stringify(input.doc)}::jsonb, updated_at = now() WHERE id = ${input.id} RETURNING id` as unknown as Array<{ id: string }>;
    if (rows[0]) return rows[0].id;
  }
  const rows = await sql`INSERT INTO agreements_v2_builder_drafts (kind, name, doc) VALUES (${input.kind}, ${name}, ${JSON.stringify(input.doc)}::jsonb) RETURNING id` as unknown as Array<{ id: string }>;
  return rows[0].id;
}

export async function deleteDraft(id: string, sql: Sql = getSql()): Promise<void> {
  await ensure(sql);
  await sql`DELETE FROM agreements_v2_builder_drafts WHERE id = ${id}`;
}

export type AgreementMeta = {
  name: string | null;
  intro: string | null;
  note: string | null;
  expires_at: string | null;
  ask_address: boolean;
  refs: Array<{ name: string; value: string; client_facing: boolean }>;
  services: Array<{ line_no: number; name: string; description: string; billing?: ServiceBilling }>;
  payment: PaymentSettings | null;
};

export async function getAgreementMeta(agreementId: string, sql: Sql = getSql()): Promise<AgreementMeta | null> {
  try {
    await ensure(sql);
    const rows = await sql`SELECT name, intro, note, to_char(expires_at, 'YYYY-MM-DD') AS expires_at, ask_address, refs, services, payment FROM agreements_v2_meta WHERE agreement_id = ${agreementId}` as unknown as AgreementMeta[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function saveAgreementMeta(agreementId: string, m: Partial<AgreementMeta>, sql: Sql = getSql()): Promise<void> {
  await ensure(sql);
  await sql`INSERT INTO agreements_v2_meta (agreement_id, name, intro, note, expires_at, ask_address, refs, services, payment)
    VALUES (${agreementId}, ${m.name ?? null}, ${m.intro ?? null}, ${m.note ?? null}, ${m.expires_at ?? null}, ${m.ask_address ?? false}, ${JSON.stringify(m.refs ?? [])}::jsonb, ${JSON.stringify(m.services ?? [])}::jsonb, ${m.payment ? JSON.stringify(m.payment) : null}::jsonb)
    ON CONFLICT (agreement_id) DO UPDATE SET name = EXCLUDED.name, intro = EXCLUDED.intro, note = EXCLUDED.note, expires_at = EXCLUDED.expires_at,
      ask_address = EXCLUDED.ask_address, refs = EXCLUDED.refs, services = EXCLUDED.services, payment = EXCLUDED.payment, updated_at = now()`;
}
