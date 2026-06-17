'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAdmin } from '@/hooks/use-admin';
import { adminApi } from '@/lib/admin-api';
import type { PublicationId } from '@/lib/publications';

export default function NewGiveawayPage() {
  const router = useRouter();
  const { admin, loading: authLoading } = useAdmin();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [prize, setPrize] = useState('');
  const [publication, setPublication] = useState<PublicationId | 'both'>('both');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [drawAt, setDrawAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      // Schema (lib/server/schemas/giveaways.ts) expects camelCase keys
      // and rejects null/undefined description. Omit description when empty.
      const payload: Record<string, unknown> = {
        title,
        prize,
        publication,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
      };
      if (description) payload.description = description;
      if (drawAt) payload.drawAt = new Date(drawAt).toISOString();
      const res = await adminApi.createGiveaway(payload);
      const id = res?.giveaway?.id || res?.id;
      router.push(id ? `/admin/giveaways/${id}` : '/admin/giveaways');
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  };

  if (authLoading || !admin) {
    return <div className="max-w-3xl mx-auto px-6 py-12 text-sm text-gray-500">Loading...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="mb-6">
        <Link href="/admin/giveaways" className="text-sm text-gray-500 hover:text-[#021D40]">
          &larr; Back to giveaways
        </Link>
      </div>
      <h1 className="text-2xl font-semibold text-[#021D40] tracking-tight mb-8">Create Giveaway</h1>

      <form onSubmit={handleSubmit} className="bg-white border border-gray-200 p-6 space-y-5 rounded-md">
        <Field label="Title" required>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Q3 Gas Card Giveaway"
            className="w-full border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#021D40] rounded-md"
          />
        </Field>

        <Field label="Description" hint="Optional internal note">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#021D40] rounded-md"
          />
        </Field>

        <Field label="Prize" required>
          <input
            type="text"
            required
            value={prize}
            onChange={(e) => setPrize(e.target.value)}
            placeholder="e.g. $200 H-E-B Gas Card"
            className="w-full border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#021D40] rounded-md"
          />
        </Field>

        <Field label="Publication" required>
          <select
            value={publication}
            onChange={(e) => setPublication(e.target.value as PublicationId | 'both')}
            className="w-full border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#021D40] bg-white rounded-md"
          >
            <option value="both">Both Publications</option>
            <option value="austin">RealtyLine Austin</option>
            <option value="san_antonio">Newsline San Antonio</option>
          </select>
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Starts At" required>
            <input
              type="datetime-local"
              required
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="w-full border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#021D40] rounded-md"
            />
          </Field>
          <Field label="Ends At" required>
            <input
              type="datetime-local"
              required
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="w-full border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#021D40] rounded-md"
            />
          </Field>
          <Field label="Draw At" hint="Optional">
            <input
              type="datetime-local"
              value={drawAt}
              onChange={(e) => setDrawAt(e.target.value)}
              className="w-full border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#021D40] rounded-md"
            />
          </Field>
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-100 px-3 py-2">{error}</div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="bg-[#021D40] text-white px-5 py-2.5 text-sm font-medium hover:bg-[#03285a] disabled:opacity-60 transition-colors"
          >
            {submitting ? 'Creating...' : 'Create Giveaway'}
          </button>
          <Link href="/admin/giveaways" className="text-sm text-gray-500 hover:text-[#021D40]">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
        {hint && <span className="ml-2 normal-case tracking-normal text-gray-400">{hint}</span>}
      </label>
      {children}
    </div>
  );
}
