import { getSql } from '@/lib/db';

export const REFERRAL_PROVIDER_CATEGORIES = [
  'Title',
  'Appraisal',
  'Remodeling',
  'A/C & Heating',
  'Roofing',
  'Inspection',
  'Lending',
  'Insurance',
  'Other',
] as const;

export type ReferralProviderCategory = (typeof REFERRAL_PROVIDER_CATEGORIES)[number];
export type ReferralApplicationStatus = 'pending' | 'contacted' | 'approved' | 'declined';

export type ReferralNetworkApplication = {
  id: number;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string;
  website: string | null;
  categories: ReferralProviderCategory[];
  service_areas: string;
  license_number: string | null;
  license_state: string | null;
  license_expires_on: string | null;
  license_verification_url: string | null;
  insurance_carrier: string | null;
  insurance_expires_on: string | null;
  coverage_notes: string | null;
  message: string | null;
  status: ReferralApplicationStatus;
  review_notes: string | null;
  source_url: string | null;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
};

let schemaPromise: Promise<void> | null = null;

export function ensureReferralNetworkApplicationsSchema(): Promise<void> {
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
    const sql = getSql();
    await sql`
      CREATE TABLE IF NOT EXISTS referral_network_applications (
        id BIGSERIAL PRIMARY KEY,
        company_name TEXT NOT NULL,
        contact_name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL,
        website TEXT,
        categories TEXT[] NOT NULL DEFAULT '{}'::text[],
        service_areas TEXT NOT NULL,
        license_number TEXT,
        license_state TEXT,
        license_expires_on DATE,
        license_verification_url TEXT,
        insurance_carrier TEXT,
        insurance_expires_on DATE,
        coverage_notes TEXT,
        message TEXT,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'contacted', 'approved', 'declined')),
        review_notes TEXT,
        source_url TEXT,
        ip TEXT,
        user_agent TEXT,
        reviewed_at TIMESTAMPTZ,
        reviewed_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS referral_network_applications_status_created_idx
      ON referral_network_applications (status, created_at DESC)
    `;
  })();
  return schemaPromise;
}

export async function createReferralNetworkApplication(input: {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  website?: string;
  categories: ReferralProviderCategory[];
  serviceAreas: string;
  licenseNumber?: string;
  licenseState?: string;
  licenseExpiresOn?: string;
  licenseVerificationUrl?: string;
  insuranceCarrier?: string;
  insuranceExpiresOn?: string;
  coverageNotes?: string;
  message?: string;
  sourceUrl?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<ReferralNetworkApplication> {
  await ensureReferralNetworkApplicationsSchema();
  const sql = getSql();
  const rows = (await sql`
    INSERT INTO referral_network_applications (
      company_name, contact_name, email, phone, website, categories, service_areas,
      license_number, license_state, license_expires_on, license_verification_url,
      insurance_carrier, insurance_expires_on, coverage_notes, message, source_url, ip, user_agent
    ) VALUES (
      ${input.companyName}, ${input.contactName}, ${input.email}, ${input.phone},
      ${input.website || null}, ${input.categories}, ${input.serviceAreas},
      ${input.licenseNumber || null}, ${input.licenseState || null}, ${input.licenseExpiresOn || null},
      ${input.licenseVerificationUrl || null}, ${input.insuranceCarrier || null},
      ${input.insuranceExpiresOn || null}, ${input.coverageNotes || null}, ${input.message || null},
      ${input.sourceUrl || null}, ${input.ip || null}, ${input.userAgent || null}
    )
    RETURNING *
  `) as unknown as ReferralNetworkApplication[];
  return rows[0];
}

export async function listReferralNetworkApplications(
  status?: ReferralApplicationStatus,
): Promise<ReferralNetworkApplication[]> {
  await ensureReferralNetworkApplicationsSchema();
  const sql = getSql();
  const rows = status
    ? await sql`SELECT * FROM referral_network_applications WHERE status = ${status} ORDER BY created_at DESC`
    : await sql`SELECT * FROM referral_network_applications ORDER BY created_at DESC`;
  return rows as unknown as ReferralNetworkApplication[];
}

export async function updateReferralNetworkApplication(
  id: number,
  input: { status: ReferralApplicationStatus; reviewNotes?: string; reviewedBy: string },
): Promise<ReferralNetworkApplication | null> {
  await ensureReferralNetworkApplicationsSchema();
  const sql = getSql();
  const rows = (await sql`
    UPDATE referral_network_applications
    SET
      status = ${input.status},
      review_notes = ${input.reviewNotes || null},
      reviewed_at = NOW(),
      reviewed_by = ${input.reviewedBy},
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `) as unknown as ReferralNetworkApplication[];
  return rows[0] ?? null;
}
