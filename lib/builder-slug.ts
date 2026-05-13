// lib/builder-slug.ts
//
// Slug helpers for /builders/[slug] routes.
//
// Round-trip strategy:
//   - builderToSlug() converts a display name to URL slug
//   - slugToBuilderName() reverses it by querying the DB for an exact match
//     among known builder names (since the slug isn't lossless for arbitrary
//     names — e.g. "M/I Homes" → "mi-homes" loses the slash).
//
// Display names known to S13 scrapers/data:
//   David Weekley Homes → david-weekley-homes
//   KB Home             → kb-home
//   M/I Homes           → mi-homes
//   Giddens Homes       → giddens-homes

export function builderNameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\/\\&]/g, '-')      // slashes, ampersands → dashes
    .replace(/[^a-z0-9\s-]/g, '')  // strip everything else non-alphanumeric (except space, dash)
    .replace(/\s+/g, '-')           // spaces → dashes
    .replace(/-+/g, '-')            // collapse multiple dashes
    .replace(/^-+|-+$/g, '');       // trim leading/trailing dashes
}

// Reverse a slug to a builder name by querying the DB. Returns null if no
// builder with that slugified name is found.
import { neon } from '@neondatabase/serverless';
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

// Helper: get the active list of distinct builders for the chip strip.
// Returns alphabetically-sorted display names.
export async function listActiveBuilders(): Promise<string[]> {
  const rows = (await sql`
    SELECT DISTINCT builder_name FROM builder_inventory
    WHERE status = 'active'
    ORDER BY builder_name ASC
  `) as { builder_name: string }[];
  return rows.map((r) => r.builder_name);
}
