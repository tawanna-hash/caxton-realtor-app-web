'use client';

import type { EventReport, ReportOverrides, BrandConfig } from '../_types';
import { EVENT_CHANNEL_LABELS, resolveBrand } from '../_types';

type Props = {
  report: EventReport;
  overrides: ReportOverrides;
};

function buildBrand(report: EventReport, overrides: ReportOverrides): BrandConfig {
  if (overrides.pub_display) {
    const guessed = resolveBrand(overrides.pub_display);
    return { ...guessed, pub_display: overrides.pub_display };
  }
  return resolveBrand(report.event.pub);
}

function resolveTitle(report: EventReport, overrides: ReportOverrides): string {
  return overrides.title.trim() || report.event.title || 'Untitled event';
}

function pluralize(n: number, singular: string, plural?: string): string {
  return n === 1 ? singular : (plural ?? `${singular}s`);
}

export function buildEventReportHtml(report: EventReport, overrides: ReportOverrides): string {
  const brand = buildBrand(report, overrides);
  const title = resolveTitle(report, overrides);

  const sharesRows = report.shares.length === 0
    ? `<tr><td colspan=\"2\" style=\"padding: 8px 12px; color: #6b7280; font-size: 13px; font-style: italic;\">No shares in this period</td></tr>`
    : report.shares.map(s => `
        <tr>
          <td style=\"padding: 8px 12px; border-bottom: 1px solid #f3f4f6; font-size: 13px; color: #111827;\">${EVENT_CHANNEL_LABELS[s.channel] ?? s.channel}</td>
          <td style=\"padding: 8px 12px; border-bottom: 1px solid #f3f4f6; font-size: 13px; color: #111827; text-align: right; font-weight: 500;\">${s.total.toLocaleString()}</td>
        </tr>`).join('');

  const noteBlock = overrides.editorial_note.trim()
    ? `<p style=\"margin: 0 0 24px 0; padding: 12px 16px; background: #f9fafb; border-left: 3px solid ${brand.primary_hex}; font-size: 14px; color: #374151; line-height: 1.5;\">${overrides.editorial_note.replace(/</g, '&lt;')}</p>`
    : '';

  // Conversion rate: registrations / card_clicks
  const convPct = report.card_clicks > 0
    ? Math.round((report.registrations / report.card_clicks) * 100)
    : 0;

  return `
<div style=\"max-width: 600px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #111827; background: #ffffff;\">
  <div style=\"background: ${brand.primary_hex}; padding: 20px 24px; color: #ffffff;\">
    <p style=\"margin: 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.15em; opacity: 0.7;\">${brand.pub_display}</p>
    <h1 style=\"margin: 6px 0 0 0; font-size: 22px; font-weight: 600;\">Event Engagement Report</h1>
  </div>

  <div style=\"padding: 24px;\">
    <h2 style=\"margin: 0 0 4px 0; font-size: 18px; font-weight: 600; color: #111827;\">${title.replace(/</g, '&lt;')}</h2>
    <p style=\"margin: 0 0 20px 0; font-size: 13px; color: #6b7280;\">Last ${report.range_days} ${pluralize(report.range_days, 'day')}</p>

    ${noteBlock}

    <div style=\"display: table; width: 100%; margin-bottom: 24px;\">
      <div style=\"display: table-row;\">
        <div style=\"display: table-cell; padding: 16px 12px; border: 1px solid #e5e7eb; border-radius: 4px; text-align: center; width: 50%;\">
          <p style=\"margin: 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #6b7280;\">Card clicks</p>
          <p style=\"margin: 6px 0 0 0; font-size: 28px; font-weight: 700; color: ${brand.primary_hex};\">${report.card_clicks.toLocaleString()}</p>
        </div>
        <div style=\"display: table-cell; width: 12px;\"></div>
        <div style=\"display: table-cell; padding: 16px 12px; border: 1px solid #e5e7eb; border-radius: 4px; text-align: center; width: 50%;\">
          <p style=\"margin: 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #6b7280;\">Registrations</p>
          <p style=\"margin: 6px 0 0 0; font-size: 28px; font-weight: 700; color: ${brand.primary_hex};\">${report.registrations.toLocaleString()} ${convPct > 0 ? `<span style=\"font-size: 13px; font-weight: 400; color: #6b7280;\">(${convPct}%)</span>` : ''}</p>
        </div>
      </div>
    </div>

    <h3 style=\"margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #111827;\">Engagement actions</h3>
    <table style=\"width: 100%; border-collapse: collapse; margin-bottom: 24px; border: 1px solid #e5e7eb; border-radius: 4px; overflow: hidden;\">
      <tbody>
        <tr>
          <td style=\"padding: 8px 12px; border-bottom: 1px solid #f3f4f6; font-size: 13px; color: #111827;\">Added to calendar</td>
          <td style=\"padding: 8px 12px; border-bottom: 1px solid #f3f4f6; font-size: 13px; color: #111827; text-align: right; font-weight: 500;\">${report.calendar_adds.toLocaleString()}</td>
        </tr>
        <tr>
          <td style=\"padding: 8px 12px; border-bottom: 1px solid #f3f4f6; font-size: 13px; color: #111827;\">Got directions</td>
          <td style=\"padding: 8px 12px; border-bottom: 1px solid #f3f4f6; font-size: 13px; color: #111827; text-align: right; font-weight: 500;\">${report.directions_clicks.toLocaleString()}</td>
        </tr>
        <tr>
          <td style=\"padding: 8px 12px; font-size: 13px; color: #111827;\">Shares</td>
          <td style=\"padding: 8px 12px; font-size: 13px; color: #111827; text-align: right; font-weight: 500;\">${report.shares_total.toLocaleString()}</td>
        </tr>
      </tbody>
    </table>

    ${report.shares_total > 0 ? `
      <h3 style=\"margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #111827;\">Shares by channel</h3>
      <table style=\"width: 100%; border-collapse: collapse; margin-bottom: 24px; border: 1px solid #e5e7eb; border-radius: 4px; overflow: hidden;\">
        <tbody>
          ${sharesRows}
        </tbody>
      </table>
    ` : ''}

    <hr style=\"border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;\" />
    <p style=\"margin: 0; font-size: 11px; color: #9ca3af; line-height: 1.5;\">
      ${brand.pub_display} \u2022 \u00a9 ${new Date().getFullYear()} Realty News Now<br/>
      ${brand.tagline} \u2022 Report generated on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
    </p>
  </div>
</div>`.trim();
}

export function buildEventReportPlainText(report: EventReport, overrides: ReportOverrides): string {
  const brand = buildBrand(report, overrides);
  const title = resolveTitle(report, overrides);

  const sharesLines = report.shares.length === 0
    ? '  No shares in this period'
    : report.shares.map(s => `  ${EVENT_CHANNEL_LABELS[s.channel] ?? s.channel}: ${s.total.toLocaleString()}`).join('\n');

  const note = overrides.editorial_note.trim()
    ? `\n${overrides.editorial_note}\n`
    : '';

  const convPct = report.card_clicks > 0
    ? Math.round((report.registrations / report.card_clicks) * 100)
    : 0;

  return `${brand.pub_display} \u2014 Event Engagement Report
${title}
Last ${report.range_days} ${pluralize(report.range_days, 'day')}
${note}
CARD CLICKS: ${report.card_clicks.toLocaleString()}
REGISTRATIONS: ${report.registrations.toLocaleString()}${convPct > 0 ? ` (${convPct}%)` : ''}

Engagement actions:
  Added to calendar: ${report.calendar_adds.toLocaleString()}
  Got directions: ${report.directions_clicks.toLocaleString()}
  Total shares: ${report.shares_total.toLocaleString()}
${report.shares_total > 0 ? `\nShares by channel:\n${sharesLines}\n` : ''}
---
${brand.pub_display} \u2022 \u00a9 ${new Date().getFullYear()} Realty News Now
${brand.tagline} \u2022 Report generated on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
`.trim();
}

export function EventReportPreview({ report, overrides }: Props) {
  const html = buildEventReportHtml(report, overrides);
  return (
    <div
      className="bg-white border border-gray-200 rounded-md overflow-hidden"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
