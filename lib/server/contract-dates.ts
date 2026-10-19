import { randomUUID } from 'crypto';
import {
  agentCommandCenterWorkspaceSchema,
  agentDealSchema,
  defaultAgentContractDetails,
  defaultAgentNotificationPreferences,
  type AgentCommandCenterWorkspace,
  type AgentDeal,
} from '@/lib/agent-command-center-workspace';
import { calculateTrecDeadlines } from '@/lib/trec-deadlines';
import {
  getAgentCommandCenterWorkspace,
  saveAgentCommandCenterWorkspace,
} from '@/lib/server/agent-command-center-workspaces';

/**
 * Limited Contracts module for Realty News Now subscribers.
 *
 * A saved contract is a deal in the agent's existing workspace, with an id that
 * starts with "contracts-". That means the daily deadline job already sends its
 * email and push alerts, with no second notification system to keep in sync.
 */
export const LITE_PREFIX = 'contracts-';
const MAX_CONTRACTS = 60;

export type ContractDatesInput = {
  propertyAddress: string;
  buyerNames: string;
  sellerNames: string;
  effectiveDate: string;
  optionPeriodDays: string;
  additionalEarnestMoneyDays: string;
  financingDeadlineDays: string;
  appraisalDeadlineDays: string;
  titleCommitmentDays: string;
  surveyDays: string;
  titleObjectionDays: string;
  closingDate: string;
  salesPrice: string;
  earnestMoney: string;
};

export type ContractSummary = ContractDatesInput & {
  id: string;
  createdAt: string;
  deadlines: Array<{ id: string; label: string; date: string }>;
};

export type ContractAlerts = {
  emailEnabled: boolean;
  pushEnabled: boolean;
  reminderOffsets: Array<0 | 1 | 3 | 7>;
};

export function isLiteDeal(deal: Pick<AgentDeal, 'id'>): boolean {
  return deal.id.startsWith(LITE_PREFIX);
}

export function deadlinesFor(input: Partial<ContractDatesInput>): Array<{ id: string; label: string; date: string }> {
  const list = calculateTrecDeadlines({
    effectiveDate: input.effectiveDate,
    optionPeriodDays: input.optionPeriodDays,
    additionalEarnestMoneyDays: input.additionalEarnestMoneyDays,
    financingDeadlineDays: input.financingDeadlineDays,
    appraisalDeadlineDays: input.appraisalDeadlineDays,
    titleCommitmentDays: input.titleCommitmentDays,
    surveyDays: input.surveyDays,
    titleObjectionDays: input.titleObjectionDays,
  }).map(({ id, label, date }) => ({ id, label, date }));
  if (input.closingDate && /^\d{4}-\d{2}-\d{2}$/.test(input.closingDate)) {
    list.push({ id: 'closing-date', label: 'Closing date', date: input.closingDate });
  }
  return list.sort((a, b) => a.date.localeCompare(b.date));
}

export function buildLiteDeal(input: ContractDatesInput, now = new Date()): AgentDeal {
  const iso = now.toISOString();
  return agentDealSchema.parse({
    id: `${LITE_PREFIX}${randomUUID()}`,
    title: input.propertyAddress.trim() || 'Uploaded contract',
    propertyAddress: input.propertyAddress,
    buyerNames: input.buyerNames,
    sellerNames: input.sellerNames,
    effectiveDate: input.effectiveDate,
    optionPeriodDays: input.optionPeriodDays,
    additionalEarnestMoneyDays: input.additionalEarnestMoneyDays,
    financingDeadlineDays: input.financingDeadlineDays,
    appraisalDeadlineDays: input.appraisalDeadlineDays,
    titleCommitmentDays: input.titleCommitmentDays,
    surveyDays: input.surveyDays,
    titleObjectionDays: input.titleObjectionDays,
    closingDate: input.closingDate,
    contractDetails: { ...defaultAgentContractDetails(), salesPrice: input.salesPrice, earnestMoney: input.earnestMoney },
    status: 'active',
    createdAt: iso,
    updatedAt: iso,
  });
}

export function summarize(deal: AgentDeal): ContractSummary {
  return {
    id: deal.id,
    createdAt: deal.createdAt,
    propertyAddress: deal.propertyAddress,
    buyerNames: deal.buyerNames,
    sellerNames: deal.sellerNames,
    effectiveDate: deal.effectiveDate,
    optionPeriodDays: deal.optionPeriodDays,
    additionalEarnestMoneyDays: deal.additionalEarnestMoneyDays,
    financingDeadlineDays: deal.financingDeadlineDays,
    appraisalDeadlineDays: deal.appraisalDeadlineDays,
    titleCommitmentDays: deal.titleCommitmentDays,
    surveyDays: deal.surveyDays,
    titleObjectionDays: deal.titleObjectionDays,
    closingDate: deal.closingDate,
    salesPrice: deal.contractDetails?.salesPrice ?? '',
    earnestMoney: deal.contractDetails?.earnestMoney ?? '',
    deadlines: deadlinesFor(deal),
  };
}

export async function listContracts(realtorId: string): Promise<{ contracts: ContractSummary[]; alerts: ContractAlerts }> {
  const record = await getAgentCommandCenterWorkspace(realtorId);
  const workspace = record?.workspace;
  const prefs = workspace?.notificationPreferences ?? defaultAgentNotificationPreferences();
  return {
    contracts: (workspace?.deals ?? []).filter(isLiteDeal).map(summarize)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    alerts: { emailEnabled: prefs.emailEnabled, pushEnabled: prefs.pushEnabled, reminderOffsets: prefs.reminderOffsets },
  };
}

type Mutator = (workspace: AgentCommandCenterWorkspace, isNew: boolean) => AgentCommandCenterWorkspace;

/** Read, change and save the workspace, retrying once if another device saved first. */
async function mutate(realtorId: string, change: Mutator): Promise<AgentCommandCenterWorkspace> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const record = await getAgentCommandCenterWorkspace(realtorId);
    const isNew = !record;
    const base = record?.workspace ?? agentCommandCenterWorkspaceSchema.parse({});
    const next = agentCommandCenterWorkspaceSchema.parse(change(base, isNew));
    const result = await saveAgentCommandCenterWorkspace(realtorId, next, record?.version ?? null);
    if (result.saved) return result.record.workspace;
  }
  throw new Error('Could not save right now. Try again.');
}

export class ContractLimitError extends Error {}

export async function addContract(realtorId: string, input: ContractDatesInput): Promise<ContractSummary> {
  const deal = buildLiteDeal(input);
  await mutate(realtorId, (workspace, isNew) => {
    const lite = workspace.deals.filter(isLiteDeal).length;
    if (lite >= MAX_CONTRACTS || workspace.deals.length >= 100) {
      throw new ContractLimitError('You have reached the limit of saved contracts. Remove one to add another.');
    }
    return {
      ...workspace,
      deals: [...workspace.deals, deal],
      // A first-time user gets email alerts on right away. Existing choices stay as they are.
      notificationPreferences: isNew
        ? { ...workspace.notificationPreferences, emailEnabled: true }
        : workspace.notificationPreferences,
    };
  });
  return summarize(deal);
}

export async function removeContract(realtorId: string, id: string): Promise<boolean> {
  if (!id.startsWith(LITE_PREFIX)) return false;
  let found = false;
  await mutate(realtorId, (workspace) => {
    found = workspace.deals.some((d) => d.id === id);
    return { ...workspace, deals: workspace.deals.filter((d) => d.id !== id) };
  });
  return found;
}

export async function setContractAlerts(realtorId: string, alerts: Partial<ContractAlerts>): Promise<ContractAlerts> {
  const saved = await mutate(realtorId, (workspace) => ({
    ...workspace,
    notificationPreferences: {
      ...workspace.notificationPreferences,
      ...(alerts.emailEnabled === undefined ? {} : { emailEnabled: alerts.emailEnabled }),
      ...(alerts.pushEnabled === undefined ? {} : { pushEnabled: alerts.pushEnabled }),
      ...(alerts.reminderOffsets ? { reminderOffsets: alerts.reminderOffsets } : {}),
    },
  }));
  const p = saved.notificationPreferences;
  return { emailEnabled: p.emailEnabled, pushEnabled: p.pushEnabled, reminderOffsets: p.reminderOffsets };
}
