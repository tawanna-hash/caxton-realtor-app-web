// lib/realtor-resources.ts
//
// Hardcoded config for the public /resources page (REALTOR Resources).
// Edit this file to add or update entries. No DB, no admin UI yet.

export interface ResourceGuide {
  /** Display title */
  title: string;
  /** Short blurb shown under the title */
  description: string;
  /** PDF (or other downloadable) URL. External links are fine. */
  href: string;
  /** Optional category label, e.g. "Buyer", "Seller", "New Build" */
  category?: string;
}

export interface ResourceLink {
  title: string;
  description: string;
  href: string;
  /** Site/source label */
  source?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — Downloadable PDFs / guides
// ─────────────────────────────────────────────────────────────────────────────
export const RESOURCE_GUIDES: ResourceGuide[] = [
  {
    title: 'New-Build Buyer Checklist',
    description: 'Step-by-step checklist for representing buyers in new construction transactions in the Austin metro.',
    href: '#',
    category: 'New Build',
  },
  {
    title: 'Builder Co-Broke Quick Reference',
    description: 'Commission structures, registration rules, and pitfalls for top Austin-area builders.',
    href: '#',
    category: 'New Build',
  },
  {
    title: 'Listing Prep & Pricing Workbook',
    description: 'Worksheet for CMA prep, staging notes, and seller expectations conversation.',
    href: '#',
    category: 'Seller',
  },
  {
    title: 'Buyer Representation Agreement Primer',
    description: 'Plain-language explainer of the post-NAR settlement buyer agreement landscape.',
    href: '#',
    category: 'Buyer',
  },
  {
    title: 'Open House Marketing Playbook',
    description: 'Signage, social media, and follow-up templates that consistently drive showings.',
    href: '#',
    category: 'Marketing',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — Recommended vendors / services
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — Embedded videos / training
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — Curated external links
// ─────────────────────────────────────────────────────────────────────────────
export const RESOURCE_LINKS: ResourceLink[] = [
  {
    title: 'TREC — Texas Real Estate Commission',
    description: 'License lookup, forms, rules, and complaints.',
    href: 'https://www.trec.texas.gov/',
    source: 'trec.texas.gov',
  },
  {
    title: 'ABoR — Austin Board of REALTORS',
    description: 'Local market stats, MLS access, and ABoR events calendar.',
    href: 'https://www.abor.com/',
    source: 'abor.com',
  },
  {
    title: 'Texas REALTORS®',
    description: 'Statewide advocacy, legal hotline, and standard form updates.',
    href: 'https://www.texasrealestate.com/',
    source: 'texasrealestate.com',
  },
  {
    title: 'NAR — National Association of REALTORS®',
    description: 'Industry research, settlement updates, and member benefits.',
    href: 'https://www.nar.realtor/',
    source: 'nar.realtor',
  },
  {
    title: 'City of Austin',
    description: 'Permits, zoning, inspections, utilities, and municipal records for properties inside the city limits.',
    href: 'https://www.austintexas.gov/',
    source: 'austintexas.gov',
  },
  {
    title: 'Williamson County, TX',
    description: 'County appraisal links, tax info, recording, and unincorporated-area resources for Round Rock, Cedar Park, Leander, Georgetown, and Hutto.',
    href: 'https://www.wilcotx.gov/',
    source: 'wilcotx.gov',
  },
];
