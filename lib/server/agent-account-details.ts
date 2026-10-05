import { z } from 'zod';
import { query } from '@/lib/server/db/neon';

export const agentAccountDetailsSchema = z.object({
  brokerage: z.string().trim().max(200).default(''),
  address: z.string().trim().max(300).default(''),
  agentId: z.string().trim().max(60).default(''),
  agentName: z.string().trim().max(120).default(''),
  brokerName: z.string().trim().max(120).default(''),
  brokerEmail: z.string().trim().max(200).default(''),
}).strict();

export type AgentAccountDetails = z.infer<typeof agentAccountDetailsSchema>;

export const EMPTY_AGENT_ACCOUNT_DETAILS: AgentAccountDetails = {
  brokerage: '', address: '', agentId: '', agentName: '', brokerName: '', brokerEmail: '',
};

let schemaPromise: Promise<void> | null = null;

function ensureSchema(): Promise<void> {
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS agent_account_details (
        realtor_id UUID PRIMARY KEY REFERENCES realtors(id) ON DELETE CASCADE,
        details JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  })().catch((error) => {
    schemaPromise = null;
    throw error;
  });
  return schemaPromise;
}

export async function getAgentAccountDetails(realtorId: string): Promise<AgentAccountDetails | null> {
  await ensureSchema();
  const rows = await query<{ details: unknown }>(
    `SELECT details FROM agent_account_details WHERE realtor_id = $1 LIMIT 1`,
    [realtorId],
  );
  if (!rows[0]) return null;
  const parsed = agentAccountDetailsSchema.safeParse(rows[0].details);
  return parsed.success ? parsed.data : { ...EMPTY_AGENT_ACCOUNT_DETAILS };
}

export async function saveAgentAccountDetails(realtorId: string, details: AgentAccountDetails): Promise<AgentAccountDetails> {
  await ensureSchema();
  const clean = agentAccountDetailsSchema.parse(details);
  await query(
    `INSERT INTO agent_account_details (realtor_id, details, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (realtor_id) DO UPDATE SET details = EXCLUDED.details, updated_at = NOW()`,
    [realtorId, JSON.stringify(clean)],
  );
  return clean;
}
