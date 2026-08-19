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
import { ensureSchema } from '@/lib/db';
import {
  autoEnrollSignupGiveaways,
  findRealtorByEmailTx,
  insertRealtor,
  withNeonTransaction,
  type SignupRow,
} from '@/lib/server/realtors-store';
import { getRequestIp } from '@/lib/server/auth/admin';
import { encode } from 'next-auth/jwt';
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookie-names';
import { logger } from '@/lib/server/logger';

// Must match lib/server/auth/authjs.ts's session.maxAge exactly.
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

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
  await ensureSchema();

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

  // Auto-verify path: when the user sets a strong password at signup we treat
  // password possession as proof-of-intent and skip the magic-link round trip.
  // This is the critical fix for iOS Capacitor users — the magic link opens
  // in Safari (separate cookie jar from the in-app WKWebView) so they could
  // never complete signup. With a password set, we issue the session cookie
  // directly in the response that the in-app fetch() already trusts.
  const autoSignIn = !!passwordHash;

  // Captured inside the transaction, used outside it for cookie + email.
  let newRealtorId: string | null = null;
  let newRealtorEmail: string | null = null;
  let existedAlready = false;
  let alreadyVerified = false;

  // -- DB phase (transactional) ---------------------------------------------
  // Only DB writes go inside the transaction. Email sends (Resend) are
  // deliberately deferred until after commit - a transient Resend outage
  // must not roll back a successfully created account and leave the user
  // stuck on a 500.
  await withNeonTransaction(async (client) => {
    const existing = await findRealtorByEmailTx(client, input.email);

    if (existing) {
      existedAlready = true;
      alreadyVerified = !!existing.email_verified_at;
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
    const inserted = await insertRealtor(client, row, { autoVerifyEmail: autoSignIn });
    newRealtorId = inserted.id;
    newRealtorEmail = input.email;

    // Auto-enroll password signups (auto-verified) in active signup
    // giveaways. Non-password signups are enrolled later when they verify
    // their magic link (see /api/auth/verify). Re-enabled 2026-07-24.
    if (autoSignIn) {
      const enrolled = await autoEnrollSignupGiveaways(client, inserted.id);
      if (enrolled > 0) {
        logger.info({ realtorId: inserted.id, enrolled }, 'Giveaway auto-enroll on signup');
      }
    }
  });

  // -- Auto-sign-in path -----------------------------------------------------
  // Brand-new account WITH password -> issue a session cookie right now so
  // the in-app WebView is signed in on the next request. We do NOT send a
  // magic link here; the client routes straight to the feed.
  //
  // Uses encode() + response.cookies.set() directly (same pattern as
  // password-login). signIn('credentials', { redirect: false }) from a
  // custom Route Handler does NOT reliably write the Set-Cookie header
  // on the JSON response — empirically verified. See password-login for
  // the full write-up (BUG-H in the sign-in audit).
  if (autoSignIn && newRealtorId && newRealtorEmail && input.password) {
    try {
      const token = await encode({
        secret: process.env.JWT_SECRET!,
        salt: SESSION_COOKIE_NAME,
        maxAge: SESSION_MAX_AGE_SECONDS,
        token: {
          sub: newRealtorId,
          email: newRealtorEmail,
          realtorId: newRealtorId,
        },
      });
      logger.info({ realtorId: newRealtorId }, 'Signup auto-sign-in succeeded (encode())');
      const sessionExpires = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
      const response = NextResponse.json({
        success: true,
        autoSignedIn: true,
        message: 'Account created. You are signed in.',
      });
      response.cookies.set(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: SESSION_MAX_AGE_SECONDS,
        expires: sessionExpires,
      });
      return response;
    } catch (err) {
      logger.error({ err, realtorId: newRealtorId }, 'Signup succeeded but auto-sign-in failed');
      return NextResponse.json({
        success: true,
        autoSignedIn: false,
        message: 'Account created. Please sign in.',
      });
    }
  }

  // -- Magic-link path (post-commit, best-effort) ---------------------------
  // Determine which email to send: existing+verified -> login link;
  // existing+unverified or brand-new -> signup_verification link.
  const purpose: 'login' | 'signup_verification' =
    existedAlready && alreadyVerified ? 'login' : 'signup_verification';

  try {
    await createAndSendMagicLink({
      email: input.email,
      firstName: input.firstName,
      purpose,
      ipAddress: ipAddress ?? undefined,
      userAgent,
    });
  } catch (err) {
    // The account already exists at this point (either we just created it,
    // or it was already there). Do not fail the request just because email
    // delivery hiccuped - log and return the same shape we always do.
    logger.error(
      { err, email: input.email, purpose, realtorId: newRealtorId },
      'Signup completed but magic-link send failed; account is intact',
    );
  }

  return NextResponse.json({
    success: true,
    autoSignedIn: false,
    message: `Check your email for a verification link. It expires in ${MAGIC_LINK_EXPIRY_MINUTES} minutes.`,
  });
});
