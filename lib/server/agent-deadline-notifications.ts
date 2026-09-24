import { randomUUID } from 'crypto';
import {
  agentCommandCenterWorkspaceSchema,
  type AgentDeal,
  type AgentDeadlineNotificationOffset,
} from '@/lib/agent-command-center-workspace';
import { sendEmail } from '@/lib/email';
import { calculateTrecDeadlines, type TrecDeadline } from '@/lib/trec-deadlines';
import { query } from '@/lib/server/db/neon';
import { sendPushToRealtor } from '@/lib/server/push';
import { ensureAgentCommandCenterWorkspaceSchema } from '@/lib/server/agent-command-center-workspaces';

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
  return deal.propertyAddress || deal.title || 'Your transaction';
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
  }).map(({ id, label, date }) => ({ id, label, date }));

  if (deal.closingDate) {
    deadlines.push({
      id: 'closing-date',
      label: 'Closing date',
      date: deal.closingDate,
    });
  }
  return deadlines;
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
  if (title && !/^new transaction$/i.test(title)) return title;
  return lastNameFrom(deal.buyerNames) || lastNameFrom(deal.sellerNames);
}

function formatDeadlineDate(value: string): string {
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' });
}

export function pushContent(deal: AgentDeal, deadline: DealDeadline, offset: number, firstName: string | null): { title: string; body: string } {
  const lastName = clientLastName(deal);
  const address = (deal.propertyAddress || '').trim();
  const client = [lastName ? titleCase(lastName) : '', address].filter(Boolean).join(', ') || 'Your Transaction';
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
        channel TEXT NOT NULL CHECK (channel IN ('email', 'web_push')),
        claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        sent_at TIMESTAMPTZ,
        provider_message_id TEXT,
        failure_reason TEXT,
        UNIQUE (realtor_id, deal_id, deadline_key, deadline_date, trigger_offset_days, channel)
      )
    `);
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
  channel: 'email' | 'web_push',
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
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://realtynewsnow.app';
  return `
    <div style="font-family:Arial,sans-serif;color:#1e293b;line-height:1.55;max-width:640px;margin:auto">
      <p style="margin:0 0 8px;color:#7059A8;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Closing Time</p>
      <h1 style="margin:0 0 16px;font-size:24px;color:#301D5D">${deadlineLabel}: ${timing}</h1>
      <p style="margin:0 0 8px"><strong>Transaction:</strong> ${label}</p>
      <p style="margin:0 0 24px">Due ${escapeHtml(formatDeadlineDate(deadline.date))}.</p>
      <a href="${siteUrl}/agents/closing-time" style="display:inline-block;background:#301D5D;color:#ffffff;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:700">Open Closing Time</a>
    </div>
  `;
}

export async function runAgentDeadlineNotifications(now = new Date()): Promise<AgentDeadlineNotificationRun> {
  await ensureAgentDeadlineDeliverySchema();
  const today = chicagoParts(now).date;

  const result: AgentDeadlineNotificationRun = {
    eligibleWorkspaces: 0,
    dueDeadlines: 0,
    emailSent: 0,
    pushSent: 0,
    skipped: 0,
    errors: [],
  };

  const PAGE_SIZE = 500;
  let pageOffset = 0;
  let pageCount = PAGE_SIZE;

  while (pageCount === PAGE_SIZE) {
    const recipients = await query<WorkspaceRecipientRow>(
      `SELECT workspace.realtor_id, workspace.workspace, realtors.email, realtors.first_name
       FROM agent_command_center_workspaces AS workspace
       JOIN realtors ON realtors.id = workspace.realtor_id
       ORDER BY workspace.updated_at DESC
       LIMIT $1
       OFFSET $2`,
      [PAGE_SIZE, pageOffset],
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
      if (!preferences.emailEnabled && !preferences.pushEnabled) continue;
      result.eligibleWorkspaces += 1;

      for (const deal of parsed.data.deals) {
        if (deal.status === 'completed') continue;
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
