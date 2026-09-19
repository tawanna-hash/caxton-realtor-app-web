import { randomUUID } from 'crypto';
import { exec, query } from './db/neon';

export type TrecWorksheet = Record<string, string>;
export type TrecAddenda = Record<string, boolean>;
export type TrecWorkflowStatus =
  | 'intake'
  | 'contract_review'
  | 'active_transaction'
  | 'closing'
  | 'completed'
  | 'cancelled';
export type TrecDealOutcome = 'closed' | 'cancelled' | 'withdrawn' | 'expired';
export type TrecTaskStatus = 'todo' | 'in_progress' | 'done' | 'skipped';
export type TrecTaskPriority = 'low' | 'normal' | 'high' | 'critical';
export type TrecDocumentStatus = 'requested' | 'received' | 'verified' | 'not_applicable';

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

export interface TrecDealTask {
  id: string;
  dealId: string;
  title: string;
  description: string | null;
  status: TrecTaskStatus;
  priority: TrecTaskPriority;
  dueDate: string | null;
  deadlineKey: string | null;
  assignee: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TrecDealDocument {
  id: string;
  dealId: string;
  kind: string;
  displayName: string;
  status: TrecDocumentStatus;
  notes: string | null;
  requestedAt: string | null;
  receivedAt: string | null;
  verifiedAt: string | null;
  updatedAt: string;
}

export interface TrecDealActivity {
  id: string;
  dealId: string;
  eventType: string;
  actor: string | null;
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface TrecDeal {
  id: string;
  title: string;
  status: 'active' | 'closed' | 'archived';
  workflowStatus: TrecWorkflowStatus;
  assignedTo: string | null;
  createdBy: string | null;
  outcome: TrecDealOutcome | null;
  outcomeDate: string | null;
  outcomeNote: string | null;
  worksheet: TrecWorksheet;
  addenda: TrecAddenda;
  createdAt: string;
  updatedAt: string;
  reminders: TrecDeadlineReminder[];
  tasks: TrecDealTask[];
  documents: TrecDealDocument[];
  activity: TrecDealActivity[];
}

interface DealRow {
  id: string;
  title: string;
  status: TrecDeal['status'];
  workflow_status: TrecWorkflowStatus | null;
  assigned_to: string | null;
  created_by: string | null;
  outcome: TrecDealOutcome | null;
  outcome_date: string | Date | null;
  outcome_note: string | null;
  worksheet: TrecWorksheet | null;
  addenda: TrecAddenda | null;
  created_at: string | Date;
  updated_at: string | Date;
}

interface TaskRow {
  id: string;
  deal_id: string;
  title: string;
  description: string | null;
  status: TrecTaskStatus;
  priority: TrecTaskPriority;
  due_date: string | Date | null;
  deadline_key: string | null;
  assignee: string | null;
  completed_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
}

interface DocumentRow {
  id: string;
  deal_id: string;
  kind: string;
  display_name: string;
  status: TrecDocumentStatus;
  notes: string | null;
  requested_at: string | Date | null;
  received_at: string | Date | null;
  verified_at: string | Date | null;
  updated_at: string | Date;
}

interface ActivityRow {
  id: string;
  deal_id: string;
  event_type: string;
  actor: string | null;
  message: string;
  metadata: Record<string, unknown> | null;
  created_at: string | Date;
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
        workflow_status TEXT NOT NULL DEFAULT 'intake',
        assigned_to TEXT,
        created_by TEXT,
        outcome TEXT,
        outcome_date DATE,
        outcome_note TEXT,
        worksheet JSONB NOT NULL DEFAULT '{}'::jsonb,
        addenda JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`ALTER TABLE trec_deals ADD COLUMN IF NOT EXISTS workflow_status TEXT NOT NULL DEFAULT 'intake'`);
    await query(`ALTER TABLE trec_deals ADD COLUMN IF NOT EXISTS assigned_to TEXT`);
    await query(`ALTER TABLE trec_deals ADD COLUMN IF NOT EXISTS created_by TEXT`);
    await query(`ALTER TABLE trec_deals ADD COLUMN IF NOT EXISTS outcome TEXT`);
    await query(`ALTER TABLE trec_deals ADD COLUMN IF NOT EXISTS outcome_date DATE`);
    await query(`ALTER TABLE trec_deals ADD COLUMN IF NOT EXISTS outcome_note TEXT`);
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
    await query(`
      CREATE TABLE IF NOT EXISTS trec_deal_tasks (
        id TEXT PRIMARY KEY,
        deal_id TEXT NOT NULL REFERENCES trec_deals(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'todo',
        priority TEXT NOT NULL DEFAULT 'normal',
        due_date DATE,
        deadline_key TEXT,
        assignee TEXT,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS trec_deal_tasks_due_idx
      ON trec_deal_tasks (deal_id, status, due_date)
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS trec_deal_documents (
        id TEXT PRIMARY KEY,
        deal_id TEXT NOT NULL REFERENCES trec_deals(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        display_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'requested',
        notes TEXT,
        requested_at TIMESTAMPTZ,
        received_at TIMESTAMPTZ,
        verified_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS trec_deal_documents_status_idx
      ON trec_deal_documents (deal_id, status)
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS trec_deal_activity (
        id TEXT PRIMARY KEY,
        deal_id TEXT NOT NULL REFERENCES trec_deals(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL,
        actor TEXT,
        message TEXT NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS trec_deal_activity_timeline_idx
      ON trec_deal_activity (deal_id, created_at DESC)
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

function nullableIsoDate(value: string | Date | null): string | null {
  return value ? toIsoDate(value) : null;
}

function nullableIsoDateTime(value: string | Date | null): string | null {
  return value ? toIsoDateTime(value) : null;
}

function toTask(row: TaskRow): TrecDealTask {
  return {
    id: row.id,
    dealId: row.deal_id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    dueDate: nullableIsoDate(row.due_date),
    deadlineKey: row.deadline_key,
    assignee: row.assignee,
    completedAt: nullableIsoDateTime(row.completed_at),
    createdAt: toIsoDateTime(row.created_at),
    updatedAt: toIsoDateTime(row.updated_at),
  };
}

function toDocument(row: DocumentRow): TrecDealDocument {
  return {
    id: row.id,
    dealId: row.deal_id,
    kind: row.kind,
    displayName: row.display_name,
    status: row.status,
    notes: row.notes,
    requestedAt: nullableIsoDateTime(row.requested_at),
    receivedAt: nullableIsoDateTime(row.received_at),
    verifiedAt: nullableIsoDateTime(row.verified_at),
    updatedAt: toIsoDateTime(row.updated_at),
  };
}

function toActivity(row: ActivityRow): TrecDealActivity {
  return {
    id: row.id,
    dealId: row.deal_id,
    eventType: row.event_type,
    actor: row.actor,
    message: row.message,
    metadata: row.metadata ?? {},
    createdAt: toIsoDateTime(row.created_at),
  };
}

function toDeal(
  row: DealRow,
  reminders: TrecDeadlineReminder[] = [],
  tasks: TrecDealTask[] = [],
  documents: TrecDealDocument[] = [],
  activity: TrecDealActivity[] = [],
): TrecDeal {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    workflowStatus: row.workflow_status ?? 'intake',
    assignedTo: row.assigned_to,
    createdBy: row.created_by,
    outcome: row.outcome,
    outcomeDate: nullableIsoDate(row.outcome_date),
    outcomeNote: row.outcome_note,
    worksheet: row.worksheet ?? {},
    addenda: row.addenda ?? {},
    createdAt: toIsoDateTime(row.created_at),
    updatedAt: toIsoDateTime(row.updated_at),
    reminders,
    tasks,
    documents,
    activity,
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

async function tasksForDealIds(dealIds: string[]): Promise<Map<string, TrecDealTask[]>> {
  const byDeal = new Map<string, TrecDealTask[]>();
  if (dealIds.length === 0) return byDeal;
  const rows = await query<TaskRow>(
    `SELECT * FROM trec_deal_tasks
     WHERE deal_id = ANY($1::text[])
     ORDER BY CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
              due_date ASC NULLS LAST, created_at DESC`,
    [dealIds],
  );
  for (const row of rows) {
    const task = toTask(row);
    byDeal.set(task.dealId, [...(byDeal.get(task.dealId) ?? []), task]);
  }
  return byDeal;
}

async function documentsForDealIds(dealIds: string[]): Promise<Map<string, TrecDealDocument[]>> {
  const byDeal = new Map<string, TrecDealDocument[]>();
  if (dealIds.length === 0) return byDeal;
  const rows = await query<DocumentRow>(
    `SELECT * FROM trec_deal_documents
     WHERE deal_id = ANY($1::text[])
     ORDER BY display_name ASC`,
    [dealIds],
  );
  for (const row of rows) {
    const document = toDocument(row);
    byDeal.set(document.dealId, [...(byDeal.get(document.dealId) ?? []), document]);
  }
  return byDeal;
}

async function activityForDealIds(dealIds: string[], limitPerDeal = 25): Promise<Map<string, TrecDealActivity[]>> {
  const byDeal = new Map<string, TrecDealActivity[]>();
  if (dealIds.length === 0) return byDeal;
  const rows = await query<ActivityRow>(
    `SELECT * FROM (
       SELECT *, ROW_NUMBER() OVER (PARTITION BY deal_id ORDER BY created_at DESC) AS rn
       FROM trec_deal_activity
       WHERE deal_id = ANY($1::text[])
     ) activity
     WHERE rn <= $2
     ORDER BY created_at DESC`,
    [dealIds, limitPerDeal],
  );
  for (const row of rows) {
    const activity = toActivity(row);
    byDeal.set(activity.dealId, [...(byDeal.get(activity.dealId) ?? []), activity]);
  }
  return byDeal;
}

export async function listTrecDeals(): Promise<TrecDeal[]> {
  await ensureTrecDealSchema();
  const rows = await query<DealRow>(
    `SELECT * FROM trec_deals WHERE status <> 'archived' ORDER BY updated_at DESC`,
  );
  const ids = rows.map((row) => row.id);
  const [reminders, tasks, documents, activity] = await Promise.all([
    remindersForDealIds(ids),
    tasksForDealIds(ids),
    documentsForDealIds(ids),
    activityForDealIds(ids, 10),
  ]);
  return rows.map((row) => toDeal(
    row,
    reminders.get(row.id) ?? [],
    tasks.get(row.id) ?? [],
    documents.get(row.id) ?? [],
    activity.get(row.id) ?? [],
  ));
}

export async function getTrecDeal(id: string): Promise<TrecDeal | null> {
  await ensureTrecDealSchema();
  const rows = await query<DealRow>(`SELECT * FROM trec_deals WHERE id = $1`, [id]);
  const row = rows[0];
  if (!row) return null;
  const [reminders, tasks, documents, activity] = await Promise.all([
    remindersForDealIds([id]),
    tasksForDealIds([id]),
    documentsForDealIds([id]),
    activityForDealIds([id]),
  ]);
  return toDeal(
    row,
    reminders.get(id) ?? [],
    tasks.get(id) ?? [],
    documents.get(id) ?? [],
    activity.get(id) ?? [],
  );
}

export async function createTrecDeal(input: {
  id: string;
  title: string;
  worksheet: TrecWorksheet;
  addenda: TrecAddenda;
  workflowStatus?: TrecWorkflowStatus;
  assignedTo?: string | null;
  createdBy?: string | null;
}): Promise<TrecDeal> {
  await ensureTrecDealSchema();
  const rows = await query<DealRow>(
    `INSERT INTO trec_deals (id, title, worksheet, addenda, workflow_status, assigned_to, created_by)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7)
     RETURNING *`,
    [
      input.id,
      input.title,
      JSON.stringify(input.worksheet),
      JSON.stringify(input.addenda),
      input.workflowStatus ?? 'intake',
      input.assignedTo ?? null,
      input.createdBy ?? null,
    ],
  );
  await appendTrecDealActivity({
    id: randomUUID(),
    dealId: input.id,
    eventType: 'deal_created',
    actor: input.createdBy,
    message: 'Created this transaction workspace.',
  });
  return toDeal(rows[0], [], [], [], await listTrecDealActivity(input.id));
}

export async function updateTrecDeal(
  id: string,
  input: {
    title: string;
    worksheet: TrecWorksheet;
    addenda: TrecAddenda;
    status?: TrecDeal['status'];
    workflowStatus?: TrecWorkflowStatus;
    assignedTo?: string | null;
    outcome?: TrecDealOutcome | null;
    outcomeDate?: string | null;
    outcomeNote?: string | null;
    actor?: string | null;
  },
): Promise<TrecDeal | null> {
  await ensureTrecDealSchema();
  const rows = await query<DealRow>(
    `UPDATE trec_deals
     SET title = $2,
         worksheet = $3::jsonb,
         addenda = $4::jsonb,
         status = COALESCE($5, status),
         workflow_status = COALESCE($6, workflow_status),
         assigned_to = CASE WHEN $7 THEN $8 ELSE assigned_to END,
         outcome = CASE WHEN $9 THEN $10 ELSE outcome END,
         outcome_date = CASE WHEN $11 THEN $12::date ELSE outcome_date END,
         outcome_note = CASE WHEN $13 THEN $14 ELSE outcome_note END,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      input.title,
      JSON.stringify(input.worksheet),
      JSON.stringify(input.addenda),
      input.status ?? null,
      input.workflowStatus ?? null,
      Object.hasOwn(input, 'assignedTo'),
      input.assignedTo ?? null,
      Object.hasOwn(input, 'outcome'),
      input.outcome ?? null,
      Object.hasOwn(input, 'outcomeDate'),
      input.outcomeDate ?? null,
      Object.hasOwn(input, 'outcomeNote'),
      input.outcomeNote ?? null,
    ],
  );
  if (!rows[0]) return null;
  await appendTrecDealActivity({
    id: randomUUID(),
    dealId: id,
    eventType: 'deal_updated',
    actor: input.actor,
    message: input.workflowStatus
      ? `Updated transaction workspace and set stage to ${input.workflowStatus.replaceAll('_', ' ')}.`
      : 'Updated transaction workspace details.',
  });
  return (await getTrecDeal(id))!;
}

export async function deleteTrecDeal(id: string): Promise<boolean> {
  await ensureTrecDealSchema();
  const result = await exec(`DELETE FROM trec_deals WHERE id = $1`, [id]);
  return result.rowCount > 0;
}

export async function appendTrecDealActivity(input: {
  id: string;
  dealId: string;
  eventType: string;
  actor?: string | null;
  message: string;
  metadata?: Record<string, unknown>;
}): Promise<TrecDealActivity> {
  await ensureTrecDealSchema();
  const rows = await query<ActivityRow>(
    `INSERT INTO trec_deal_activity (id, deal_id, event_type, actor, message, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     RETURNING *`,
    [input.id, input.dealId, input.eventType, input.actor ?? null, input.message, JSON.stringify(input.metadata ?? {})],
  );
  return toActivity(rows[0]);
}

export async function listTrecDealActivity(dealId: string, limit = 100): Promise<TrecDealActivity[]> {
  await ensureTrecDealSchema();
  const rows = await query<ActivityRow>(
    `SELECT * FROM trec_deal_activity WHERE deal_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [dealId, Math.min(Math.max(limit, 1), 250)],
  );
  return rows.map(toActivity);
}

export async function createTrecDealTask(input: {
  id: string;
  dealId: string;
  title: string;
  description?: string | null;
  priority?: TrecTaskPriority;
  dueDate?: string | null;
  deadlineKey?: string | null;
  assignee?: string | null;
  actor?: string | null;
}): Promise<TrecDealTask> {
  await ensureTrecDealSchema();
  const rows = await query<TaskRow>(
    `INSERT INTO trec_deal_tasks
       (id, deal_id, title, description, priority, due_date, deadline_key, assignee)
     VALUES ($1, $2, $3, $4, $5, $6::date, $7, $8)
     RETURNING *`,
    [
      input.id,
      input.dealId,
      input.title,
      input.description ?? null,
      input.priority ?? 'normal',
      input.dueDate ?? null,
      input.deadlineKey ?? null,
      input.assignee ?? null,
    ],
  );
  const task = toTask(rows[0]);
  await appendTrecDealActivity({
    id: randomUUID(),
    dealId: input.dealId,
    eventType: 'task_created',
    actor: input.actor,
    message: `Added task: ${task.title}`,
    metadata: { taskId: task.id, priority: task.priority },
  });
  return task;
}

export async function updateTrecDealTask(
  dealId: string,
  taskId: string,
  input: {
    title?: string;
    description?: string | null;
    status?: TrecTaskStatus;
    priority?: TrecTaskPriority;
    dueDate?: string | null;
    deadlineKey?: string | null;
    assignee?: string | null;
    actor?: string | null;
  },
): Promise<TrecDealTask | null> {
  await ensureTrecDealSchema();
  const rows = await query<TaskRow>(
    `UPDATE trec_deal_tasks
     SET title = COALESCE($3, title),
         description = CASE WHEN $4 THEN $5 ELSE description END,
         status = COALESCE($6, status),
         priority = COALESCE($7, priority),
         due_date = CASE WHEN $8 THEN $9::date ELSE due_date END,
         deadline_key = CASE WHEN $10 THEN $11 ELSE deadline_key END,
         assignee = CASE WHEN $12 THEN $13 ELSE assignee END,
         completed_at = CASE
           WHEN $6 IN ('done', 'skipped') THEN NOW()
           WHEN $6 IN ('todo', 'in_progress') THEN NULL
           ELSE completed_at
         END,
         updated_at = NOW()
     WHERE id = $1 AND deal_id = $2
     RETURNING *`,
    [
      taskId,
      dealId,
      input.title ?? null,
      Object.hasOwn(input, 'description'),
      input.description ?? null,
      input.status ?? null,
      input.priority ?? null,
      Object.hasOwn(input, 'dueDate'),
      input.dueDate ?? null,
      Object.hasOwn(input, 'deadlineKey'),
      input.deadlineKey ?? null,
      Object.hasOwn(input, 'assignee'),
      input.assignee ?? null,
    ],
  );
  if (!rows[0]) return null;
  const task = toTask(rows[0]);
  await appendTrecDealActivity({
    id: randomUUID(),
    dealId,
    eventType: 'task_updated',
    actor: input.actor,
    message: input.status ? `Marked task “${task.title}” as ${input.status.replaceAll('_', ' ')}.` : `Updated task: ${task.title}`,
    metadata: { taskId, status: task.status },
  });
  return task;
}

export async function deleteTrecDealTask(dealId: string, taskId: string, actor?: string | null): Promise<boolean> {
  await ensureTrecDealSchema();
  const rows = await query<TaskRow>(
    `DELETE FROM trec_deal_tasks WHERE id = $1 AND deal_id = $2 RETURNING *`,
    [taskId, dealId],
  );
  if (!rows[0]) return false;
  await appendTrecDealActivity({
    id: randomUUID(),
    dealId,
    eventType: 'task_deleted',
    actor,
    message: `Deleted task: ${rows[0].title}`,
    metadata: { taskId },
  });
  return true;
}

export async function createTrecDealDocument(input: {
  id: string;
  dealId: string;
  kind: string;
  displayName: string;
  notes?: string | null;
  actor?: string | null;
}): Promise<TrecDealDocument> {
  await ensureTrecDealSchema();
  const rows = await query<DocumentRow>(
    `INSERT INTO trec_deal_documents (id, deal_id, kind, display_name, notes, requested_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     RETURNING *`,
    [input.id, input.dealId, input.kind, input.displayName, input.notes ?? null],
  );
  const document = toDocument(rows[0]);
  await appendTrecDealActivity({
    id: randomUUID(),
    dealId: input.dealId,
    eventType: 'document_requested',
    actor: input.actor,
    message: `Added document request: ${document.displayName}`,
    metadata: { documentId: document.id, kind: document.kind },
  });
  return document;
}

export async function updateTrecDealDocument(
  dealId: string,
  documentId: string,
  input: { status?: TrecDocumentStatus; notes?: string | null; actor?: string | null },
): Promise<TrecDealDocument | null> {
  await ensureTrecDealSchema();
  const rows = await query<DocumentRow>(
    `UPDATE trec_deal_documents
     SET status = COALESCE($3, status),
         notes = CASE WHEN $4 THEN $5 ELSE notes END,
         received_at = CASE WHEN $3 IN ('received', 'verified') AND received_at IS NULL THEN NOW() ELSE received_at END,
         verified_at = CASE WHEN $3 = 'verified' THEN NOW() WHEN $3 <> 'verified' THEN NULL ELSE verified_at END,
         updated_at = NOW()
     WHERE id = $1 AND deal_id = $2
     RETURNING *`,
    [documentId, dealId, input.status ?? null, Object.hasOwn(input, 'notes'), input.notes ?? null],
  );
  if (!rows[0]) return null;
  const document = toDocument(rows[0]);
  await appendTrecDealActivity({
    id: randomUUID(),
    dealId,
    eventType: 'document_updated',
    actor: input.actor,
    message: input.status ? `Marked ${document.displayName} as ${input.status.replaceAll('_', ' ')}.` : `Updated document request: ${document.displayName}`,
    metadata: { documentId, status: document.status },
  });
  return document;
}

export async function deleteTrecDealDocument(dealId: string, documentId: string, actor?: string | null): Promise<boolean> {
  await ensureTrecDealSchema();
  const rows = await query<DocumentRow>(
    `DELETE FROM trec_deal_documents WHERE id = $1 AND deal_id = $2 RETURNING *`,
    [documentId, dealId],
  );
  if (!rows[0]) return false;
  await appendTrecDealActivity({
    id: randomUUID(),
    dealId,
    eventType: 'document_deleted',
    actor,
    message: `Deleted document request: ${rows[0].display_name}`,
    metadata: { documentId },
  });
  return true;
}

export async function createTrecReminder(input: {
  id: string;
  dealId: string;
  deadlineKey: string;
  reminderDate: string;
  note?: string | null;
  actor?: string | null;
}): Promise<TrecDeadlineReminder> {
  await ensureTrecDealSchema();
  const rows = await query<ReminderRow>(
    `INSERT INTO trec_deadline_reminders (id, deal_id, deadline_key, reminder_date, note)
     VALUES ($1, $2, $3, $4::date, $5)
     ON CONFLICT (deal_id, deadline_key, reminder_date)
     DO UPDATE SET note = COALESCE(EXCLUDED.note, trec_deadline_reminders.note),
                   updated_at = NOW()
     RETURNING *`,
    [input.id, input.dealId, input.deadlineKey, input.reminderDate, input.note ?? null],
  );
  const reminder = toReminder(rows[0]);
  await appendTrecDealActivity({
    id: randomUUID(),
    dealId: input.dealId,
    eventType: 'reminder_created',
    actor: input.actor,
    message: `Scheduled a reminder for ${reminder.reminderDate}.`,
    metadata: { reminderId: reminder.id, deadlineKey: reminder.deadlineKey },
  });
  return reminder;
}

export async function updateTrecReminder(
  dealId: string,
  reminderId: string,
  input: { isComplete?: boolean; note?: string | null; actor?: string | null },
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
  if (!rows[0]) return null;
  const reminder = toReminder(rows[0]);
  await appendTrecDealActivity({
    id: randomUUID(),
    dealId,
    eventType: 'reminder_updated',
    actor: input.actor,
    message: input.isComplete === true
      ? `Completed a deadline reminder for ${reminder.reminderDate}.`
      : 'Updated a deadline reminder.',
    metadata: { reminderId, deadlineKey: reminder.deadlineKey, isComplete: reminder.isComplete },
  });
  return reminder;
}

export async function deleteTrecReminder(dealId: string, reminderId: string, actor?: string | null): Promise<boolean> {
  await ensureTrecDealSchema();
  const rows = await query<ReminderRow>(
    `DELETE FROM trec_deadline_reminders WHERE id = $1 AND deal_id = $2 RETURNING *`,
    [reminderId, dealId],
  );
  if (!rows[0]) return false;
  await appendTrecDealActivity({
    id: randomUUID(),
    dealId,
    eventType: 'reminder_deleted',
    actor,
    message: `Deleted a deadline reminder for ${toIsoDate(rows[0].reminder_date)}.`,
    metadata: { reminderId, deadlineKey: rows[0].deadline_key },
  });
  return true;
}
