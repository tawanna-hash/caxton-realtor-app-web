import type { AgentDeal } from '@/lib/agent-command-center-workspace';
import { calculateTrecDeadlines } from '@/lib/trec-deadlines';

export type DealRisk = {
  id: string;
  severity: 'high' | 'medium';
  title: string;
  detail: string;
  /** Deadline the risk relates to, when an extension could address it. */
  deadlineLabel?: string;
  deadlineDate?: string;
};

export type DealTimelineItem = { id: string; label: string; date: string };

function dayDiff(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

export function dealTimeline(deal: AgentDeal): DealTimelineItem[] {
  const items: DealTimelineItem[] = calculateTrecDeadlines({
    effectiveDate: deal.effectiveDate,
    optionPeriodDays: deal.optionPeriodDays,
    additionalEarnestMoneyDays: deal.additionalEarnestMoneyDays,
    financingDeadlineDays: deal.financingDeadlineDays,
    appraisalDeadlineDays: deal.appraisalDeadlineDays,
    titleCommitmentDays: deal.titleCommitmentDays,
    surveyDays: deal.surveyDays,
    titleObjectionDays: deal.titleObjectionDays,
  }).map(({ id, label, date }) => ({ id, label, date }));
  if (deal.closingDate) items.push({ id: 'closing-date', label: 'Closing date', date: deal.closingDate });
  return items.sort((a, b) => a.date.localeCompare(b.date));
}

function hasReceived(deal: AgentDeal, pattern: RegExp): boolean {
  return deal.documents.some((doc) => pattern.test(doc.label) && (doc.status === 'received' || doc.status === 'reviewed'));
}

/**
 * Flags deals where a deadline is close or past and a required item is not on
 * file. Rules are intentionally conservative; they only use data the agent has
 * already entered in the deal.
 */
export function dealRisks(deal: AgentDeal, today: string): DealRisk[] {
  if (deal.status === 'completed') return [];
  const risks: DealRisk[] = [];
  const timeline = dealTimeline(deal);
  const find = (re: RegExp) => timeline.find((item) => re.test(item.id) || re.test(item.label));

  const when = (date: string) => {
    const d = dayDiff(today, date);
    return d < 0 ? `${-d} day${d === -1 ? '' : 's'} past due` : d === 0 ? 'due today' : `due in ${d} day${d === 1 ? '' : 's'}`;
  };

  const check = (re: RegExp, window: number, docRe: RegExp, title: string, detail: string) => {
    const item = find(re);
    if (!item) return;
    const d = dayDiff(today, item.date);
    if (d > window || d < -14) return;
    if (hasReceived(deal, docRe)) return;
    risks.push({
      id: `risk-${item.id}`,
      severity: d <= 1 ? 'high' : 'medium',
      title,
      detail: `${item.label} ${when(item.date)}. ${detail}`,
      deadlineLabel: item.label,
      deadlineDate: item.date,
    });
  };

  check(/apprais/i, 5, /apprais/i, 'No appraisal on file', 'Confirm the appraisal date with the lender or request an extension.');
  check(/title.?commit/i, 5, /title commitment|commitment/i, 'Title commitment not received', 'Ask the title company for the commitment.');
  check(/survey/i, 5, /survey/i, 'Survey not received', 'Ask the title company or surveyor for status.');
  check(/financ/i, 5, /loan approval|lender|approval|financ/i, 'No financing approval on file', 'Ask the lender for approval status or request an extension.');
  check(/option.*(end|expire|period)/i, 2, /inspection/i, 'No inspection report on file', 'Confirm the inspection and any repair request before the option period ends.');

  if (deal.effectiveDate) {
    const money = dayDiff(today, deal.effectiveDate) + 3;
    if (!deal.earnestMoneyDeliveredDate && money <= 1 && money >= -14) {
      risks.push({
        id: 'risk-earnest-money', severity: money <= 0 ? 'high' : 'medium',
        title: 'Earnest money not marked delivered',
        detail: `Earnest money is due within 3 days of the effective date (${money <= 0 ? 'now due' : 'due soon'}). Confirm delivery with the title company.`,
      });
    }
    if (!deal.optionFeeDeliveredDate && money <= 1 && money >= -14) {
      risks.push({
        id: 'risk-option-fee', severity: money <= 0 ? 'high' : 'medium',
        title: 'Option fee not marked delivered',
        detail: 'The option fee is due within 3 days of the effective date. Confirm it was delivered to the seller.',
      });
    }
  }

  const overdue = deal.tasks.filter((t) => !t.complete && t.dueDate && t.dueDate < today);
  if (overdue.length) {
    risks.push({
      id: 'risk-overdue-tasks', severity: 'medium',
      title: `${overdue.length} overdue task${overdue.length === 1 ? '' : 's'}`,
      detail: overdue.slice(0, 3).map((t) => t.title).join('; '),
    });
  }

  if (deal.closingDate) {
    const d = dayDiff(today, deal.closingDate);
    const open = deal.documents.filter((doc) => doc.status === 'requested');
    if (d >= 0 && d <= 7 && open.length) {
      risks.push({
        id: 'risk-closing-docs', severity: d <= 3 ? 'high' : 'medium',
        title: `${open.length} document${open.length === 1 ? '' : 's'} still requested`,
        detail: `Closing ${when(deal.closingDate)}. Still open: ${open.slice(0, 4).map((x) => x.label).join(', ')}.`,
      });
    }
  }
  return risks.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'high' ? -1 : 1));
}

export function extensionDraft(deal: AgentDeal, risk: DealRisk, agentName: string): { subject: string; body: string } {
  const property = deal.propertyAddress || deal.title || 'the property';
  const label = risk.deadlineLabel ?? 'the deadline';
  return {
    subject: `Extension request: ${label} - ${property}`,
    body:
      `Hello,\n\nOn behalf of my client, I am requesting a short extension of the ${label.toLowerCase()} for ${property}` +
      `${risk.deadlineDate ? ` (currently ${risk.deadlineDate})` : ''}. ` +
      `We are still waiting on a required item and want to keep the transaction on track. ` +
      `Please let me know whether your client agrees to ___ additional days. If so, I will prepare the signed amendment.\n\nThank you,\n${agentName}`,
  };
}
