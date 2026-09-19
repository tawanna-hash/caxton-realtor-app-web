import Link from 'next/link';
import PageTitle from '@/components/ui/PageTitle';
import {
  EMPTY_EVENT,
  EventForm,
} from '@/app/admin/events/_components/EventForm';

export const metadata = {
  title: 'Submit an Event — Realty News Now',
  description: 'Submit an event for review and inclusion in the Realty News Now Calendar.',
};

export default function SubmitCalendarEventPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <Link href="/calendar" className="text-sm text-gray-600 hover:text-gray-900">
          ← Back to Calendar
        </Link>
        <div className="mb-7 mt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-brand-700">
            Calendar
          </p>
          <PageTitle size="md">Submit an Event</PageTitle>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-600">
            Share an industry event with RealtyLine Austin or Newsline San Antonio.
            Every submission is reviewed by our team before it appears on the public Calendar.
          </p>
        </div>
        <EventForm initial={EMPTY_EVENT} mode="public" />
      </div>
    </main>
  );
}
