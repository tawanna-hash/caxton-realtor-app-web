/**
 * PUBLIC read-only view of the current Gmail event review queue,
 * unlocked by a signed share token. No approve/reject controls, no
 * raw source emails — only the pertinent event details.
 */

import { notFound } from 'next/navigation';
import { verifyGmailShareToken } from '@/lib/server/gmail-share-token';
import { collectGmailQueuePdfInputs } from '@/lib/server/gmail-queue-pdf-inputs';
import { PUBLICATION_FILTER_LABELS } from '@/lib/publications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ token: string }>;
}

function fmt(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-US', {
      timeZone: 'America/Chicago',
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

export default async function SharedGmailQueuePage({ params }: PageProps) {
  const { token } = await params;
  const claim = verifyGmailShareToken(token);
  if (!claim) notFound();

  const items = await collectGmailQueuePdfInputs();

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Gmail Event Review Queue</h1>
          <p className="text-sm text-gray-500 mt-1">
            Read-only snapshot · {items.length} pending event{items.length === 1 ? '' : 's'} · Generated{' '}
            {new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })}
          </p>
        </div>
        <a
          href={`/api/admin/events/gmail/shared/${encodeURIComponent(token)}/pdf`}
          className="px-4 py-2 bg-brand-700 text-white text-sm font-medium rounded-md hover:bg-brand-700 transition-colors whitespace-nowrap"
        >
          Download PDF
        </a>
      </div>

      {items.length === 0 ? (
        <p className="text-gray-500 italic">The queue is empty — no pending events to review.</p>
      ) : (
        <div className="space-y-4">
          {items.map(({ event, confidence }, i) => (
            <article key={event.id} className="border border-gray-200 rounded-md p-4 bg-white">
              <header className="mb-2">
                <h2 className="text-lg font-semibold text-gray-900">
                  {i + 1}. {event.title || '(no title)'}
                </h2>
                <p className="text-xs text-brand-700 font-medium mt-1">
                  {PUBLICATION_FILTER_LABELS[event.publication] ?? event.publication} · {fmt(event.startDate)}
                  {event.location ? ` · ${event.location}` : ''}
                  {confidence != null ? ` · ${Math.round(confidence * 100)}% confidence` : ''}
                </p>
              </header>
              <dl className="text-sm text-gray-700 space-y-1">
                {(event.organizer || event.organizerEmail) && (
                  <div>
                    <dt className="inline font-medium">Organizer: </dt>
                    <dd className="inline">
                      {event.organizer || '—'}
                      {event.organizerEmail ? ` <${event.organizerEmail}>` : ''}
                    </dd>
                  </div>
                )}
                {event.endDate && (
                  <div>
                    <dt className="inline font-medium">Ends: </dt>
                    <dd className="inline">{fmt(event.endDate)}</dd>
                  </div>
                )}
                {event.link && (
                  <div>
                    <dt className="inline font-medium">Link: </dt>
                    <dd className="inline break-all">{event.link}</dd>
                  </div>
                )}
              </dl>
              {event.description && (
                <div className="mt-3 text-sm text-gray-700 whitespace-pre-wrap">{event.description}</div>
              )}
            </article>
          ))}
        </div>
      )}

      <footer className="mt-8 pt-4 border-t border-gray-200 text-xs text-gray-500">
        Realty News Now · Gmail Event Review · Share link expires in 7 days.
      </footer>
    </div>
  );
}
