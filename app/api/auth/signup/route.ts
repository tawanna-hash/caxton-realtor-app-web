/**
 * /api/auth/signup  POST
 *
 * Creates the realtor record (or finds existing) and sends a magic link.
 * Always returns the same response shape regardless of whether the email
 * is new, existing-but-unverified, or already-verified — this prevents
 * email enumeration attacks.
 */

import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { withErrorHandling } from '@/lib/server/error';
import { rateLimit } from '@/lib/server/rate-limit';
import { signupSchema } from '@/lib/server/schemas/auth';
import { createAndSendMagicLink } from '@/lib/server/magic-link';
import {
  findRealtorByEmailTx,
  insertRealtor,
  withNeonTransaction,
  type SignupRow,
} from '@/lib/server/realtors-store';
import { getRequestIp } from '@/lib/server/auth/admin';

export const runtime = 'nodejs';

const MAGIC_LINK_EXPIRY_MINUTES = Number(process.env.MAGIC_LINK_EXPIRY_MINUTES ?? 15);

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const POST = withErrorHandling(async (req: Request) => {
  await rateLimit('auth');

  const input = signupSchema.parse(await req.json());
  const ipAddress = await getRequestIp();
  const userAgent = (await headers()).get('user-agent') ?? undefined;

  // Normalize license type ("TREC #" / "NMLS #" -> "TREC" / "NMLS") and
  // route the number to the matching column.
  const normalizedLicenseType: 'TREC' | 'NMLS' | null = !input.licenseNumber
    ? null
    : input.licenseType?.startsWith('NMLS')
      ? 'NMLS'
      : input.licenseType?.startsWith('TREC')
        ? 'TREC'
        : null;
  const trecNumber = normalizedLicenseType === 'TREC' ? (input.licenseNumber ?? null) : null;
  const nmlsNumber = normalizedLicenseType === 'NMLS' ? (input.licenseNumber ?? null) : null;

  // Birthday: month name -> 1..12, day -> 1..31. If only one is set, drop
  // both so the CHECK constraint on (month, day) is satisfied.
  const monthIdx = input.birthdayMonth ? MONTH_NAMES.indexOf(input.birthdayMonth) : -1;
  const birthdayMonth = monthIdx >= 0 ? monthIdx + 1 : null;
  const birthdayDayRaw = input.birthdayDay ? parseInt(input.birthdayDay, 10) : NaN;
  const birthdayDay =
    Number.isFinite(birthdayDayRaw) && birthdayDayRaw >= 1 && birthdayDayRaw <= 31
      ? birthdayDayRaw
      : null;
  const safeBirthdayMonth = birthdayMonth !== null && birthdayDay !== null ? birthdayMonth : null;
  const safeBirthdayDay = birthdayMonth !== null && birthdayDay !== null ? birthdayDay : null;

  // Hash outside the transaction so we don't hold a DB connection during
  // bcrypt CPU work. Password is optional during the rollout.
  const passwordHash = input.password ? await bcrypt.hash(input.password, 12) : null;

  await withNeonTransaction(async (client) => {
    const existing = await findRealtorByEmailTx(client, input.email);

    if (existing) {
      // Already verified -> treat as login. Otherwise resend verification.
      const purpose: 'login' | 'signup_verification' = existing.email_verified_at
        ? 'login'
        : 'signup_verification';
      await createAndSendMagicLink({
        email: input.email,
        firstName: input.firstName,
        purpose,
        ipAddress: ipAddress ?? undefined,
        userAgent,
      });
      return;
    }

    const row: SignupRow = {
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      market: input.market,
      consentText: input.consentText,
      ipAddress,
      normalizedLicenseType,
      trecNumber,
      nmlsNumber,
      title: input.title ?? null,
      mobile: input.mobile ?? null,
      mailingAddress: input.mailingAddress ?? null,
      mailingAddress2: input.mailingAddress2 ?? null,
      city: input.city ?? null,
      state: input.state ?? null,
      zip: input.zip ?? null,
      birthdayMonth: safeBirthdayMonth,
      birthdayDay: safeBirthdayDay,
      subscriptions: input.subscriptions ?? [],
      fbHandle: input.fbHandle ?? null,
      igHandle: input.igHandle ?? null,
      liHandle: input.liHandle ?? null,
      passwordHash,
    };
    await insertRealtor(client, row);

    await createAndSendMagicLink({
      email: input.email,
      firstName: input.firstName,
      purpose: 'signup_verification',
      ipAddress: ipAddress ?? undefined,
      userAgent,
    });
  });

  return NextResponse.json({
    success: true,
    message: `Check your email for a verification link. It expires in ${MAGIC_LINK_EXPIRY_MINUTES} minutes.`,
  });
});
