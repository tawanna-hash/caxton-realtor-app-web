// app/portal/forms/[id]/PortalFormClient.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PortalFormSchema } from '@/lib/portal';

export default function PortalFormClient({
  assignmentId,
  schema,
  initialAnswers,
  submitted,
}: {
  assignmentId: string;
  schema: PortalFormSchema;
  initialAnswers: Record<string, string>;
  submitted: boolean;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(submitted);

  function setField(key: string, value: string) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Client-side required validation
    for (const field of schema.fields) {
      if (field.required && !(answers[field.key] ?? '').trim()) {
        setError(`Please complete: ${field.label}`);
        return;
      }
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/portal/form-assignments/${assignmentId}/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ answers }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error ?? 'Submit failed');
        return;
      }
      setDone(true);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-6">
        <div className="font-serif text-xl text-emerald-900">
          Thank you — your response is recorded.
        </div>
        <p className="text-emerald-800 text-sm mt-1">You can close this tab.</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5 rounded-md border border-gray-200 bg-white p-6">
      {schema.fields.map((field) => (
        <label key={field.key} className="block">
          <div className="text-sm font-medium text-gray-700 mb-1">
            {field.label}
            {field.required && <span className="text-red-600"> *</span>}
          </div>
          {field.type === 'textarea' ? (
            <textarea
              value={answers[field.key] ?? ''}
              onChange={(e) => setField(field.key, e.target.value)}
              rows={4}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          ) : field.type === 'select' ? (
            <select
              value={answers[field.key] ?? ''}
              onChange={(e) => setField(field.key, e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">(choose one)</option>
              {(field.options ?? []).map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          ) : (
            <input
              type={field.type === 'tel' ? 'tel' : field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : 'text'}
              value={answers[field.key] ?? ''}
              onChange={(e) => setField(field.key, e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          )}
        </label>
      ))}

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 text-red-800 px-3 py-2 text-sm">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-gray-900 text-white px-5 py-2 text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
        >
          {submitting ? 'Submitting…' : 'Submit'}
        </button>
      </div>
    </form>
  );
}
