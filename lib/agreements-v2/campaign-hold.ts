// Blocks activating / approving an ad campaign whose agreement is still
// waiting on payment (eBlast, app, digital).
import { getSql } from '@/lib/db';
import { ApiError } from '@/lib/server/error';
import { getServiceHold } from '@/lib/agreements-v2/service-hold';

export async function assertCampaignNotOnHold(campaignId: string): Promise<void> {
  const sql = getSql();
  const rows = (await sql`SELECT agreement_id FROM ad_campaigns WHERE id = ${campaignId}`.catch(() => [])) as unknown as Array<{ agreement_id: string | null }>;
  const agreementId = rows[0]?.agreement_id;
  if (!agreementId) return;
  const hold = await getServiceHold(sql, agreementId);
  if (hold?.held) {
    throw new ApiError(409, 'Payment has not been received for this agreement. Mark payment received before scheduling this service.');
  }
}
