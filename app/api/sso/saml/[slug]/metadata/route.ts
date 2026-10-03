import { getBrokerageBySlug, samlFor, spAcsUrl, spEntityId } from '@/lib/server/closing-time-brokerage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Service provider metadata the brokerage's IT team imports into its identity provider. */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const b = await getBrokerageBySlug(slug);
  if (!b) return new Response('Not found', { status: 404 });
  let xml: string;
  try { xml = samlFor({ ...b, ssoCert: b.ssoCert || 'placeholder' }).generateServiceProviderMetadata(null, null); }
  catch {
    xml = `<?xml version="1.0"?><EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${spEntityId(slug)}"><SPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol"><NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</NameIDFormat><AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${spAcsUrl(slug)}" index="1"/></SPSSODescriptor></EntityDescriptor>`;
  }
  return new Response(xml, { headers: { 'Content-Type': 'application/xml' } });
}
