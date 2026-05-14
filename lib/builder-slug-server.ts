// lib/builder-slug-server.ts — server-only DB helpers.

import { neon } from '@neondatabase/serverless';
import { builderNameToSlug } from './builder-slug';

const sql = neon(process.env.DATABASE_URL!);

export async function slugToBuilderName(slug: string): Promise<string | null> {
  const rows = (await sql`
    SELECT DISTINCT builder_name FROM builder_inventory
    WHERE status = 'active'
  `) as { builder_name: string }[];

  const target = slug.toLowerCase();
  for (const r of rows) {
    if (builderNameToSlug(r.builder_name) === target) {
      return r.builder_name;
    }
  }
  return null;
}

export async function listActiveBuilders(): Promise<string[]> {
  const rows = (await sql`
    SELECT DISTINCT builder_name FROM builder_inventory
    WHERE status = 'active'
    ORDER BY builder_name ASC
  `) as { builder_name: string }[];
  return rows.map((r) => r.builder_name);
}
