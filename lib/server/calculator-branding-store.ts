import { query } from './db/neon';
import type { FooterBrand, FooterTemplateId } from '@/lib/footer-templates';
import { coerceFooterTemplateId } from '@/lib/footer-templates';
import type { PublicationScope } from '@/lib/publications';
import {
  normalizeCustomDesign,
  type CustomDesignConfig,
} from '@/lib/custom-design';

export interface CalculatorBranding {
  template: FooterTemplateId;
  brand: FooterBrand;
  customDesign: CustomDesignConfig;
}

export interface CalculatorBrandingInput {
  display_name: string | null;
  professional_title: string | null;
  brokerage_name: string | null;
  email: string | null;
  phone: string | null;
  office_phone: string | null;
  website: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  x_url: string | null;
  linkedin_url: string | null;
  logo_url: string | null;
  photo_url: string | null;
  address: string | null;
  address_2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  license_number: string | null;
  tagline: string | null;
  footer_template: FooterTemplateId;
  custom_design: CustomDesignConfig;
}

interface BrandingRow {
  display_name: string | null;
  professional_title: string | null;
  brokerage_name: string | null;
  email: string | null;
  phone: string | null;
  office_phone: string | null;
  website: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  x_url: string | null;
  linkedin_url: string | null;
  logo_url: string | null;
  photo_url: string | null;
  address: string | null;
  address_2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  license_number: string | null;
  tagline: string | null;
  footer_template: string | null;
  market: string | null;
  custom_design: unknown;
}

async function ensureCalculatorBrandingTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS realtor_calculator_branding (
      realtor_id UUID PRIMARY KEY,
      display_name TEXT,
      professional_title TEXT,
      brokerage_name TEXT,
      email TEXT,
      phone TEXT,
      office_phone TEXT,
      website TEXT,
      facebook_url TEXT,
      instagram_url TEXT,
      x_url TEXT,
      linkedin_url TEXT,
      logo_url TEXT,
      photo_url TEXT,
      address TEXT,
      address_2 TEXT,
      city TEXT,
      state TEXT,
      zip TEXT,
      license_number TEXT,
      tagline TEXT,
      footer_template TEXT NOT NULL DEFAULT 'business-card',
      custom_design JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    ALTER TABLE realtor_calculator_branding
    ADD COLUMN IF NOT EXISTS office_phone TEXT,
    ADD COLUMN IF NOT EXISTS facebook_url TEXT,
    ADD COLUMN IF NOT EXISTS instagram_url TEXT,
    ADD COLUMN IF NOT EXISTS x_url TEXT,
    ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
    ADD COLUMN IF NOT EXISTS custom_design JSONB NOT NULL DEFAULT '{}'::jsonb
  `);
}

function publicationFromMarket(value: string | null): PublicationScope {
  if (value === 'san_antonio' || value === 'houston' || value === 'dallas') return value;
  return 'austin';
}

function toCalculatorBranding(row: BrandingRow): CalculatorBranding {
  const template = coerceFooterTemplateId(row.footer_template);
  const customDesign = normalizeCustomDesign(row.custom_design, template);
  return {
    template,
    customDesign: { ...customDesign, layout: template },
    brand: {
      name: row.display_name,
      company: row.brokerage_name,
      title: row.professional_title,
      email: row.email,
      phone: row.phone,
      office_phone: row.office_phone,
      website: row.website,
      facebook_url: row.facebook_url,
      instagram_url: row.instagram_url,
      x_url: row.x_url,
      linkedin_url: row.linkedin_url,
      logo_url: row.logo_url,
      photo_url: row.photo_url,
      address: row.address,
      address_2: row.address_2,
      city: row.city,
      state: row.state,
      zip: row.zip,
      license_number: row.license_number,
      tagline: row.tagline,
      publication: publicationFromMarket(row.market),
    },
  };
}

export async function getCalculatorBranding(realtorId: string): Promise<CalculatorBranding> {
  await ensureCalculatorBrandingTable();
  const rows = await query<BrandingRow>(
    `SELECT
       COALESCE(NULLIF(b.display_name, ''), NULLIF(CONCAT_WS(' ', r.first_name, r.last_name), '')) AS display_name,
       COALESCE(NULLIF(b.professional_title, ''), r.title) AS professional_title,
       COALESCE(NULLIF(b.brokerage_name, ''), r.brokerage_name) AS brokerage_name,
       COALESCE(NULLIF(b.email, ''), r.email) AS email,
       COALESCE(NULLIF(b.phone, ''), r.mobile) AS phone,
       b.office_phone,
       b.website,
       b.facebook_url,
       b.instagram_url,
       b.x_url,
       b.linkedin_url,
       b.logo_url,
       b.photo_url,
       COALESCE(NULLIF(b.address, ''), r.mailing_address) AS address,
       COALESCE(NULLIF(b.address_2, ''), r.mailing_address_2) AS address_2,
       COALESCE(NULLIF(b.city, ''), r.city) AS city,
       COALESCE(NULLIF(b.state, ''), r.state) AS state,
       COALESCE(NULLIF(b.zip, ''), r.zip) AS zip,
       COALESCE(NULLIF(b.license_number, ''), r.trec_license_number) AS license_number,
       b.tagline,
       b.footer_template,
       b.custom_design,
       r.market::text AS market
     FROM realtors r
     LEFT JOIN realtor_calculator_branding b ON b.realtor_id = r.id
     WHERE r.id = $1`,
    [realtorId],
  );
  const row = rows[0];
  if (!row) throw new Error('Realtor not found');
  return toCalculatorBranding(row);
}

export async function updateCalculatorBranding(
  realtorId: string,
  input: CalculatorBrandingInput,
): Promise<CalculatorBranding> {
  await ensureCalculatorBrandingTable();
  const customDesign = normalizeCustomDesign(input.custom_design, input.footer_template);
  await query(
    `INSERT INTO realtor_calculator_branding (
       realtor_id, display_name, professional_title, brokerage_name,
       email, phone, office_phone, website,
       facebook_url, instagram_url, x_url, linkedin_url,
       logo_url, photo_url,
       address, address_2, city, state, zip, license_number,
       tagline, footer_template, custom_design, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
       $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
       $21, $22, $23::jsonb, NOW()
     )
     ON CONFLICT (realtor_id) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       professional_title = EXCLUDED.professional_title,
       brokerage_name = EXCLUDED.brokerage_name,
       email = EXCLUDED.email,
       phone = EXCLUDED.phone,
       office_phone = EXCLUDED.office_phone,
       website = EXCLUDED.website,
       facebook_url = EXCLUDED.facebook_url,
       instagram_url = EXCLUDED.instagram_url,
       x_url = EXCLUDED.x_url,
       linkedin_url = EXCLUDED.linkedin_url,
       logo_url = EXCLUDED.logo_url,
       photo_url = EXCLUDED.photo_url,
       address = EXCLUDED.address,
       address_2 = EXCLUDED.address_2,
       city = EXCLUDED.city,
       state = EXCLUDED.state,
       zip = EXCLUDED.zip,
       license_number = EXCLUDED.license_number,
       tagline = EXCLUDED.tagline,
       footer_template = EXCLUDED.footer_template,
       custom_design = EXCLUDED.custom_design,
       updated_at = NOW()`,
    [
      realtorId,
      input.display_name,
      input.professional_title,
      input.brokerage_name,
      input.email,
      input.phone,
      input.office_phone,
      input.website,
      input.facebook_url,
      input.instagram_url,
      input.x_url,
      input.linkedin_url,
      input.logo_url,
      input.photo_url,
      input.address,
      input.address_2,
      input.city,
      input.state,
      input.zip,
      input.license_number,
      input.tagline,
      input.footer_template,
      JSON.stringify({ ...customDesign, layout: input.footer_template }),
    ],
  );
  return getCalculatorBranding(realtorId);
}
