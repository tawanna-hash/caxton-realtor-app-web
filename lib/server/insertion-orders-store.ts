// lib/server/insertion-orders-store.ts
//
// CRUD for insertion_orders. Uses the same neon `query`/`exec` helpers
// as the rest of the CRM layer. All mutations transition status via a
// simple state machine (see IO_STATE_TRANSITIONS below).

import { query, exec } from '@/lib/server/db/neon';
import { isAdChannel, type AdChannel } from '@/lib/ad-channels';
import {
  IO_STATUS_VALUES,
  type InsertionOrder,
  type InsertionOrderWithAdvertiser,
  type IoLineItem,
  type IoStatus,
} from '@/lib/insertion-orders';

// State machine — draft is the only entry, cancelled is terminal.
const IO_STATE_TRANSITIONS: Record<IoStatus, IoStatus[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['acknowledged', 'cancelled', 'draft'],
  acknowledged: ['active', 'cancelled'],
  active: ['fulfilled', 'cancelled'],
  fulfilled: [],
  cancelled: [],
};

interface RawIo {
  id: string;
  io_number: string;
  agreement_id: string | null;
  advertiser_id: number | null;
  campaign_ids: string[] | null;
  channel: string;
  publication: string | null;
  flight_start: string | null;
  flight_end: string | null;
  line_items: unknown;
  total_cents: number;
  status: string;
  notes: string | null;
  sent_at: string | null;
  acknowledged_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  pdf_url: string | null;
}

function normalizeStatus(s: string): IoStatus {
  return (IO_STATUS_VALUES as readonly string[]).includes(s)
    ? (s as IoStatus)
    : 'draft';
}

function normalizeChannel(c: string): AdChannel {
  return isAdChannel(c) ? c : 'digital';
}

function normalizeLineItems(v: unknown): IoLineItem[] {
  if (!v) return [];
  if (Array.isArray(v)) return v as IoLineItem[];
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? (parsed as IoLineItem[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function toIo(r: RawIo): InsertionOrder {
  return {
    pdf_url: r.pdf_url ?? null,
    id: r.id,
    io_number: r.io_number,
    agreement_id: r.agreement_id,
    advertiser_id: r.advertiser_id,
    campaign_ids: Array.isArray(r.campaign_ids) ? r.campaign_ids : [],
    channel: normalizeChannel(r.channel),
    publication: r.publication,
    flight_start: r.flight_start,
    flight_end: r.flight_end,
    line_items: normalizeLineItems(r.line_items),
    total_cents: r.total_cents ?? 0,
    status: normalizeStatus(r.status),
    notes: r.notes,
    sent_at: r.sent_at,
    acknowledged_at: r.acknowledged_at,
    created_by: r.created_by,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

/**
 * Reserve the next IO number for the current year using the io_counters
 * table. Format: IO-YYYY-NNNN (4-digit zero-padded, resets each year).
 */
async function reserveIoNumber(): Promise<string> {
  const year = new Date().getUTCFullYear();
  const rows = await query<{ last_seq: number }>(
    `INSERT INTO io_counters (year, last_seq)
     VALUES ($1, 1)
     ON CONFLICT (year) DO UPDATE SET last_seq = io_counters.last_seq + 1
     RETURNING last_seq`,
    [year],
  );
  const seq = rows[0]?.last_seq ?? 1;
  return `IO-${year}-${String(seq).padStart(4, '0')}`;
}

export interface CreateIoInput {
  agreement_id?: string | null;
  advertiser_id?: number | null;
  campaign_ids?: string[];
  channel: AdChannel;
  publication?: string | null;
  flight_start?: string | null;
  flight_end?: string | null;
  line_items?: IoLineItem[];
  total_cents?: number;
  notes?: string | null;
  created_by?: string | null;
}

export async function createInsertionOrder(
  input: CreateIoInput,
): Promise<InsertionOrder> {
  const io_number = await reserveIoNumber();
  const line_items = input.line_items ?? [];
  const total_cents =
    input.total_cents ??
    line_items.reduce((sum, li) => sum + (li.total_cents ?? 0), 0);

  const rows = await query<RawIo>(
    `INSERT INTO insertion_orders
       (io_number, agreement_id, advertiser_id, campaign_ids, channel,
        publication, flight_start, flight_end, line_items, total_cents,
        notes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12)
     RETURNING *`,
    [
      io_number,
      input.agreement_id ?? null,
      input.advertiser_id ?? null,
      input.campaign_ids ?? [],
      input.channel,
      input.publication ?? null,
      input.flight_start ?? null,
      input.flight_end ?? null,
      JSON.stringify(line_items),
      total_cents,
      input.notes ?? null,
      input.created_by ?? null,
    ],
  );

  return toIo(rows[0]);
}

export async function getInsertionOrder(
  id: string,
): Promise<InsertionOrder | null> {
  const rows = await query<RawIo>(
    `SELECT * FROM insertion_orders WHERE id = $1 LIMIT 1`,
    [id],
  );
  return rows[0] ? toIo(rows[0]) : null;
}

export interface UpdateIoInput {
  status?: IoStatus;
  agreement_id?: string | null;
  advertiser_id?: number | null;
  campaign_ids?: string[];
  channel?: AdChannel;
  publication?: string | null;
  flight_start?: string | null;
  flight_end?: string | null;
  line_items?: IoLineItem[];
  total_cents?: number;
  notes?: string | null;
}

export async function updateInsertionOrder(
  id: string,
  patch: UpdateIoInput,
): Promise<InsertionOrder | null> {
  const current = await getInsertionOrder(id);
  if (!current) return null;

  if (patch.status && patch.status !== current.status) {
    const allowed = IO_STATE_TRANSITIONS[current.status] ?? [];
    if (!allowed.includes(patch.status)) {
      throw new Error(
        `Invalid IO status transition ${current.status} -> ${patch.status}`,
      );
    }
  }

  const sets: string[] = [];
  const values: unknown[] = [];
  const push = (col: string, val: unknown, cast = '') => {
    values.push(val);
    sets.push(`${col} = $${values.length}${cast}`);
  };

  if (patch.status !== undefined) push('status', patch.status);
  if (patch.agreement_id !== undefined) push('agreement_id', patch.agreement_id);
  if (patch.advertiser_id !== undefined) push('advertiser_id', patch.advertiser_id);
  if (patch.campaign_ids !== undefined) push('campaign_ids', patch.campaign_ids);
  if (patch.channel !== undefined) push('channel', patch.channel);
  if (patch.publication !== undefined) push('publication', patch.publication);
  if (patch.flight_start !== undefined) push('flight_start', patch.flight_start);
  if (patch.flight_end !== undefined) push('flight_end', patch.flight_end);
  if (patch.line_items !== undefined)
    push('line_items', JSON.stringify(patch.line_items), '::jsonb');
  if (patch.total_cents !== undefined) push('total_cents', patch.total_cents);
  if (patch.notes !== undefined) push('notes', patch.notes);

  // Timestamp side effects for state transitions.
  if (patch.status === 'sent' && current.status !== 'sent') {
    sets.push(`sent_at = now()`);
  }
  if (patch.status === 'acknowledged' && current.status !== 'acknowledged') {
    sets.push(`acknowledged_at = now()`);
  }

  sets.push(`updated_at = now()`);

  if (sets.length === 1) return current; // only updated_at

  values.push(id);
  const rows = await query<RawIo>(
    `UPDATE insertion_orders SET ${sets.join(', ')}
     WHERE id = $${values.length}
     RETURNING *`,
    values,
  );
  return rows[0] ? toIo(rows[0]) : null;
}

export async function deleteInsertionOrder(id: string): Promise<boolean> {
  const res = await exec(`DELETE FROM insertion_orders WHERE id = $1`, [id]);
  return res.rowCount > 0;
}

export interface ListIosParams {
  advertiser_id?: number;
  agreement_id?: string;
  channel?: AdChannel;
  status?: IoStatus;
  q?: string;
  limit?: number;
}

export async function listInsertionOrders(
  params: ListIosParams = {},
): Promise<InsertionOrderWithAdvertiser[]> {
  const clauses: string[] = [];
  const values: unknown[] = [];
  const push = (sql: string, val: unknown) => {
    values.push(val);
    clauses.push(sql.replace('$?', `$${values.length}`));
  };

  if (params.advertiser_id !== undefined)
    push('io.advertiser_id = $?', params.advertiser_id);
  if (params.agreement_id !== undefined)
    push('io.agreement_id = $?', params.agreement_id);
  if (params.channel !== undefined) push('io.channel = $?', params.channel);
  if (params.status !== undefined) push('io.status = $?', params.status);
  if (params.q) {
    values.push(`%${params.q}%`);
    const n = values.length;
    clauses.push(
      `(io.io_number ILIKE $${n} OR io.notes ILIKE $${n} OR a.name ILIKE $${n})`,
    );
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit = Math.min(Math.max(params.limit ?? 200, 1), 500);

  const rows = await query<RawIo & {
    advertiser_name: string | null;
    advertiser_email: string | null;
  }>(
    `SELECT io.*, a.name AS advertiser_name, a.email AS advertiser_email
       FROM insertion_orders io
       LEFT JOIN advertisers a ON a.id = io.advertiser_id
       ${where}
       ORDER BY io.created_at DESC
       LIMIT ${limit}`,
    values,
  );

  return rows.map((r) => ({
    ...toIo(r),
    advertiser_name: r.advertiser_name,
    advertiser_email: r.advertiser_email,
  }));
}

/**
 * Overwrite the pdf_url for an IO. Used by the upload endpoint after
 * pushing the advertiser/agency-provided PDF to Vercel Blob. Passing
 * null clears the field (fallback to the branded renderer).
 */
export async function setInsertionOrderPdfUrl(
  id: string,
  pdfUrl: string | null,
): Promise<InsertionOrder | null> {
  const rows = await query<RawIo>(
    `UPDATE insertion_orders
        SET pdf_url = $2,
            updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [id, pdfUrl],
  );
  return rows[0] ? toIo(rows[0]) : null;
}
