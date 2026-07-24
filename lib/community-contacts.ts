// lib/community-contacts.ts
//
// "Request more information" contact links for inventory listings.
//
// Two layers, checked in order:
//   1. COMMUNITY_CONTACT_LINKS — per-community (builder + community) URLs to
//      the builder's own contact form (e.g. Newmark's #contactarea, David
//      Weekley's #schedule-tour-form-scroll-anchor). The builder's form
//      forwards the lead to their sales team.
//   2. BUILDER_SALES_LINKS — a single builder-level sales page for builders
//      that don't expose per-community forms (e.g. M/I Homes' central sales
//      selector).
//
// Listings with no match at either layer fall back to the inline email form
// (POST /api/listing-inquiry), which forwards to the builder's sales-team
// email when configured (lib/builder-contacts.ts) and CCs the RNN inbox.
//
// Per-community key: `${builderName}||${communityName}`. Community names can
// repeat across builders, so the builder scopes them. Matched case-
// insensitively against inventory row.builderName + row.communityName.

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

// Drees Homes community contact pages. Drees' move-in-ready scraper emits
// plan-suffixed community names (e.g. "Provence - 60'", "The Hollows Canyon -
// 60'", "Rough Hollow The District"), so these are matched by containment
// (longest name first) rather than exact key. Community rows use the clean
// communityName, which the contains-match also satisfies. URLs are the
// builder's per-community contact/location section. Clearwater Ranch (no
// user-provided URL) is derived from Drees' community API.
export const DREES_COMMUNITY_LINKS: { name: string; url: string }[] = [
  { name: "Wolf Ranch West Bend", url: "https://www.dreeshomes.com/new-homes-austin/georgetown-tx/wolf-ranch/?mapState=false&view=neighborhoods&sort=Price-Asc#community-location-block" },
  { name: "Wolf Ranch South Fork", url: "https://www.dreeshomes.com/new-homes-austin/georgetown-tx/wolf-ranch-south-fork/wolf-ranch-south-fork/?mapState=false&view=floorplans&sort=Price-Asc#neighborhood-block:-location-info" },
  { name: "Lakeside Estates", url: "https://www.dreeshomes.com/new-homes-austin/lakeway-tx/comm-lakeside-estates/lakeside-estates/?mapState=false&view=floorplans&sort=Price-Asc#neighborhood-block:-location-info" },
  { name: "Las Brisas Estates", url: "https://www.dreeshomes.com/new-homes-austin/lakeway-tx/las-brisas-estates/las-brisas-estates/?mapState=false&view=floorplans&sort=Price-Asc#neighborhood-block:-location-info" },
  { name: "Hilltop Ranch", url: "https://www.dreeshomes.com/new-homes-austin/leander-tx/comm-hilltop-ranch/hilltop-ranch/?mapState=false&view=floorplans&sort=Price-Asc#neighborhood-block:-location-info" },
  { name: "Clara Vista", url: "https://www.dreeshomes.com/new-homes-austin/kyle-tx/clara-vista/clara-vista-80/?mapState=false&view=floorplans&sort=Price-Asc#neighborhood-block:-location-info" },
  { name: "Silverleaf", url: "https://www.dreeshomes.com/new-homes-austin/bastrop/comm-silverleaf/silverleaf/?mapState=false&view=floorplans&sort=Price-Asc#neighborhood-block:-location-info" },
  { name: "Northline", url: "https://www.dreeshomes.com/new-homes-austin/leander-tx/northline/northline/?mapState=false&view=floorplans&sort=Price-Asc#neighborhood-block:-location-info" },
  { name: "Parmer Ranch", url: "https://www.dreeshomes.com/new-homes-austin/georgetown-tx/comm-parmer-ranch/parmer-ranch-60/?mapState=false&view=floorplans&sort=Price-Asc#neighborhood-block:-location-info" },
  { name: "Clearwater Ranch", url: "https://www.dreeshomes.com/new-homes-austin/liberty-hill-tx/clearwater-ranch/clearwater-ranch/?mapState=false&view=floorplans&sort=Price-Asc#neighborhood-block:-location-info" },
  { name: "Caliterra", url: "https://www.dreeshomes.com/new-homes-austin/dripping-springs-tx/caliterra/?mapState=false&view=neighborhoods&sort=Price-Asc#community-location-block" },
  { name: "Lariat", url: "https://www.dreeshomes.com/new-homes-austin/liberty-hill-tx/lariat/?mapState=false&view=neighborhoods&sort=Price-Asc#community-location-block" },
  { name: "The Hollows", url: "https://www.dreeshomes.com/new-homes-austin/jonestown-tx/the-hollows/?mapState=false&view=neighborhoods&sort=Price-Asc#community-location-block" },
  { name: "Rough Hollow", url: "https://www.dreeshomes.com/new-homes-austin/lakeway-tx/rough-hollow/?mapState=false&view=neighborhoods&sort=Price-Asc#community-location-block" },
  { name: "The Colony", url: "https://www.dreeshomes.com/new-homes-austin/bastrop/comm-colony/?mapState=false&view=neighborhoods&sort=Price-Asc#community-location-block" },
  { name: "Provence", url: "https://www.dreeshomes.com/new-homes-austin/austin-tx/provence/provence-60/?mapState=false&view=floorplans&sort=Price-Asc#neighborhood-block:-location-info" },
];

// Builder-level sales pages for builders without per-community contact
// forms. Used as a fallback when no per-community link matches.
export const BUILDER_SALES_LINKS: Record<string, string> = {
  // M/I Homes uses a single central sales page (a market selector) rather
  // than per-community contact forms.
  'M/I Homes': 'https://www.mihomes.com/support/sales',
};

export function getCommunityContactLink(
  builderName: string | null | undefined,
  communityName: string | null | undefined,
): string | null {
  const b = builderName?.trim();
  if (!b) return null;
  const c = communityName?.trim();

  // 1. Per-community link (Newmark, David Weekley).
  if (c) {
    const key = `${b}||${c}`;
    if (COMMUNITY_CONTACT_LINKS[key]) return COMMUNITY_CONTACT_LINKS[key];
    const found = Object.entries(COMMUNITY_CONTACT_LINKS).find(
      ([k]) => k.toLowerCase() === key.toLowerCase(),
    );
    if (found) return found[1];
  }

  // 2. Drees fuzzy match — plan-suffixed home communityNames (e.g.
  //    "Provence - 60'") contain the clean community name.
  if (c && b.toLowerCase() === 'drees homes') {
    const lower = c.toLowerCase();
    const byLen = [...DREES_COMMUNITY_LINKS].sort(
      (a, z) => z.name.length - a.name.length,
    );
    for (const { name, url } of byLen) {
      if (name.length > 0 && lower.includes(name.toLowerCase())) return url;
    }
  }

  // 3. Builder-level sales page (M/I Homes, …).
  if (BUILDER_SALES_LINKS[b]) return BUILDER_SALES_LINKS[b];
  const bFound = Object.entries(BUILDER_SALES_LINKS).find(
    ([k]) => k.toLowerCase() === b.toLowerCase(),
  );
  return bFound ? bFound[1] : null;
}
