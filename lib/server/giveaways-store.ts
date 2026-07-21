/**
 * Giveaways store — DO Postgres (transient).
 *
 * Reads/writes `giveaways`, `giveaway_rules`, `giveaway_entries`. After data
 * migration, swap `query` / `exec` / `withNeonTransaction` for the Neon
 * equivalents from `lib/server/db/neon.ts` — column names and shapes are
 * unchanged.
 */

import { query, exec, withNeonTransaction } from './db/neon';
import type {
  CreateGiveawayInput,
  UpdateGiveawayInput,
  RuleInput,
} from './schemas/giveaways';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface GiveawayListRow {
  id: string;
  title: string;
  prize: string;
  publication: string;
  starts_at: Date;
  ends_at: Date;
  draw_at: Date | null;
  status: string;
  winner_realtor_id: string | null;
  winner_drawn_at: Date | null;
  created_at: Date;
  ticket_count: number;
  participant_count: number;
}

export interface GiveawayDetail {
  giveaway: Record<string, unknown> & {
    id: string;
    title: string;
    prize: string;
    status: string;
  };
  rules: Array<Record<string, unknown>>;
  stats: { ticketCount: number; participantCount: number };
}

// -----------------------------------------------------------------------------
// List + detail
// -----------------------------------------------------------------------------

export async function listGiveaways(): Promise<GiveawayListRow[]> {
  const rows = await query<
    Omit<GiveawayListRow, 'ticket_count' | 'participant_count'> & {
      ticket_count: string;
      participant_count: string;
    }
  >(
    `SELECT
       g.id, g.title, g.prize, g.publication, g.starts_at, g.ends_at, g.draw_at,
       g.status, g.winner_realtor_id, g.winner_drawn_at, g.created_at,
       (SELECT COUNT(*) FROM giveaway_entries WHERE giveaway_id = g.id) AS ticket_count,
       (SELECT COUNT(DISTINCT realtor_id) FROM giveaway_entries WHERE giveaway_id = g.id) AS participant_count
     FROM giveaways g
     ORDER BY g.created_at DESC`,
  );
  return rows.map((r) => ({
    ...r,
    ticket_count: Number(r.ticket_count),
    participant_count: Number(r.participant_count),
  }));
}

// -----------------------------------------------------------------------------
// Public list — the giveaways surfaced on the public /giveaways page.
// -----------------------------------------------------------------------------

export interface PublicGiveawayRow {
  id: string;
  title: string;
  prize: string;
  publication: string;
  starts_at: Date;
  ends_at: Date;
}

/**
 * Giveaways eligible for public display: explicitly published (`active`) and
 * currently within their entry window. `draft` (never published), `closed`,
 * and `announced` are excluded. `market` is the admin publication id the
 * viewer's chosen publication maps to (or null for markets without a giveaway
 * catalog); giveaways scoped to that market plus `both` are returned.
 *
 * `description` is deliberately not selected — the admin form labels it an
 * "Optional internal note", so it must not surface to the public.
 */
export async function listPublicGiveaways(
  market: 'austin' | 'san_antonio' | null,
): Promise<PublicGiveawayRow[]> {
  return query<PublicGiveawayRow>(
    `SELECT id, title, prize, publication, starts_at, ends_at
     FROM giveaways
     WHERE status = 'active'
       AND starts_at <= NOW()
       AND ends_at >= NOW()
       AND (publication = 'both' OR publication = $1::market_enum)
     ORDER BY ends_at ASC`,
    [market],
  );
}

export async function getGiveawayDetail(id: string): Promise<GiveawayDetail | null> {
  const giveawayRows = await query(
    `SELECT g.*, r.first_name AS winner_first_name, r.last_name AS winner_last_name, r.email AS winner_email
     FROM giveaways g
     LEFT JOIN realtors r ON r.id = g.winner_realtor_id
     WHERE g.id = $1`,
    [id],
  );

  const giveaway = giveawayRows[0];
  if (!giveaway) return null;

  const rules = await query(
    `SELECT id, action_type, label, target_url, tickets, sort_order, required, created_at
     FROM giveaway_rules
     WHERE giveaway_id = $1
     ORDER BY sort_order, created_at`,
    [id],
  );

  const stats = await query<{ ticket_count: string; participant_count: string }>(
    `SELECT COUNT(*) AS ticket_count, COUNT(DISTINCT realtor_id) AS participant_count
     FROM giveaway_entries WHERE giveaway_id = $1`,
    [id],
  );

  return {
    giveaway: giveaway as GiveawayDetail['giveaway'],
    rules: rules as GiveawayDetail['rules'],
    stats: {
      ticketCount: Number(stats[0]!.ticket_count),
      participantCount: Number(stats[0]!.participant_count),
    },
  };
}

// -----------------------------------------------------------------------------
// Create / update / delete
// -----------------------------------------------------------------------------

export async function createGiveaway(
  input: CreateGiveawayInput,
  adminId: string,
): Promise<string> {
  const rows = await query<{ id: string }>(
    `INSERT INTO giveaways
       (title, description, prize, publication, starts_at, ends_at, draw_at, created_by_admin_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      input.title,
      input.description ?? null,
      input.prize,
      input.publication,
      input.startsAt,
      input.endsAt,
      input.drawAt ?? null,
      adminId,
    ],
  );
  return rows[0]!.id;
}

const GIVEAWAY_FIELD_MAP: Record<string, string> = {
  title: 'title',
  description: 'description',
  prize: 'prize',
  publication: 'publication',
  startsAt: 'starts_at',
  endsAt: 'ends_at',
  drawAt: 'draw_at',
  status: 'status',
};

export async function updateGiveaway(
  id: string,
  input: UpdateGiveawayInput,
): Promise<{ ok: true } | { ok: false; reason: 'not_found' | 'no_fields' }> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  for (const [key, col] of Object.entries(GIVEAWAY_FIELD_MAP)) {
    const v = (input as Record<string, unknown>)[key];
    if (v !== undefined) {
      setClauses.push(`${col} = $${i++}`);
      values.push(v);
    }
  }

  if (setClauses.length === 0) return { ok: false, reason: 'no_fields' };

  setClauses.push(`updated_at = NOW()`);
  values.push(id);

  const { rowCount } = await exec(
    `UPDATE giveaways SET ${setClauses.join(', ')} WHERE id = $${i}`,
    values,
  );
  if (!rowCount) return { ok: false, reason: 'not_found' };
  return { ok: true };
}

export async function deleteDraftGiveaway(
  id: string,
): Promise<{ ok: true } | { ok: false; reason: 'not_found' | 'not_draft' }> {
  const rows = await query<{ status: string }>(
    `SELECT status FROM giveaways WHERE id = $1`,
    [id],
  );
  if (!rows[0]) return { ok: false, reason: 'not_found' };
  if (rows[0].status !== 'draft') return { ok: false, reason: 'not_draft' };

  await exec(`DELETE FROM giveaways WHERE id = $1`, [id]);
  return { ok: true };
}

// -----------------------------------------------------------------------------
// Rules
// -----------------------------------------------------------------------------

export async function createGiveawayRule(
  giveawayId: string,
  input: RuleInput,
): Promise<{ ok: true; id: string } | { ok: false; reason: 'giveaway_not_found' }> {
  const g = await query(`SELECT id FROM giveaways WHERE id = $1`, [giveawayId]);
  if (!g[0]) return { ok: false, reason: 'giveaway_not_found' };

  const rows = await query<{ id: string }>(
    `INSERT INTO giveaway_rules
       (giveaway_id, action_type, label, target_url, tickets, sort_order, required)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      giveawayId,
      input.actionType,
      input.label,
      input.targetUrl ?? null,
      input.tickets,
      input.sortOrder,
      input.required,
    ],
  );
  return { ok: true, id: rows[0]!.id };
}

const RULE_FIELD_MAP: Record<string, string> = {
  actionType: 'action_type',
  label: 'label',
  targetUrl: 'target_url',
  tickets: 'tickets',
  sortOrder: 'sort_order',
  required: 'required',
};

export async function updateGiveawayRule(
  giveawayId: string,
  ruleId: string,
  input: Partial<RuleInput>,
): Promise<{ ok: true } | { ok: false; reason: 'not_found' | 'no_fields' }> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  for (const [key, col] of Object.entries(RULE_FIELD_MAP)) {
    const v = (input as Record<string, unknown>)[key];
    if (v !== undefined) {
      setClauses.push(`${col} = $${i++}`);
      values.push(v);
    }
  }
  if (setClauses.length === 0) return { ok: false, reason: 'no_fields' };

  values.push(ruleId, giveawayId);
  const { rowCount } = await exec(
    `UPDATE giveaway_rules SET ${setClauses.join(', ')}
     WHERE id = $${i++} AND giveaway_id = $${i}`,
    values,
  );
  if (!rowCount) return { ok: false, reason: 'not_found' };
  return { ok: true };
}

export async function deleteGiveawayRule(
  giveawayId: string,
  ruleId: string,
): Promise<{ ok: true } | { ok: false; reason: 'not_found' }> {
  const { rowCount } = await exec(
    `DELETE FROM giveaway_rules WHERE id = $1 AND giveaway_id = $2`,
    [ruleId, giveawayId],
  );
  if (!rowCount) return { ok: false, reason: 'not_found' };
  return { ok: true };
}

// -----------------------------------------------------------------------------
// Entries (paginated)
// -----------------------------------------------------------------------------

export interface GiveawayEntryRow {
  realtor_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  tickets: number;
  first_entry_at: Date | null;
  last_entry_at: Date | null;
  rule_ids: string[];
}

export async function listGiveawayEntries(
  giveawayId: string,
  limit: number,
  offset: number,
): Promise<GiveawayEntryRow[]> {
  const rows = await query<Omit<GiveawayEntryRow, 'tickets'> & { tickets: string }>(
    `SELECT
       r.id AS realtor_id,
       r.email,
       r.first_name,
       r.last_name,
       COUNT(e.id) AS tickets,
       MIN(e.completed_at) AS first_entry_at,
       MAX(e.completed_at) AS last_entry_at,
       array_agg(e.rule_id) AS rule_ids
     FROM giveaway_entries e
     JOIN realtors r ON r.id = e.realtor_id
     WHERE e.giveaway_id = $1
     GROUP BY r.id, r.email, r.first_name, r.last_name
     ORDER BY tickets DESC, last_entry_at DESC
     LIMIT $2 OFFSET $3`,
    [giveawayId, limit, offset],
  );
  return rows.map((r) => ({ ...r, tickets: Number(r.tickets) }));
}

// -----------------------------------------------------------------------------
// Draw winner (transaction)
// -----------------------------------------------------------------------------

export interface DrawResult {
  winner: { id: string; email: string; first_name: string; last_name: string };
  giveaway: {
    id: string;
    title: string;
    prize: string;
    publication: string;
  };
}

export type DrawError =
  | { kind: 'not_found' }
  | { kind: 'already_drawn' }
  | { kind: 'not_ended' }
  | { kind: 'no_entries' };

export async function drawGiveawayWinner(
  giveawayId: string,
  adminId: string,
): Promise<{ ok: true; result: DrawResult } | { ok: false; error: DrawError }> {
  return withNeonTransaction(async (client) => {
    const { rows: g } = await client.query<{
      id: string;
      status: string;
      winner_realtor_id: string | null;
      ends_at: Date;
      title: string;
      prize: string;
      publication: string;
    }>(
      `SELECT id, status, winner_realtor_id, ends_at, title, prize, publication
       FROM giveaways WHERE id = $1
       FOR UPDATE`,
      [giveawayId],
    );

    const giveaway = g[0];
    if (!giveaway) return { ok: false as const, error: { kind: 'not_found' as const } };
    if (giveaway.winner_realtor_id)
      return { ok: false as const, error: { kind: 'already_drawn' as const } };
    if (new Date(giveaway.ends_at).getTime() > Date.now())
      return { ok: false as const, error: { kind: 'not_ended' as const } };

    // Each entry row counts as one ticket — random() over rows gives
    // proportional odds to realtors with multiple completed rules.
    const { rows: pick } = await client.query<{ realtor_id: string }>(
      `SELECT realtor_id
       FROM giveaway_entries
       WHERE giveaway_id = $1
       ORDER BY random()
       LIMIT 1`,
      [giveawayId],
    );

    if (!pick[0]) return { ok: false as const, error: { kind: 'no_entries' as const } };

    await client.query(
      `UPDATE giveaways
       SET winner_realtor_id = $1,
           winner_drawn_at = NOW(),
           drawn_by_admin_id = $2,
           status = 'closed',
           updated_at = NOW()
       WHERE id = $3`,
      [pick[0].realtor_id, adminId, giveawayId],
    );

    const { rows: r } = await client.query<{
      id: string;
      email: string;
      first_name: string;
      last_name: string;
    }>(
      `SELECT id, email, first_name, last_name FROM realtors WHERE id = $1`,
      [pick[0].realtor_id],
    );

    return {
      ok: true as const,
      result: {
        winner: r[0]!,
        giveaway: {
          id: giveaway.id,
          title: giveaway.title,
          prize: giveaway.prize,
          publication: giveaway.publication,
        },
      },
    };
  });
}
