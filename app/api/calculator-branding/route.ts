import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser, requireUser } from '@/lib/server/auth/user';
import { withErrorHandling } from '@/lib/server/error';
import {
  getCalculatorBranding,
  updateCalculatorBranding,
} from '@/lib/server/calculator-branding-store';
import { FOOTER_TEMPLATE_IDS } from '@/lib/footer-templates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const nullableText = (max: number) => z.string().trim().max(max).nullable();
const nullableUrl = z.union([z.literal(''), z.url().max(2_000)]).nullable();
const requiredText = (label: string, max: number) =>
  z.string().trim().min(1, `${label} is required.`).max(max);

const calculatorBrandingSchema = z.object({
  display_name: requiredText('Display name', 160),
  professional_title: nullableText(160),
  brokerage_name: requiredText('Broker licensed or registered assumed business name', 200),
  email: z.union([z.literal(''), z.email().max(320)]).nullable(),
  phone: nullableText(60),
  website: nullableUrl,
  logo_url: nullableUrl,
  photo_url: nullableUrl,
  address: nullableText(240),
  address_2: nullableText(240),
  city: nullableText(120),
  state: nullableText(80),
  zip: nullableText(20),
  license_number: nullableText(80),
  tagline: nullableText(240),
  footer_template: z.enum(FOOTER_TEMPLATE_IDS),
});

function normalize(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed || null;
}

export const GET = withErrorHandling(async () => {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ branding: null });
  const branding = await getCalculatorBranding(user.realtorId);
  return NextResponse.json({ branding });
});

export const PUT = withErrorHandling(async (req: Request) => {
  const user = await requireUser();
  const input = calculatorBrandingSchema.parse(await req.json());
  const branding = await updateCalculatorBranding(user.realtorId, {
    ...input,
    display_name: normalize(input.display_name),
    professional_title: normalize(input.professional_title),
    brokerage_name: normalize(input.brokerage_name),
    email: normalize(input.email),
    phone: normalize(input.phone),
    website: normalize(input.website),
    logo_url: normalize(input.logo_url),
    photo_url: normalize(input.photo_url),
    address: normalize(input.address),
    address_2: normalize(input.address_2),
    city: normalize(input.city),
    state: normalize(input.state),
    zip: normalize(input.zip),
    license_number: normalize(input.license_number),
    tagline: normalize(input.tagline),
  });
  return NextResponse.json({ branding });
});
