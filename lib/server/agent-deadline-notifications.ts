import { randomUUID } from 'crypto';
import { logDeadlineDelivery } from '@/lib/server/closing-time-events';
import {
  agentCommandCenterWorkspaceSchema,
  type AgentDeal,
  type AgentDeadlineNotificationOffset,
} from '@/lib/agent-command-center-workspace';
import { sendEmail } from '@/lib/email';
import { calculateTrecDeadlines, type TrecDeadline } from '@/lib/trec-deadlines';
import { query } from '@/lib/server/db/neon';
import { blankFieldAlerts, type TrecFormStatus } from '@/lib/blank-field-alerts';
import { BUILT_IN_TREC_FORM_VERSIONS } from '@/lib/trec-form-versions';
import { sendSms, toE164 } from '@/lib/server/sms';
import { sendPushToRealtor } from '@/lib/server/push';
import { ensureAgentCommandCenterWorkspaceSchema } from '@/lib/server/agent-command-center-workspaces';
import { CLOSING_TIME_ORIGIN } from '@/lib/closing-time-origin';

type WorkspaceRecipientRow = {
  realtor_id: string;
  email: string | null;
  first_name: string | null;
  workspace: unknown;
};

type ClaimedDelivery = { id: string };

type DealDeadline = Pick<TrecDeadline, 'id' | 'label' | 'date'>;

export type AgentDeadlineNotificationRun = {
  eligibleWorkspaces: number;
  dueDeadlines: number;
  emailSent: number;
  pushSent: number;
  smsSent: number;
  skipped: number;
  errors: string[];
};

let deliverySchemaPromise: Promise<void> | null = null;

function chicagoParts(now = new Date()): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return {
    date: `${value('year')}-${value('month')}-${value('day')}`,
    hour: Number(value('hour')),
  };
}

export function isAgentDeadlineDeliveryWindow(now = new Date()): boolean {
  const { hour } = chicagoParts(now);
  // The second hour gives a failed provider call one safe retry window. The
  // private ledger prevents a duplicate after an earlier successful send.
  return hour === 8 || hour === 9;
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character] ?? character));
}

function dealLabel(deal: AgentDeal): string {
  const address = (deal.propertyAddress || deal.formFields?.p01_f008 || '').trim();
  return address || `${deal.title || 'Your deal'} (address not entered)`;
}

function deadlinesForDeal(deal: AgentDeal): DealDeadline[] {
  const deadlines = calculateTrecDeadlines({
    effectiveDate: deal.effectiveDate,
    optionPeriodDays: deal.optionPeriodDays,
    additionalEarnestMoneyDays: deal.additionalEarnestMoneyDays,
    financingDeadlineDays: deal.financingDeadlineDays,
    appraisalDeadlineDays: deal.appraisalDeadlineDays,
    titleCommitmentDays: deal.titleCommitmentDays,
    surveyDays: deal.surveyDays,
    titleObjectionDays: deal.titleObjectionDays,
  }).map(({ id, label, date }) => ({ id, label, date }));


  if (deal.closingDate) {
    deadlines.push({
      id: 'closing-date',
      label: 'Closing date',
      date: deal.closingDate,
    });
  }
  // Deadlines marked done on the Snapshot no longer send alerts.
  return deadlines.filter((deadline) => !deal.documentChecks?.[`dl:${deadline.id}`]);
}

function titleCase(value: string): string {
  return value.replace(/\b([a-z])/g, (c) => c.toUpperCase());
}

function lastNameFrom(names: string | undefined): string {
  const first = (names || '').split(/[,&]| and /i)[0]?.trim() ?? '';
  const parts = first.split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

function clientLastName(deal: AgentDeal): string {
  const title = (deal.title || '').trim();
  if (title && !/^new (transaction|contract)$/i.test(title)) return title;
  return lastNameFrom(deal.buyerNames) || lastNameFrom(deal.sellerNames);
}

function formatDeadlineDate(value: string): string {
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' });
}

export function pushContent(deal: AgentDeal, deadline: DealDeadline, offset: number, firstName: string | null): { title: string; body: string } {
  const lastName = clientLastName(deal);
  const address = dealLabel(deal);
  const client = [lastName ? titleCase(lastName) : '', address].filter(Boolean).join(', ');
  void firstName;
  return {
    title: `${deadline.label}: ${offset === 0 ? 'today' : `in ${offset} day${offset === 1 ? '' : 's'}`}`,
    body: `${client}\nDue ${formatDeadlineDate(deadline.date)}.\nFrom Closing Time`,
  };
}

async function ensureAgentDeadlineDeliverySchema(): Promise<void> {
  if (deliverySchemaPromise) return deliverySchemaPromise;
  deliverySchemaPromise = (async () => {
    await ensureAgentCommandCenterWorkspaceSchema();
    await query(`
      CREATE TABLE IF NOT EXISTS agent_command_center_deadline_deliveries (
        id UUID PRIMARY KEY,
        realtor_id UUID NOT NULL REFERENCES realtors(id) ON DELETE CASCADE,
        deal_id TEXT NOT NULL,
        deadline_key TEXT NOT NULL,
        deadline_date DATE NOT NULL,
        trigger_offset_days SMALLINT NOT NULL CHECK (trigger_offset_days IN (0, 1, 3, 7)),
        channel TEXT NOT NULL CHECK (channel IN ('email', 'web_push', 'sms')),
        claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        sent_at TIMESTAMPTZ,
        provider_message_id TEXT,
        failure_reason TEXT,
        UNIQUE (realtor_id, deal_id, deadline_key, deadline_date, trigger_offset_days, channel)
      )
    `);
    // Text alerts were added after the table existed: widen the channel check once.
    await query(`ALTER TABLE agent_command_center_deadline_deliveries DROP CONSTRAINT IF EXISTS agent_command_center_deadline_deliveries_channel_check`);
    await query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_deadline_deliveries_channel_v2') THEN
        ALTER TABLE agent_command_center_deadline_deliveries ADD CONSTRAINT agent_deadline_deliveries_channel_v2 CHECK (channel IN ('email', 'web_push', 'sms'));
      END IF; END $$`);
    await query(`
      CREATE INDEX IF NOT EXISTS agent_deadline_deliveries_realtor_idx
      ON agent_command_center_deadline_deliveries (realtor_id, sent_at DESC)
    `);
  })().catch((error) => {
    deliverySchemaPromise = null;
    throw error;
  });
  return deliverySchemaPromise;
}

async function claimDelivery(
  realtorId: string,
  dealId: string,
  deadline: DealDeadline,
  offset: AgentDeadlineNotificationOffset,
  channel: 'email' | 'web_push' | 'sms',
): Promise<string | null> {
  const id = randomUUID();
  const rows = await query<ClaimedDelivery>(
    `INSERT INTO agent_command_center_deadline_deliveries
       (id, realtor_id, deal_id, deadline_key, deadline_date, trigger_offset_days, channel)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5::date, $6, $7)
     ON CONFLICT (realtor_id, deal_id, deadline_key, deadline_date, trigger_offset_days, channel)
     DO NOTHING
     RETURNING id`,
    [id, realtorId, dealId, deadline.id, deadline.date, offset, channel],
  );
  return rows[0]?.id ?? null;
}

async function markDeliverySent(id: string, providerMessageId?: string): Promise<void> {
  await query(
    `UPDATE agent_command_center_deadline_deliveries
     SET sent_at = NOW(),
         provider_message_id = $2,
         failure_reason = NULL
     WHERE id = $1::uuid`,
    [id, providerMessageId ?? null],
  );
  await logDeadlineDelivery(id);
}

async function releaseDelivery(id: string, failureReason: string): Promise<void> {
  await query(
    `DELETE FROM agent_command_center_deadline_deliveries
     WHERE id = $1::uuid
       AND sent_at IS NULL`,
    [id],
  );
  console.warn('[agent-deadline-notifications] delivery released', { id, failureReason });
}

export function emailHtml(deal: AgentDeal, deadline: DealDeadline, offset: number): string {
  const label = escapeHtml(dealLabel(deal));
  const deadlineLabel = escapeHtml(deadline.label);
  const timing = offset === 0 ? 'today' : `in ${offset} day${offset === 1 ? '' : 's'}`;
  const siteUrl = CLOSING_TIME_ORIGIN;
  return `
    <div style="font-family:Arial,sans-serif;color:#292a2d;line-height:1.55;max-width:640px;margin:auto">
      <p style="margin:0 0 8px;color:#2f7aa7;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Closing Time</p>
      <h1 style="margin:0 0 16px;font-size:24px;color:#005a8f">${deadlineLabel}: ${timing}</h1>
      <p style="margin:0 0 8px"><strong>Property:</strong> ${label}</p>
      <p style="margin:0 0 24px">Due ${escapeHtml(formatDeadlineDate(deadline.date))}.</p>
      <a href="${siteUrl}/agents/closing-time" style="display:inline-block;background:#005a8f;color:#ffffff;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:700">Open Closing Time</a>
    </div>
  `;
}


function formStatuses(deal: AgentDeal): TrecFormStatus[] {
  return BUILT_IN_TREC_FORM_VERSIONS.filter((version) => version.isActive).map((version) => ({
    formFamily: version.formFamily, formNumber: version.formNumber, title: version.title, total: version.fields.length,
    filled: version.fields.filter((field) => (deal.formFields?.[field.id] ?? '').trim() !== '').length,
    selected: Boolean(deal.selectedFormFamilies?.[version.formFamily]),
    textTotal: version.fields.filter((field) => field.type === 'text').length,
    textFilled: version.fields.filter((field) => field.type === 'text' && (deal.formFields?.[field.id] ?? '').trim() !== '').length,
  }));
}

function openBlankAlerts(deal: AgentDeal) {
  const ignored = new Set(deal.ignoredBlankAlerts ?? []);
  return blankFieldAlerts(deal, formStatuses(deal)).filter((alert) => !ignored.has(alert.id));
}

const SMS_OWNER_EMAILS = new Set(['tawanna@verock.com', 'tawanna@myrealtyline.com']);
export const smsAllowedFor = (email: string | null | undefined): boolean => SMS_OWNER_EMAILS.has((email ?? '').trim().toLowerCase());
export const SMS_AUDIENCE = 'closing-time-alerts';

/** One text to the agent's own number; only if they turned text alerts on (consent is recorded then). */
async function textAgent(email: string | null | undefined, preferences: { smsEnabled?: boolean; smsPhone?: string }, text: string): Promise<{ ok: boolean; reason?: string }> {
  // Texts go out on the owner's Telnyx account (paid per message), so they are owner-only for now.
  if (!smsAllowedFor(email)) return { ok: false, reason: 'text alerts not available for this account' };
  if (!preferences.smsEnabled || !toE164(preferences.smsPhone)) return { ok: false, reason: 'text alerts off' };
  try {
    const out = await sendSms(SMS_AUDIENCE, text, [preferences.smsPhone as string]);
    if (out.sent.length > 0) return { ok: true };
    return { ok: false, reason: out.skipped[0]?.reason ?? out.failed[0]?.error ?? 'not sent' };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'text send failed' };
  }
}

export function reminderText(deal: AgentDeal, deadline: DealDeadline, offset: number): string {
  const timing = offset === 0 ? 'today' : `in ${offset} day${offset === 1 ? '' : 's'}`;
  return `Closing Time: ${deadline.label} ${timing} (${formatDeadlineDate(deadline.date)}). Property: ${dealLabel(deal)}. Reply STOP to opt out.`;
}

export function urgentText(deal: AgentDeal, deadline: DealDeadline, count: number): string {
  return `Closing Time URGENT: ${deadline.label} is tomorrow. ${count} item${count === 1 ? '' : 's'} with blank fields need review. Property: ${dealLabel(deal)}. Reply STOP to opt out.`;
}

export function urgentEmailHtml(deal: AgentDeal, deadline: DealDeadline, items: Array<{ label: string; blank: number }>): string {
  const siteUrl = CLOSING_TIME_ORIGIN;
  const rows = items.slice(0, 12).map((item) => `<li style="margin:0 0 4px">${escapeHtml(item.label)}: ${item.blank} blank</li>`).join('');
  return `
    <div style="font-family:Arial,sans-serif;color:#292a2d;line-height:1.55;max-width:640px;margin:auto">
      <p style="margin:0 0 8px;color:#2f7aa7;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Closing Time</p>
      <h1 style="margin:0 0 16px;font-size:24px;color:#005a8f">Urgent: Review Blank Fields Before ${escapeHtml(deadline.label)}</h1>
      <p style="margin:0 0 8px"><strong>Property:</strong> ${escapeHtml(dealLabel(deal))}</p>
      <p style="margin:0 0 12px">${escapeHtml(deadline.label)} is due tomorrow, ${escapeHtml(formatDeadlineDate(deadline.date))}. These items still have blank fields. Review each one or ignore it if the blanks are intentional.</p>
      <ul style="margin:0 0 24px;padding-left:20px">${rows}</ul>
      <a href="${siteUrl}/agents/closing-time" style="display:inline-block;background:#005a8f;color:#ffffff;padding:12px 18px;border-radius:999px;text-decoration:none">Open Closing Time</a>
    </div>
  `;
}

export async function runAgentDeadlineNotifications(now = new Date(), options: { realtorId?: string } = {}): Promise<AgentDeadlineNotificationRun> {
  await ensureAgentDeadlineDeliverySchema();
  const today = chicagoParts(now).date;

  const result: AgentDeadlineNotificationRun = {
    eligibleWorkspaces: 0,
    dueDeadlines: 0,
    emailSent: 0,
    pushSent: 0,
    smsSent: 0,
    skipped: 0,
    errors: [],
  };

  const PAGE_SIZE = 500;
  let pageOffset = 0;
  let pageCount = PAGE_SIZE;

  while (pageCount === PAGE_SIZE) {
    const recipients = await query<WorkspaceRecipientRow>(
      `SELECT workspace.realtor_id, workspace.workspace, COALESCE(NULLIF(workspace.workspace->'notificationPreferences'->>'notificationEmail',''), realtors.email) AS email, realtors.first_name
       FROM agent_command_center_workspaces AS workspace
       JOIN realtors ON realtors.id = workspace.realtor_id
       WHERE ($3::uuid IS NULL OR workspace.realtor_id = $3::uuid)
       ORDER BY workspace.updated_at DESC
       LIMIT $1
       OFFSET $2`,
      [PAGE_SIZE, pageOffset, options.realtorId ?? null],
    );
    pageCount = recipients.length;
    pageOffset += pageCount;

    for (const row of recipients) {
      const parsed = agentCommandCenterWorkspaceSchema.safeParse(row.workspace);
      if (!parsed.success) {
        result.skipped += 1;
        continue;
      }
      const preferences = parsed.data.notificationPreferences;
      if (!preferences.emailEnabled && !preferences.pushEnabled && !preferences.smsEnabled) continue;
      result.eligibleWorkspaces += 1;

      for (const deal of parsed.data.deals) {
        if (deal.status === 'completed' || deal.isTemplate) continue;
        // Urgent alert: the day before each key deadline, any item with unreviewed blank fields.
        for (const deadline of deadlinesForDeal(deal)) {
          if (addDays(deadline.date, -1) !== today) continue;
          const items = openBlankAlerts(deal);
          if (items.length === 0) continue;
          const urgentKey: DealDeadline = { ...deadline, id: `urgent:${deadline.id}` };
          const transaction = dealLabel(deal);
          result.dueDeadlines += 1;
          if (preferences.emailEnabled && row.email) {
            const deliveryId = await claimDelivery(row.realtor_id, deal.id, urgentKey, 1, 'email');
            if (deliveryId) {
              const sent = await sendEmail({ to: row.email, subject: `Urgent: review blank fields before ${deadline.label} — ${transaction}`, html: urgentEmailHtml(deal, deadline, items) });
              if (sent.ok) { await markDeliverySent(deliveryId, sent.messageId); result.emailSent += 1; }
              else { await releaseDelivery(deliveryId, sent.error ?? 'email send failed'); result.errors.push(`urgent email ${deal.id}/${deadline.id}: ${sent.error ?? 'send failed'}`); }
            }
          }
          if (preferences.pushEnabled) {
            const deliveryId = await claimDelivery(row.realtor_id, deal.id, urgentKey, 1, 'web_push');
            if (deliveryId) {
              try {
                const sent = await sendPushToRealtor(row.realtor_id, {
                  title: `Urgent: ${deadline.label} is tomorrow`,
                  body: `${transaction}\n${items.length} item${items.length === 1 ? '' : 's'} with blank fields need review.\nFrom Closing Time`,
                  url: '/agents/closing-time',
                  tag: `agent-urgent-${deal.id}-${deadline.id}`,
                });
                if (sent.sent > 0) { await markDeliverySent(deliveryId); result.pushSent += 1; }
                else { await releaseDelivery(deliveryId, 'No active browser or app push subscription'); result.skipped += 1; }
              } catch (error) {
                const message = error instanceof Error ? error.message : 'push send failed';
                await releaseDelivery(deliveryId, message);
                result.errors.push(`urgent push ${deal.id}/${deadline.id}: ${message}`);
              }
            }
          }
          if (preferences.smsEnabled) {
            const deliveryId = await claimDelivery(row.realtor_id, deal.id, urgentKey, 1, 'sms');
            if (deliveryId) {
              const sent = await textAgent(row.email, preferences, urgentText(deal, deadline, items.length));
              if (sent.ok) { await markDeliverySent(deliveryId); result.smsSent += 1; }
              else { await releaseDelivery(deliveryId, sent.reason ?? 'text send failed'); result.skipped += 1; }
            }
          }
        }
        for (const deadline of deadlinesForDeal(deal)) {
          for (const offset of preferences.reminderOffsets) {
            if (addDays(deadline.date, -offset) !== today) continue;
            result.dueDeadlines += 1;
            const transaction = dealLabel(deal);
            const timing = offset === 0 ? 'today' : `in ${offset} day${offset === 1 ? '' : 's'}`;

            if (preferences.emailEnabled && row.email) {
              const deliveryId = await claimDelivery(row.realtor_id, deal.id, deadline, offset, 'email');
              if (deliveryId) {
                const sent = await sendEmail({
                  to: row.email,
                  subject: `${deadline.label}: ${timing} — ${transaction}`,
                  html: emailHtml(deal, deadline, offset),
                });
                if (sent.ok) {
                  await markDeliverySent(deliveryId, sent.messageId);
                  result.emailSent += 1;
                } else {
                  await releaseDelivery(deliveryId, sent.error ?? 'email send failed');
                  result.errors.push(`email ${deal.id}/${deadline.id}: ${sent.error ?? 'send failed'}`);
                }
              }
            }

            if (preferences.pushEnabled) {
              const deliveryId = await claimDelivery(row.realtor_id, deal.id, deadline, offset, 'web_push');
              if (deliveryId) {
                try {
                  const push = pushContent(deal, deadline, offset, row.first_name);
                  const sent = await sendPushToRealtor(row.realtor_id, {
                    title: push.title,
                    body: push.body,
                    url: '/agents/closing-time',
                    tag: `agent-deadline-${deal.id}-${deadline.id}-${offset}`,
                  });
                  if (sent.sent > 0) {
                    await markDeliverySent(deliveryId);
                    result.pushSent += 1;
                  } else {
                    await releaseDelivery(deliveryId, 'No active browser or app push subscription');
                    result.skipped += 1;
                  }
                } catch (error) {
                  const message = error instanceof Error ? error.message : 'push send failed';
                  await releaseDelivery(deliveryId, message);
                  result.errors.push(`push ${deal.id}/${deadline.id}: ${message}`);
                }
              }
            }

            if (preferences.smsEnabled) {
              const deliveryId = await claimDelivery(row.realtor_id, deal.id, deadline, offset, 'sms');
              if (deliveryId) {
                const sent = await textAgent(row.email, preferences, reminderText(deal, deadline, offset));
                if (sent.ok) { await markDeliverySent(deliveryId); result.smsSent += 1; }
                else { await releaseDelivery(deliveryId, sent.reason ?? 'text send failed'); result.skipped += 1; }
              }
            }
          }
        }
      }
    }
  }

  return result;
}

/**
 * Admin-only live test: sends one Closing Time email + push to a realtor
 * using their next upcoming deadline (or a sample deal when they have none).
 * Bypasses the 8–10 AM window and the delivery ledger.
 */
export async function sendAgentDeadlineTestAlert(email: string, emailTo?: string): Promise<Record<string, unknown>> {
  await ensureAgentCommandCenterWorkspaceSchema();
  const realtors = await query<{ id: string; email: string; first_name: string | null }>(
    `SELECT id, email, first_name FROM realtors WHERE LOWER(email) = LOWER($1) LIMIT 1`,
    [email],
  );
  const realtor = realtors[0];
  if (!realtor) return { ok: false, error: 'realtor not found' };

  const workspaces = await query<{ workspace: unknown }>(
    `SELECT workspace FROM agent_command_center_workspaces WHERE realtor_id = $1 LIMIT 1`,
    [realtor.id],
  );
  const parsed = workspaces[0] ? agentCommandCenterWorkspaceSchema.safeParse(workspaces[0].workspace) : null;
  const today = chicagoParts().date;
  let pick: { deal: AgentDeal; deadline: DealDeadline } | null = null;
  if (parsed?.success) {
    for (const deal of parsed.data.deals) {
      if (deal.status === 'completed') continue;
      for (const deadline of deadlinesForDeal(deal)) {
        if (deadline.date >= today && (!pick || deadline.date < pick.deadline.date)) pick = { deal, deadline };
      }
    }
  }
  const sample = !pick;
  if (!pick) {
    pick = {
      deal: { title: 'Smith', propertyAddress: '1234 Oak Hollow Dr, Austin, TX 78745' } as AgentDeal,
      deadline: { id: 'option-period-ends', label: 'Option period ends', date: addDays(today, 3) },
    };
  }
  const { deal, deadline } = pick;
  const msPerDay = 86_400_000;
  const offset = Math.max(0, Math.round((Date.parse(`${deadline.date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / msPerDay));
  const timing = offset === 0 ? 'today' : `in ${offset} day${offset === 1 ? '' : 's'}`;

  const emailResult = await sendEmail({
    to: emailTo || realtor.email,
    subject: `${deadline.label}: ${timing} — ${dealLabel(deal)}`,
    html: emailHtml(deal, deadline, offset),
  });

  const push = pushContent(deal, deadline, offset, realtor.first_name);
  const payload = { title: push.title, body: push.body, url: '/agents/closing-time', tag: `agent-deadline-test-${Date.now()}` };
  const devices = await query<{ kind: string; n: number }>(
    `SELECT 'web' AS kind, COUNT(*)::int AS n FROM push_subscriptions WHERE realtor_id = $1 AND revoked_at IS NULL
     UNION ALL
     SELECT platform AS kind, COUNT(*)::int AS n FROM native_push_tokens WHERE realtor_id = $1 AND revoked_at IS NULL GROUP BY platform`,
    [realtor.id],
  );
  const pushResult = await sendPushToRealtor(realtor.id, payload);
  const { getApnsConfigStatus } = await import('@/lib/server/native-push');
  const { isFcmConfigured } = await import('@/lib/server/android-push');

  return {
    ok: true,
    sampleDeal: sample,
    email: { to: emailTo || realtor.email, ok: emailResult.ok, error: emailResult.ok ? undefined : emailResult.error },
    push: { ...payload, result: pushResult },
    devices,
    apns: getApnsConfigStatus(),
    fcmConfigured: isFcmConfigured(),
  };
}
