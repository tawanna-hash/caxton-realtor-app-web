// lib/server/mailing/types.ts
//
// Row + input shapes for mailing_contacts.

import type { MailingSegment } from './segments';

// ============================================================

export type MailingStage = 'holding' | 'mailing';
export type VerifyStatus = 'Pending' | 'Valid' | 'Invalid';

export type MailingContactRow = {
  id: string;
  segment: MailingSegment;
  stage: MailingStage;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  title: string | null;
  license_number: string | null;
  address: string | null;
  address_2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  website: string | null;
  notes: string | null;
  tags: string[];
  source: string | null;
  advertiser_id: number | null;
  addr_status: VerifyStatus | null;
  email_status: VerifyStatus | null;
  addr_verified_at: string | null;
  email_verified_at: string | null;
  promoted_at: string | null;
  external_id: string | null;
  external_source: string | null;
  unsubscribed_at: string | null;
  // ABOR Members extensions
  mobile_phone: string | null;
  lat: number | null;
  lon: number | null;
  geocoded_at: string | null;
  distance_abor_mi: number | null;
  distance_fivepoints_mi: number | null;
  distance_sabor_mi: number | null;
  addr_usps_normalized: string | null;
  // Email verifier signals
  email_disposable:    boolean | null;
  email_role:          boolean | null;
  email_free_provider: boolean | null;
  email_catch_all:     boolean | null;
  email_risk:          number  | null;
  email_suggestion:    string  | null;
  email_check:         Record<string, unknown> | null;
  email_notes:         string  | null;
  // Manual override of the probe verdict. When set, the effective
  // verification status the rest of the app should use is
  // (email_override_status ?? email_status). See crm-schema.ts.
  email_override_status: 'Valid' | 'Invalid' | null;
  email_override_by:     string | null;
  email_override_at:     string | null;
  email_override_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type MailingContactInput = {
  segment?: MailingSegment;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  title?: string | null;
  license_number?: string | null;
  address?: string | null;
  address_2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  website?: string | null;
  notes?: string | null;
  source?: string | null;
  advertiser_id?: number | null;
  tags?: string[] | null;
};
