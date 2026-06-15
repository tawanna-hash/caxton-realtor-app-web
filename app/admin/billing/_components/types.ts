// app/admin/billing/_components/types.ts
//
// Shared types used across the billing-tab subtree. Kept separate from
// helpers.ts so circular imports stay easy to reason about.

export type AdvertiserOption = {
  id: number;
  name: string;
  publication: string;
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
