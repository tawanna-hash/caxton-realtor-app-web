// app/admin/reports/_components/MailchimpReportPreview.tsx
// Branded HTML report for a Mailchimp campaign.
// Mirrors ReportPreview.tsx / EventReportPreview.tsx structure.

import type {
  MailchimpCampaignReportData,
  MailchimpClickedLink,
  ReportOverrides,
} from '../_types';
import { resolveBrand } from '../_types';

type Props = {
  report: MailchimpCampaignReportData;
  overrides: ReportOverrides;
};

function fmtPercent(rate: number): string {
  // Mailchimp returns rates as decimals (0..1).
  return (rate * 100).toFixed(1) + '%';
}

function fmtNumber(n: number): string {
  return n.toLocaleString('en-US');
}

function fmtDate(iso: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

function truncateUrl(url: string, max = 70): string {
  if (url.length <= max) return url;
  return url.slice(0, max - 1) + '…';
}

export function buildMailchimpReportHtml(
  report: MailchimpCampaignReportData,
  overrides: ReportOverrides,
): string {
  const brand = resolveBrand(overrides.pub_display);
  const titleText = overrides.title?.trim() || report.campaign.title || report.campaign.subject_line || 'Untitled campaign';
  const pubDisplay = overrides.pub_display?.trim() || brand.pub_display;
  const noteHtml = overrides.editorial_note?.trim()
    ? `<div style="background:#f7f7f7;border-left:3px solid ${brand.primary_hex};padding:12px 16px;margin:0 0 24px 0;font-size:14px;color:#333;line-height:1.5;">${escapeHtml(overrides.editorial_note.trim())}</div>`
    : '';

  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const year = new Date().getFullYear();

  const topLinksHtml = report.top_links.length > 0
    ? `
      <h2 style="font-size:16px;font-weight:600;color:#111;margin:24px 0 12px 0;">Top clicked links</h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="border-bottom:2px solid #e5e5e5;">
            <th style="text-align:left;padding:8px 12px;font-weight:600;color:#666;">Link</th>
            <th style="text-align:right;padding:8px 12px;font-weight:600;color:#666;width:90px;">Clicks</th>
            <th style="text-align:right;padding:8px 12px;font-weight:600;color:#666;width:90px;">Unique</th>
          </tr>
        </thead>
        <tbody>
          ${report.top_links.map((l: MailchimpClickedLink) => `
            <tr style="border-bottom:1px solid #f0f0f0;">
              <td style="padding:8px 12px;color:#333;word-break:break-all;">${escapeHtml(truncateUrl(l.url))}</td>
              <td style="padding:8px 12px;text-align:right;color:#333;">${fmtNumber(l.total_clicks)}</td>
              <td style="padding:8px 12px;text-align:right;color:#666;">${fmtNumber(l.unique_clicks)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `
    : '';

  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:680px;margin:0 auto;background:#fff;">
  <div style="background:${brand.primary_hex};color:#fff;padding:20px 24px;">
    <div style="font-size:12px;text-transform:uppercase;letter-spacing:1.5px;opacity:0.85;margin-bottom:4px;">${escapeHtml(pubDisplay)}</div>
    <div style="font-size:20px;font-weight:600;">Email Campaign Report</div>
  </div>
  <div style="padding:24px;">
    <h1 style="font-size:22px;font-weight:600;color:#111;margin:0 0 4px 0;line-height:1.3;">${escapeHtml(titleText)}</h1>
    <div style="font-size:13px;color:#666;margin:0 0 24px 0;">
      Subject: ${escapeHtml(report.campaign.subject_line)} · Sent ${fmtDate(report.campaign.send_time)} to ${fmtNumber(report.emails_sent)} recipients
    </div>
    ${noteHtml}

    <table style="width:100%;border-collapse:collapse;margin:0 0 24px 0;">
      <tr>
        <td style="width:50%;padding:0 8px 0 0;vertical-align:top;">
          <div style="border:1px solid #e5e5e5;padding:16px;border-radius:6px;">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#666;margin-bottom:4px;">Opens</div>
            <div style="font-size:28px;font-weight:600;color:#111;line-height:1;">${fmtNumber(report.unique_opens)}</div>
            <div style="font-size:12px;color:#666;margin-top:4px;">${fmtPercent(report.open_rate)} open rate · ${fmtNumber(report.opens_total)} total</div>
          </div>
        </td>
        <td style="width:50%;padding:0 0 0 8px;vertical-align:top;">
          <div style="border:1px solid #e5e5e5;padding:16px;border-radius:6px;">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#666;margin-bottom:4px;">Clicks</div>
            <div style="font-size:28px;font-weight:600;color:#111;line-height:1;">${fmtNumber(report.unique_clicks)}</div>
            <div style="font-size:12px;color:#666;margin-top:4px;">${fmtPercent(report.click_rate)} click rate · ${fmtNumber(report.clicks_total)} total</div>
          </div>
        </td>
      </tr>
    </table>

    <h2 style="font-size:16px;font-weight:600;color:#111;margin:24px 0 12px 0;">Delivery</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr style="border-bottom:1px solid #f0f0f0;">
        <td style="padding:10px 12px;color:#333;">Bounces</td>
        <td style="padding:10px 12px;text-align:right;color:#333;font-weight:500;">${fmtNumber(report.bounces)}</td>
      </tr>
      <tr style="border-bottom:1px solid #f0f0f0;">
        <td style="padding:10px 12px;color:#333;">Unsubscribes</td>
        <td style="padding:10px 12px;text-align:right;color:#333;font-weight:500;">${fmtNumber(report.unsubscribes)}</td>
      </tr>
    </table>

    ${topLinksHtml}

    <div style="margin:32px 0 0 0;padding:16px 0 0 0;border-top:1px solid #e5e5e5;font-size:11px;color:#999;line-height:1.6;">
      <div>${escapeHtml(pubDisplay)} • © ${year} Caxton Publications Inc</div>
      <div>${escapeHtml(brand.tagline)} • Report generated on ${today}</div>
    </div>
  </div>
</div>`;
}

export function buildMailchimpReportPlainText(
  report: MailchimpCampaignReportData,
  overrides: ReportOverrides,
): string {
  const brand = resolveBrand(overrides.pub_display);
  const titleText = overrides.title?.trim() || report.campaign.title || report.campaign.subject_line || 'Untitled campaign';
  const pubDisplay = overrides.pub_display?.trim() || brand.pub_display;
  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const year = new Date().getFullYear();

  const lines: string[] = [];
  lines.push(`${pubDisplay} — EMAIL CAMPAIGN REPORT`);
  lines.push('');
  lines.push(titleText);
  lines.push(`Subject: ${report.campaign.subject_line}`);
  lines.push(`Sent ${fmtDate(report.campaign.send_time)} to ${fmtNumber(report.emails_sent)} recipients`);
  lines.push('');

  if (overrides.editorial_note?.trim()) {
    lines.push(overrides.editorial_note.trim());
    lines.push('');
  }

  lines.push('PERFORMANCE');
  lines.push(`  Opens:  ${fmtNumber(report.unique_opens)} unique (${fmtPercent(report.open_rate)} open rate, ${fmtNumber(report.opens_total)} total)`);
  lines.push(`  Clicks: ${fmtNumber(report.unique_clicks)} unique (${fmtPercent(report.click_rate)} click rate, ${fmtNumber(report.clicks_total)} total)`);
  lines.push('');

  lines.push('DELIVERY');
  lines.push(`  Bounces:      ${fmtNumber(report.bounces)}`);
  lines.push(`  Unsubscribes: ${fmtNumber(report.unsubscribes)}`);

  if (report.top_links.length > 0) {
    lines.push('');
    lines.push('TOP CLICKED LINKS');
    report.top_links.forEach((l, i) => {
      lines.push(`  ${i + 1}. ${l.url}`);
      lines.push(`     ${fmtNumber(l.total_clicks)} clicks (${fmtNumber(l.unique_clicks)} unique)`);
    });
  }

  lines.push('');
  lines.push('———');
  lines.push(`${pubDisplay} · © ${year} Caxton Publications Inc`);
  lines.push(`${brand.tagline} · Report generated on ${today}`);

  return lines.join('\n');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function MailchimpReportPreview({ report, overrides }: Props) {
  const html = buildMailchimpReportHtml(report, overrides);
  return (
    <div
      className="bg-white border border-gray-200 rounded-md overflow-hidden"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
