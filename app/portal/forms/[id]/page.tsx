// app/portal/forms/[id]/page.tsx
//
// Single form assignment — render field-by-field based on schema.
// Submission posts to /api/portal/form-assignments/[id]/submit.

import { redirect, notFound } from 'next/navigation';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentPortalUser } from '@/lib/server/portal-session';
import type { PortalFormSchema } from '@/lib/portal';
import PortalFormClient from './PortalFormClient';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface PageProps { params: Promise<{ id: string }> }

export default async function PortalFormPage({ params }: PageProps) {
  const user = await getCurrentPortalUser();
  if (!user) redirect('/portal/error?code=auth');
  const { id } = await params;

  await ensureSchema();
  const sql = getSql();

  const rows = (await sql`
    SELECT
      a.id, a.form_id, a.status, a.answers, a.submitted_at,
      f.title AS form_title, f.description AS form_description, f.schema
    FROM portal_form_assignments a
    JOIN portal_forms f ON f.id = a.form_id
    WHERE a.id = ${id}
      AND a.advertiser_id = ${user.advertiser_id}
  `) as unknown as {
    id: string;
    form_id: string;
    status: string;
    answers: Record<string, unknown>;
    submitted_at: string | null;
    form_title: string;
    form_description: string | null;
    schema: PortalFormSchema;
  }[];
  if (rows.length === 0) notFound();
  const assignment = rows[0];

  return (
    <div className="space-y-6">
      <header>
        <div className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">Form</div>
        <h1 className="font-serif text-3xl text-gray-900" style={{ fontFamily: 'Georgia, serif' }}>
          {assignment.form_title}
        </h1>
        {assignment.form_description && (
          <p className="text-gray-600 mt-1">{assignment.form_description}</p>
        )}
      </header>

      <PortalFormClient
        assignmentId={assignment.id}
        schema={assignment.schema}
        initialAnswers={(assignment.answers ?? {}) as Record<string, string>}
        submitted={!!assignment.submitted_at}
      />
    </div>
  );
}
