import { z } from 'zod';
import {
  TREC_DEAL_WORKFLOW_STATUSES,
  TREC_TASK_PRIORITIES,
  TREC_TASK_STATUSES,
  TREC_WORKFLOW_STAGES,
} from './trec-workflow';

export const AGENT_DEAL_STATUSES = ['prep', 'active', 'closing', 'completed'] as const;
export type AgentDealStatus = typeof AGENT_DEAL_STATUSES[number];
export const AGENT_DEADLINE_NOTIFICATION_OFFSETS = [7, 3, 1, 0] as const;
export type AgentDeadlineNotificationOffset = typeof AGENT_DEADLINE_NOTIFICATION_OFFSETS[number];

const shortText = (max: number) => z.string().trim().max(max);
const dateText = z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]);
const optionalShortText = (max: number) => shortText(max).default('');

export type AgentNotificationPreferences = {
  emailEnabled: boolean;
  pushEnabled: boolean;
  reminderOffsets: AgentDeadlineNotificationOffset[];
};

export function defaultAgentNotificationPreferences(): AgentNotificationPreferences {
  return { emailEnabled: false, pushEnabled: false, reminderOffsets: [7, 3, 1, 0] };
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
    county: '', legalDescription: '', improvementsAndAccessories: '', exclusions: '', cashPortion: '',
    loanAmount: '', salesPrice: '', financingType: '', financingNotes: '', earnestMoney: '',
    titleCompany: '', optionFee: '', additionalEarnestMoney: '', titlePolicyPayer: '', surveyPlan: '',
    titleAndSurveyNotes: '', conditionAndRepairNotes: '', possessionPlan: '', specialProvisionsNotes: '',
    settlementNotes: '', notices: '',
  };
}

export const agentNotificationPreferencesSchema = z.object({
  emailEnabled: z.boolean().default(false),
  pushEnabled: z.boolean().default(false),
  reminderOffsets: z.array(z.union([z.literal(7), z.literal(3), z.literal(1), z.literal(0)])).min(1).max(4).default([7, 3, 1, 0]),
}).strict().default(defaultAgentNotificationPreferences());

export const agentContractDetailsSchema = z.object({
  county: optionalShortText(200), legalDescription: optionalShortText(2_000), improvementsAndAccessories: optionalShortText(2_000), exclusions: optionalShortText(2_000),
  cashPortion: optionalShortText(120), loanAmount: optionalShortText(120), salesPrice: optionalShortText(120), financingType: optionalShortText(280), financingNotes: optionalShortText(2_000),
  earnestMoney: optionalShortText(120), titleCompany: optionalShortText(280), optionFee: optionalShortText(120), additionalEarnestMoney: optionalShortText(120),
  titlePolicyPayer: optionalShortText(280), surveyPlan: optionalShortText(2_000), titleAndSurveyNotes: optionalShortText(2_000), conditionAndRepairNotes: optionalShortText(2_000),
  possessionPlan: optionalShortText(1_000), specialProvisionsNotes: optionalShortText(2_000), settlementNotes: optionalShortText(2_000), notices: optionalShortText(2_000),
}).strict().default(defaultAgentContractDetails());

export const agentTrecFormFieldsSchema = z.record(z.string(), z.string().max(20_000)).default({});

export const agentReminderSchema = z.object({
  id: shortText(120),
  deadlineId: shortText(120),
  label: shortText(200),
  deadlineDate: dateText.default(''),
  reminderDate: dateText,
  note: optionalShortText(1_000),
  preset: z.enum(['7d', '3d', '1d', 'due', 'custom']).default('custom'),
  complete: z.boolean().default(false),
}).strict();

export const agentTaskSchema = z.preprocess((value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const task = value as Record<string, unknown>;
  return { ...task, status: task.status ?? (task.complete === true ? 'done' : 'todo'), priority: task.priority ?? 'normal', complete: task.complete ?? task.status === 'done' };
}, z.object({
  id: shortText(120), title: shortText(280), dueDate: dateText.default(''),
  priority: z.enum(TREC_TASK_PRIORITIES).default('normal'),
  status: z.enum(TREC_TASK_STATUSES).default('todo'),
  complete: z.boolean().default(false),
}).strict());

export const agentDocumentSchema = z.preprocess((value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const document = value as Record<string, unknown>;
  return { ...document, status: document.status ?? (document.complete === true ? 'received' : 'requested'), complete: document.complete ?? document.status === 'received' };
}, z.object({
  id: shortText(120), label: shortText(200),
  status: z.enum(['requested', 'received', 'reviewed', 'not_needed']).default('requested'),
  complete: z.boolean().default(false),
  requestedAt: z.string().datetime().default(() => new Date().toISOString()),
  updatedAt: z.string().datetime().default(() => new Date().toISOString()),
  driveFileId: optionalShortText(200),
  fileName: optionalShortText(280),
  fileUploadedAt: z.union([z.literal(''), z.string().datetime()]).default(''),
}).strict());

export const agentActivitySchema = z.object({
  id: shortText(120), message: shortText(600), createdAt: z.string().datetime(),
}).strict();

export const agentDealSchema = z.object({
  id: shortText(120), title: shortText(200), propertyAddress: shortText(400), buyerNames: shortText(300), sellerNames: shortText(300),
  effectiveDate: dateText.default(''), optionPeriodDays: optionalShortText(4), additionalEarnestMoneyDays: optionalShortText(4), financingDeadlineDays: optionalShortText(4),
  appraisalDeadlineDays: optionalShortText(4), titleCommitmentDays: optionalShortText(4), surveyDays: optionalShortText(4), titleObjectionDays: optionalShortText(4),
  earnestMoneyDeliveredDate: dateText.default(''), optionFeeDeliveredDate: dateText.default(''), closingDate: dateText.default(''),
  status: z.enum(AGENT_DEAL_STATUSES).default('prep'),
  owner: optionalShortText(280),
  workflowStatus: z.enum(TREC_DEAL_WORKFLOW_STATUSES).default('intake'),
  worksheetStep: z.number().int().min(0).max(TREC_WORKFLOW_STAGES.length - 1).default(0),
  trecFormVersionId: optionalShortText(120).default('built-in-trec-20-19'),
  closeoutOutcome: optionalShortText(120), closeoutDate: dateText.default(''), closeoutNote: optionalShortText(2_000),
  auditLocked: z.boolean().default(false),
  contractDetails: agentContractDetailsSchema,
  formFields: agentTrecFormFieldsSchema,
  addenda: z.record(z.string(), z.boolean()).default({}),
  selectedFormFamilies: z.record(z.string(), z.boolean()).default({}),
  reminders: z.array(agentReminderSchema).max(100).default([]), tasks: z.array(agentTaskSchema).max(200).default([]), documents: z.array(agentDocumentSchema).max(100).default([]),
  activity: z.array(agentActivitySchema).max(300).default([]),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
}).strict();

export const agentCommandCenterWorkspaceSchema = z.object({
  deals: z.array(agentDealSchema).max(100).default([]),
  notificationPreferences: agentNotificationPreferencesSchema,
}).strict();

export type AgentReminder = z.infer<typeof agentReminderSchema>;
export type AgentTask = z.infer<typeof agentTaskSchema>;
export type AgentDocument = z.infer<typeof agentDocumentSchema>;
export type AgentActivity = z.infer<typeof agentActivitySchema>;
export type AgentDeal = z.infer<typeof agentDealSchema>;
export type AgentCommandCenterWorkspace = z.infer<typeof agentCommandCenterWorkspaceSchema>;
