// lib/server/tearsheets-store.ts
//
// CRUD for tearsheets. Slimmer than IOs because tearsheets are
// essentially "file + metadata" records — no state machine, just
// pending → ready → sent.

import { query, exec } from '@/lib/server/db/neon';
import { isAdChannel, type AdChannel } from '@/lib/ad-channels';
import {
  TEARSHEET_STATUS_VALUES,
  type Tearsheet,
  type TearsheetStatus,
  type TearsheetWithAdvertiser,
} from '@/lib/insertion-orders';

interface RawTs {
  id: string;
  io_id: string | null;
  campaign_id: string | null;
  advertiser_id: number | null;
  channel: string;
  publication: string | null;
  issue_date: string | null;
  issue_label: string | null;
  file_url: string | null;
  file_type: string | null;
  status: string;
  sent_to: string | null;
  sent_at: string | null;
  created_by: string | null;
  created_at: string;
}

function normStatus(s: string): TearsheetStatus {
  return (TEARSHEET_STATUS_VALUES as readonly string[]).includes(s)
    ? (s as TearsheetStatus)
    : 'pending';
}

function normChannel(c: string): AdChannel {
  return isAdChannel(c) ? c : 'digital';
}

function toTs(r: RawTs): Tearsheet {
  return {
    id: r.id,
    io_id: r.io_id,
    campaign_id: r.campaign_id,
    advertiser_id: r.advertiser_id,
    channel: normChannel(r.channel),
    publication: r.publication,
    issue_date: r.issue_date,
    issue_label: r.issue_label,
    file_url: r.file_url,
    file_type: r.file_type,
    status: normStatus(r.status),
    sent_to: r.sent_to,
    sent_at: r.sent_at,
    created_by: r.created_by,
    created_at: r.created_at,
  };
}

export interface CreateTsInput {
  io_id?: string | null;
  campaign_id?: string | null;
  advertiser_id?: number | null;
  channel: AdChannel;
  publication?: string | null;
  issue_date?: string | null;
  issue_label?: string | null;
  file_url?: string | null;
  file_type?: string | null;
  created_by?: string | null;
}

export async function createTearsheet(input: CreateTsInput): Promise<Tearsheet> {
  const rows = await query<RawTs>(
    `INSERT INTO tearsheets
       (io_id, campaign_id, advertiser_id, channel, publication,
        issue_date, issue_label, file_url, file_type, status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      input.io_id ?? null,
      input.campaign_id ?? null,
      input.advertiser_id ?? null,
      input.channel,
      input.publication ?? null,
      input.issue_date ?? null,
      input.issue_label ?? null,
      input.file_url ?? null,
      input.file_type ?? null,
      input.file_url ? 'ready' : 'pending',
      input.created_by ?? null,
    ],
  );
  return toTs(rows[0]);
}

export async function getTearsheet(id: string): Promise<Tearsheet | null> {
  const rows = await query<RawTs>(
    `SELECT * FROM tearsheets WHERE id = $1 LIMIT 1`,
    [id],
  );
  return rows[0] ? toTs(rows[0]) : null;
}

export async function markTearsheetSent(
  id: string,
  sentTo: string,
): Promise<Tearsheet | null> {
  const rows = await query<RawTs>(
    `UPDATE tearsheets
        SET status = 'sent', sent_to = $2, sent_at = now()
      WHERE id = $1
      RETURNING *`,
    [id, sentTo],
  );
  return rows[0] ? toTs(rows[0]) : null;
}

export async function deleteTearsheet(id: string): Promise<boolean> {
  const res = await exec(`DELETE FROM tearsheets WHERE id = $1`, [id]);
  return res.rowCount > 0;
}

export interface ListTsParams {
  advertiser_id?: number;
  io_id?: string;
  channel?: AdChannel;
  status?: TearsheetStatus;
  limit?: number;
}

export async function listTearsheets(
  params: ListTsParams = {},
): Promise<TearsheetWithAdvertiser[]> {
  const clauses: string[] = [];
  const values: unknown[] = [];
  const push = (sql: string, val: unknown) => {
    values.push(val);
    clauses.push(sql.replace('$?', `$${values.length}`));
  };

  if (params.advertiser_id !== undefined)
    push('t.advertiser_id = $?', params.advertiser_id);
  if (params.io_id !== undefined) push('t.io_id = $?', params.io_id);
  if (params.channel !== undefined) push('t.channel = $?', params.channel);
  if (params.status !== undefined) push('t.status = $?', params.status);

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit = Math.min(Math.max(params.limit ?? 200, 1), 500);

  const rows = await query<
    RawTs & {
      advertiser_name: string | null;
      advertiser_email: string | null;
      io_number: string | null;
    }
  >(
    `SELECT t.*,
            a.name AS advertiser_name,
            a.email AS advertiser_email,
            io.io_number AS io_number
       FROM tearsheets t
       LEFT JOIN advertisers a ON a.id = t.advertiser_id
       LEFT JOIN insertion_orders io ON io.id = t.io_id
       ${where}
       ORDER BY t.created_at DESC
       LIMIT ${limit}`,
    values,
  );

  return rows.map((r) => ({
    ...toTs(r),
    advertiser_name: r.advertiser_name,
    advertiser_email: r.advertiser_email,
    io_number: r.io_number,
  }));
}
