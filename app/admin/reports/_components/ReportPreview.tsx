'use client';

import type { ArticleReport, ReportOverrides, BrandConfig } from '../_types';
import { CHANNEL_LABELS, formatDuration, resolveBrand } from '../_types';

type Props = {
  report: ArticleReport;
  overrides: ReportOverrides;
};

function buildBrand(report: ArticleReport, overrides: ReportOverrides): BrandConfig {
  if (overrides.pub_display) {
    const guessed = resolveBrand(overrides.pub_display);
    return { ...guessed, pub_display: overrides.pub_display };
  }
  return resolveBrand(report.article.pub);
}

function resolveTitle(report: ArticleReport, overrides: ReportOverrides): string {
  return overrides.title.trim() || report.article.title || 'Untitled article';
}

function pluralize(n: number, singular: string, plural?: string): string {
  return n === 1 ? singular : (plural ?? `${singular}s`);
}

// Inline-style helper for email-friendly HTML
const style = (s: Record<string, string>) =>
  Object.entries(s).map(([k, v]) => `${k.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}: ${v}`).join('; ');

export function buildReportHtml(report: ArticleReport, overrides: ReportOverrides): string {
  const brand = buildBrand(report, overrides);
  const title = resolveTitle(report, overrides);
  const avgTime = formatDuration(report.avg_time_on_article_ms);

  const sharesRows = report.shares.length === 0
    ? `<tr><td colspan=\"2\" style=\"padding: 8px 12px; color: #6b7280; font-size: 13px; font-style: italic;\">No shares in this period</td></tr>`
    : report.shares.map(s => `
        <tr>
          <td style=\"padding: 8px 12px; border-bottom: 1px solid #f3f4f6; font-size: 13px; color: #111827;\">${CHANNEL_LABELS[s.channel] ?? s.channel}</td>
          <td style=\"padding: 8px 12px; border-bottom: 1px solid #f3f4f6; font-size: 13px; color: #111827; text-align: right; font-weight: 500;\">${s.total.toLocaleString()}</td>
        </tr>`).join('');

  const scrollMap = new Map(report.scroll.map(s => [s.milestone, s.total]));
  const scrollRow = (m: number) => {
    const v = scrollMap.get(m) ?? 0;
    const pct = report.opens > 0 ? Math.round((v / report.opens) * 100) : 0;
    return `
      <tr>
        <td style=\"padding: 8px 12px; border-bottom: 1px solid #f3f4f6; font-size: 13px; color: #111827;\">${m}% read</td>
        <td style=\"padding: 8px 12px; border-bottom: 1px solid #f3f4f6; font-size: 13px; color: #111827; text-align: right; font-weight: 500;\">${v.toLocaleString()} ${pct > 0 ? `<span style=\"color: #6b7280; font-weight: 400;\">(${pct}%)</span>` : ''}</td>
      </tr>`;
  };

  const noteBlock = overrides.editorial_note.trim()
    ? `<p style=\"margin: 0 0 24px 0; padding: 12px 16px; background: #f9fafb; border-left: 3px solid ${brand.primary_hex}; font-size: 14px; color: #374151; line-height: 1.5;\">${overrides.editorial_note.replace(/</g, '&lt;')}</p>`
    : '';

  return `
<div style=\"max-width: 600px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #111827; background: #ffffff;\">
  <div style=\"background: ${brand.primary_hex}; padding: 20px 24px; color: #ffffff;\">
    <p style=\"margin: 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.15em; opacity: 0.7;\">${brand.pub_display}</p>
    <h1 style=\"margin: 6px 0 0 0; font-size: 22px; font-weight: 600;\">Engagement Report</h1>
  </div>

  <div style=\"padding: 24px;\">
    <h2 style=\"margin: 0 0 4px 0; font-size: 18px; font-weight: 600; color: #111827;\">${title.replace(/</g, '&lt;')}</h2>
    <p style=\"margin: 0 0 20px 0; font-size: 13px; color: #6b7280;\">Last ${report.range_days} ${pluralize(report.range_days, 'day')}</p>

    ${noteBlock}

    <div style=\"display: table; width: 100%; margin-bottom: 24px;\">
      <div style=\"display: table-row;\">
        <div style=\"display: table-cell; padding: 16px 12px; border: 1px solid #e5e7eb; border-radius: 4px; text-align: center; width: 50%;\">
          <p style=\"margin: 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #6b7280;\">Article opens</p>
          <p style=\"margin: 6px 0 0 0; font-size: 28px; font-weight: 700; color: ${brand.primary_hex};\">${report.opens.toLocaleString()}</p>
        </div>
        <div style=\"display: table-cell; width: 12px;\"></div>
        <div style=\"display: table-cell; padding: 16px 12px; border: 1px solid #e5e7eb; border-radius: 4px; text-align: center; width: 50%;\">
          <p style=\"margin: 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #6b7280;\">Total shares</p>
          <p style=\"margin: 6px 0 0 0; font-size: 28px; font-weight: 700; color: ${brand.primary_hex};\">${report.shares_total.toLocaleString()}</p>
        </div>
      </div>
    </div>

    <h3 style=\"margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #111827;\">Shares by channel</h3>
    <table style=\"width: 100%; border-collapse: collapse; margin-bottom: 24px; border: 1px solid #e5e7eb; border-radius: 4px; overflow: hidden;\">
      <tbody>
        ${sharesRows}
      </tbody>
    </table>

    <h3 style=\"margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #111827;\">Reading depth</h3>
    <table style=\"width: 100%; border-collapse: collapse; margin-bottom: 24px; border: 1px solid #e5e7eb; border-radius: 4px; overflow: hidden;\">
      <tbody>
        ${scrollRow(25)}
        ${scrollRow(50)}
        ${scrollRow(75)}
        ${scrollRow(100)}
      </tbody>
    </table>

    <h3 style=\"margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #111827;\">Time on article</h3>
    <p style=\"margin: 0 0 24px 0; font-size: 13px; color: #374151;\">
      Average ${avgTime} across ${report.sessions_with_time.toLocaleString()} ${pluralize(report.sessions_with_time, 'session')} where reading time was measured.
    </p>

    ${report.net_saves !== 0 ? `
      <h3 style=\"margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #111827;\">Saves</h3>
      <p style=\"margin: 0 0 24px 0; font-size: 13px; color: #374151;\">
        ${report.saves.toLocaleString()} ${pluralize(report.saves, 'save')}, ${report.unsaves.toLocaleString()} ${pluralize(report.unsaves, 'unsave')} — net ${report.net_saves.toLocaleString()}.
      </p>
    ` : ''}

    <hr style=\"border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;\" />
    <p style=\"margin: 0; font-size: 11px; color: #9ca3af; line-height: 1.5;\">
      ${brand.pub_display} • ${brand.tagline}<br/>
      © ${new Date().getFullYear()} Caxton Publications Inc<br/>
      Report generated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
    </p>
  </div>
</div>`.trim();
}

export function buildReportPlainText(report: ArticleReport, overrides: ReportOverrides): string {
  const brand = buildBrand(report, overrides);
  const title = resolveTitle(report, overrides);
  const avgTime = formatDuration(report.avg_time_on_article_ms);

  const sharesLines = report.shares.length === 0
    ? '  No shares in this period'
    : report.shares.map(s => `  ${CHANNEL_LABELS[s.channel] ?? s.channel}: ${s.total.toLocaleString()}`).join('\n');

  const scrollMap = new Map(report.scroll.map(s => [s.milestone, s.total]));
  const scrollLine = (m: number) => {
    const v = scrollMap.get(m) ?? 0;
    const pct = report.opens > 0 ? Math.round((v / report.opens) * 100) : 0;
    return `  ${m}% read: ${v.toLocaleString()}${pct > 0 ? ` (${pct}%)` : ''}`;
  };

  const note = overrides.editorial_note.trim()
    ? `\n${overrides.editorial_note}\n`
    : '';

  return `${brand.pub_display} — Engagement Report
${title}
Last ${report.range_days} ${pluralize(report.range_days, 'day')}
${note}
ARTICLE OPENS: ${report.opens.toLocaleString()}
TOTAL SHARES: ${report.shares_total.toLocaleString()}

Shares by channel:
${sharesLines}

Reading depth:
${scrollLine(25)}
${scrollLine(50)}
${scrollLine(75)}
${scrollLine(100)}

Time on article:
  Average ${avgTime} across ${report.sessions_with_time.toLocaleString()} ${pluralize(report.sessions_with_time, 'session')}

${report.net_saves !== 0 ? `Saves: ${report.saves.toLocaleString()} saves, ${report.unsaves.toLocaleString()} unsaves (net ${report.net_saves.toLocaleString()})\n\n` : ''}---
${brand.pub_display} • ${brand.tagline}
© ${new Date().getFullYear()} Caxton Publications Inc
Report generated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
`.trim();
}

export function ReportPreview({ report, overrides }: Props) {
  const html = buildReportHtml(report, overrides);
  return (
    <div
      className="bg-white border border-gray-200 rounded-md overflow-hidden"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
