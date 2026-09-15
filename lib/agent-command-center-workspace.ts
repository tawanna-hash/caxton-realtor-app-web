import { z } from 'zod';

export const AGENT_DEAL_STATUSES = ['prep', 'active', 'closing', 'completed'] as const;
export type AgentDealStatus = typeof AGENT_DEAL_STATUSES[number];

const shortText = (max: number) => z.string().trim().max(max);
const dateText = z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]);

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
  reminders: z.array(agentReminderSchema).max(100),
  tasks: z.array(agentTaskSchema).max(200),
  documents: z.array(agentDocumentSchema).max(50),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();

export const agentCommandCenterWorkspaceSchema = z.object({
  deals: z.array(agentDealSchema).max(100),
}).strict();

export type AgentReminder = z.infer<typeof agentReminderSchema>;
export type AgentTask = z.infer<typeof agentTaskSchema>;
export type AgentDocument = z.infer<typeof agentDocumentSchema>;
export type AgentDeal = z.infer<typeof agentDealSchema>;
export type AgentCommandCenterWorkspace = z.infer<typeof agentCommandCenterWorkspaceSchema>;
