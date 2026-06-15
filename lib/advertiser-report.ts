// lib/advertiser-report.ts
//
// Renders branded HTML and plain-text email reports for advertisers.
// Used by /api/admin/advertisers/[id]/send-report.
//
// Email uses table-based layout + inline styles for broad client support.

import type { PublicationTheme } from '@/lib/publication-theme';
import { escapeHtml } from '@/lib/server/email/html';

export interface AdvertiserReportInput {
  advertiserName: string;
  shareUrl: string;
  theme: PublicationTheme;
  range: { from: string; to: string };
  totalClicks: number;
  uniqueSessions: number;
  hotspotCount: number;
  topDay: { date: string; clicks: number } | null;
  hotspots: Array<{
    magazineLabel: string;
    pageNumber: number;
    label: string | null;
    clicks: number;
    uniqueSessions: number;
  }>;
  personalMessage?: string;
}

function fmtShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  });
}

function fmtLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function fmtDateRange(from: string, to: string): string {
  return `${fmtLongDate(from)} – ${fmtLongDate(to)}`;
}

function fmtNumber(n: number): string {
  return n.toLocaleString('en-US');
}

/** Renders the full HTML email body. Email-safe markup (tables + inline styles). */
export function renderAdvertiserReportHtml(data: AdvertiserReportInput): string {
  const t = data.theme;
  const safeName = escapeHtml(data.advertiserName);
  const safePub = escapeHtml(t.name);
  const dateRangeLabel = fmtDateRange(data.range.from, data.range.to);
  const personalBlock = data.personalMessage?.trim()
    ? `
        <tr><td style="padding:20px 24px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border-left:3px solid ${t.primaryColor};border-radius:4px;">
            <tr><td style="padding:14px 16px;">
              <p style="margin:0;font-size:14px;color:#374151;line-height:1.55;white-space:pre-wrap;">${escapeHtml(data.personalMessage.trim())}</p>
            </td></tr>
          </table>
        </td></tr>`
    : '';

  const kpiRow = (cards: Array<{ label: string; value: string; sub?: string }>) => {
    return cards.map((c) => `
      <td width="50%" valign="top" style="padding:4px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:white;border:1px solid #e5e7eb;border-radius:6px;">
          <tr><td style="padding:14px 16px;">
            <div style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">${escapeHtml(c.label)}</div>
            <div style="font-size:22px;font-weight:600;color:#111827;line-height:1.1;">${escapeHtml(c.value)}</div>
            ${c.sub ? `<div style="font-size:11px;color:#6b7280;margin-top:4px;">${escapeHtml(c.sub)}</div>` : ''}
          </td></tr>
        </table>
      </td>`).join('');
  };

  const kpiCards: Array<{ label: string; value: string; sub?: string }> = [
    { label: 'Total clicks', value: fmtNumber(data.totalClicks) },
    { label: 'Unique readers', value: fmtNumber(data.uniqueSessions) },
    { label: 'Active placements', value: fmtNumber(data.hotspotCount) },
    {
      label: 'Best day',
      value: data.topDay ? fmtNumber(data.topDay.clicks) : '—',
      sub: data.topDay ? fmtShortDate(data.topDay.date) : undefined,
    },
  ];

  const hotspotRows = data.hotspots.length === 0
    ? `
      <tr><td colspan="3" style="padding:24px 16px;text-align:center;font-size:13px;color:#6b7280;">
        No active placements yet. Reports will populate once ads go live.
      </td></tr>`
    : data.hotspots.slice(0, 10).map((h) => `
      <tr style="border-top:1px solid #f3f4f6;">
        <td style="padding:10px 12px;font-size:13px;color:#374151;line-height:1.4;">
          <div style="color:#111827;">${escapeHtml(h.magazineLabel)}</div>
          <div style="color:#6b7280;font-size:11px;">Page ${h.pageNumber}${h.label ? ` · ${escapeHtml(h.label)}` : ''}</div>
        </td>
        <td style="padding:10px 12px;font-size:13px;color:#111827;font-weight:500;text-align:right;">${fmtNumber(h.clicks)}</td>
        <td style="padding:10px 12px;font-size:13px;color:#374151;text-align:right;">${fmtNumber(h.uniqueSessions)}</td>
      </tr>`).join('');

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;">
    <tr><td align="center" style="padding:24px 12px;">
      <table width="600" cellpadding="0" cellspacing="0" style="background:white;border-radius:8px;box-shadow:0 1px 2px rgba(0,0,0,0.04);max-width:600px;">

        <tr><td style="background:${t.primaryColor};color:white;padding:16px 24px;border-top-left-radius:8px;border-top-right-radius:8px;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="font-weight:600;font-size:14px;">${safePub} &middot; Performance Report</td>
            <td align="right" style="font-size:12px;opacity:0.85;">${safeName}</td>
          </tr></table>
        </td></tr>

${personalBlock}

        <tr><td style="padding:24px 24px 8px;">
          <h1 style="margin:0 0 4px;font-size:22px;color:#111827;font-weight:600;">${safeName}</h1>
          <p style="margin:0;font-size:13px;color:#6b7280;">${escapeHtml(dateRangeLabel)}</p>
        </td></tr>

        <tr><td style="padding:8px 20px 12px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>${kpiRow(kpiCards.slice(0, 2))}</tr>
            <tr>${kpiRow(kpiCards.slice(2, 4))}</tr>
          </table>
        </td></tr>

        <tr><td style="padding:12px 24px 8px;">
          <h2 style="margin:0 0 10px;font-size:13px;font-weight:600;color:#374151;">Where your readers clicked</h2>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;border-collapse:separate;">
            <tr style="background:#f9fafb;">
              <td style="padding:8px 12px;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;font-weight:600;border-top-left-radius:6px;">Issue / Page</td>
              <td style="padding:8px 12px;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;font-weight:600;text-align:right;">Clicks</td>
              <td style="padding:8px 12px;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;font-weight:600;text-align:right;border-top-right-radius:6px;">Unique</td>
            </tr>
            ${hotspotRows}
          </table>
        </td></tr>

        <tr><td align="center" style="padding:20px 24px 12px;">
          <a href="${escapeHtml(data.shareUrl)}" style="display:inline-block;background:${t.primaryColor};color:white;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:500;font-size:14px;">View live dashboard</a>
          <p style="margin:12px 0 0;font-size:11px;color:#9ca3af;">Real-time data updates as ads are viewed.</p>
        </td></tr>

        <tr><td style="border-top:1px solid #e5e7eb;padding:14px 24px;text-align:center;border-bottom-left-radius:8px;border-bottom-right-radius:8px;">
          <p style="margin:0;font-size:11px;color:#9ca3af;">Powered by ${safePub}</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;
}

/** Plain-text fallback — used as multipart text alternative. */
export function renderAdvertiserReportText(data: AdvertiserReportInput): string {
  const t = data.theme;
  const lines: string[] = [];
  lines.push(`${t.name} — Performance Report`);
  lines.push(data.advertiserName);
  lines.push(fmtDateRange(data.range.from, data.range.to));
  lines.push('');
  if (data.personalMessage?.trim()) {
    lines.push(data.personalMessage.trim());
    lines.push('');
  }
  lines.push(`Total clicks:      ${fmtNumber(data.totalClicks)}`);
  lines.push(`Unique readers:    ${fmtNumber(data.uniqueSessions)}`);
  lines.push(`Active placements: ${fmtNumber(data.hotspotCount)}`);
  if (data.topDay) {
    lines.push(`Best day:          ${fmtNumber(data.topDay.clicks)} (${fmtShortDate(data.topDay.date)})`);
  }
  lines.push('');
  lines.push('— Where your readers clicked —');
  if (data.hotspots.length === 0) {
    lines.push('No active placements yet.');
  } else {
    for (const h of data.hotspots.slice(0, 10)) {
      const labelPart = h.label ? ` — ${h.label}` : '';
      lines.push(`${h.magazineLabel} · Page ${h.pageNumber}${labelPart}`);
      lines.push(`  ${fmtNumber(h.clicks)} clicks · ${fmtNumber(h.uniqueSessions)} unique`);
    }
  }
  lines.push('');
  lines.push(`View live dashboard: ${data.shareUrl}`);
  lines.push('');
  lines.push(`Powered by ${t.name}`);
  return lines.join('\n');
}
