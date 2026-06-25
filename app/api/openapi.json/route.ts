// app/api/openapi.json/route.ts
//
// Serves the OpenAPI 3.1 spec for the public + admin API. Generated from
// the same zod schemas the route handlers validate against, so the docs
// can never drift from the code. Cached for 5 minutes.

import { NextResponse } from 'next/server';
import { buildOpenApiSpec } from '@/lib/server/openapi';

export const runtime = 'nodejs';
export const dynamic = 'force-static';
export const revalidate = 300; // 5 min

export async function GET() {
  const spec = buildOpenApiSpec();
  return NextResponse.json(spec, {
    headers: {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      'Access-Control-Allow-Origin': '*', // public docs
    },
  });
}
