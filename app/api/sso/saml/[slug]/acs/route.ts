import { NextResponse } from 'next/server';
import { signIn, INTERNAL_TRUSTED_PROVIDER_ID } from '@/lib/server/auth/authjs';
import { signInternalTrustToken } from '@/lib/server/auth/internal-trust-token';
import { getBrokerageBySlug, resolveSsoRealtor, samlFor } from '@/lib/server/closing-time-brokerage';
import { logger } from '@/lib/server/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const origin = () => process.env.NEXT_PUBLIC_SITE_URL ?? 'https://realtynewsnow.app';
const fail = (reason: string) => NextResponse.redirect(`${origin()}/login?sso_error=${encodeURIComponent(reason)}`, 303);

/** Assertion consumer service: verifies the signed SAML response, then signs the matching agent in. */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const b = await getBrokerageBySlug(slug);
  if (!b || !b.ssoEnabled) return fail('SSO is not enabled');
  const form = await req.formData();
  const samlResponse = form.get('SAMLResponse');
  if (typeof samlResponse !== 'string') return fail('Missing SSO response');
  try {
    const { profile } = await samlFor(b).validatePostResponseAsync({ SAMLResponse: samlResponse });
    const attrs = (profile ?? {}) as Record<string, unknown>;
    const candidate = [attrs.email, attrs.mail, attrs['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'], attrs.nameID]
      .find((v) => typeof v === 'string' && v.includes('@')) as string | undefined;
    if (!candidate) return fail('Your identity provider did not send an email address');
    const realtor = await resolveSsoRealtor(b, candidate);
    if (!realtor) return fail('No RealtyLine account matches that email for this brokerage');
    await signIn(INTERNAL_TRUSTED_PROVIDER_ID, { realtorId: realtor.id, token: signInternalTrustToken({ realtorId: realtor.id, email: realtor.email }), redirect: false });
    return NextResponse.redirect(`${origin()}/agents/closing-time`, 303);
  } catch (err) {
    logger.warn({ err, slug }, 'SAML assertion rejected');
    return fail('Single sign-on could not be verified');
  }
}
