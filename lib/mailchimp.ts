// lib/mailchimp.ts
// Shared Mailchimp API helper. Env vars required:
//   MAILCHIMP_API_KEY — the full API key (e.g. 'abc123...-us19')
//   MAILCHIMP_SERVER  — the data center suffix only (e.g. 'us19')
//
// The data center is appended to the API URL. Mailchimp shards
// accounts across data centers and each one has its own subdomain.

const API_KEY = process.env.MAILCHIMP_API_KEY;
const SERVER = process.env.MAILCHIMP_SERVER;

export function isMailchimpConfigured(): boolean {
  return !!(API_KEY && SERVER);
}

function getBaseUrl(): string {
  if (!SERVER) throw new Error('MAILCHIMP_SERVER env var missing');
  return `https://${SERVER}.api.mailchimp.com/3.0`;
}

function getAuthHeader(): string {
  if (!API_KEY) throw new Error('MAILCHIMP_API_KEY env var missing');
  // Mailchimp uses HTTP Basic auth with any username and the API key as password.
  // 'anystring:KEY' base64-encoded.
  const encoded = Buffer.from(`anystring:${API_KEY}`).toString('base64');
  return `Basic ${encoded}`;
}

export async function mailchimpFetch<T = unknown>(
  endpoint: string,
  options: { searchParams?: Record<string, string> } = {},
): Promise<T> {
  if (!isMailchimpConfigured()) {
    throw new Error('Mailchimp not configured (MAILCHIMP_API_KEY or MAILCHIMP_SERVER missing)');
  }

  const url = new URL(`${getBaseUrl()}${endpoint}`);
  if (options.searchParams) {
    for (const [key, value] of Object.entries(options.searchParams)) {
      url.searchParams.set(key, value);
    }
  }

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: getAuthHeader(),
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Mailchimp API ${res.status}: ${body.slice(0, 300)}`);
  }

  return (await res.json()) as T;
}

// ─── Response types from Mailchimp API ───
// Documented at: https://mailchimp.com/developer/marketing/api/

export type MailchimpCampaign = {
  id: string;
  type: string;                    // 'regular' | 'plaintext' | 'absplit' | 'rss' | 'variate'
  status: string;                  // 'sent' | 'save' | 'paused' | 'schedule' | 'sending'
  emails_sent: number;
  send_time: string;               // ISO 8601
  archive_url: string;
  settings: {
    subject_line: string;
    title: string;
    from_name: string;
    reply_to: string;
    preview_text: string;
  };
  recipients: {
    list_id: string;
    list_name: string;
    recipient_count: number;
  };
};

export type MailchimpCampaignsListResponse = {
  campaigns: MailchimpCampaign[];
  total_items: number;
};

export type MailchimpCampaignReport = {
  id: string;
  campaign_title: string;
  subject_line: string;
  type: string;
  list_id: string;
  list_name: string;
  emails_sent: number;
  send_time: string;
  bounces: { hard_bounces: number; soft_bounces: number; syntax_errors: number };
  forwards: { forwards_count: number; forwards_opens: number };
  opens: {
    opens_total: number;
    unique_opens: number;
    open_rate: number;
    last_open: string;
  };
  clicks: {
    clicks_total: number;
    unique_clicks: number;
    unique_subscriber_clicks: number;
    click_rate: number;
    last_click: string;
  };
  unsubscribed: number;
};

export type MailchimpClickLinkDetail = {
  id: string;
  url: string;
  total_clicks: number;
  click_percentage: number;
  unique_clicks: number;
  unique_click_percentage: number;
  last_click: string;
};

export type MailchimpClickDetailsResponse = {
  urls_clicked: MailchimpClickLinkDetail[];
  campaign_id: string;
  total_items: number;
};
