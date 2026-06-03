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

export interface ResourceVendor {
  name: string;
  /** What they do, in 1–2 sentences */
  description: string;
  /** Their website */
  href: string;
  /** e.g. "Lender", "Title", "Inspection", "Photography" */
  category: string;
  /** Optional contact line shown beneath the description */
  contact?: string;
}

export interface ResourceVideo {
  title: string;
  description: string;
  /** YouTube/Vimeo embed URL (use the /embed/ form for YouTube) */
  embedUrl: string;
  /** Optional duration like "12:34" */
  duration?: string;
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
export const RESOURCE_VENDORS: ResourceVendor[] = [
  {
    name: 'Preferred Lending Partner',
    description: 'Fast pre-approvals, jumbo programs, and bilingual loan officers serving Austin and Round Rock.',
    href: '#',
    category: 'Lender',
    contact: 'team@example-lender.com · (512) 555-0101',
  },
  {
    name: 'Capital Title of Texas',
    description: 'Statewide title company with multiple convenient closing locations across the metro.',
    href: '#',
    category: 'Title',
  },
  {
    name: 'Austin Home Inspections',
    description: 'TREC-licensed inspectors with same-week availability and structured PDF reports.',
    href: '#',
    category: 'Inspection',
  },
  {
    name: 'Front Door Photography',
    description: 'Listing photography, twilight shoots, drone, and 3D Matterport tours.',
    href: '#',
    category: 'Photography',
  },
  {
    name: 'Staged & Sold ATX',
    description: 'Vacant and occupied staging with rapid turnaround for active listings.',
    href: '#',
    category: 'Staging',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — Embedded videos / training
// ─────────────────────────────────────────────────────────────────────────────
export const RESOURCE_VIDEOS: ResourceVideo[] = [
  {
    title: 'Working with New-Home Builders 101',
    description: 'Registration etiquette, when to bring your buyer, and protecting your commission.',
    embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    duration: '14:22',
  },
  {
    title: 'Buyer Consultation Script Walkthrough',
    description: 'The exact framework top Austin agents use for first buyer meetings.',
    embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    duration: '21:08',
  },
  {
    title: 'Reading a Title Commitment',
    description: 'Section-by-section breakdown of a typical Texas title commitment.',
    embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    duration: '09:47',
  },
];

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
