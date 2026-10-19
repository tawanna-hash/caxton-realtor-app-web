import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/server/auth/user';
import { withErrorHandling } from '@/lib/server/error';
import { rateLimit } from '@/lib/server/rate-limit';
import {
  addContract,
  ContractLimitError,
  listContracts,
  removeContract,
  setContractAlerts,
} from '@/lib/server/contract-dates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const priv = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store, max-age=0' } });

const text = (max: number) => z.string().trim().max(max).default('');
const days = z.string().trim().regex(/^\d{0,3}$/, 'Days must be a whole number').default('');
const date = z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-11-05')]).default('');

const contractSchema = z.object({
  propertyAddress: z.string().trim().min(3, 'Enter the property address').max(400),
  buyerNames: text(300),
  sellerNames: text(300),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter the effective date'),
  optionPeriodDays: days,
  additionalEarnestMoneyDays: days,
  financingDeadlineDays: days,
  appraisalDeadlineDays: days,
  titleCommitmentDays: days,
  surveyDays: days,
  titleObjectionDays: days,
  closingDate: date,
  salesPrice: z.string().trim().max(20).regex(/^[\d.]*$/, 'Use numbers only').default(''),
  earnestMoney: z.string().trim().max(20).regex(/^[\d.]*$/, 'Use numbers only').default(''),
}).strict();

const alertsSchema = z.object({
  emailEnabled: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
  reminderOffsets: z.array(z.union([z.literal(7), z.literal(3), z.literal(1), z.literal(0)])).min(1).max(4).optional(),
}).strict();

export const GET = withErrorHandling(async (): Promise<Response> => {
  const user = await requireUser();
  return priv(await listContracts(user.realtorId));
});

export const POST = withErrorHandling(async (req: Request): Promise<Response> => {
  const user = await requireUser();
  await rateLimit('general', 'contract-dates-save');
  const parsed = contractSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return priv({ error: parsed.error.issues[0]?.message ?? 'Check the contract details.' }, 400);
  try {
    return priv({ contract: await addContract(user.realtorId, parsed.data) }, 201);
  } catch (error) {
    if (error instanceof ContractLimitError) return priv({ error: error.message }, 409);
    throw error;
  }
});

export const PATCH = withErrorHandling(async (req: Request): Promise<Response> => {
  const user = await requireUser();
  const parsed = alertsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return priv({ error: 'Check the alert settings.' }, 400);
  return priv({ alerts: await setContractAlerts(user.realtorId, parsed.data) });
});

export const DELETE = withErrorHandling(async (req: Request): Promise<Response> => {
  const user = await requireUser();
  const id = new URL(req.url).searchParams.get('id') ?? '';
  const removed = await removeContract(user.realtorId, id);
  return removed ? priv({ ok: true }) : priv({ error: 'Contract not found.' }, 404);
});
