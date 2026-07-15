// app/api/admin/advertisers/[id]/channels/route.ts
//
// Returns per-channel activity for a single advertiser, keyed by AdChannel.
// Used by the CRM edit-drawer sub-tabs (Print / Digital / Email / App).
//
// For each channel we return three lists:
//   • campaigns   — rows from ad_campaigns  (ad_space_slug + pubs + dates + active)
//   • agreements  — rows from agreements     (publication + status + amount + dates)
//   • inquiries   — rows from ad_inquiries   (slot_slug + status + created_at)
//
// Campaigns are attributed via ad_campaigns.channel (added 2026-07).
// Agreements have no channel column; we derive it from the `type` via
// deriveChannelFromAgreementType. Inquiries carry their own channel column.

import { NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { query } from '@/lib/server/db/neon';
import {
  AD_CHANNELS,
  deriveChannelFromAgreementType,
  isAdChannel,
  type AdChannel,
} from '@/lib/ad-channels';

export const dynamic = 'force-dynamic';

type CampaignRow = {
  id: string;
  ad_space_slug: string;
  publication: string;
  pubs: string[] | null;
  channel: string | null;
  start_date: string;
  end_date: string;
  active: boolean;
  price_total: string | null;
};

type AgreementRow = {
  id: string;
  publication: string | null;
  type: string | null;
  status: string;
  ad_size: string | null;
  frequency: string | null;
  amount_cents: number | null;
  start_date: string | null;
  end_date: string | null;
  signed_at: string | null;
  paid_at: string | null;
};

type InquiryRow = {
  id: string;
  channel: string | null;
  slot_slug: string | null;
  slot_label: string | null;
  publication: string | null;
  status: string;
  created_at: string;
  message: string | null;
};

type ChannelBucket = {
  campaigns: CampaignRow[];
  agreements: AgreementRow[];
  inquiries: InquiryRow[];
};

function emptyBuckets(): Record<AdChannel, ChannelBucket> {
  const out: Partial<Record<AdChannel, ChannelBucket>> = {};
  for (const c of AD_CHANNELS) {
    out[c] = { campaigns: [], agreements: [], inquiries: [] };
  }
  return out as Record<AdChannel, ChannelBucket>;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { id: idStr } = await params;
  const advertiserId = Number.parseInt(idStr, 10);
  if (!Number.isFinite(advertiserId)) {
    return NextResponse.json({ error: 'bad id' }, { status: 400 });
  }

  const advRows = await query<{ id: number; name: string }>(
    `SELECT id, name FROM advertisers WHERE id = $1 LIMIT 1`,
    [advertiserId],
  );
  const adv = advRows[0];
  if (!adv) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const [campaigns, agreements, inquiries] = await Promise.all([
    query<CampaignRow>(
      `SELECT id, ad_space_slug, publication, pubs, channel,
              start_date, end_date, active, price_total
         FROM ad_campaigns
        WHERE advertiser_id = $1 OR advertiser_name = $2
        ORDER BY start_date DESC
        LIMIT 200`,
      [advertiserId, adv.name],
    ),
    query<AgreementRow>(
      `SELECT id, publication, type, status, ad_size, frequency,
              amount_cents, start_date, end_date, signed_at, paid_at
         FROM agreements
        WHERE advertiser_id = $1
        ORDER BY COALESCE(start_date, created_at::date) DESC
        LIMIT 200`,
      [advertiserId],
    ),
    query<InquiryRow>(
      `SELECT id, channel, slot_slug, slot_label, publication, status,
              created_at, message
         FROM ad_inquiries
        WHERE advertiser_id = $1
        ORDER BY created_at DESC
        LIMIT 200`,
      [advertiserId],
    ),
  ]);

  const buckets = emptyBuckets();

  for (const c of campaigns) {
    const ch = isAdChannel(c.channel) ? c.channel : 'digital';
    buckets[ch].campaigns.push(c);
  }
  for (const a of agreements) {
    const ch = deriveChannelFromAgreementType(a.type);
    buckets[ch].agreements.push(a);
  }
  for (const q of inquiries) {
    const ch = isAdChannel(q.channel) ? q.channel : 'digital';
    buckets[ch].inquiries.push(q);
  }

  return NextResponse.json({ channels: buckets });
}
