import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/server/auth/user';
import { withErrorHandling } from '@/lib/server/error';
import { lookupProperty } from '@/lib/server/property-lookup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({ address: z.string().trim().min(6).max(200) }).strict();

export const POST = withErrorHandling(async (req: Request): Promise<Response> => {
  await requireUser();
  const { address } = bodySchema.parse(await req.json());
  const result = await lookupProperty(address);
  return NextResponse.json({ result }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
});
