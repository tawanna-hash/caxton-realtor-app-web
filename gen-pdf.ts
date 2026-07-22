// One-off: render a sample single-line e-Blast agreement PDF to verify the
// updated Insertion Order section (Package + Placement Date).
import { writeFileSync } from 'node:fs';
import { generateAgreementPdfBuffer } from '@/lib/agreement-pdf';
import type { Agreement } from '@/lib/agreements';

const sample: Agreement = {
  id: 'sample-eblast-001',
  advertiser_id: 42,
  company_name: 'Bluebonnet Realty Group',
  rep_name: 'Tawanna Verock',
  advertiser_email: 'advertiser@example.com',
  advertiser_phone: '(512) 555-0142',
  advertiser_address: '1200 Congress Ave, Austin, TX 78701',
  address: '1200 Congress Ave', city: 'Austin', state: 'TX', zip: '78701',
  type: 'eblast',
  status: 'signed',
  start_date: '2026-07-28',
  end_date: '2026-07-28',
  ad_size: null,
  frequency: null,
  ad_rate_cents: 99,
  ad_timing: null,
  eblast_packages: ['Standout Blast'],
  discount_cents: null,
  ad_premium_cents: null,
  total_monthly_rate_cents: 99,
  page_position: null,
  ad_timing_months: null,
  amount_cents: 99,
  sign_date: '2026-07-21',
  exp_date: '2026-08-22',
  renewal_notice_date: null,
  signed_at: '2026-07-21T20:00:00Z',
  signed_document: null,
  sent_to_email: 'advertiser@example.com',
  is_uploaded: false,
  signer_name: 'Jordan Advertiser',
  terms_accepted: true,
  terms_accepted_at: '2026-07-21T20:00:00Z',
  billing_name: null,
  billing_email: 'billing@example.com',
  payment_mode: 'card',
  bill_to: 'Advertiser',
  billing_contact_name: 'Jordan Advertiser',
  billing_contact_phone: '(512) 555-0142',
  card_type: 'Visa',
  cardholder_name: 'Jordan Advertiser',
  card_number_last4: '4242',
  card_expiration: '12/27',
  cardholder_address: '1200 Congress Ave, Austin, TX 78701',
  stripe_customer_id: null,
  stripe_invoice_id: null,
  stripe_payment_intent_id: null,
  stripe_payment_link_url: null,
  stripe_payment_method_id: null,
  stripe_charged_cents: 99,
  stripe_charged_at: '2026-07-21T20:00:00Z',
  paid_at: '2026-07-21T20:00:00Z',
  attachments: null,
  is_renewal: false,
  renewed_from_id: null,
  notes: 'Sample e-Blast agreement to verify IO section.',
  // optional publication/channel stamps may not be on the type; ignore
} as unknown as Agreement;

(async () => {
  const buf = await generateAgreementPdfBuffer(sample);
  writeFileSync('/home/user/workspace/sample-eblast-agreement.pdf', Buffer.from(buf));
  console.log('WROTE /home/user/workspace/sample-eblast-agreement.pdf', Buffer.from(buf).length, 'bytes');
})().catch((e) => { console.error(e); process.exit(1); });
