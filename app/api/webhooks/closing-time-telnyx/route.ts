// app/api/webhooks/closing-time-telnyx/route.ts
//
// Closing Time's own Telnyx webhook (inbound replies and delivery receipts).
// Telnyx Portal -> Messaging Profile "Closing Time" -> Inbound webhook URL:
//   https://itsalmostclosingtime.com/api/webhooks/closing-time-telnyx
// Uses the same signature check and handling as the shared Telnyx handler.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export { POST } from '../telnyx/route';
