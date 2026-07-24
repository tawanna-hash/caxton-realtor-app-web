// lib/builder-inventory-sync.ts
//
// Pruning helpers for builder_inventory: mark rows 'expired' when they leave a
// builder's source feed (sold / off-market inventory homes). Kept in its own
// module so the prune pass can ship independently of in-flight work in
// builder-inventory.ts.
//
// 'expired' is a terminal, non-active status (added by migration
// 2026_06_22__add_status_expired). The public feed filters to status='active',
// so expired rows disappear from the quick-move-in / inventory pages.

import { neon } from '@neondatabase/serverless';
import { ensureBuilderInventorySchema, type HomeType } from './builder-inventory';

const sql = neon(process.env.DATABASE_URL!);

/**
 * Mark builder_inventory rows status='expired' when their external_id is no
 * longer present in a scrape. After upserting the current set, any previously
 * active scraper row (kind='listing', home_type=<homeType>) for this builder
 * whose external_id is NOT in `activeExternalIds` is set to 'expired'.
 *
 * Safety:
 *  - Returns 0 when activeExternalIds is empty — a transient empty scrape never
 *    nukes the whole set.
 *  - Rows with a NULL external_id (human-submitted listings) are never
 *    deactivated, since NULL <> ALL(...) is NULL (not true).
 *
 * Returns the count of rows deactivated.
 */
export async function deactivateStaleBuilderInventory(args: {
  builderName: string;
  homeType: HomeType;
  activeExternalIds: string[];
}): Promise<number> {
  await ensureBuilderInventorySchema();
  const { builderName, homeType, activeExternalIds } = args;
  if (activeExternalIds.length === 0) return 0;

  const rows = await sql`
    UPDATE builder_inventory
    SET status = 'expired'
    WHERE builder_name = ${builderName}
      AND home_type   = ${homeType}
      AND kind        = 'listing'
      AND status      = 'active'
      AND external_id IS NOT NULL
      AND external_id <> ALL (${activeExternalIds}::text[])
    RETURNING id
  `;
  return Array.isArray(rows) ? rows.length : 0;
}


/**
 * DELETE builder_inventory promotion rows for a builder that are no longer
 * present in a scrape. After upserting the current promotions, any scraper-
 * produced promotion row (kind='promotion') for this builder whose external_id
 * is NOT in `activeExternalIds` is deleted (cascades to subordinate rows via
 * the inventory_id FK).
 *
 * Safety:
 *  - Returns 0 when activeExternalIds is empty — a transient empty scrape never
 *    wipes the set.
 *  - Rows with a NULL external_id (human-submitted promotions) are never
 *    deleted, since NULL <> ALL(...) is NULL (not true).
 *
 * Returns the count of rows deleted.
 */
export async function deleteStaleBuilderPromotions(args: {
  builderName: string;
  activeExternalIds: string[];
}): Promise<number> {
  await ensureBuilderInventorySchema();
  const { builderName, activeExternalIds } = args;
  if (activeExternalIds.length === 0) return 0;

  const rows = await sql`
    DELETE FROM builder_inventory
    WHERE builder_name = ${builderName}
      AND kind        = 'promotion'
      AND external_id IS NOT NULL
      AND external_id <> ALL (${activeExternalIds}::text[])
    RETURNING id
  `;
  return Array.isArray(rows) ? rows.length : 0;
}
