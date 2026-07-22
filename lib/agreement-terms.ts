// lib/agreement-terms.ts
//
// Channel-specific terms text for the /admin/billing/sign wizard.
//
//   TERMS_RL      — Print / Digital (RealtyLine magazine, print + digital editions)
//   TERMS_DIGITAL — Shares TERMS_RL (print/digital is one terms category)
//   TERMS_EMAIL   — e-Blasts (solo, weekly inclusion)
//   TERMS_APP     — In-app placements (splash, feed, article, calendar)
//
// Use `termsForChannel(channel)` to pick the right block from an AdChannel.
// Print/digital, e-Blast, and App each share a PAYMENT block; e-Blast and App
// append a Governing Law / Entire Agreement footer.

import type { AdChannel } from '@/lib/ad-channels';

const PAYMENT_BLOCK = `PAYMENT
INVOICES ARE PROCESSED MONTHLY and sent to a preferred billing email.
We accept all major credit cards and ACH bank processing. Payments can be submitted by check and mailed to P. O. Box 81366, Austin, Texas 78708-1366. Make checks payable to Caxton Publications, Inc.`;


// ─────────────────────────────────────────────────────────────────────────────
// PRINT / DIGITAL — RealtyLine magazine (print + digital editions)
// ─────────────────────────────────────────────────────────────────────────────

export const TERMS_RL = `TERMS OF AGREEMENT

${PAYMENT_BLOCK}

PRINT MATERIAL DEADLINES
Issue dates and deadlines can be found at realtyline.us.

FREQUENCY
Published monthly. Advertising closing is the stated deadline of the month preceding the date of issue. The publication is direct-mailed to subscribers and arrives about the third week of the month for the same issue month.

CANCELLATIONS
Neither the advertiser, the advertising agency, nor their agents may cancel after the stated issue deadline. Orders for inserts may not be canceled less than 30 days preceding the stated issue deadline.
If by the materials date the Publisher has not received advertising material that it, in its sole discretion, deems acceptable for publication, it may either repeat the advertiser's most recent advertisement that it has published or publish nothing, charging the advertiser and/or advertising agency for any space reserved for them.

SUPPLEMENTAL INFORMATION

PREMIUM POSITIONS
A 20% fee will be added to the following premium positions: inside front cover, page 3, inside back cover, center-spread and back page.

INSERTS
Pricing and availability on request.

CONTRACT REGULATIONS

FREQUENCY DISCOUNT
An advertiser who does not complete a committed consecutive-month insertion schedule will be subject to the one-time insertion rate.

AGENCY
All advertisements are published for the benefit of the advertiser and advertising agency, and each of them is jointly and severally liable for all charges.

BILLING
Payment in U.S. dollars, including any applicable tax, is due at the Publisher's Postal Box in Austin, Texas, within 20 days of the date of invoice. Any error in billing is binding upon advertiser and/or advertising agency unless Publisher receives written notice of the error within such 20-day period.

PAST DUE
All accounts not paid in full within 20 days of the date of the invoice shall incur a late charge of 1.5% per month from the due date until paid in full.

COLLECTION
In the event advertiser and/or advertising agency defaults in payment of invoices, such invoices are turned over for collection. In this event, the advertiser and/or advertising agency shall be totally liable for all fees and sums charged by the collection agency or attorney. If any suit or other judicial proceeding is instituted or had thereon or if such fees and sums are collected through probate or bankruptcy proceeding, advertiser and/or advertising agency shall be totally liable for all attorneys' fees and court costs incurred by Publisher in the collection of said invoices.

LIMITS OF LIABILITY

Publisher's liability for failure to publish the advertisement or any error in the advertisement shall be limited to a "make good" in the next available issue.

1. The Publisher or President will accept requests to make changes at its discretion but is not responsible for any errors in any revisions made by the Publisher, nor is the Publisher responsible for errors in advertising materials supplied by the advertiser or its agent. The Publisher reserves the right to make such modifications to the advertiser's submitted files as are necessary to bring them into compliance with the publication's current specifications and is not responsible for any errors resulting from this modification.

2. All advertisements are accepted and published by the Publisher upon the representation that advertiser and/or advertising agency is authorized to publish the entire contents and subject matter thereof. This includes but is not limited to the rights to (a) convert advertisements between digital formats and incorporate the advertisements into Publisher's digital products, which may be published on an online network and in so doing, to modify, alter, and edit the advertisements as Publisher deems appropriate; (b) reproduce the advertisements for publication and distribution in the forms, manners, and media listed in subparagraph (a) above; and (c) display publicly and distribute the advertisements as incorporated into the media listed in subparagraph (a). Advertiser and/or advertising agency warrants that advertiser owns all rights in and to the advertisements submitted for publication, including copyrights, and the advertisements do not violate any applicable state or federal trade regulation and do not invade the privacy rights of any person or libel any person. When advertisements containing the names, pictures, and/or testimonials of persons are submitted for publication, the order or request for the publication thereof shall be deemed a representation by the advertiser and/or advertising agency that they have obtained the written consent for the use in the advertisement of the name, picture, and/or testimonial of any such person or the consent of his administrator, executor, heirs, or assigns. In consideration of the Publisher's acceptance of any advertisements for publication, advertiser and advertising agency shall, jointly and severally, indemnify and hold the Publisher or President harmless from and against any loss or expense, including without limitation reasonable attorneys' fees, resulting from claims or suits based upon the contents or subject matter of such advertisements, including without limitation claims or suits alleging negligence, gross negligence, deceptive trade practices, libel, violation of right of privacy, plagiarism, and copyright infringement.

3. The term "advertising agency" as used in this contract refers to a recognized individual or group of individuals who make the media selection, handle the order, and coordinate and process the space placed with the Publisher under the terms of this contract.

4. The Publisher shall not be liable for failure to publish or distribute all or any part of any issue because of labor disputes, accidents, fires, acts of God, or any other circumstances beyond the Publisher's control.

5. All orders are subject to Publisher's acceptance. Publisher reserves the right to reject or cancel any advertising for any reason at any time, including, but not limited to, any advertisement that, in the opinion of the Publisher, does not conform to the editorial or graphic standards of the publication.

6. The advertising agency and the advertiser assume and agree to pay the charges, including any applicable tax, for advertising published at their direction. Invoices shall be sent, at Publisher's option, to the agency or the advertiser, unless other arrangements have been made at execution of the contract.

7. Publisher reserves the right to cancel the contract at any time upon default by agency or advertiser in the payment of invoices. In the event of such cancellation, charges for all advertising shall become immediately due and payable by the agency. Furthermore, if there has been any default in the payment of a prior invoice or if, in the sole judgment of Publisher, the agency's credit becomes impaired, Publisher shall have the right to require payment for further advertising under this contract upon such terms as it may see fit.

8. No waiver or modification of any of the terms set forth in this contract shall be binding on the Publisher unless in writing signed by an officer of the publication.`;

// Print and digital share the same terms (one "Print / Digital" category).
export const TERMS_DIGITAL = TERMS_RL;

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL — e-Blast sends (solo, weekly inclusion)
// ─────────────────────────────────────────────────────────────────────────────

export const TERMS_EMAIL = `TERMS OF AGREEMENT — E-BLAST

{{BRAND}} does not release subscriber email addresses to external parties, but external parties may purchase the opportunity for {{BRAND}} to send an e-Blast campaign on their behalf. Each e-Blast campaign sent by {{BRAND}} on behalf of an external group will include the following disclaimer: This email is brought to you on behalf of our advertising partner [Advertiser's Name]. {{BRAND}} does not endorse any information contained within this communication.

PAYMENT
Credit card payment must be received in full at time of signing the agreement. No e-Blast campaigns will be scheduled until payment has been received.

CREATIVE ASSETS
Advertiser shall deliver all creative assets (images, tap-through URLs, and any headline copy) no later than seventy-two (72) hours before the e-Blast campaign send date/time specified in the insertion order. All assets must be emailed to Caroline Carver at {{CAROLINE_EMAIL}}.

Content is preferred in HTML code form, with subject line included.

If HTML code is not available, please submit according to the following specifications: PNG or JPEG (less than 10MB), high resolution at the pixel dimensions provided by Publisher for the reserved spot. Copy should be submitted via Word document, with formatting directions and hyperlinks included. Images should be indicated in text via [insert "image name" image here], submitted as an email attachment. Publisher will provide a "test" version of the email for approval prior to sending.

CAN-SPAM COMPLIANCE
Publisher provides CAN-SPAM compliance in all e-Blast campaigns.

PLACEMENT AND MARKETS
The e-Blast campaign (publication scope and market(s)) is set forth in the insertion order. The Advertiser acknowledges the Publisher operates separate markets (RealtyLine Austin and Newsline San Antonio) and that "markets" refers to the number of market instances in which the campaign will run.

LIMITATION OF LIABILITY
Publisher does not guarantee specific results, sales, or click-through rates.

1. Publisher will make every effort to send the e-Blast campaign on requested dates but will schedule according to availability.

2. Publisher has final approval of all e-Blast campaign content. Publisher reserves the right to refuse e-Blast campaign for any reason.

3. No cancellations will be accepted or refunded.

Your signature below signifies that you understand and agree to the terms of agreement above.`;

// ─────────────────────────────────────────────────────────────────────────────
// APP — In-app placements (RealtyLine + Newsline iOS/Android apps)
// ─────────────────────────────────────────────────────────────────────────────

export const TERMS_APP = `TERMS OF AGREEMENT — IN-APP PLACEMENT

${PAYMENT_BLOCK}

CREATIVE ASSETS
Advertiser shall deliver all creative assets (in-app image, tap-through URL, and any headline copy) no later than seventy-two (72) hours before the campaign start date specified in the insertion order. Accepted formats: PNG or JPG at the pixel dimensions provided by the Publisher for the reserved slot.

If the Publisher does not receive acceptable creative materials by the stated deadline, the Publisher may, at its sole discretion: (a) rerun the Advertiser's most recent approved in-app creative; or (b) leave the reserved slot unfilled. In either case, the Advertiser shall be charged in full for the reserved flight.

PLACEMENT AND MARKETS
The in-app placement (slot, zone, and market count) is set forth in the insertion order. The Advertiser acknowledges that the Publisher operates separate market instances (Austin RealtyLine and San Antonio Newsline) and that "markets" refers to the number of market instances in which the placement will run. The Publisher makes commercially reasonable efforts to deliver the placement to all users of the reserved markets but does not guarantee any specific impression, install, or tap-through volume.

TERM AND AUTOMATIC RENEWAL

1. INITIAL TERM
This Agreement shall commence on the Start Date set forth in the insertion order and shall continue through the End Date (weeks × 7 days for weekly cadence; last calendar day of the final month for monthly cadence).

2. AUTOMATIC RENEWAL
Upon expiration of the initial flight, this Agreement shall automatically renew for successive flights of equal duration under the same terms, rate, slot, and market count, unless either Party provides written notice of cancellation in accordance with Section 3.

3. REQUIRED NOTICE OF CANCELLATION
Either Party may cancel by providing written notice no later than fourteen (14) calendar days before the End Date of the then-current flight. Notice received after that date applies to the subsequent renewal flight.

4. MANNER OF NOTICE
Written notice may be delivered by (a) personal delivery; (b) mail to P.O. Box 81366, Austin, Texas 78708-1366; or (c) email to {{NOTICE_EMAIL}} with receipt confirmation.`;

// ─────────────────────────────────────────────────────────────────────────────
// Helper — pick terms text by channel.
// ─────────────────────────────────────────────────────────────────────────────

export function termsForChannel(channel: AdChannel, publication?: string | null): string {
  let text: string;
  switch (channel) {
    case 'print':
      text = TERMS_RL;
      break;
    case 'digital':
      text = TERMS_DIGITAL;
      break;
    case 'email': {
      // Each market has its own tailored e-Blast terms. {{BRAND}} and
      // {{CAROLINE_EMAIL}} resolve per publication; the "RealtyLine Austin and
      // Newsline San Antonio" line in PLACEMENT AND MARKETS stays literal.
      const brand = publication === 'san_antonio' ? 'Newsline San Antonio' : 'RealtyLine Austin';
      const carolineEmail = publication === 'san_antonio' ? 'caroline@newslinesa.com' : 'caroline@myrealtyline.com';
      return TERMS_EMAIL
        .replace(/\{\{BRAND\}\}/g, brand)
        .replace(/\{\{CAROLINE_EMAIL\}\}/g, carolineEmail);
    }
    case 'app': {
      // App terms are generic ("Publisher" throughout); the only market-specific
      // value is the cancellation-notice email, resolved per publication. The
      // "Austin RealtyLine and San Antonio Newsline" line stays literal (both).
      const noticeEmail = publication === 'san_antonio' ? 'tawanna@newslinesa.com' : 'tawanna@myrealtyline.com';
      return TERMS_APP.replace(/\{\{NOTICE_EMAIL\}\}/g, noticeEmail);
    }
    default:
      text = TERMS_RL;
  }
  // Print/digital terms carry the brand URL (realtyline.us). For Newsline San
  // Antonio, swap the brand name and deadline URL. (Email/App terms list both
  // brands intentionally, so they are not substituted.)
  if (publication === 'san_antonio') {
    return text
      .replace(/RealtyLine/g, 'Newsline San Antonio')
      .replace(/realtyline\.us/g, 'newslinesa.com');
  }
  return text;
}
