import { exec, query } from './db/neon';

export type TrecWorksheet = Record<string, string>;
export type TrecAddenda = Record<string, boolean>;

export interface TrecDeadlineReminder {
  id: string;
  dealId: string;
  deadlineKey: string;
  reminderDate: string;
  note: string | null;
  isComplete: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TrecDeal {
  id: string;
  title: string;
  status: 'active' | 'closed' | 'archived';
  worksheet: TrecWorksheet;
  addenda: TrecAddenda;
  createdAt: string;
  updatedAt: string;
  reminders: TrecDeadlineReminder[];
}

interface DealRow {
  id: string;
  title: string;
  status: TrecDeal['status'];
  worksheet: TrecWorksheet | null;
  addenda: TrecAddenda | null;
  created_at: string | Date;
  updated_at: string | Date;
}

interface ReminderRow {
  id: string;
  deal_id: string;
  deadline_key: string;
  reminder_date: string | Date;
  note: string | null;
  is_complete: boolean;
  created_at: string | Date;
  updated_at: string | Date;
}

let schemaPromise: Promise<void> | null = null;

export function ensureTrecDealSchema(): Promise<void> {
  if (schemaPromise) return schemaPromise;

  schemaPromise = (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS trec_deals (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active'
          CHECK (status IN ('active', 'closed', 'archived')),
        worksheet JSONB NOT NULL DEFAULT '{}'::jsonb,
        addenda JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS trec_deals_status_updated_idx
      ON trec_deals (status, updated_at DESC)
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS trec_deadline_reminders (
        id TEXT PRIMARY KEY,
        deal_id TEXT NOT NULL REFERENCES trec_deals(id) ON DELETE CASCADE,
        deadline_key TEXT NOT NULL,
        reminder_date DATE NOT NULL,
        note TEXT,
        is_complete BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (deal_id, deadline_key, reminder_date)
      )
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS trec_deadline_reminders_due_idx
      ON trec_deadline_reminders (deal_id, is_complete, reminder_date)
    `);
  })().catch((error) => {
    schemaPromise = null;
    throw error;
  });

  return schemaPromise;
}

function toIsoDate(value: string | Date): string {
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function toIsoDateTime(value: string | Date): string {
  return typeof value === 'string' ? value : value.toISOString();
}

function toReminder(row: ReminderRow): TrecDeadlineReminder {
  return {
    id: row.id,
    dealId: row.deal_id,
    deadlineKey: row.deadline_key,
    reminderDate: toIsoDate(row.reminder_date),
    note: row.note,
    isComplete: row.is_complete,
    createdAt: toIsoDateTime(row.created_at),
    updatedAt: toIsoDateTime(row.updated_at),
  };
}

function toDeal(row: DealRow, reminders: TrecDeadlineReminder[] = []): TrecDeal {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    worksheet: row.worksheet ?? {},
    addenda: row.addenda ?? {},
    createdAt: toIsoDateTime(row.created_at),
    updatedAt: toIsoDateTime(row.updated_at),
    reminders,
  };
}

async function remindersForDealIds(dealIds: string[]): Promise<Map<string, TrecDeadlineReminder[]>> {
  const byDeal = new Map<string, TrecDeadlineReminder[]>();
  if (dealIds.length === 0) return byDeal;

  const rows = await query<ReminderRow>(
    `SELECT * FROM trec_deadline_reminders
     WHERE deal_id = ANY($1::text[])
     ORDER BY is_complete ASC, reminder_date ASC, created_at DESC`,
    [dealIds],
  );
  for (const row of rows) {
    const reminder = toReminder(row);
    const existing = byDeal.get(reminder.dealId) ?? [];
    existing.push(reminder);
    byDeal.set(reminder.dealId, existing);
  }
  return byDeal;
}

export async function listTrecDeals(): Promise<TrecDeal[]> {
  await ensureTrecDealSchema();
  const rows = await query<DealRow>(
    `SELECT * FROM trec_deals WHERE status <> 'archived' ORDER BY updated_at DESC`,
  );
  const reminders = await remindersForDealIds(rows.map((row) => row.id));
  return rows.map((row) => toDeal(row, reminders.get(row.id) ?? []));
}

export async function getTrecDeal(id: string): Promise<TrecDeal | null> {
  await ensureTrecDealSchema();
  const rows = await query<DealRow>(`SELECT * FROM trec_deals WHERE id = $1`, [id]);
  const row = rows[0];
  if (!row) return null;
  const reminders = await remindersForDealIds([id]);
  return toDeal(row, reminders.get(id) ?? []);
}

export async function createTrecDeal(input: {
  id: string;
  title: string;
  worksheet: TrecWorksheet;
  addenda: TrecAddenda;
}): Promise<TrecDeal> {
  await ensureTrecDealSchema();
  const rows = await query<DealRow>(
    `INSERT INTO trec_deals (id, title, worksheet, addenda)
     VALUES ($1, $2, $3::jsonb, $4::jsonb)
     RETURNING *`,
    [input.id, input.title, JSON.stringify(input.worksheet), JSON.stringify(input.addenda)],
  );
  return toDeal(rows[0]);
}

export async function updateTrecDeal(
  id: string,
  input: { title: string; worksheet: TrecWorksheet; addenda: TrecAddenda; status?: TrecDeal['status'] },
): Promise<TrecDeal | null> {
  await ensureTrecDealSchema();
  const rows = await query<DealRow>(
    `UPDATE trec_deals
     SET title = $2,
         worksheet = $3::jsonb,
         addenda = $4::jsonb,
         status = COALESCE($5, status),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, input.title, JSON.stringify(input.worksheet), JSON.stringify(input.addenda), input.status ?? null],
  );
  if (!rows[0]) return null;
  const reminders = await remindersForDealIds([id]);
  return toDeal(rows[0], reminders.get(id) ?? []);
}

export async function deleteTrecDeal(id: string): Promise<boolean> {
  await ensureTrecDealSchema();
  const result = await exec(`DELETE FROM trec_deals WHERE id = $1`, [id]);
  return result.rowCount > 0;
}

export async function createTrecReminder(input: {
  id: string;
  dealId: string;
  deadlineKey: string;
  reminderDate: string;
  note?: string | null;
}): Promise<TrecDeadlineReminder> {
  await ensureTrecDealSchema();
  const rows = await query<ReminderRow>(
    `INSERT INTO trec_deadline_reminders (id, deal_id, deadline_key, reminder_date, note)
     VALUES ($1, $2, $3, $4::date, $5)
     RETURNING *`,
    [input.id, input.dealId, input.deadlineKey, input.reminderDate, input.note ?? null],
  );
  return toReminder(rows[0]);
}

export async function updateTrecReminder(
  dealId: string,
  reminderId: string,
  input: { isComplete?: boolean; note?: string | null },
): Promise<TrecDeadlineReminder | null> {
  await ensureTrecDealSchema();
  const rows = await query<ReminderRow>(
    `UPDATE trec_deadline_reminders
     SET is_complete = COALESCE($3, is_complete),
         note = CASE WHEN $4 THEN $5 ELSE note END,
         updated_at = NOW()
     WHERE id = $1 AND deal_id = $2
     RETURNING *`,
    [
      reminderId,
      dealId,
      input.isComplete ?? null,
      Object.hasOwn(input, 'note'),
      input.note ?? null,
    ],
  );
  return rows[0] ? toReminder(rows[0]) : null;
}

export async function deleteTrecReminder(dealId: string, reminderId: string): Promise<boolean> {
  await ensureTrecDealSchema();
  const result = await exec(
    `DELETE FROM trec_deadline_reminders WHERE id = $1 AND deal_id = $2`,
    [reminderId, dealId],
  );
  return result.rowCount > 0;
}
