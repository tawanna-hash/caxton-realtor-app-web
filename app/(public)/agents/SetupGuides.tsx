'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { HowTo } from './HelpTips';

/* ---------- Guides ---------- */

export type TourStep = {
  title: string;
  text: string;
  /** Desk view to open before showing this step. */
  view?: string;
  /** Element to point at: the first visible element whose text starts with one of these (separate with |, end with $ for an exact match). */
  find?: string;
  /** Shown when the element is not on screen yet. */
  hint?: string;
  /** Click the element when moving on (safe navigation clicks only). */
  clickOnNext?: boolean;
  /** Move on by itself when the person clicks the highlighted element. */
  advanceOnClick?: boolean;
};
export type Guide = HowTo & { id: string; view: string; tour: TourStep[] };

export const GUIDES: Guide[] = [
  {
    id: 'scheduler',
    view: 'my-schedule',
    title: 'How To Set Up A Scheduler',
    intro: 'Follow these steps in order. The whole setup takes about five minutes.',
    steps: [
      { step: "Before You Start", text: "A scheduler is a booking page. People pick an open time and it lands on your calendar. To book onto your own calendar and skip your busy times, open Integrations and connect Google Calendar or Outlook first. You can skip this and use the Closing Time Calendar, which emails you each booking with a calendar file." },
      { step: "Set Your Custom URL", text: "On My Scheduling, find Your Custom Scheduler URL and choose Edit. Type your slug, for example your name, then choose Save. Every scheduler you make lives under this address, as in itsalmostclosingtime.com/book/your-slug." },
      { step: "Start A Scheduler", text: "Under Schedulers, choose New Scheduler. On a first visit the button reads Create Your First Scheduler. A five-step builder opens with a live preview on the right. Choose Continue at the bottom of each step to move on, and Back to return to the previous one." },
      { step: "Step 1, Select Calendars: Calendar And Name", text: "Choose Select Booking Calendar: pick your connected calendar, or Closing Time Calendar. Type a Scheduler Name such as Home Inspection Walkthrough. This is the title on the booking page. Optionally type Your Name, which is shown to people booking. Leave it blank to hide your name." },
      { step: "Step 1, Select Calendars: Web Address", text: "Under Scheduler URL, choose Custom Alias and type a short word such as inspection. The page becomes /book/your-slug/inspection. Or choose Use Root URL for no alias. Only one scheduler can use the root. If you want to block busy times on other calendars, check up to six under Additional Calendars. Then choose Continue." },
      { step: "Step 2, Availability: Meeting Length", text: "Tap one or more lengths such as 15 Min, 30 Min or 60 Min. To add another, type minutes between 5 and 480 into Add Custom Time and choose Add. If you pick more than one, choose which loads first under Default Time When Scheduler Page Is First Loaded." },
      { step: "Step 2, Availability: Days And Hours", text: "Under Weekly Availability, turn on each day you take bookings with its switch. Set a start and end time for each day. Days that are off cannot be booked. Choose your Timezone." },
      { step: "Step 2, Availability: Limits", text: "Set How Far In Advance Can Someone Book With You, and How Much Notice You Need Before A Meeting Starts. Set Buffer Before Event and Buffer After Event to leave travel or prep time. Set Start Time Increments to control how often start times appear, such as every 30 minutes. Then choose Continue." },
      { step: "Step 3, Event Details", text: "Event Subject is the title on the calendar invite. You can use the variables {invitee_name}, {invitee_email}, {my_name} and {subject}. Add an Event Description with an agenda or notes. Pick a Booked Event Color (Google Calendar only). Under Create Online Meeting, choose None, Google Meet, Microsoft Teams, or Meeting Link and paste a Zoom or phone bridge link." },
      { step: "Step 3, Event Details: Questions", text: "Under Additional Attendees, invite others by email. Under Custom Questions, choose Add Question to ask the person booking something, such as the property address. Check Required to make an answer mandatory. You can add up to ten. Then choose Continue." },
      { step: "Step 4, Appearance And Branding", text: "Type Welcome Text shown at the top of the booking page. Optionally enter a Redirect URL to send people to your own thank-you page after booking. Set Language, Booker's Locale, Time Format and First Day Of Week. Optionally upload a banner image and an avatar image. Then choose Continue." },
      { step: "Step 5, Workflow", text: "Add up to two reminder emails before the meeting, choosing how long before and writing the subject and message. Add one follow-up email after the meeting ends the same way. Reminders that would already be in the past for a last-minute booking are skipped. Then choose Create Scheduler (or Save Scheduler when editing)." },
      { step: "Turn It On And Test It", text: "Back in the Schedulers list, check that the switch beside your scheduler shows On. A scheduler that is Off or missing means your URL does not lead to a booking page. Choose Open to view the live page, pick a time as a visitor would and confirm the event lands on your calendar." },
      { step: "Share The Link", text: "Choose Copy Link and paste it into emails, texts or your signature. To show several schedulers on one page, create a Combined Link, give it a title and alias, and pick at least two schedulers. People then choose the meeting type first." },
      { step: "Change Or Cancel Later", text: "Choose Edit on a scheduler to change any step. Use the switch to pause it without deleting it. The delete icon removes it and its bookings. The Bookings list shows each person, time and answers. Cancel an upcoming booking and the person is emailed." },
    ],
    tour: [
      { title: 'Set Up A Scheduler', text: 'This walkthrough points at each part of the page in order. You can click and type on the page at any time, then press Next here. Press Esc to stop.', view: 'my-schedule' },
      { title: 'Connect Your Calendar', text: 'Optional. Connect Google Calendar or Outlook so bookings land on your calendar and busy times are skipped. Without one, bookings use the Closing Time calendar and arrive by email.', find: 'Connected Accounts' },
      { title: 'Set Your Custom URL', text: 'Choose Edit, type your slug and Save. Every scheduler lives under this address.', find: 'Your Custom Scheduler URL' },
      { title: 'Start A Scheduler', text: 'Choose New Scheduler. Pressing Next opens the builder for you.', find: 'New Scheduler|Create Your First Scheduler', advanceOnClick: true, clickOnNext: true },
      { title: 'Pick The Booking Calendar', text: 'Step 1 of 5. Choose the calendar that receives bookings, or the Closing Time Calendar.', find: 'Select Booking Calendar', hint: 'Press New Scheduler first to open the builder.' },
      { title: 'Name It', text: 'The Scheduler Name is the title on the booking page, such as Home Inspection Walkthrough.', find: 'Scheduler Name' },
      { title: 'Choose The Web Address', text: 'Pick Custom Alias and type a short word such as inspection, or Use Root URL for no alias. Only one scheduler can use the root.', find: 'Scheduler URL' },
      { title: 'Go To Availability', text: 'Choose Continue to move to Step 2.', find: 'Continue to Availability', advanceOnClick: true, hint: 'Finish Step 1, then this button appears at the bottom of it.' },
      { title: 'Meeting Length', text: 'Step 2 of 5. Tap the lengths you offer, or add a custom time between 5 and 480 minutes.', find: 'Meeting Length', hint: 'Press Continue on Step 1 to get here.' },
      { title: 'Days And Hours', text: 'Turn on each day you take bookings and set start and end times. Choose your Timezone below it.', find: 'Weekly availability' },
      { title: 'Limits And Buffers', text: 'Set how far ahead people can book, how much notice you need, and the buffer before and after each meeting.', find: 'How far in advance' },
      { title: 'Go To Event Details', text: 'Choose Continue to move to Step 3.', find: 'Continue to Event Details', advanceOnClick: true },
      { title: 'Event Details', text: 'Step 3 of 5. The Event Subject is the invite title. You can use {invitee_name}, {invitee_email}, {my_name} and {subject}.', find: 'Event Subject', hint: 'Press Continue on Step 2 to get here.' },
      { title: 'Ask Questions', text: 'Add up to ten questions for the person booking, such as the property address. Check Required to make an answer mandatory.', find: 'Custom Questions' },
      { title: 'Go To Appearance', text: 'Choose Continue to move to Step 4.', find: 'Continue to Appearance', advanceOnClick: true },
      { title: 'Welcome Text', text: 'Step 4 of 5. Add a welcome message, an optional redirect page, and language and time format.', find: 'Welcome text', hint: 'Press Continue on Step 3 to get here.' },
      { title: 'Go To Workflow', text: 'Choose Continue to move to Step 5.', find: 'Continue to workflow', advanceOnClick: true },
      { title: 'Reminders', text: 'Step 5 of 5. Add up to two reminder emails before the meeting and one follow-up after it.', find: 'Reminder emails', hint: 'Press Continue on Step 4 to get here.' },
      { title: 'Create It', text: 'Choose Create Scheduler. Then make sure the switch beside it shows On, choose Open to try the booking page, and Copy Link to share it.', find: 'Create Scheduler|Save Scheduler', advanceOnClick: true },
    ],
  },
  {
    id: 'documents',
    view: 'transaction',
    title: 'How To Request And Track A Missing Document',
    intro: 'Ask a client for a document, follow it until it arrives, and see how Closing Time warns you when something is still missing.',
    steps: [
      { step: "Open The Deal", text: "Choose Deals and open the deal. The Client Document Requests card appears on the deal tabs, such as Contract and Readiness Check, below the main content." },
      { step: "Add The Client First", text: "Open the People tab and make sure the client is listed with an email address. If nobody is on the deal, the request stops with the message: Add the client on the People tab first." },
      { step: "Choose Request Document", text: "On the Client Document Requests card, choose Request Document. The card shows how many requests are still open." },
      { step: "Pick The Document", text: "Under Document, choose from the list. If the document is not listed, choose Other and type what you need under What Do You Need." },
      { step: "Choose Who Gets It", text: "Under Send To, choose one person, or Everyone On The Deal (Separate Request Each) to send each person their own request." },
      { step: "Add A Note", text: "Optionally add a Note To Client, such as a clear photo of both sides. Notes can be up to 500 characters." },
      { step: "Send The Request", text: "Leave the box checked to email the request with the client's private portal link, then choose Send Request. A status line confirms who was asked and how many emails went out." },
      { step: "Track It", text: "Each request shows when it was requested, whether it was emailed, and when it was uploaded and received. When the client uploads a file, it appears under the request." },
      { step: "Mark It Received", text: "After the client uploads, the checkbox beside the request becomes available. Review the file, then check the box to mark it received. Until then the request stays open." },
      { step: "How Closing Time Warns You", text: "Closing Time flags a deal when a deadline is close and the matching document is not marked received: appraisal, title commitment, survey and financing approval within 5 days of their dates, and an inspection report within 2 days of the end of the option period. It also flags documents still requested within 7 days of closing. A flag turns high priority at 1 day out, or 3 days before closing." },
      { step: "Where The Warnings Show", text: "Flags appear in the deal, and in the morning email Closing Time: Your Deals Today when daily emails are on. A separate card, Blank Fields Need Your Attention, lists forms that still have empty fields." },
    ],
    tour: [
      { title: 'Request A Document', text: 'This walkthrough shows where to ask a client for a document and track it. Open a deal first. Press Esc to stop at any time.', view: 'transaction' },
      { title: 'Client Document Requests', text: 'This card lists every document you have asked for and how many are still open.', find: 'Client Document Requests', hint: 'Open a deal from Deals first. The card shows on the deal tabs.' },
      { title: 'Start A Request', text: 'Choose Request Document. Pressing Next opens the form for you.', find: 'Request Document', clickOnNext: true },
      { title: 'Pick The Document', text: 'Choose a document from the list, or Other and type what you need.', find: 'Document$' },
      { title: 'Choose Who Gets It', text: 'Send to one person, or to everyone on the deal as separate requests. The client must be on the People tab with an email.', find: 'Send To$' },
      { title: 'Add A Note', text: 'Optional. Tell the client how you want it, for example a clear photo of both sides.', find: 'Note To Client' },
      { title: 'Send It', text: 'Choose Send Request. The client gets an email with a private portal link where they upload the file.', find: 'Send Request' },
      { title: 'Mark It Received', text: 'After the client uploads, the checkbox beside the request turns on. Review the file, then check it to mark the document received.', find: 'Client Document Requests' },
      { title: 'How You Are Warned', text: 'Closing Time flags the deal when a deadline is close and the matching document is not received, and when requested documents are still open within 7 days of closing. Flags show in the deal and in the morning email.' },
    ],
  },
  {
    id: 'alerts',
    view: 'coordinator',
    title: 'How To Turn On Deadline Alerts',
    intro: 'Get an email, a push alert, or both before each deadline on every active deal.',
    steps: [
      { step: "Open Settings", text: "In the left nav, choose Settings and find Deadline Alerts." },
      { step: "Turn On Email", text: "Check Send Deadline Alerts By Email. Alerts go to the notification email on your account." },
      { step: "Turn On Push", text: "Check Send Browser Push Alerts, then choose Connect This Device and Allow when asked. Connect every phone and computer you use, one at a time." },
      { step: "Choose When", text: "Check any of 7 Days Before, 3 Days Before, 1 Day Before and Due Today. You can choose more than one." },
      { step: "Enter Effective Dates", text: "On each deal, enter the Effective Date so the deadlines fill in. Alerts only send for active deals that have dates, and not for deadlines you have checked off as done." },
      { step: "Know When They Arrive", text: "Alerts go out between 8 and 10 AM Central on the days you choose, and each one carries the property address." },
      { step: "If Alerts Stop", text: "Open the full Alert Setup guide from Settings for iPhone, Android, Mac, Windows and email steps. If the button says Notifications Blocked, allow notifications for itsalmostclosingtime.com in your browser's site settings and connect again." },
    ],
    tour: [
      { title: 'Turn On Deadline Alerts', text: 'This walkthrough points at each alert setting on the Settings page. Press Esc to stop at any time.', view: 'coordinator' },
      { title: 'Email Alerts', text: 'Check this to get a deadline email at your notification address.', find: 'Send Deadline Alerts By Email', hint: 'Open Settings from the left nav.' },
      { title: 'Push Alerts', text: 'Check this for alerts on your phone or computer.', find: 'Send Browser Push Alerts' },
      { title: 'Connect This Device', text: 'Choose Connect This Device and Allow when asked. Do this on every phone and computer you use.', find: 'Connect This Device' },
      { title: 'Choose When', text: 'Pick 7 Days Before, 3 Days Before, 1 Day Before, Due Today, or any mix.', find: '7 Days Before' },
      { title: 'Last Step', text: 'Enter the Effective Date on each deal so deadlines fill in. Alerts go out between 8 and 10 AM Central.' },
    ],
  },
];

/* ---------- Walkthrough ---------- */

function visible(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

function locate(find: string | undefined): HTMLElement | null {
  if (!find) return null;
  const needles = find.toLowerCase().split('|').map((n) => n.trim()).filter(Boolean);
  const nodes = document.querySelectorAll<HTMLElement>('button, a, h1, h2, h3, h4, label, summary, span, p, legend');
  for (const el of nodes) {
    if (el.closest('[data-walkthrough]')) continue;
    const t = (el.textContent ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (!t) continue;
    if (needles.some((n) => (n.endsWith('$') ? t === n.slice(0, -1) : t.startsWith(n) && t.length <= n.length + 40)) && visible(el)) return el;
  }
  return null;
}

export function Walkthrough({ guide, onClose, goView }: { guide: Guide; onClose: () => void; goView: (view: string) => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const elRef = useRef<HTMLElement | null>(null);
  const step = guide.tour[i];
  const last = i === guide.tour.length - 1;

  const measure = useCallback(() => {
    const el = locate(step.find);
    elRef.current = el;
    if (!el) { setRect(null); return; }
    const box = el.matches('button, a, input, select, textarea') ? el : (el.parentElement ?? el);
    setRect(box.getBoundingClientRect());
  }, [step.find]);

  useEffect(() => {
    if (step.view) goView(step.view);
  }, [i]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let scrolled = false;
    const tick = () => {
      measure();
      if (!scrolled && elRef.current) { scrolled = true; elRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    };
    const t0 = window.setTimeout(tick, 250);
    const iv = window.setInterval(tick, 300);
    return () => { window.clearTimeout(t0); window.clearInterval(iv); };
  }, [i, measure]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (!step.advanceOnClick) return;
    const onClick = (e: MouseEvent) => {
      const el = elRef.current;
      if (el && e.target instanceof Node && el.contains(e.target)) {
        window.setTimeout(() => setI((n) => Math.min(n + 1, guide.tour.length - 1)), 500);
      }
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [i, step.advanceOnClick, guide.tour.length]);

  const next = () => {
    if (step.clickOnNext && step.advanceOnClick && elRef.current) { elRef.current.click(); return; }
    if (step.clickOnNext && elRef.current) elRef.current.click();
    if (last) { onClose(); return; }
    window.setTimeout(() => setI((n) => Math.min(n + 1, guide.tour.length - 1)), step.clickOnNext ? 400 : 0);
  };

  const vh = typeof window === 'undefined' ? 800 : window.innerHeight;
  const vw = typeof window === 'undefined' ? 1200 : window.innerWidth;
  const cardW = Math.min(360, vw - 24);
  let cardStyle: React.CSSProperties = { width: cardW, left: Math.max(12, (vw - cardW) / 2), top: Math.max(12, vh / 2 - 110) };
  if (rect) {
    const left = Math.min(Math.max(12, rect.left), vw - cardW - 12);
    cardStyle = rect.bottom < vh * 0.55 ? { width: cardW, left, top: rect.bottom + 14 } : { width: cardW, left, bottom: vh - rect.top + 14 };
  }
  const btn = '!min-h-0 rounded-md border border-[#E6E5EC] bg-white px-3 py-1.5 text-[13px] font-medium text-[#1B1726] hover:!bg-[#EFEAF8] hover:!text-[#301D5D]';

  return (
    <div data-walkthrough data-no-auto-open style={{ position: 'fixed', inset: 0, zIndex: 80, pointerEvents: 'none' }}>
      {rect && (
        <div aria-hidden="true" style={{ position: 'fixed', left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12, border: '2px solid #301D5D', borderRadius: 8, boxShadow: '0 0 0 9999px rgba(27,23,38,0.45)', transition: 'all 200ms ease', pointerEvents: 'none' }} />
      )}
      {!rect && <div aria-hidden="true" style={{ position: 'fixed', inset: 0, background: 'rgba(27,23,38,0.45)' }} />}
      <div role="dialog" aria-label={`${guide.title}: step ${i + 1} of ${guide.tour.length}`} style={{ position: 'fixed', pointerEvents: 'auto', ...cardStyle }} className="rounded-lg border border-[#E6E5EC] bg-white p-4 shadow-lg">
        <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-[#7A7787]">Step {i + 1} Of {guide.tour.length}</p>
        <div className="mt-1 h-1 rounded-full bg-[#E6E5EC]" aria-hidden="true"><div className="h-1 rounded-full bg-[#301D5D]" style={{ width: `${((i + 1) / guide.tour.length) * 100}%` }} /></div>
        <p className="mt-3 text-[14px] font-semibold text-[#301D5D]">{step.title}</p>
        <p className="mt-1 text-[14px] leading-6 text-[#4A4757]">{step.text}</p>
        {step.find && !rect && <p className="mt-2 rounded-md bg-[#EFEAF8] px-3 py-2 text-[13px] text-[#301D5D]">{step.hint ?? 'This part is not on the screen yet. Open it, then press Next.'}</p>}
        <div className="mt-3 flex items-center justify-between gap-2">
          <button type="button" className={btn} onClick={onClose}>Stop</button>
          <span className="flex gap-2">
            <button type="button" className={btn} disabled={i === 0} onClick={() => setI((n) => Math.max(0, n - 1))}>Back</button>
            <button type="button" className={btn} onClick={next}>{last ? 'Finish' : 'Next'}</button>
          </span>
        </div>
      </div>
    </div>
  );
}
