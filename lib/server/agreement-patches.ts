// lib/server/agreement-patches.ts
//
// Shared, allowlisted patch logic for the public sign portal. Used by:
//   - /api/sign/[token]            (PATCH autosave + sign-time applyPatches)
//   - /api/sign/[token]/approve    (proposal approval — apply last-second IO edits)
//
// The advertiser may only touch insertion-order / billing reference fields
// via the portal — never status, amounts beyond the rate, or ownership.

import type { getSql } from '@/lib/db';

type Sql = ReturnType<typeof getSql>;

// Fields the advertiser is allowed to update via the portal — strings / null
export const SIGN_PATCHABLE_STR = new Set([
  'company_name', 'rep_name', 'advertiser_email', 'advertiser_phone',
  'address', 'city', 'state', 'zip',
  'ad_size', 'frequency', 'page_position',
  'bill_to', 'billing_email', 'billing_contact_name', 'billing_contact_phone',
  'payment_mode', 'card_type', 'cardholder_name', 'card_number_last4',
  'card_expiration', 'cardholder_address',
]);

// Integer cents fields
export const SIGN_PATCHABLE_INT = new Set([
  'ad_rate_cents', 'discount_cents', 'ad_premium_cents', 'total_monthly_rate_cents',
]);

// Date fields (YYYY-MM-DD)
export const SIGN_PATCHABLE_DATE = new Set(['exp_date', 'start_date', 'end_date']);

// JSON object fields
export const SIGN_PATCHABLE_JSON = new Set(['ad_timing_months']);

const MAX_CENTS = 100_000_000;

export async function applyPatches(
  sql: Sql,
  id: string,
  body: Record<string, unknown>,
): Promise<void> {
  for (const field of Object.keys(body)) {
    const val = body[field];

    if (SIGN_PATCHABLE_STR.has(field)) {
      if (typeof val !== 'string' && val !== null) continue;
      const v = val as string | null;
      switch (field) {
        case 'company_name':          await sql`UPDATE agreements SET company_name          = ${v} WHERE id = ${id}`; break;
        case 'rep_name':              await sql`UPDATE agreements SET rep_name              = ${v} WHERE id = ${id}`; break;
        case 'advertiser_email':      await sql`UPDATE agreements SET advertiser_email      = ${v} WHERE id = ${id}`; break;
        case 'advertiser_phone':      await sql`UPDATE agreements SET advertiser_phone      = ${v} WHERE id = ${id}`; break;
        case 'address':               await sql`UPDATE agreements SET address               = ${v} WHERE id = ${id}`; break;
        case 'city':                  await sql`UPDATE agreements SET city                  = ${v} WHERE id = ${id}`; break;
        case 'state':                 await sql`UPDATE agreements SET state                 = ${v} WHERE id = ${id}`; break;
        case 'zip':                   await sql`UPDATE agreements SET zip                   = ${v} WHERE id = ${id}`; break;
        case 'ad_size':               await sql`UPDATE agreements SET ad_size               = ${v} WHERE id = ${id}`; break;
        case 'frequency':             await sql`UPDATE agreements SET frequency             = ${v} WHERE id = ${id}`; break;
        case 'page_position':         await sql`UPDATE agreements SET page_position         = ${v} WHERE id = ${id}`; break;
        case 'bill_to':               await sql`UPDATE agreements SET bill_to               = ${v} WHERE id = ${id}`; break;
        case 'billing_email':         await sql`UPDATE agreements SET billing_email         = ${v} WHERE id = ${id}`; break;
        case 'billing_contact_name':  await sql`UPDATE agreements SET billing_contact_name  = ${v} WHERE id = ${id}`; break;
        case 'billing_contact_phone': await sql`UPDATE agreements SET billing_contact_phone = ${v} WHERE id = ${id}`; break;
        case 'payment_mode':          await sql`UPDATE agreements SET payment_mode          = ${v} WHERE id = ${id}`; break;
        case 'card_type':             await sql`UPDATE agreements SET card_type             = ${v} WHERE id = ${id}`; break;
        case 'cardholder_name':       await sql`UPDATE agreements SET cardholder_name       = ${v} WHERE id = ${id}`; break;
        case 'card_number_last4':     await sql`UPDATE agreements SET card_number_last4     = ${v} WHERE id = ${id}`; break;
        case 'card_expiration':       await sql`UPDATE agreements SET card_expiration       = ${v} WHERE id = ${id}`; break;
        case 'cardholder_address':    await sql`UPDATE agreements SET cardholder_address    = ${v} WHERE id = ${id}`; break;
      }

    } else if (SIGN_PATCHABLE_INT.has(field)) {
      if (val === null) {
        switch (field) {
          case 'ad_rate_cents':            await sql`UPDATE agreements SET ad_rate_cents            = NULL WHERE id = ${id}`; break;
          case 'discount_cents':           await sql`UPDATE agreements SET discount_cents           = NULL WHERE id = ${id}`; break;
          case 'ad_premium_cents':         await sql`UPDATE agreements SET ad_premium_cents         = NULL WHERE id = ${id}`; break;
          case 'total_monthly_rate_cents': await sql`UPDATE agreements SET total_monthly_rate_cents = NULL WHERE id = ${id}`; break;
        }
        continue;
      }
      if (typeof val !== 'number' || !Number.isInteger(val) || val < 0 || val > MAX_CENTS) continue;
      const n = val;
      switch (field) {
        case 'ad_rate_cents':            await sql`UPDATE agreements SET ad_rate_cents            = ${n} WHERE id = ${id}`; break;
        case 'discount_cents':           await sql`UPDATE agreements SET discount_cents           = ${n} WHERE id = ${id}`; break;
        case 'ad_premium_cents':         await sql`UPDATE agreements SET ad_premium_cents         = ${n} WHERE id = ${id}`; break;
        case 'total_monthly_rate_cents': await sql`UPDATE agreements SET total_monthly_rate_cents = ${n} WHERE id = ${id}`; break;
      }

    } else if (SIGN_PATCHABLE_DATE.has(field)) {
      if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
        if (field === 'exp_date') await sql`UPDATE agreements SET exp_date = ${val} WHERE id = ${id}`;
        // start_date/end_date are advertiser-chosen placement dates (Step 3);
        // guard against print agreements, which use their own anchor math.
        else if (field === 'start_date') await sql`UPDATE agreements SET start_date = ${val} WHERE id = ${id} AND type <> 'print_ad'`;
        else if (field === 'end_date') await sql`UPDATE agreements SET end_date = ${val} WHERE id = ${id} AND type <> 'print_ad'`;
      } else if (val === null) {
        if (field === 'exp_date') await sql`UPDATE agreements SET exp_date = NULL WHERE id = ${id}`;
        else if (field === 'start_date') await sql`UPDATE agreements SET start_date = NULL WHERE id = ${id} AND type <> 'print_ad'`;
        else if (field === 'end_date') await sql`UPDATE agreements SET end_date = NULL WHERE id = ${id} AND type <> 'print_ad'`;
      }

    } else if (SIGN_PATCHABLE_JSON.has(field)) {
      if (val === null) {
        await sql`UPDATE agreements SET ad_timing_months = NULL WHERE id = ${id}`;
        continue;
      }
      if (typeof val !== 'object' || Array.isArray(val)) continue;
      const j = JSON.stringify(val);
      await sql`UPDATE agreements SET ad_timing_months = ${j}::jsonb WHERE id = ${id}`;
    } else if (field === 'line_item_dates') {
      // Advertiser-chosen placement dates for app bundle lines (Step 3).
      if (!Array.isArray(val)) continue;
      let updatedAny = false;
      for (const entry of val) {
        if (!entry || typeof entry !== 'object') continue;
        const e = entry as { line_no?: unknown; start_date?: unknown; end_date?: unknown };
        if (typeof e.line_no !== 'number' || !Number.isInteger(e.line_no)) continue;
        if (typeof e.start_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(e.start_date)) continue;
        if (typeof e.end_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(e.end_date)) continue;
        const res = await sql`
          UPDATE agreement_line_items
          SET start_date = ${e.start_date}::date, end_date = ${e.end_date}::date
          WHERE agreement_id = ${id} AND line_no = ${e.line_no} AND channel IN ('app', 'email')
          RETURNING 1
        `;
        if (res.length > 0) updatedAny = true;
      }
      // Keep the agreement-level window in sync with the bundle (min start / max end),
      // but only if at least one app line actually changed.
      if (updatedAny) {
        const windows = await sql`
          SELECT MIN(start_date) AS min_start, MAX(end_date) AS max_end
          FROM agreement_line_items WHERE agreement_id = ${id}
        `;
        const w = (windows[0] ?? {}) as { min_start?: string | null; max_end?: string | null };
        if (w.min_start && w.max_end) {
          await sql`UPDATE agreements SET start_date = ${w.min_start}::date, end_date = ${w.max_end}::date WHERE id = ${id}`;
        }
      }
    }
  }
}
