// Enforced Content-Security-Policy for the Closing Time domain (itsalmostclosingtime.com).
// Built per request in proxy.ts so every inline script carries a one-time nonce instead of 'unsafe-inline'.
// Trusted Types are required for script sinks; the 'default' policy is created in app/layout.tsx and only
// allows script URLs from this origin and the vendors listed here.

export function closingTimeCsp(nonce: string, frameAncestors: "'none'" | "'self'" = "'none'"): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', 'https:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': [
      "'self'",
      'https://api.stripe.com',
      'https://us.i.posthog.com',
      'https://us-assets.i.posthog.com',
      'https://*.posthog.com',
      'https://vitals.vercel-insights.com',
      'https://*.blob.vercel-storage.com',
      'https://va.vercel-scripts.com',
    ],
    'frame-src': ["'self'", 'https://js.stripe.com', 'https://hooks.stripe.com', 'https://*.stripe.com', 'blob:'],
    'worker-src': ["'self'", 'blob:'],
    'media-src': ["'self'", 'https:', 'blob:'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': [frameAncestors],
    'require-trusted-types-for': ["'script'"],
    'trusted-types': ['default', 'nextjs#bundler', "'allow-duplicates'"],
    'upgrade-insecure-requests': [],
  };
  return Object.entries(directives)
    .map(([k, v]) => (v.length ? `${k} ${v.join(' ')}` : k))
    .join('; ');
}

export function newNonce(): string {
  return btoa(crypto.randomUUID());
}
