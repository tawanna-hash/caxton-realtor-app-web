import { query } from './db/neon';
import type { FooterBrand, FooterTemplateId } from '@/lib/footer-templates';
import { coerceFooterTemplateId } from '@/lib/footer-templates';
import type { PublicationScope } from '@/lib/publications';

export interface CalculatorBranding {
  template: FooterTemplateId;
  brand: FooterBrand;
}

export interface CalculatorBrandingInput {
  display_name: string | null;
  professional_title: string | null;
  brokerage_name: string | null;
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
  footer_template: FooterTemplateId;
}

interface BrandingRow {
  display_name: string | null;
  professional_title: string | null;
  brokerage_name: string | null;
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
  footer_template: string | null;
  market: string | null;
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
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    ALTER TABLE realtor_calculator_branding
    ADD COLUMN IF NOT EXISTS office_phone TEXT
  `);
}

function publicationFromMarket(value: string | null): PublicationScope {
  if (value === 'san_antonio' || value === 'houston' || value === 'dallas') return value;
  return 'austin';
}

function toCalculatorBranding(row: BrandingRow): CalculatorBranding {
  return {
    template: coerceFooterTemplateId(row.footer_template),
    brand: {
      name: row.display_name,
      company: row.brokerage_name,
      title: row.professional_title,
      email: row.email,
      phone: row.phone,
      office_phone: row.office_phone,
      website: row.website,
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
  await query(
    `INSERT INTO realtor_calculator_branding (
       realtor_id, display_name, professional_title, brokerage_name,
       email, phone, office_phone, website, logo_url, photo_url,
       address, address_2, city, state, zip, license_number,
       tagline, footer_template, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
       $11, $12, $13, $14, $15, $16, $17, $18, NOW()
     )
     ON CONFLICT (realtor_id) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       professional_title = EXCLUDED.professional_title,
       brokerage_name = EXCLUDED.brokerage_name,
       email = EXCLUDED.email,
       phone = EXCLUDED.phone,
       office_phone = EXCLUDED.office_phone,
       website = EXCLUDED.website,
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
    ],
  );
  return getCalculatorBranding(realtorId);
}
