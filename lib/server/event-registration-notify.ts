import { sendEmail } from '@/lib/email';
import { escapeHtml } from '@/lib/server/email/html';
import { ADMIN_INBOX } from '@/lib/admin-inbox';

type RegistrationNotice = {
  registrationId: number;
  eventId: number;
  eventTitle: string;
  eventStart: string | null;
  fullName: string;
  company: string;
  isRealtor: boolean;
  licenseNumber: string | null;
  email: string;
  mobile: string;
};

function siteOrigin(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  // Production emails must link to the real domain: VERCEL_URL is the
  // per-deployment host, which is behind Vercel protection and has no admin session.
  if (process.env.VERCEL_ENV === 'production') return 'https://realtynewsnow.app';
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'https://realtynewsnow.app';
}

function notificationAddress(): string {
  return (
    ADMIN_INBOX
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return 'Date not provided';
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export async function notifyEventRegistration(input: RegistrationNotice) {
  const registryUrl = `${siteOrigin()}/admin/events/${input.eventId}`;
  const subject = `[Realty News Now] New registration — ${input.eventTitle.slice(0, 80)}`;
  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:7px 12px 7px 0;color:#51555b;width:135px;vertical-align:top;">${label}</td>
      <td style="padding:7px 0;color:#292a2d;">${escapeHtml(value)}</td>
    </tr>`;
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <p style="margin:0 0 6px;color:#51555b;font-size:12px;text-transform:uppercase;letter-spacing:.12em;">New event registration</p>
      <h1 style="margin:0 0 6px;color:#005a8f;font-size:24px;">${escapeHtml(input.eventTitle)}</h1>
      <p style="margin:0 0 22px;color:#51555b;font-size:14px;">${escapeHtml(fmtDate(input.eventStart))}</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        ${row('Name', input.fullName)}
        ${row('Company', input.company)}
        ${row('REALTOR', input.isRealtor ? 'Yes' : 'No')}
        ${row('License number', input.licenseNumber || '—')}
        ${row('Email', input.email)}
        ${row('Mobile', input.mobile)}
      </table>
      <p style="margin:24px 0 8px;">
        <a href="${registryUrl}" style="display:inline-block;background:#005a8f;color:#fff;padding:11px 18px;border-radius:6px;text-decoration:none;font-weight:600;">
          View attendee registry
        </a>
      </p>
      <p style="margin:18px 0 0;color:#7b8089;font-size:12px;">Registration ID: ${input.registrationId}</p>
    </div>`;

  return sendEmail({
    to: notificationAddress(),
    subject,
    html,
    replyTo: input.email,
  });
}
