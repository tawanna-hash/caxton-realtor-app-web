// caxton-mailing-v1
// POST /api/admin/mailing/sabor-realtors/sync-now
// Triggers the GitHub Actions "SABOR Realtor Sync" workflow_dispatch.
//
// Required env:
//   GH_DISPATCH_TOKEN  \u2014 fine-grained PAT with Actions:write on the repo
//   GH_DISPATCH_REPO   \u2014 owner/repo  (e.g. realtynewsnow/caxton-realtor-app-web)
//   GH_DISPATCH_REF    \u2014 branch ref  (default: api-merge)

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withErrorHandling } from '@/lib/server/error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface DispatchBody {
  max_records?: number | string;
  max_pages?: number | string;
}

export const POST = withErrorHandling(async (req: Request) => {
  await requireAdmin();

  const token = process.env.GH_DISPATCH_TOKEN;
  const repo = process.env.GH_DISPATCH_REPO;
  const ref = process.env.GH_DISPATCH_REF || 'api-merge';

  if (!token || !repo) {
    return NextResponse.json(
      {
        ok: false,
        code: 'not_configured',
        message:
          'GH_DISPATCH_TOKEN / GH_DISPATCH_REPO env vars must be set to trigger the SABOR sync workflow.',
      },
      { status: 503 },
    );
  }

  let body: DispatchBody = {};
  try {
    body = (await req.json()) as DispatchBody;
  } catch {
    // empty body is fine \u2014 use defaults
  }

  const inputs: Record<string, string> = {};
  if (body.max_records !== undefined && body.max_records !== '') {
    inputs.max_records = String(body.max_records);
  }
  if (body.max_pages !== undefined && body.max_pages !== '') {
    inputs.max_pages = String(body.max_pages);
  }

  const url = `https://api.github.com/repos/${repo}/actions/workflows/sabor-sync.yml/dispatches`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ref, inputs }),
  });

  if (res.status === 204) {
    return NextResponse.json({
      ok: true,
      message:
        'SABOR sync workflow dispatched. Refresh the page in 1\u20132 minutes to see progress.',
    });
  }

  const text = await res.text();
  return NextResponse.json(
    {
      ok: false,
      code: 'dispatch_failed',
      status: res.status,
      message: text.slice(0, 300),
    },
    { status: res.status >= 500 ? 502 : res.status },
  );
});
