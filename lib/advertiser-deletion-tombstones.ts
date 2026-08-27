import { getSql } from '@/lib/db';

type PartnerIdentity = {
  email?: string | null;
  name?: string | null;
  slug?: string | null;
};

function normalize(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase() ?? '';
  return normalized || null;
}

export function partnerDeletionTombstoneKey(identity: PartnerIdentity): string {
  const email = normalize(identity.email);
  if (email) return email;
  const slug = normalize(identity.slug);
  if (slug) return `__slug__:${slug}`;
  return `__name__:${normalize(identity.name) ?? 'unknown'}`;
}

export async function isPartnerDeletionTombstoned(identity: PartnerIdentity): Promise<boolean> {
  const sql = getSql();
  const email = normalize(identity.email);
  const name = normalize(identity.name);
  const slug = normalize(identity.slug);
  const syntheticSlugKey = slug ? `__slug__:${slug}` : null;
  const syntheticNameKey = name ? `__name__:${name}` : null;

  try {
    const rows = (await sql`
      SELECT 1
      FROM advertiser_deletion_tombstones
      WHERE (${email}::text IS NOT NULL AND normalized_email = ${email})
         OR (${syntheticSlugKey}::text IS NOT NULL AND normalized_email = ${syntheticSlugKey})
         OR (${syntheticNameKey}::text IS NOT NULL AND normalized_email = ${syntheticNameKey})
         OR (${slug}::text IS NOT NULL AND LOWER(COALESCE(original_slug, '')) = ${slug})
         OR (${name}::text IS NOT NULL AND LOWER(COALESCE(original_name, '')) = ${name})
      LIMIT 1
    `) as unknown as Array<{ '?column?': number }>;
    return rows.length > 0;
  } catch {
    return false;
  }
}
