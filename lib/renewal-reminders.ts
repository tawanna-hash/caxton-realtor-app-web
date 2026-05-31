// lib/renewal-reminders.ts
// DB helpers for renewal_reminders table (Pressbook parity).

import { getSql } from '@/lib/db';
import type { RenewalReminder, RenewalReminderStatus } from '@/lib/types/renewal-reminder';
import type { Agreement } from '@/lib/agreements';

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ── List ─────────────────────────────────────────────────────────────────────

export async function getRenewalReminders(
  statusFilter?: RenewalReminderStatus,
): Promise<RenewalReminder[]> {
  const sql = getSql();
  try {
    if (statusFilter) {
      return (await sql`
        SELECT * FROM renewal_reminders
        WHERE status = ${statusFilter}
        ORDER BY remind_date ASC
      `) as unknown as RenewalReminder[];
    }
    return (await sql`
      SELECT * FROM renewal_reminders
      ORDER BY remind_date ASC
    `) as unknown as RenewalReminder[];
  } catch (err) {
    console.error('[renewal-reminders getRenewalReminders]', errMessage(err));
    return [];
  }
}

// ── Create ───────────────────────────────────────────────────────────────────

export type CreateRenewalReminderInput = Omit<RenewalReminder, 'id' | 'created_at' | 'status'> & {
  status?: RenewalReminderStatus;
};

export async function createRenewalReminder(
  input: CreateRenewalReminderInput,
): Promise<RenewalReminder | null> {
  const sql = getSql();
  try {
    const rows = await sql`
      INSERT INTO renewal_reminders (
        agreement_id, company_name, rep_name, email, ad_size, frequency,
        ad_rate_cents, exp_date, remind_date, status, note, triggered_by
      ) VALUES (
        ${input.agreement_id},
        ${input.company_name ?? null},
        ${input.rep_name ?? null},
        ${input.email ?? null},
        ${input.ad_size ?? null},
        ${input.frequency ?? null},
        ${input.ad_rate_cents ?? null},
        ${input.exp_date ?? null},
        ${input.remind_date ?? null},
        ${input.status ?? 'Pending'},
        ${input.note ?? null},
        ${input.triggered_by ?? null}
      )
      RETURNING *
    `;
    return (rows[0] as unknown as RenewalReminder) ?? null;
  } catch (err) {
    console.error('[renewal-reminders createRenewalReminder]', errMessage(err));
    return null;
  }
}

// ── Update ───────────────────────────────────────────────────────────────────

export type RenewalReminderPatch = Partial<Pick<RenewalReminder, 'status' | 'note' | 'remind_date'>>;

export async function updateRenewalReminder(
  id: string,
  patch: RenewalReminderPatch,
): Promise<RenewalReminder | null> {
  const sql = getSql();
  try {
    if (patch.status !== undefined) {
      await sql`UPDATE renewal_reminders SET status = ${patch.status} WHERE id = ${id}`;
    }
    if (patch.note !== undefined) {
      await sql`UPDATE renewal_reminders SET note = ${patch.note} WHERE id = ${id}`;
    }
    if (patch.remind_date !== undefined) {
      await sql`UPDATE renewal_reminders SET remind_date = ${patch.remind_date} WHERE id = ${id}`;
    }
    const rows = await sql`SELECT * FROM renewal_reminders WHERE id = ${id}`;
    return (rows[0] as unknown as RenewalReminder) ?? null;
  } catch (err) {
    console.error('[renewal-reminders updateRenewalReminder]', errMessage(err));
    return null;
  }
}

// ── Auto-create on signing ────────────────────────────────────────────────────

/**
 * Mirror of Pressbook autoCreateRenewalReminder.
 * Dedupes by agreement_id — only creates if no Pending reminder exists.
 */
export async function autoCreateForAgreement(ag: Agreement): Promise<RenewalReminder | null> {
  if (!ag.exp_date) return null;

  const sql = getSql();
  try {
    // Dedupe: skip if a non-dismissed/completed reminder already exists
    const existing = await sql`
      SELECT id FROM renewal_reminders
      WHERE agreement_id = ${ag.id}
        AND status NOT IN ('Dismissed','Completed')
      LIMIT 1
    `;
    if ((existing as unknown[]).length > 0) return null;

    // remindDate = expDate - 30 days
    const expDate = new Date(ag.exp_date);
    const remindDate = new Date(expDate.getTime() - 30 * 86400000);
    const remindDateStr = remindDate.toISOString().slice(0, 10);

    return createRenewalReminder({
      agreement_id:  ag.id,
      company_name:  ag.company_name,
      rep_name:      ag.rep_name,
      email:         ag.advertiser_email,
      ad_size:       ag.ad_size,
      frequency:     ag.frequency,
      ad_rate_cents: ag.ad_rate_cents,
      exp_date:      ag.exp_date,
      remind_date:   remindDateStr,
      note:          null,
      triggered_by:  'auto-sign',
    });
  } catch (err) {
    console.error('[renewal-reminders autoCreateForAgreement]', errMessage(err));
    return null;
  }
}
