import { NextResponse } from 'next/server';
import { getBrokerageBySlug, samlFor } from '@/lib/server/closing-time-brokerage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Starts brokerage single sign-on: redirects the browser to the brokerage's identity provider. */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const b = await getBrokerageBySlug(slug);
  if (!b || !b.ssoEnabled || !b.ssoEntryPoint || !b.ssoCert) return NextResponse.json({ error: 'Single sign-on is not set up for this brokerage.' }, { status: 404 });
  const url = await samlFor(b).getAuthorizeUrlAsync('', undefined, {});
  return NextResponse.redirect(url);
}
