'use client';

import { PUB_META, type PubKey } from '@/lib/pub-meta';
import { SW } from '@/lib/style-constants';
import type { CalendarEvent } from '@/lib/events-store';
import { decodeEntities } from '@/lib/events/text';
import { isSponsored } from '@/lib/events/sponsorship';
import { formatEventDateLong, formatEventTimeRange } from '@/lib/events/dates';
import { generateICS } from '@/lib/events/ics';
import { trackEvent } from '@/app/posthog-provider';
import { DetailSection } from './DetailSection';
import FloaterPill, { type FloaterAction } from '@/components/ui/FloaterPill';
import PageTitle from '@/components/ui/PageTitle';

/**
 * Returns true only when the location string looks like a real physical
 * address — not a virtual/zoom/online label. Used to gate the Map button
 * and onDirections handler so users don't get bounced into a maps app with
 * a meaningless query.
 *
 * TODO: this is a frontend bandaid. The scraper writes virtual labels into
 * the `location` field; ideally those events should have `location: null`
 * and the descriptive text should live in `format` or similar. Filed as a
 * follow-up: 'audit Unlock MLS scraper virtual-event handling'.
 */
function isMappable(location: string | null | undefined): location is string {
  if (!location) return false;
  const lower = location.toLowerCase();
  if (lower.startsWith('virtual')) return false;
  if (lower.includes('zoom')) return false;
  if (lower.includes('webinar')) return false;
  if (lower.startsWith('online')) return false;
  return true;
}

export interface EventDetailProps {
  pub: string;
  event: CalendarEvent | null;
  onBack: () => void;
}

export function EventDetail({ pub, event, onBack }: EventDetailProps) {
  const info = PUB_META[pub as PubKey] || PUB_META.realtyline;
  if (!event) {
    return (
      <div className="fixed inset-0 bg-white z-30 flex items-center justify-center" style={SW}>
        <div className="text-center px-8">
          <p className="text-gray-500 mb-4">Event not found</p>
          <button onClick={onBack} className="text-sm uppercase tracking-wider font-medium" style={{ color: info.color }}>
            ← Back to events
          </button>
        </div>
      </div>
    );
  }

  const sponsored = isSponsored(event);
  const title = decodeEntities(event.title);
  const description = decodeEntities(event.description);

  // Action handlers
  const onAddToCalendar = () => {
    trackEvent('event_added_to_calendar', { event_id: event.id, pub });
    const ics = generateICS(event);
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(event.title || 'event').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const onRegister = () => {
    if (!event.website) return;
    trackEvent('event_register_clicked', { event_id: event.id, event_title: event.title, website: event.website, pub });
    window.open(event.website, '_blank', 'noopener,noreferrer');
  };

  const onShare = async () => {
    const shareData = {
      title: title,
      text: title,
      url: event.link,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        trackEvent('event_shared', { event_id: event.id, channel: 'native', pub });
      } else {
        await navigator.clipboard.writeText(event.link);
        alert('Event link copied to clipboard');
        trackEvent('event_shared', { event_id: event.id, channel: 'copy', pub });
      }
    } catch (err) {
      // User cancelled or share failed
      console.log('[Share] cancelled or failed:', err);
    }
  };

  const onDirections = () => {
    if (!isMappable(event.location)) return;
    trackEvent('event_directions_clicked', { event_id: event.id, pub });
    const isApple = /iPhone|iPad|iPod|Mac/.test(navigator.userAgent);
    const q = encodeURIComponent(event.location);
    const url = isApple ? `https://maps.apple.com/?q=${q}` : `https://www.google.com/maps/search/?api=1&query=${q}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="fixed inset-0 bg-white z-30 overflow-y-auto" style={SW}>
      {/* Header */}
      <div className="sticky top-0 bg-white z-10 border-b border-gray-200 px-3 py-3 flex items-center justify-between">
        <div className="flex items-center">
          <button onClick={onBack} aria-label="Back" className="text-gray-900 p-2 -ml-2 min-w-[44px] min-h-[44px] flex items-center justify-center">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <p className="text-sm uppercase tracking-[0.2em] text-gray-900 font-medium ml-2">Events</p>
        </div>
        <span className="text-xs uppercase tracking-[0.2em] text-gray-400 font-medium">{info.city}</span>
      </div>

      {/* Featured image */}
      {event.imageUrl && (
        <div className="w-full bg-gray-100">
          {/* eslint-disable-next-line @next/next/no-img-element -- TODO(S18-lint-debt): swap for next/image after configuring remotePatterns + known dimensions */}
          <img src={event.imageUrl} alt="" className="w-full h-auto" />
        </div>
      )}

      <div className="px-5 pt-6 pb-48">
        {/* Sponsored tag */}
        {sponsored && (
          <p className="text-xs uppercase tracking-[0.2em] font-semibold mb-3" style={{ color: info.color }}>
            {event.sponsor_advertiser ? `Sponsored · ${event.sponsor_advertiser}` : 'Sponsored'}
          </p>
        )}

        {/* Title */}
        <div className="mb-2">
          <PageTitle size="md">{title}</PageTitle>
        </div>

        {/* Subtitle: date · time · location */}
        {(event.startDate || event.location) && (
          <p className="text-sm uppercase tracking-wider text-gray-500 font-medium mb-6">
            {[
              event.startDate ? formatEventDateLong(event.startDate) : null,
              event.startDate ? formatEventTimeRange(event.startDate, event.endDate) : null,
              event.location,
            ].filter(Boolean).join(' · ')}
          </p>
        )}

        {/* DESCRIPTION section */}
        {description && description.length > 0 && (
          <DetailSection label="Description">
            <p className="text-base text-gray-700 leading-relaxed font-light whitespace-pre-wrap">{description}</p>
          </DetailSection>
        )}

        {/* DATE section */}
        {event.startDate && (
          <DetailSection label="Date">
            <p className="text-base text-gray-900">{formatEventDateLong(event.startDate)}</p>
          </DetailSection>
        )}

        {/* TIME section */}
        {event.startDate && (
          <DetailSection label="Time">
            <p className="text-base text-gray-900">{formatEventTimeRange(event.startDate, event.endDate)}</p>
          </DetailSection>
        )}

        {/* WHERE section */}
        {event.location && (
          <DetailSection label="Where">
            <p className="text-base text-gray-900">{event.location}</p>
          </DetailSection>
        )}

        {/* ORGANIZER section */}
        {event.organizer && (
          <DetailSection label="Provider">
            <p className="text-base text-gray-900">{event.organizer}</p>
            {event.organizerEmail && (
              <a href={`mailto:${event.organizerEmail}`} className="text-sm text-gray-500 font-light underline">
                {event.organizerEmail}
              </a>
            )}
          </DetailSection>
        )}

        {/* COURSE INFO section */}
        {(event.courseNumber || event.format) && (
          <DetailSection label="Course Info">
            {event.format && <p className="text-base text-gray-900">{event.format}</p>}
            {event.courseNumber && <p className="text-sm text-gray-500 font-light">Course {event.courseNumber}</p>}
          </DetailSection>
        )}

        {/* PRICE section */}
        {(event.memberPrice || event.nonmemberPrice) && (
          <DetailSection label="Price">
            {event.memberPrice && (
              <p className="text-base text-gray-900"><span className="text-gray-500 text-sm font-light mr-2">Members</span>{event.memberPrice}</p>
            )}
            {event.nonmemberPrice && (
              <p className="text-base text-gray-900"><span className="text-gray-500 text-sm font-light mr-2">Non-members</span>{event.nonmemberPrice}</p>
            )}
          </DetailSection>
        )}

        {/* INSTRUCTOR section */}
        {(event.instructor || event.instructorBio || event.imageThumb) && (
          <DetailSection label="Instructor">
            <div className="flex items-start gap-3">
              {event.imageThumb && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={event.imageThumb}
                  alt={event.instructor || 'Instructor'}
                  className="w-16 h-16 rounded-full object-cover flex-shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                {event.instructor && <p className="text-base text-gray-900">{event.instructor}</p>}
                {event.instructorBio && (
                  <p className="text-sm text-gray-700 font-light leading-relaxed whitespace-pre-wrap mt-2">
                    {event.instructorBio}
                  </p>
                )}
              </div>
            </div>
          </DetailSection>
        )}

        {/* TAGS */}
        {event.tags && (
          <DetailSection label="Tags">
            <p className="text-sm text-gray-500 font-light">{event.tags}</p>
          </DetailSection>
        )}
      </div>

      {/* Sticky action bar — sits ABOVE the AppShell BottomNav (~68px tall, z-40).
          On notched iPhones the BottomNav reserves env(safe-area-inset-bottom)
          (~34px) at its lower edge, so a flat bottom-[68px] put the Register
          bar UNDER the nav. We anchor with calc(68px + safe-area-inset-bottom)
          so the CTA always clears the nav across every device. */}
      <div
        className="fixed left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 flex gap-2 z-50"
        style={{ ...SW, bottom: 'calc(68px + env(safe-area-inset-bottom, 0px))' }}
      >
        {event.website && (
          <button
            onClick={onRegister}
            className="w-full py-3 text-white text-sm font-semibold uppercase tracking-wider rounded-md"
            style={{ backgroundColor: info.color }}
          >
            Register
          </button>
        )}
      </div>
      {/* Floating action pill — shared <FloaterPill>. Stacked above the
          Register bar (which itself sits above the BottomNav). FloaterPill
          adds env(safe-area-inset-bottom) on top of bottomOffsetClass
          automatically, so 148px = 68px (BottomNav) + ~60px (Register bar +
          gap), and the inset stacks correctly on notched devices. */}
      <FloaterPill
        bottomOffsetClass="bottom-[148px]"
        actions={(() => {
          const acts: FloaterAction[] = [
            {
              key: 'back',
              label: 'Back',
              ariaLabel: 'Back to events',
              onClick: () => {
                trackEvent('event_back_pill_clicked', { event_id: event.id, pub });
                onBack();
              },
              icon: <path d="m15 18-6-6 6-6" />,
            },
          ];
          if (isMappable(event.location)) {
            acts.push({
              key: 'map',
              label: 'Map',
              ariaLabel: 'Directions',
              onClick: onDirections,
              icon: (
                <>
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </>
              ),
            });
          }
          acts.push({
            key: 'calendar',
            label: 'Calendar',
            ariaLabel: 'Add to calendar',
            onClick: onAddToCalendar,
            icon: (
              <>
                <rect width="18" height="18" x="3" y="4" rx="2" />
                <path d="M16 2v4" />
                <path d="M8 2v4" />
                <path d="M3 10h18" />
              </>
            ),
          });
          acts.push({
            key: 'share',
            label: 'Share',
            ariaLabel: 'Share',
            onClick: onShare,
            icon: (
              <>
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </>
            ),
          });
          return acts;
        })()}
      />
    </div>
  );
}
