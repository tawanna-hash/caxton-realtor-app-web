import { CLOSING_TIME_ORIGIN } from '@/lib/closing-time-origin';

const esc = (value: string) => value.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

/**
 * The Closing Time email design (same as closingtimetexas.com): a violet outline, the logo with a badge naming the
 * kind of email, the heading and message, then "Sent with Closing Time" under the card.
 */
export function brandEmail({ badge, title, body }: { badge: string; title: string; body: string }): string {
  return `<!doctype html><html><body data-ct-brand style="margin:0;padding:0;background:#FFFFFF">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFFFFF;padding:20px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
<tr><td style="border:1.5px solid #582BE7;border-radius:14px;padding:26px;font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1B1726">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td><img src="${CLOSING_TIME_ORIGIN}/logo-lockup.png" alt="Closing Time" height="40" style="display:block;height:40px;border:0"></td><td align="right" valign="middle"><span style="display:inline-block;background:#582BE7;color:#FFFFFF;border-radius:6px;padding:4px 10px;font-size:12px;font-weight:600;font-family:Inter,Arial,sans-serif;white-space:nowrap">${esc(badge)}</span></td></tr></table>
<h1 style="margin:22px 0 12px;font-size:21px;line-height:1.3;font-weight:600;color:#16132D">${esc(title)}</h1>
${body}</td></tr>
<tr><td style="padding:16px 8px;font-family:Inter,Arial,sans-serif;font-size:12px;line-height:1.5;color:#6B6880;text-align:center">Sent with Closing Time</td></tr>
</table></td></tr></table></body></html>`;
}

export const emailButton = (href: string, label: string) =>
  `<p style="margin:20px 0 0"><a href="${href}" style="display:inline-block;background:#582BE7;color:#FFFFFF;padding:11px 18px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">${esc(label)}</a></p>`;
