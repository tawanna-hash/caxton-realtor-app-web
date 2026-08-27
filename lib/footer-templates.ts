// lib/footer-templates.ts
//
// Footer template registry for downloadable broker/agent tools (PDFs from
// /resources calculators today; reused by any future export surface).
//
// Each template is rendered onto the last page (or every page) of a PDF
// by lib/pdf/brand-footer.ts. The shape here is purely declarative so
// the picker UI and the renderer share the same source of truth.
//
// IDs are stored verbatim in the DB column advertisers.footer_template
// (admin-set default) and in localStorage key
// 'rnn:footer-template' (per-device override picked at download time).
// Unknown / removed legacy values coerce back to Layout 1 on read.

export const FOOTER_TEMPLATE_IDS = ['split-column', 'minimal-rows'] as const;

export type FooterTemplateId = (typeof FOOTER_TEMPLATE_IDS)[number];

export const FOOTER_TEMPLATE_PICKER_IDS = FOOTER_TEMPLATE_IDS;

const FOOTER_TEMPLATE_DEFAULT: FooterTemplateId = 'split-column';

export function coerceFooterTemplateId(value: unknown): FooterTemplateId {
  if (typeof value !== 'string') return FOOTER_TEMPLATE_DEFAULT;
  return (FOOTER_TEMPLATE_IDS as readonly string[]).includes(value)
    ? (value as FooterTemplateId)
    : FOOTER_TEMPLATE_DEFAULT;
}

/**
 * Brand fields the renderer can pull from. Calculator branding requires
 * `company` at save time so every public-facing export identifies the
 * broker. Other blank fields are skipped by the renderer.
 *
 * `publication` controls the color palette: 'austin' (RealtyLine) uses
 * navy + gold, 'san_antonio' (Newsline San Antonio) uses plum + gold, 'both' falls
 * back to navy. Unknown / null also defaults to navy.
 */
export interface FooterBrand {
  name: string | null;
  company: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  office_phone: string | null;
  website: string | null;
  logo_url: string | null;
  photo_url: string | null;
  address: string | null;
  address_2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  license_number: string | null;
  tagline: string | null;
  publication: import('./publications').PublicationScope | null;
}

/** Color palette derived from a brand's publication. The renderer uses
 *  this everywhere it used to reference hardcoded BRAND_NAVY. */
export interface FooterPalette {
  /** Primary brand color (navy for RealtyLine, plum for Newsline San Antonio). RGB. */
  primary: [number, number, number];
  /** Slightly lighter shade of primary, used for body text on dark backgrounds. */
  primarySoft: [number, number, number];
  /** Gold accent stays the same across publications. */
  accent: [number, number, number];
}

const PALETTE_NAVY: FooterPalette = {
  primary: [48, 29, 93],       // #301D5D RealtyLine Austin
  primarySoft: [220, 226, 238],
  accent: [196, 163, 90],     // #fb923c gold
};

const PALETTE_PLUM: FooterPalette = {
  primary: [48, 29, 93],       // #301D5D Newsline San Antonio
  primarySoft: [232, 220, 234],
  accent: [196, 163, 90],     // shared gold
};

export function getFooterPalette(b: Pick<FooterBrand, 'publication'>): FooterPalette {
  if (b.publication === 'san_antonio') return PALETTE_PLUM;
  return PALETTE_NAVY;
}

export interface FooterTemplateMeta {
  id: FooterTemplateId;
  label: string;
  blurb: string;
  /** Approximate footer height in points (jsPDF letter). The renderer
   *  reserves this much space at the bottom of each page. */
  heightPt: number;
  /** Where the footer should render. */
  placement: 'every-page' | 'last-page';
}

export const FOOTER_TEMPLATE_META: Record<FooterTemplateId, FooterTemplateMeta> = {
  'split-column': {
    id: 'split-column',
    label: 'Split Column (Classic)',
    blurb: 'Headshot, contact details, and company logo in three clean columns.',
    heightPt: 112,
    placement: 'every-page',
  },
  'minimal-rows': {
    id: 'minimal-rows',
    label: 'Minimal Rows (Stack)',
    blurb: 'A compact stacked identity and contact layout with headshot and logo.',
    heightPt: 112,
    placement: 'every-page',
  },
};

export function getFooterTemplateMeta(id: FooterTemplateId): FooterTemplateMeta {
  return FOOTER_TEMPLATE_META[id] ?? FOOTER_TEMPLATE_META[FOOTER_TEMPLATE_DEFAULT];
}
