'use client';

import Link from 'next/link';
import { useAdmin } from '@/hooks/use-admin';
import { EventForm, EMPTY_EVENT } from '../_components/EventForm';

export default function NewEventPage() {
  const { admin, loading } = useAdmin();

  if (loading || !admin) {
    return <div className="max-w-6xl mx-auto px-6 py-12 text-sm text-gray-500">Loading...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="mb-6">
        <Link href="/admin/events" className="text-xs text-gray-500 hover:text-gray-900">
          ← Events
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900 mt-2">New Event</h1>
        <p className="text-sm text-gray-500 mt-1">
          Create a manual event. It will appear in the public calendar with a Manual source tag.
        </p>
      </div>
      <EventForm initial={EMPTY_EVENT} mode="create" />
    </div>
  );
}
