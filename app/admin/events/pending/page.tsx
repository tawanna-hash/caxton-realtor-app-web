/**
 * /admin/events/pending — review queue for advertiser-submitted events
 * and Gemini-detected events from the RealtyLine Facebook Page.
 *
 * Approve flips hidden=false (event appears on Calendar). Reject deletes
 * the row. Edit before approve = PATCH /admin/events/[id] then approve.
 */
import PendingEventsClient from './PendingEventsClient';

export const metadata = { title: 'Pending Events — Realty News Now Admin' };

export default function Page() {
  return <PendingEventsClient />;
}
