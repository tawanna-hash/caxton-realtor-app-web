// app/admin/api-docs/page.tsx
//
// Admin-only Swagger UI page. Hosts the spec at /api/openapi.json and
// renders an interactive explorer for it. We load Swagger UI from the
// official CDN (swagger-ui-dist) so we don't add another build dep —
// the spec itself is fully owned by us and generated from our schemas.

import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import ApiDocsClient from './ApiDocsClient';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata = {
  title: 'API Docs · Admin',
  robots: { index: false, follow: false },
};

export default async function AdminApiDocsPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/admin/login?next=/admin/api-docs');

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">API Documentation</h1>
            <p className="text-sm text-slate-500">
              Live OpenAPI 3.1 spec generated from server-side zod schemas.
            </p>
          </div>
          <a
            href="/api/openapi.json"
            className="text-sm font-medium text-brand-700 hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            View raw spec →
          </a>
        </div>
      </header>
      <ApiDocsClient specUrl="/api/openapi.json" />
    </div>
  );
}
