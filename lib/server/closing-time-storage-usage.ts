import { query } from '@/lib/server/db/neon';

const PRICE_PER_GB = 0.35;
const tableExists = async (name: string) => (await query<{ t: string | null }>(`SELECT to_regclass($1)::text AS t`, [name]))[0]?.t != null;

export type StorageUsage = {
  databaseBytes: number;
  closingTimeBytes: number;
  held: { count: number; bytes: number };
  stored: { count: number };
  signing: { count: number; bytes: number };
  archivedDeals: number;
  platformArchive: { count: number; bytes: number };
  tables: { name: string; bytes: number }[];
  topAgents: { email: string; files: number; bytes: number }[];
  monthlyCostDollars: number;
};

/** What the database holds for Closing Time, and how much of it is files that could move to the agent's own storage. */
export async function storageUsage(): Promise<StorageUsage> {
  const db = await query<{ b: string }>(`SELECT pg_database_size(current_database())::text AS b`);
  const tables = await query<{ name: string; bytes: string }>(
    `SELECT relname AS name, pg_total_relation_size(relid)::text AS bytes FROM pg_stat_user_tables WHERE relname LIKE 'closing_time%' OR relname = 'agent_command_center_workspaces' ORDER BY pg_total_relation_size(relid) DESC LIMIT 12`);
  let held = { count: 0, bytes: 0 }; let stored = { count: 0 }; let topAgents: StorageUsage['topAgents'] = [];
  if (await tableExists('closing_time_portal_uploads')) {
    const h = await query<{ n: string; b: string }>(`SELECT COUNT(*)::text AS n, COALESCE(SUM(length(data_b64)),0)::text AS b FROM closing_time_portal_uploads WHERE data_b64 <> ''`);
    held = { count: Number(h[0]?.n ?? 0), bytes: Number(h[0]?.b ?? 0) };
    const st = await query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM closing_time_portal_uploads WHERE data_b64 = ''`);
    stored = { count: Number(st[0]?.n ?? 0) };
    const top = await query<{ email: string; n: string; b: string }>(
      `SELECT r.email, COUNT(*)::text AS n, SUM(length(u.data_b64))::text AS b FROM closing_time_portal_uploads u JOIN realtors r ON r.id=u.realtor_id WHERE u.data_b64 <> '' GROUP BY r.email ORDER BY SUM(length(u.data_b64)) DESC LIMIT 10`);
    topAgents = top.map((t) => ({ email: t.email, files: Number(t.n), bytes: Number(t.b) }));
  }
  let signing = { count: 0, bytes: 0 };
  if (await tableExists('closing_time_sign_requests')) {
    const s = await query<{ n: string; b: string }>(`SELECT COUNT(*)::text AS n, COALESCE(SUM(length(original_b64) + COALESCE(length(signed_b64),0)),0)::text AS b FROM closing_time_sign_requests WHERE original_b64 <> ''`);
    signing = { count: Number(s[0]?.n ?? 0), bytes: Number(s[0]?.b ?? 0) };
  }
  let archivedDeals = 0;
  if (await tableExists('closing_time_archives')) archivedDeals = Number((await query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM closing_time_archives`))[0]?.n ?? 0);
  let platformArchive = { count: 0, bytes: 0 };
  if (await tableExists('closing_time_platform_archives')) {
    const a = await query<{ n: string; b: string }>(`SELECT COUNT(*)::text AS n, COALESCE(SUM(size_bytes),0)::text AS b FROM closing_time_platform_archives`);
    platformArchive = { count: Number(a[0]?.n ?? 0), bytes: Number(a[0]?.b ?? 0) };
  }
  const databaseBytes = Number(db[0]?.b ?? 0);
  return {
    databaseBytes, closingTimeBytes: tables.reduce((n, t) => n + Number(t.bytes), 0), held, stored, signing, archivedDeals, platformArchive,
    tables: tables.map((t) => ({ name: t.name, bytes: Number(t.bytes) })), topAgents,
    monthlyCostDollars: (databaseBytes / 1024 ** 3) * PRICE_PER_GB,
  };
}
