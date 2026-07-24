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

  // David Weekley Homes (Austin-area communities — 'Schedule Your Personal
  // Tour' form, anchored to #schedule-tour-form-scroll-anchor). Names are
  // sourced from davidweekleyhomes.com/Search/CommunityData (market 4),
  // which is also where the inventory scraper derives communityName.
  "David Weekley Homes||Build on Your Lot - Classic Collection":
    "https://www.davidweekleyhomes.com/new-homes/tx/austin/austin/suburban-build-on-your-lot-executive-collection#schedule-tour-form-scroll-anchor",
  "David Weekley Homes||Build on Your Lot - Urban Collection":
    "https://www.davidweekleyhomes.com/new-homes/tx/austin/austin/urban-build-on-your-lot-urban-collection#schedule-tour-form-scroll-anchor",
  "David Weekley Homes||Sunfield":
    "https://www.davidweekleyhomes.com/new-homes/tx/austin/buda/sunfield#schedule-tour-form-scroll-anchor",
  "David Weekley Homes||Goodnight Ranch":
    "https://www.davidweekleyhomes.com/new-homes/tx/austin/austin/goodnight-ranch-40#schedule-tour-form-scroll-anchor",
  "David Weekley Homes||Rees Landing Estates":
    "https://www.davidweekleyhomes.com/new-homes/tx/austin/spicewood/rees-landing-estates#schedule-tour-form-scroll-anchor",
  "David Weekley Homes||The Point at Rough Hollow":
    "https://www.davidweekleyhomes.com/new-homes/tx/austin/lakeway/the-point-at-rough-hollow#schedule-tour-form-scroll-anchor",
  "David Weekley Homes||La Cima":
    "https://www.davidweekleyhomes.com/new-homes/tx/austin/san-marcos/la-cima#schedule-tour-form-scroll-anchor",
  "David Weekley Homes||The Twilight at Goodnight Ranch":
    "https://www.davidweekleyhomes.com/new-homes/tx/austin/austin/the-twilight-at-goodnight-ranch#schedule-tour-form-scroll-anchor",
  "David Weekley Homes||Headwaters 50' - Executive Series":
    "https://www.davidweekleyhomes.com/new-homes/tx/austin/dripping-springs/headwaters-50-executive-series#schedule-tour-form-scroll-anchor",
  "David Weekley Homes||South Brook":
    "https://www.davidweekleyhomes.com/new-homes/tx/austin/leander/south-brook#schedule-tour-form-scroll-anchor",
  "David Weekley Homes||Easton Park - Nelson Village - Jewel Series":
    "https://www.davidweekleyhomes.com/new-homes/tx/austin/austin/nelson-village-at-easton-park-29#schedule-tour-form-scroll-anchor",
  "David Weekley Homes||Easton Park \u2013 Nelson Village - Haven Series":
    "https://www.davidweekleyhomes.com/new-homes/tx/austin/austin/nelson-village-at-easton-park-34#schedule-tour-form-scroll-anchor",
  "David Weekley Homes||Double Creek Crossing":
    "https://www.davidweekleyhomes.com/new-homes/tx/austin/round-rock/double-creek-crossing-city-home-series#schedule-tour-form-scroll-anchor",
  "David Weekley Homes||The Colony":
    "https://www.davidweekleyhomes.com/new-homes/tx/austin/bastrop/the-colony-riverside#schedule-tour-form-scroll-anchor",
  "David Weekley Homes||Wolf Ranch \u2013 West Bend":
    "https://www.davidweekleyhomes.com/new-homes/tx/austin/georgetown/wolf-ranch#schedule-tour-form-scroll-anchor",
  "David Weekley Homes||Leander Estates":
    "https://www.davidweekleyhomes.com/new-homes/tx/austin/leander/leander-estates#schedule-tour-form-scroll-anchor",
  "David Weekley Homes||Caliterra 80'":
    "https://www.davidweekleyhomes.com/new-homes/tx/austin/dripping-springs/caliterra#schedule-tour-form-scroll-anchor",
  "David Weekley Homes||Central Living \u2013 Urban Quick Move-in Homes":
    "https://www.davidweekleyhomes.com/new-homes/tx/austin/austin/central-living-urban-quick-move-in-homes#schedule-tour-form-scroll-anchor",
  "David Weekley Homes||Kissing Tree \u2013 Grove Series":
    "https://www.davidweekleyhomes.com/new-homes/tx/austin/san-marcos/kissing-tree-grove-series#schedule-tour-form-scroll-anchor",
  "David Weekley Homes||Kissing Tree \u2013 Summit Series":
    "https://www.davidweekleyhomes.com/new-homes/tx/austin/san-marcos/kissing-tree-summit-series#schedule-tour-form-scroll-anchor",
  "David Weekley Homes||Kissing Tree \u2013 Vista Series":
    "https://www.davidweekleyhomes.com/new-homes/tx/austin/san-marcos/kissing-tree-vista-series#schedule-tour-form-scroll-anchor",
  "David Weekley Homes||Kissing Tree \u2013 Spruce Series":
    "https://www.davidweekleyhomes.com/new-homes/tx/austin/san-marcos/kissing-tree-spruce-series#schedule-tour-form-scroll-anchor",
  "David Weekley Homes||Headwaters 60' - Executive Series":
    "https://www.davidweekleyhomes.com/new-homes/tx/austin/dripping-springs/headwaters-60-executive-series#schedule-tour-form-scroll-anchor",
  "David Weekley Homes||Flora":
    "https://www.davidweekleyhomes.com/new-homes/tx/austin/hutto/flora#schedule-tour-form-scroll-anchor",
  "David Weekley Homes||Double Creek Crossing Townhomes":
    "https://www.davidweekleyhomes.com/new-homes/tx/austin/round-rock/double-creek-crossing-townhomes#schedule-tour-form-scroll-anchor",
  "David Weekley Homes||Caliterra 100\u2019":
    "https://www.davidweekleyhomes.com/new-homes/tx/austin/dripping-springs/caliterra-100#schedule-tour-form-scroll-anchor",
  "David Weekley Homes||Headwaters 80' - Executive Series":
    "https://www.davidweekleyhomes.com/new-homes/tx/austin/dripping-springs/headwaters-80#schedule-tour-form-scroll-anchor",
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
