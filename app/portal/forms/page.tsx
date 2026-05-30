// app/portal/forms/page.tsx
//
// Lists form assignments for the current advertiser.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentPortalUser } from '@/lib/server/portal-session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface AssignmentRow {
  id: string;
  form_id: string;
  status: string;
  assigned_at: string;
  submitted_at: string | null;
  due_at: string | null;
  form_title: string;
  form_description: string | null;
  form_slug: string;
}

export default async function PortalFormsPage() {
  const user = await getCurrentPortalUser();
  if (!user) redirect('/portal/error?code=auth');

  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT
      a.id, a.form_id, a.status, a.assigned_at, a.submitted_at, a.due_at,
      f.title AS form_title, f.description AS form_description, f.slug AS form_slug
    FROM portal_form_assignments a
    JOIN portal_forms f ON f.id = a.form_id
    WHERE a.advertiser_id = ${user.advertiser_id}
    ORDER BY a.submitted_at NULLS FIRST, a.assigned_at DESC
  `) as unknown as AssignmentRow[];

  const pending = rows.filter(r => !r.submitted_at);
  const done = rows.filter(r => r.submitted_at);

  return (
    <div className="space-y-8">
      <header>
        <div className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">Portal</div>
        <h1 className="font-serif text-3xl text-gray-900" style={{ fontFamily: 'Georgia, serif' }}>Forms</h1>
        <p className="text-gray-600 mt-1">Short forms your account manager has asked you to complete.</p>
      </header>

      <section>
        <h2 className="font-serif text-xl text-gray-900 mb-3" style={{ fontFamily: 'Georgia, serif' }}>
          To complete ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-gray-500">
            Nothing pending — you&apos;re all caught up.
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map((a) => (
              <Link
                key={a.id}
                href={`/portal/forms/${a.id}`}
                className="block rounded-xl border border-gray-200 bg-white p-4 hover:border-gray-400"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-medium text-gray-900">{a.form_title}</div>
                    {a.form_description && <div className="text-sm text-gray-600 mt-1">{a.form_description}</div>}
                  </div>
                  <div className="text-right text-xs text-gray-500">
                    Assigned {new Date(a.assigned_at).toLocaleDateString()}
                    {a.due_at && <div className="text-amber-700 mt-1">Due {new Date(a.due_at).toLocaleDateString()}</div>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {done.length > 0 && (
        <section>
          <h2 className="font-serif text-xl text-gray-900 mb-3" style={{ fontFamily: 'Georgia, serif' }}>
            Submitted ({done.length})
          </h2>
          <div className="space-y-3">
            {done.map((a) => (
              <div key={a.id} className="rounded-xl border border-gray-200 bg-white p-4 opacity-80">
                <div className="flex items-start justify-between gap-4">
                  <div className="font-medium text-gray-900">{a.form_title}</div>
                  <div className="text-xs text-gray-500">
                    Submitted {a.submitted_at ? new Date(a.submitted_at).toLocaleDateString() : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
