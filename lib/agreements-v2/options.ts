// lib/agreements-v2/options.ts
//
// Agreements (Beta): packages (Option 1 / Option 2) and optional services.
// Before signing, the client picks one package and may decline optional
// services. Applying the choice removes every other line from the agreement and
// recomputes the totals, so payment, billing and signing see an ordinary
// single-package agreement from then on.

import type { getSql } from '@/lib/db';
import { getAgreementMeta, saveAgreementMeta } from '@/lib/agreements-v2/builder';

type Sql = ReturnType<typeof getSql>;

export type ChoiceResult = { ok: true; kept: number } | { ok: false; error: string; status: number };

export async function applyChoice(sql: Sql, agreementId: string, choice: { option?: number; declined?: number[] }): Promise<ChoiceResult> {
  const ag = (await sql`SELECT id, signed_at, payment_mode FROM agreements WHERE id = ${agreementId}`) as unknown as Array<{ id: string; signed_at: string | null; payment_mode: string | null }>;
  if (!ag[0]) return { ok: false, error: 'not found', status: 404 };
  if (ag[0].signed_at) return { ok: false, error: 'This agreement is already signed.', status: 409 };
  const meta = await getAgreementMeta(agreementId, sql);
  if (!meta) return { ok: false, error: 'This agreement has no choices to make.', status: 400 };

  const lines = (await sql`SELECT line_no, amount_cents, unit_cents, ad_size, frequency, start_date, end_date FROM agreement_line_items WHERE agreement_id = ${agreementId} ORDER BY line_no`) as unknown as Array<{ line_no: number; amount_cents: number; unit_cents: number; ad_size: string | null; frequency: string | null; start_date: string | null; end_date: string | null }>;
  const all = lines.map((l) => l.line_no);
  let keep = [...all];

  const options = meta.options ?? [];
  if (options.length > 1) {
    const o = options[Math.floor(Number(choice.option))];
    if (!o) return { ok: false, error: 'Please choose one of the packages.', status: 400 };
    keep = keep.filter((n) => o.line_nos.includes(n));
  }
  const optional = new Set(meta.services.filter((s) => s.optional).map((s) => s.line_no));
  const declined = (choice.declined ?? []).map(Number).filter((n) => keep.includes(n));
  for (const n of declined) if (!optional.has(n)) return { ok: false, error: 'That service is required.', status: 400 };
  keep = keep.filter((n) => !declined.includes(n));
  if (keep.length === 0) return { ok: false, error: 'At least one service must stay on the agreement.', status: 400 };

  const removed = all.filter((n) => !keep.includes(n));
  if (removed.length) {
    await sql`DELETE FROM agreement_line_items WHERE agreement_id = ${agreementId} AND line_no = ANY(${removed}::int[])`;
    const left = lines.filter((l) => keep.includes(l.line_no));
    const total = left.reduce((n, l) => n + l.amount_cents, 0);
    const starts = left.map((l) => l.start_date).filter(Boolean).map(String).sort();
    const ends = left.map((l) => l.end_date).filter(Boolean).map(String).sort();
    await sql`UPDATE agreements SET amount_cents = ${total}, ad_rate_cents = ${left[0].unit_cents}, ad_size = ${left[0].ad_size}, frequency = ${left[0].frequency},
      start_date = COALESCE(${starts[0] ?? null}::date, start_date), end_date = COALESCE(${ends[ends.length - 1] ?? null}::date, end_date), updated_at = NOW() WHERE id = ${agreementId}`;
    // The draft invoice lists one line per agreement line, in order.
    const inv = (await sql`SELECT id, line_items FROM invoices WHERE agreement_id = ${agreementId} AND status = 'draft' ORDER BY created_at LIMIT 1`) as unknown as Array<{ id: string; line_items: unknown[] }>;
    if (inv[0] && Array.isArray(inv[0].line_items) && inv[0].line_items.length === all.length) {
      const items = inv[0].line_items.filter((_, i) => keep.includes(all[i]));
      await sql`UPDATE invoices SET line_items = ${JSON.stringify(items)}::jsonb, amount_cents = ${total}, updated_at = NOW() WHERE id = ${inv[0].id}`;
    }
  }

  await saveAgreementMeta(agreementId, {
    ...meta,
    options: options.length > 1 ? [options[Math.floor(Number(choice.option))]] : meta.options,
    services: meta.services.filter((s) => keep.includes(s.line_no)).map((s) => ({ ...s, optional: false })),
  }, sql);
  return { ok: true, kept: keep.length };
}
