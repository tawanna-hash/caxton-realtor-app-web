// lib/marketing-campaigns.ts
//
// Types + helpers for marketing campaigns (with tasks + outreach).
// Distinct from `lib/advertisers.ts`-style `ad_campaigns` — those are
// ad placements purchased BY advertisers; these are outreach efforts
// you run TO advertisers.

export type MarketingCampaignStatus =
  | 'draft' | 'planning' | 'active' | 'completed' | 'archived';

export type TaskStatus   = 'to_do' | 'in_progress' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';

export type OutreachChannel = 'email' | 'sms' | 'drip';
export type OutreachStatus  = 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled';

// ── Audience filter (drives recipient resolution) ────────────────
// Each key narrows the advertiser list with AND; arrays within a key
// are OR. Empty filter = all advertisers.
export type AudienceFilter = {
  status?: string[];         // advertiser.status values
  type?: string[];           // advertiser.type values
  publication?: string[];    // advertiser.publication values
  tags?: string[];           // any tag in advertiser.tags
  industry?: string[];       // advertiser.industry values
  has_active_agreement?: boolean;
  no_agreement_in_days?: number;  // advertisers w/o any agreement in last N days
};

export interface MarketingCampaign {
  id: string;
  name: string;
  status: MarketingCampaignStatus;
  type: string | null;
  audience_filter: AudienceFilter;
  brief: string | null;
  goal: string | null;
  start_date: string | null;
  end_date: string | null;
  publication: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MarketingCampaignWithStats extends MarketingCampaign {
  task_count: number;
  task_done: number;
  outreach_sent: number;
  recipients_total: number;
}

export interface MarketingCampaignTask {
  id: string;
  campaign_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  assignee: string | null;
  done_at: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type OutreachAudienceSource = 'advertisers' | 'subscribers' | 'manual' | 'segment';

export interface MarketingCampaignOutreach {
  id: string;
  campaign_id: string;
  channel: OutreachChannel;
  subject: string | null;
  body: string | null;
  template_id: string | null;
  status: OutreachStatus;
  scheduled_for: string | null;
  sent_at: string | null;
  recipient_ids: number[];        // advertiser ids
  recipient_count: number | null;
  stats: Record<string, number>;
  error_message: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Composer extensions (nullable for back-compat with older rows).
  from_name?: string | null;
  reply_to?: string | null;
  preview_text?: string | null;
  audience_sources?: OutreachAudienceSource[];
  subscriber_ids?: number[];
  manual_emails?: string[];
}

export interface MarketingCampaignOutreachRecipient {
  id: string;
  outreach_id: string;
  recipient_type: 'advertiser' | 'subscriber' | 'manual';
  recipient_id: number | null;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  status: 'pending' | 'sent' | 'failed' | 'bounced' | 'unsubscribed';
  message_id: string | null;
  error: string | null;
  unsub_token: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  open_count: number;
  clicked_at: string | null;
  click_count: number;
  unsubscribed_at: string | null;
  created_at: string;
}

// ── Allow-lists ─────────────────────────────────────────────────
export const CAMPAIGN_PATCHABLE_FIELDS = [
  'name','status','type','audience_filter','brief','goal',
  'start_date','end_date','publication',
] as const;

export const TASK_PATCHABLE_FIELDS = [
  'title','description','status','priority','due_date','assignee','sort_order',
] as const;

export const OUTREACH_PATCHABLE_FIELDS = [
  'channel','subject','body','template_id','status',
  'scheduled_for','sent_at','recipient_ids','recipient_count','stats','error_message',
  'from_name','reply_to','preview_text','audience_sources','subscriber_ids','manual_emails',
] as const;

export const AUDIENCE_SOURCE_VALUES = new Set<OutreachAudienceSource>(
  ['advertisers','subscribers','manual','segment']);

// ── Validation sets ─────────────────────────────────────────────
export const CAMPAIGN_STATUS_VALUES = new Set<MarketingCampaignStatus>(
  ['draft','planning','active','completed','archived']);
export const TASK_STATUS_VALUES = new Set<TaskStatus>(['to_do','in_progress','done']);
export const TASK_PRIORITY_VALUES = new Set<TaskPriority>(['low','medium','high']);
export const OUTREACH_CHANNEL_VALUES = new Set<OutreachChannel>(['email','sms','drip']);
export const OUTREACH_STATUS_VALUES = new Set<OutreachStatus>(
  ['draft','scheduled','sending','sent','failed','cancelled']);

// ── Audience-filter → SQL WHERE fragments ───────────────────────
// Resolves a filter into the list of advertiser ids that match.
// Run from the server route. Imports omitted — pass the `sql` tagged
// template in as a parameter.
//
// Usage example in a route:
//   const ids = await resolveAudience(sql, campaign.audience_filter);
//   await sql`UPDATE marketing_campaign_outreach
//             SET recipient_ids = ${JSON.stringify(ids)}::jsonb,
//                 recipient_count = ${ids.length}
//             WHERE id = ${outreachId}`;
//
// Returns advertiser ids as number[]. Caller decides how to use them
// (email send, snapshot, etc.).
export async function resolveAudience<Row extends { id: number }>(
  sql: <T = Row>(strings: TemplateStringsArray, ...values: unknown[]) => Promise<T[]>,
  filter: AudienceFilter | null | undefined,
): Promise<number[]> {
  const f: AudienceFilter = filter ?? {};
  // We build with multiple chained predicates because Caxton uses
  // the Neon tagged-template driver (no interpolated SQL fragments).
  // Each conditional clause runs as part of a single SELECT, so we
  // emit explicit branches.
  //
  // Order of branches: most-selective first.

  // Branch 1: status + type + publication + industry (all string-array filters)
  const rows = (await sql`
    SELECT a.id
    FROM advertisers a
    WHERE
      (${JSON.stringify(f.status ?? null)}::jsonb IS NULL OR a.status = ANY(SELECT jsonb_array_elements_text(${JSON.stringify(f.status ?? null)}::jsonb)))
      AND (${JSON.stringify(f.type ?? null)}::jsonb IS NULL OR a.type = ANY(SELECT jsonb_array_elements_text(${JSON.stringify(f.type ?? null)}::jsonb)))
      AND (${JSON.stringify(f.publication ?? null)}::jsonb IS NULL OR string_to_array(COALESCE(a.publication, ''), ',') && ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(f.publication ?? null)}::jsonb)))
      AND (${JSON.stringify(f.industry ?? null)}::jsonb IS NULL OR a.industry = ANY(SELECT jsonb_array_elements_text(${JSON.stringify(f.industry ?? null)}::jsonb)))
      AND (${JSON.stringify(f.tags ?? null)}::jsonb IS NULL OR a.tags ?| ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(f.tags ?? null)}::jsonb)))
      AND (${f.has_active_agreement ?? null}::boolean IS NULL OR ${f.has_active_agreement ?? null}::boolean = EXISTS (
        SELECT 1 FROM agreements ag WHERE ag.advertiser_id = a.id AND ag.status = 'active'
      ))
      AND (${f.no_agreement_in_days ?? null}::int IS NULL OR NOT EXISTS (
        SELECT 1 FROM agreements ag
        WHERE ag.advertiser_id = a.id
          AND ag.created_at >= NOW() - (${f.no_agreement_in_days ?? null}::int || ' days')::interval
      ))
    ORDER BY a.name ASC
  `) as unknown as Row[];
  return rows.map((r) => r.id);
}

/** Human-readable summary of an audience filter — for UI display. */
export function summarizeAudience(f: AudienceFilter | null | undefined): string {
  if (!f || Object.keys(f).length === 0) return 'All advertisers';
  const parts: string[] = [];
  if (f.status?.length)      parts.push(`status: ${f.status.join('/')}`);
  if (f.type?.length)        parts.push(`type: ${f.type.join('/')}`);
  if (f.publication?.length) parts.push(`pub: ${f.publication.join('/')}`);
  if (f.tags?.length)        parts.push(`tags: ${f.tags.join('/')}`);
  if (f.industry?.length)    parts.push(`industry: ${f.industry.join('/')}`);
  if (f.has_active_agreement === true)  parts.push('has active agreement');
  if (f.has_active_agreement === false) parts.push('no active agreement');
  if (f.no_agreement_in_days != null)   parts.push(`no agreement in ${f.no_agreement_in_days}d`);
  return parts.join(' · ');
}
