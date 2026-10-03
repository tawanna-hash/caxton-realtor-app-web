import { ensureSchema, getSql } from '@/lib/db';
import { ensureBuilderInventorySchema } from '@/lib/builder-inventory';
import { ensurePublicationColumn, parsePublications, type PublicationKey } from '@/lib/publication-theme';
import type { ReferralProvider } from '@/app/(public)/agents/AgentToolsPanels';

type AdvertiserRow = ReferralProvider & { publication: string | null };

/** Featured local partners visible in the agent's market. Returns [] if the directory is unavailable. */
export async function loadReferralProviders(agentMarket: string | undefined): Promise<ReferralProvider[]> {
  let providers: ReferralProvider[] = [];
  // The command center remains useful even if the directory database is
  // temporarily unavailable. The only affected area is the live provider list;
  // no agent workflow or contract data is ever written from this public page.
  try {
    await ensureSchema();
    await ensureBuilderInventorySchema();
    await ensurePublicationColumn();
    const sql = getSql();
    const rows = (await sql`
      SELECT id, name, slug, website, publication, industry, tagline
      FROM advertisers
      WHERE COALESCE(status, 'advertiser') IN ('advertiser', 'active')
        AND NULLIF(TRIM(COALESCE(industry, '')), '') IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM builder_page_visibility v
          WHERE LOWER(TRIM(v.builder_name)) = LOWER(TRIM(advertisers.name))
            AND v.public_enabled = false
        )
      ORDER BY name ASC
    `) as unknown as AdvertiserRow[];

        providers = rows
      .filter((row) => {
        if (agentMarket === 'both') return true;
        return parsePublications(row.publication).includes(agentMarket as PublicationKey);
      })
      .map(({ publication: _publication, ...provider }) => provider);
  } catch (error) {
    console.error('[Closing Time] Partner directory unavailable', error);
  }

  return providers;
}
