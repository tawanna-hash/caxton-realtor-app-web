// lib/community-contacts.ts
//
// Per-community "Request more information" contact links. Each entry maps a
// builder + community to the builder's own contact form on their site (e.g.
// Newmark's per-community #contactarea). The inventory detail "Request more
// information" CTA links out to it — the builder's form forwards the lead to
// their sales team. Communities without an entry fall back to the inline
// email form (POST /api/listing-inquiry).
//
// Key: `${builderName}||${communityName}`. Community names can repeat across
// builders, so the builder scopes them. Matched case-insensitively against
// inventory row.builderName + row.communityName.

export const COMMUNITY_CONTACT_LINKS: Record<string, string> = {
  // Newmark Homes (Austin-area communities)
  'Newmark Homes||Anthem':
    'https://newmarkhomes.com/new-homes/austin/kyle/anthem#contactarea',
  'Newmark Homes||Cimarron Hills':
    'https://newmarkhomes.com/new-homes/austin/georgetown/fedrick-harris-estate-homes-cimarron-hills#contactarea',
  'Newmark Homes||Easton Park':
    'https://newmarkhomes.com/new-homes/austin/austin/eastonpark#contactarea',
  'Newmark Homes||La Cima':
    'https://newmarkhomes.com/new-homes/austin/san-marcos/lacima#contactarea',
  'Newmark Homes||Provence':
    'https://newmarkhomes.com/new-homes/austin/austin/provence#contactarea',
  'Newmark Homes||Sweetwater':
    'https://newmarkhomes.com/new-homes/austin/austin/sweetwater#contactarea',
};

export function getCommunityContactLink(
  builderName: string | null | undefined,
  communityName: string | null | undefined,
): string | null {
  const b = builderName?.trim();
  const c = communityName?.trim();
  if (!b || !c) return null;
  const key = `${b}||${c}`;
  if (COMMUNITY_CONTACT_LINKS[key]) return COMMUNITY_CONTACT_LINKS[key];
  const found = Object.entries(COMMUNITY_CONTACT_LINKS).find(
    ([k]) => k.toLowerCase() === key.toLowerCase(),
  );
  return found ? found[1] : null;
}
