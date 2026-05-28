/**
 * Resolve the cookie `domain` attribute based on a request host. Same logic
 * as the original Express helper but takes a plain host string so it can be
 * called from Next.js route handlers via `headers().get('host')`.
 */

export function resolveCookieDomain(rawHost: string | null | undefined): string | undefined {
  const host = (rawHost ?? '').split(':')[0]?.toLowerCase() ?? '';

  if (host === 'myrealtyline.com' || host.endsWith('.myrealtyline.com')) {
    return '.myrealtyline.com';
  }
  if (host.endsWith('.realtynewsnow.app')) {
    return '.realtynewsnow.app';
  }
  if (host === 'realtynewsnow.app') {
    return 'realtynewsnow.app';
  }
  return undefined;
}
