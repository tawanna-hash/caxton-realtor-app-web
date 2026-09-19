// app/admin/billing/_components/types.ts
//
// Shared types used across the billing-tab subtree. Kept separate from
// helpers.ts so circular imports stay easy to reason about.

export type AdvertiserOption = {
  id: number;
  name: string;
  publication: string;
  contact_email: string | null;
  billing_email: string | null;
  /**
   * Read-only card-on-file mirror kept in sync FROM the signed agreement by
   * lib/server/billing-crm-sync.ts. Used only to *display* which card is on
   * file (e.g. "•••• 4242") — never written from billing UI code, and never
   * the source of truth for charging. Agreements own
   * stripe_customer_id/stripe_payment_method_id.
   */
  payment_mode?: string | null;
  stripe_customer_id?: string | null;
  card_last4?: string | null;
};

export type AdCampaignOption = {
  id: string;
  advertiser_name: string;
  ad_space_slug: string;
  publication: string;
  start_date: string | Date | null;
  end_date: string | Date | null;
  active: boolean;
  advertiser_id: number | null;
  agreement_id: string | null;
};

export type KpiAccent = 'blue' | 'rose' | 'amber' | 'emerald' | undefined;
