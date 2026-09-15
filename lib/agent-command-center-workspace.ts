import { z } from 'zod';

export const AGENT_DEAL_STATUSES = ['prep', 'active', 'closing', 'completed'] as const;
export type AgentDealStatus = typeof AGENT_DEAL_STATUSES[number];
export const AGENT_DEADLINE_NOTIFICATION_OFFSETS = [7, 3, 1, 0] as const;
export type AgentDeadlineNotificationOffset = typeof AGENT_DEADLINE_NOTIFICATION_OFFSETS[number];

const shortText = (max: number) => z.string().trim().max(max);
const dateText = z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]);

export type AgentNotificationPreferences = {
  emailEnabled: boolean;
  pushEnabled: boolean;
  reminderOffsets: AgentDeadlineNotificationOffset[];
};

export function defaultAgentNotificationPreferences(): AgentNotificationPreferences {
  return {
    emailEnabled: false,
    pushEnabled: false,
    reminderOffsets: [7, 3, 1, 0],
  };
}

export type AgentContractDetails = {
  county: string;
  legalDescription: string;
  improvementsAndAccessories: string;
  exclusions: string;
  cashPortion: string;
  loanAmount: string;
  salesPrice: string;
  financingType: string;
  financingNotes: string;
  earnestMoney: string;
  titleCompany: string;
  optionFee: string;
  additionalEarnestMoney: string;
  titlePolicyPayer: string;
  surveyPlan: string;
  titleAndSurveyNotes: string;
  conditionAndRepairNotes: string;
  possessionPlan: string;
  specialProvisionsNotes: string;
  settlementNotes: string;
  notices: string;
};

export function defaultAgentContractDetails(): AgentContractDetails {
  return {
    county: '',
    legalDescription: '',
    improvementsAndAccessories: '',
    exclusions: '',
    cashPortion: '',
    loanAmount: '',
    salesPrice: '',
    financingType: '',
    financingNotes: '',
    earnestMoney: '',
    titleCompany: '',
    optionFee: '',
    additionalEarnestMoney: '',
    titlePolicyPayer: '',
    surveyPlan: '',
    titleAndSurveyNotes: '',
    conditionAndRepairNotes: '',
    possessionPlan: '',
    specialProvisionsNotes: '',
    settlementNotes: '',
    notices: '',
  };
}

export const agentNotificationPreferencesSchema = z.object({
  emailEnabled: z.boolean(),
  pushEnabled: z.boolean(),
  reminderOffsets: z.array(z.union([
    z.literal(7),
    z.literal(3),
    z.literal(1),
    z.literal(0),
  ])).min(1).max(4),
}).strict();

export const agentContractDetailsSchema = z.object({
  county: shortText(200),
  legalDescription: shortText(2_000),
  improvementsAndAccessories: shortText(2_000),
  exclusions: shortText(2_000),
  cashPortion: shortText(120),
  loanAmount: shortText(120),
  salesPrice: shortText(120),
  financingType: shortText(280),
  financingNotes: shortText(2_000),
  earnestMoney: shortText(120),
  titleCompany: shortText(280),
  optionFee: shortText(120),
  additionalEarnestMoney: shortText(120),
  titlePolicyPayer: shortText(280),
  surveyPlan: shortText(2_000),
  titleAndSurveyNotes: shortText(2_000),
  conditionAndRepairNotes: shortText(2_000),
  possessionPlan: shortText(1_000),
  specialProvisionsNotes: shortText(2_000),
  settlementNotes: shortText(2_000),
  notices: shortText(2_000),
}).strict();

export const agentReminderSchema = z.object({
  id: shortText(120),
  deadlineId: shortText(120),
  label: shortText(200),
  deadlineDate: dateText,
  reminderDate: dateText,
  complete: z.boolean(),
}).strict();

export const agentTaskSchema = z.object({
  id: shortText(120),
  title: shortText(280),
  dueDate: dateText,
  complete: z.boolean(),
}).strict();

export const agentDocumentSchema = z.object({
  id: shortText(120),
  label: shortText(200),
  complete: z.boolean(),
}).strict();

export const agentDealSchema = z.object({
  id: shortText(120),
  title: shortText(200),
  propertyAddress: shortText(400),
  buyerNames: shortText(300),
  sellerNames: shortText(300),
  effectiveDate: dateText,
  optionPeriodDays: shortText(4),
  additionalEarnestMoneyDays: shortText(4),
  financingDeadlineDays: shortText(4),
  appraisalDeadlineDays: shortText(4),
  titleCommitmentDays: shortText(4),
  surveyDays: shortText(4),
  closingDate: dateText,
  status: z.enum(AGENT_DEAL_STATUSES),
  contractDetails: agentContractDetailsSchema.default(defaultAgentContractDetails()),
  addenda: z.record(z.string(), z.boolean()).default({}),
  reminders: z.array(agentReminderSchema).max(100),
  tasks: z.array(agentTaskSchema).max(200),
  documents: z.array(agentDocumentSchema).max(50),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();

export const agentCommandCenterWorkspaceSchema = z.object({
  deals: z.array(agentDealSchema).max(100),
  notificationPreferences: agentNotificationPreferencesSchema.default(defaultAgentNotificationPreferences()),
}).strict();

export type AgentReminder = z.infer<typeof agentReminderSchema>;
export type AgentTask = z.infer<typeof agentTaskSchema>;
export type AgentDocument = z.infer<typeof agentDocumentSchema>;
export type AgentDeal = z.infer<typeof agentDealSchema>;
export type AgentCommandCenterWorkspace = z.infer<typeof agentCommandCenterWorkspaceSchema>;
