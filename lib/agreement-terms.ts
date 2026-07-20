// lib/agreement-terms.ts
//
// Channel-specific terms text for the /admin/billing/sign wizard.
//
//   TERMS_RL      — Print (monthly RealtyLine magazine)
//   TERMS_DIGITAL — On-site web placements (banners, article, calendar)
//   TERMS_EMAIL   — e-Blasts (solo, weekly inclusion)
//   TERMS_APP     — In-app placements (splash, feed, article, calendar)
//
// Use `termsForChannel(channel)` to pick the right block from an AdChannel.
// All four share the same PAYMENT block and Governing Law footer; only the
// creative-deadline / cadence / term sections change.

import type { AdChannel } from '@/lib/ad-channels';

const PAYMENT_BLOCK = `PAYMENT
INVOICES ARE PROCESSED MONTHLY and sent to a preferred billing email.
We accept all major credit cards and ACH bank processing. Payments can be submitted by check and mailed to P. O. Box 81366, Austin, Texas 78708-1366. Make checks payable to Caxton Publications, Inc.`;

const GOVERNING_LAW = `GOVERNING LAW
This Agreement shall be governed by and construed in accordance with the laws of the State of Texas, without regard to its conflict-of-law principles. Any dispute arising out of or in connection with this Agreement shall be resolved exclusively in the state or federal courts located in Travis County, Texas.

ENTIRE AGREEMENT
This Agreement, together with the Insertion Order and any addenda, constitutes the entire agreement between the Parties with respect to the subject matter hereof and supersedes all prior negotiations, understandings, and agreements, whether written or oral.`;

// ─────────────────────────────────────────────────────────────────────────────
// PRINT — RealtyLine monthly magazine (unchanged from original)
// ─────────────────────────────────────────────────────────────────────────────

export const TERMS_RL = `TERMS OF AGREEMENT

${PAYMENT_BLOCK}

PRINT MATERIAL DEADLINES
Issue dates and deadlines can be found at newslinesa.com.

If the Publisher does not receive acceptable advertising materials by the stated deadline, the Publisher may, at its sole discretion: (a) republish the Advertiser's most recent advertisement; or (b) leave the reserved space unpublished. In either case, the Advertiser and/or advertising agency shall be charged in full for all reserved space.

FREQUENCY
Published monthly. Advertising materials are due by the stated deadline within the month of issue. The publication is direct-mailed to subscribers and arrives approximately the third week of that month.

TERM AND AUTOMATIC RENEWAL

1. INITIAL TERM
This Agreement shall commence on the Sign Date set forth in the Agreement Acceptance section and shall continue for the duration of the advertising schedule specified in the Insertion Order (the "Ad Timing Term"). The final month of the Ad Timing Term shall be determined by the last month selected in the Insertion Order section.

2. AUTOMATIC RENEWAL
Upon expiration of the Ad Timing Term, this Agreement shall automatically renew on a month-to-month basis, under the same terms and conditions then in effect, including the applicable advertising rate and ad size, unless either Party provides written notice of cancellation in accordance with Section 3 below. Each subsequent Renewal Term shall also automatically renew on a month-to-month basis under the same conditions.

3. REQUIRED NOTICE OF CANCELLATION
Either the Publisher or the Advertiser may cancel this Agreement by providing written notice of cancellation to the other Party no later than thirty (30) calendar days before the stated advertising deadline of the Final Term Month (or, during any Renewal Term, thirty (30) calendar days before the stated advertising deadline of the then-current monthly term). Advertising deadlines for each issue are published at newslinesa.com. Notice received after this date shall not be effective for the current term and shall instead apply to the following month's Renewal Term.

4. MANNER OF NOTICE
All notices of cancellation shall be in writing and must be received by the Publisher via: (a) personal delivery; (b) mail to P.O. Box 81366, Austin, Texas 78708-1366; or (c) email to tawanna@myrealtyline.com with receipt confirmation from Publisher.

${GOVERNING_LAW}`;

// ─────────────────────────────────────────────────────────────────────────────
// DIGITAL — On-site placements at realtynewsnow.app
// ─────────────────────────────────────────────────────────────────────────────

export const TERMS_DIGITAL = `TERMS OF AGREEMENT — DIGITAL PLACEMENT

${PAYMENT_BLOCK}

CREATIVE ASSETS
Advertiser shall deliver all creative assets (image, tap-through URL, and any headline/subtitle copy) no later than seventy-two (72) hours before the campaign start date specified in the Insertion Order. Accepted formats: PNG, JPG, or animated GIF (≤ 500 KB); dimensions must match the reserved placement size.

If the Publisher does not receive acceptable creative materials by the stated deadline, the Publisher may, at its sole discretion: (a) rerun the Advertiser's most recent approved creative from the same or an equivalent campaign; or (b) leave the reserved placement unfilled. In either case, the Advertiser shall be charged in full for the reserved flight.

CAMPAIGN FLIGHT
The advertising placement will run continuously from the Start Date through the End Date set forth in the Insertion Order. The Publisher makes commercially reasonable efforts to deliver the placement across the specified pages, sections, or zones, but does not guarantee any specific impression, click, or conversion volume.

TERM AND AUTOMATIC RENEWAL

1. INITIAL TERM
This Agreement shall commence on the Start Date set forth in the Insertion Order and shall continue through the End Date.

2. AUTOMATIC RENEWAL
Upon expiration of the initial flight, this Agreement shall automatically renew for successive flights of equal duration under the same terms, rate, and placement, unless either Party provides written notice of cancellation in accordance with Section 3.

3. REQUIRED NOTICE OF CANCELLATION
Either Party may cancel by providing written notice no later than fourteen (14) calendar days before the End Date of the then-current flight. Notice received after that date applies to the subsequent renewal flight.

4. MANNER OF NOTICE
Written notice may be delivered by (a) personal delivery; (b) mail to P.O. Box 81366, Austin, Texas 78708-1366; or (c) email to tawanna@myrealtyline.com with receipt confirmation.

${GOVERNING_LAW}`;

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL — e-Blast sends (solo, weekly inclusion)
// ─────────────────────────────────────────────────────────────────────────────

export const TERMS_EMAIL = `TERMS OF AGREEMENT — E-BLAST

${PAYMENT_BLOCK}

E-BLAST CREATIVE DEADLINES
Advertiser shall deliver all creative assets (subject line, HTML body or approved template fields, hero image, and destination URL) no later than forty-eight (48) hours before each scheduled send. Copy is subject to Publisher's editorial review; the Publisher reserves the right to reject or request revisions to any creative that violates applicable law, CAN-SPAM, or Publisher's advertising standards.

If the Publisher does not receive acceptable e-Blast materials by the stated deadline, the Publisher may, at its sole discretion: (a) postpone the send to the next available slot at no reduction in fee; (b) resend the Advertiser's most recent approved e-Blast creative; or (c) drop the scheduled send. In each case, the Advertiser shall be charged in full for the reserved send.

SEND SCHEDULE
The number of sends reserved is set forth in the Insertion Order. The Publisher schedules sends across the RealtyLine and/or Newsline San Antonio subscriber lists as specified. The Publisher makes commercially reasonable efforts to hit the reserved send dates but reserves the right to shift any individual send by up to five (5) business days to accommodate list health and deliverability.

TERM AND AUTOMATIC RENEWAL

1. INITIAL TERM
This Agreement shall commence on the Sign Date and shall continue until all reserved sends have been delivered or the End Date set forth in the Insertion Order, whichever is later.

2. AUTOMATIC RENEWAL
Upon delivery of the final reserved send, this Agreement shall automatically renew for a further block of the same size (same number of sends, same publication, same rate) unless either Party provides written notice of cancellation in accordance with Section 3.

3. REQUIRED NOTICE OF CANCELLATION
Either Party may cancel by providing written notice no later than fourteen (14) calendar days before the scheduled date of the next send. Notice received after that date applies to the subsequent send block.

4. MANNER OF NOTICE
Written notice may be delivered by (a) personal delivery; (b) mail to P.O. Box 81366, Austin, Texas 78708-1366; or (c) email to tawanna@myrealtyline.com with receipt confirmation.

${GOVERNING_LAW}`;

// ─────────────────────────────────────────────────────────────────────────────
// APP — In-app placements (RealtyLine + Newsline iOS/Android apps)
// ─────────────────────────────────────────────────────────────────────────────

export const TERMS_APP = `TERMS OF AGREEMENT — IN-APP PLACEMENT

${PAYMENT_BLOCK}

CREATIVE ASSETS
Advertiser shall deliver all creative assets (in-app image, tap-through URL, and any headline copy) no later than seventy-two (72) hours before the campaign start date specified in the Insertion Order. Accepted formats: PNG or JPG at the pixel dimensions provided by the Publisher for the reserved slot.

If the Publisher does not receive acceptable creative materials by the stated deadline, the Publisher may, at its sole discretion: (a) rerun the Advertiser's most recent approved in-app creative; or (b) leave the reserved slot unfilled. In either case, the Advertiser shall be charged in full for the reserved flight.

PLACEMENT AND MARKETS
The in-app placement (slot, zone, and market count) is set forth in the Insertion Order. The Advertiser acknowledges that the Publisher operates separate market instances (Austin RealtyLine and San Antonio Newsline) and that "markets" refers to the number of market instances in which the placement will run. The Publisher makes commercially reasonable efforts to deliver the placement to all users of the reserved markets but does not guarantee any specific impression, install, or tap-through volume.

TERM AND AUTOMATIC RENEWAL

1. INITIAL TERM
This Agreement shall commence on the Start Date set forth in the Insertion Order and shall continue through the End Date (weeks × 7 days for weekly cadence; last calendar day of the final month for monthly cadence).

2. AUTOMATIC RENEWAL
Upon expiration of the initial flight, this Agreement shall automatically renew for successive flights of equal duration under the same terms, rate, slot, and market count, unless either Party provides written notice of cancellation in accordance with Section 3.

3. REQUIRED NOTICE OF CANCELLATION
Either Party may cancel by providing written notice no later than fourteen (14) calendar days before the End Date of the then-current flight. Notice received after that date applies to the subsequent renewal flight.

4. MANNER OF NOTICE
Written notice may be delivered by (a) personal delivery; (b) mail to P.O. Box 81366, Austin, Texas 78708-1366; or (c) email to tawanna@myrealtyline.com with receipt confirmation.

${GOVERNING_LAW}`;

// ─────────────────────────────────────────────────────────────────────────────
// Helper — pick terms text by channel.
// ─────────────────────────────────────────────────────────────────────────────

export function termsForChannel(channel: AdChannel): string {
  switch (channel) {
    case 'print':
      return TERMS_RL;
    case 'digital':
      return TERMS_DIGITAL;
    case 'email':
      return TERMS_EMAIL;
    case 'app':
      return TERMS_APP;
    default:
      return TERMS_RL;
  }
}

