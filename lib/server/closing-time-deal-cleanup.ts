import { query } from '@/lib/server/db/neon';
import { agentCommandCenterWorkspaceSchema } from '@/lib/agent-command-center-workspace';

/**
 * A deal is live while it exists in the agent's workspace, is not a template and is not completed (closed).
 * Anything that would still message someone about a deal that is no longer live is retired here:
 * follow-up drafts, document requests, signature chases, title closing requests and e-sign reminders.
 * The records stay for history; they just stop sending.
 */
export function liveDealIds(workspace: unknown): Set<string> {
  const parsed = agentCommandCenterWorkspaceSchema.safeParse(workspace);
  return new Set(parsed.success ? parsed.data.deals.filter((d) => d.status !== 'completed' && !d.isTemplate).map((d) => d.id) : []);
}

export async function retireDealNotifications(realtorId: string, live: Set<string>): Promise<void> {
  const ids = [...live];
  const gone = `AND NOT (deal_id = ANY($2::text[]))`;
  await query(`UPDATE closing_time_followups SET status='dismissed' WHERE realtor_id=$1 AND status='draft' ${gone}`, [realtorId, ids]);
  await query(`UPDATE closing_time_doc_requests SET status='cancelled' WHERE realtor_id=$1 AND status='pending' ${gone}`, [realtorId, ids]);
  await query(`UPDATE closing_time_signatures SET status='cancelled', closed_at=NOW() WHERE realtor_id=$1 AND status='open' ${gone}`, [realtorId, ids]);
  await query(`UPDATE closing_time_closing_requests SET status='cancelled', updated_at=NOW() WHERE realtor_id=$1 AND status IN ('awaiting_title','awaiting_choice') ${gone}`, [realtorId, ids]);
  await query(`UPDATE closing_time_sign_requests SET opts = COALESCE(opts, '{}'::jsonb) || '{"remindEvery":0}'::jsonb WHERE realtor_id=$1 AND status='sent' AND COALESCE((opts->>'remindEvery')::int,0) > 0 ${gone}`, [realtorId, ids]);
}

/** Run at the start of every cron pass so nothing is sent for a removed or closed deal, whatever path removed it. */
export async function retireAllOrphanNotifications(): Promise<{ agents: number; errors: string[] }> {
  const out = { agents: 0, errors: [] as string[] };
  const rows = await query<{ realtor_id: string; workspace: unknown }>(`SELECT realtor_id, workspace FROM agent_command_center_workspaces`);
  for (const r of rows) {
    try { await retireDealNotifications(r.realtor_id, liveDealIds(r.workspace)); out.agents += 1; }
    catch (e) { out.errors.push(`${r.realtor_id}: ${String(e)}`); }
  }
  return out;
}
