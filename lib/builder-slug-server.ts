// lib/builder-slug-server.ts — server-only DB helpers.

import { neon } from '@neondatabase/serverless';
import { builderNameToSlug } from './builder-slug';

const sql = neon(process.env.DATABASE_URL!);

export async function slugToBuilderName(slug: string): Promise<string | null> {
  // Match against BOTH builder_name and developer_name so that developer-
  // only entities (rows where a name appears exclusively as developer_name,
  // e.g. "The Hollows at Lake Travis") also resolve. Kept in lockstep with
  // summarizeBuilders(), which keys on developer_name || builder_name.
  const rows = (await sql`
    SELECT DISTINCT name FROM (
      SELECT b.builder_name AS name
      FROM builder_inventory b
      LEFT JOIN builder_page_visibility v ON v.builder_name = b.builder_name
      WHERE b.status = 'active'
        AND COALESCE(v.public_enabled, true) = true
      UNION
      SELECT b.developer_name AS name
      FROM builder_inventory b
      LEFT JOIN builder_page_visibility v ON v.builder_name = b.developer_name
      WHERE b.status = 'active'
        AND b.developer_name IS NOT NULL
        AND COALESCE(v.public_enabled, true) = true
    ) t
    WHERE name IS NOT NULL
  `) as { name: string }[];

  const target = slug.toLowerCase();
  for (const r of rows) {
    if (builderNameToSlug(r.name) === target) {
      return r.name;
    }
  }
  return null;
}
