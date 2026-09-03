'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAdmin } from '@/hooks/use-admin';
import { adminApi } from '@/lib/admin-api';
import { EventForm, isoToLocalInput, type EventFormData } from '../_components/EventForm';
import type { PublicationId } from '@/lib/publications';

import PageTitle from '@/components/ui/PageTitle';
type AdminEvent = {
  id: number;
  externalSource: string;
  externalId: string;
  publication: PublicationId;
  title: string;
  description: string;
  link: string;
  startDate: string | null;
  endDate: string | null;
  location: string | null;
  organizer: string | null;
  organizerEmail: string | null;
  website: string | null;
  tags: string | null;
  format: string | null;
  courseNumber: string | null;
  memberPrice: string | null;
  nonmemberPrice: string | null;
  imageUrl: string | null;
  imageThumb: string | null;
  instructor: string | null;
  instructorBio: string | null;
  lat: number | null;
  lng: number | null;
  hidden: boolean;
  editedFields: string[];
  editedBy: string | null;
  editedAt: string | null;
};

function eventToForm(ev: AdminEvent): EventFormData {
  return {
    id: ev.id,
    publication: ev.publication,
    title: ev.title,
    description: ev.description ?? '',
    link: ev.link ?? '',
    startDate: isoToLocalInput(ev.startDate),
    endDate: isoToLocalInput(ev.endDate),
    location: ev.location ?? '',
    organizer: ev.organizer ?? '',
    organizerEmail: ev.organizerEmail ?? '',
    website: ev.website ?? '',
    tags: ev.tags ?? '',
    format: ev.format ?? '',
    courseNumber: ev.courseNumber ?? '',
    memberPrice: ev.memberPrice ?? '',
    nonmemberPrice: ev.nonmemberPrice ?? '',
    imageUrl: ev.imageUrl ?? '',
    imageThumb: ev.imageThumb ?? '',
    instructorName: ev.instructor ?? '',
    instructorBio: ev.instructorBio ?? '',
    lat: ev.lat !== null ? String(ev.lat) : '',
    lng: ev.lng !== null ? String(ev.lng) : '',
  };
}

export default function EditEventPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const { admin, loading: authLoading } = useAdmin();

  const [event, setEvent] = useState<AdminEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    if (!admin || !Number.isFinite(id)) return;
    adminApi
      .listEvents()
      .then((data) => {
        const items: AdminEvent[] = data?.events || [];
        const found = items.find((e) => e.id === id) || null;
        setEvent(found);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [admin, id]);

  if (authLoading || !admin || loading) {
    return <div className="max-w-6xl mx-auto px-6 py-12 text-sm text-gray-500">Loading...</div>;
  }

  if (!event) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-12">
        <Link href="/admin/events" className="text-xs text-gray-500 hover:text-gray-900">
          ← Events
        </Link>
        <div className="text-sm text-gray-500 mt-6">
          Event not found.{error ? ` (${error})` : ''}
        </div>
      </div>
    );
  }

  const isManual = event.externalSource === 'manual';
  const isPendingSubmission = event.externalSource === 'submission' && event.hidden;

  const approveAndPublish = async () => {
    setApproving(true);
    setError(null);
    try {
      await adminApi.approvePendingEvent(event.id);
      setEvent((current) => current ? { ...current, hidden: false } : current);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval failed');
    } finally {
      setApproving(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="mb-6">
        <Link href="/admin/events" className="text-xs text-gray-500 hover:text-gray-900">
          ← Events
        </Link>
        <div className="flex items-baseline gap-3 mt-2">
          <PageTitle size="md">Edit Event</PageTitle>
          <span className="text-xs text-gray-500">
            {isManual ? 'Manual event' : `Scraped from ${event.externalSource}`}
          </span>
        </div>
        {!isManual && (
          <p className="text-xs text-amber-700 mt-2 bg-amber-50 border border-amber-200 px-3 py-2 rounded-md">
            ⚠️ This event was scraped. Any field you change will be locked from future scraper updates.
          </p>
        )}
        {event.editedAt && (
          <p className="text-xs text-gray-500 mt-2">
            Last edited {new Date(event.editedAt).toLocaleString()}{event.editedBy ? ` by ${event.editedBy}` : ''}.
          </p>
        )}
        {isPendingSubmission && (
          <div className="mt-4 flex flex-col gap-3 rounded-md border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-amber-950">Pending public submission</p>
              <p className="mt-1 text-xs text-amber-800">
                Review the details below, then approve to publish this event to the Calendar.
              </p>
            </div>
            <button
              type="button"
              onClick={approveAndPublish}
              disabled={approving}
              className="shrink-0 rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
            >
              {approving ? 'Publishing...' : 'Approve and Publish'}
            </button>
          </div>
        )}
        {!event.hidden && event.externalSource === 'submission' && (
          <div className="mt-4 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
            Approved and published to the Calendar.
          </div>
        )}
        {error && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>
      <EventForm initial={eventToForm(event)} mode="edit" />
    </div>
  );
}
