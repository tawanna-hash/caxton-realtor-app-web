import type { Metadata } from 'next';
import Link from 'next/link';
import { Bell, Laptop, Mail, Monitor, Smartphone, Wrench } from 'lucide-react';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Closing Time Alert Setup | Realty News Now',
  description: 'Set up your iPhone, computer, and email so you never miss a Closing Time deadline alert.',
};

type Section = {
  id: string;
  eyebrow: string;
  title: string;
  icon: ReactNode;
  steps: ReactNode[];
  note?: ReactNode;
};

const iconClass = 'h-5 w-5 shrink-0 text-[#7059A8]';

const sections: Section[] = [
  {
    id: 'closing-time',
    eyebrow: 'Step 1',
    title: 'Turn On Alerts In Closing Time',
    icon: <Bell className={iconClass} aria-hidden="true" />,
    steps: [
      <>Sign in and open <Link href="/agents/closing-time" className="font-semibold text-[#301D5D] underline underline-offset-2">Closing Time</Link>.</>,
      <>In <strong>Deadline Alerts</strong>, check <strong>Send Deadline Alerts By Email</strong> and <strong>Send Browser Push Alerts</strong>.</>,
      <>Choose when you want to be alerted: <strong>7 Days Before</strong>, <strong>3 Days Before</strong>, <strong>1 Day Before</strong>, and/or <strong>Due Today</strong>.</>,
      <>Tap <strong>Connect This Device</strong> on every phone and computer you use, and tap <strong>Allow</strong> when asked. Each device has to be connected separately.</>,
      <>Enter each deal&apos;s <strong>Effective Date</strong> so deadlines fill in. Alerts only send for active transactions with dates.</>,
    ],
    note: <>Alerts go out between 8 and 10 AM Central on the days you choose.</>,
  },
  {
    id: 'iphone',
    eyebrow: 'Step 2',
    title: 'iPhone App',
    icon: <Smartphone className={iconClass} aria-hidden="true" />,
    steps: [
      <>Install the <strong>Realty News Now</strong> app from the App Store and sign in with the same account you use for Closing Time.</>,
      <>When the app asks to send notifications, tap <strong>Allow</strong>.</>,
      <>Open <strong>Settings → Notifications → Realty News Now</strong> and turn on <strong>Allow Notifications</strong>.</>,
      <>Under Alerts, turn on <strong>Lock Screen</strong>, <strong>Notification Center</strong>, and <strong>Banners</strong>. Set <strong>Banner Style</strong> to <strong>Persistent</strong> so alerts stay on screen until you act on them.</>,
      <>Turn on <strong>Sounds</strong> and <strong>Badges</strong>, and set <strong>Notification Grouping</strong> to <strong>Automatic</strong>.</>,
      <>If you use <strong>Scheduled Summary</strong>, leave Realty News Now out of it so alerts arrive right away.</>,
      <>If you use a <strong>Focus</strong> (Do Not Disturb, Work, Sleep), go to <strong>Settings → Focus</strong>, choose the Focus, tap <strong>Apps</strong>, and add <strong>Realty News Now</strong> to allowed apps.</>,
    ],
    note: <>Safari on iPhone does not support website alerts. Use the app to get alerts on your iPhone.</>,
  },
  {
    id: 'android',
    eyebrow: 'Step 3',
    title: 'Android Phone',
    icon: <Smartphone className={iconClass} aria-hidden="true" />,
    steps: [
      <>Open realtynewsnow.app in <strong>Chrome</strong>, sign in, go to Closing Time, and tap <strong>Connect This Device</strong>. Tap <strong>Allow</strong> when asked.</>,
      <>Open <strong>Settings → Apps → Chrome → Notifications</strong> and make sure notifications are on for realtynewsnow.app.</>,
      <>Turn off <strong>Do Not Disturb</strong>, or add Chrome as an exception.</>,
      <>If alerts stop, open <strong>Settings → Apps → Chrome → Battery</strong> and set it to <strong>Unrestricted</strong>.</>,
    ],
    note: <>Push alerts in the Android app are coming soon. Until then, use Chrome and email.</>,
  },
  {
    id: 'mac',
    eyebrow: 'Step 4',
    title: 'Mac',
    icon: <Laptop className={iconClass} aria-hidden="true" />,
    steps: [
      <>In the browser you use (Chrome, Comet, Edge, or Safari), open Closing Time, click <strong>Connect This Device</strong>, and click <strong>Allow</strong>.</>,
      <>Open <strong>System Settings → Notifications</strong> and select your browser (for example <strong>Google Chrome</strong>, <strong>Comet</strong>, or <strong>Safari</strong>). For Safari, also look for <strong>realtynewsnow.app</strong>.</>,
      <>Turn on <strong>Allow Notifications</strong>, set the alert style to <strong>Alerts</strong> (stays until dismissed) or <strong>Banners</strong>, and turn on <strong>Show In Notification Center</strong> and <strong>Play Sound</strong>.</>,
      <>If your browser is not in the list, quit and reopen it, then click Connect This Device again and approve any macOS prompt.</>,
      <>Check the site is allowed inside the browser: Chrome/Comet/Edge <strong>Settings → Privacy → Site Settings → Notifications</strong>; Safari <strong>Settings → Websites → Notifications</strong>. realtynewsnow.app should say <strong>Allow</strong>.</>,
      <>Turn off <strong>Focus</strong> in Control Center, or add your browser to the allowed apps.</>,
    ],
    note: <>The browser has to be open (it can run in the background) to receive alerts on a computer.</>,
  },
  {
    id: 'windows',
    eyebrow: 'Step 5',
    title: 'Windows PC',
    icon: <Monitor className={iconClass} aria-hidden="true" />,
    steps: [
      <>In Chrome or Edge, open Closing Time, click <strong>Connect This Device</strong>, and click <strong>Allow</strong>.</>,
      <>Open <strong>Settings → System → Notifications</strong>, turn notifications on, and make sure your browser is turned on in the app list.</>,
      <>Turn off <strong>Do Not Disturb</strong>, or add your browser to priority notifications.</>,
      <>In the browser, open <strong>Settings → Privacy → Site Settings → Notifications</strong> and confirm realtynewsnow.app is set to <strong>Allow</strong>.</>,
    ],
  },
  {
    id: 'email',
    eyebrow: 'Step 6',
    title: 'Email',
    icon: <Mail className={iconClass} aria-hidden="true" />,
    steps: [
      <>Alerts go to the email address on your Realty News Now account. Make sure it is one you check daily.</>,
      <>When your first Closing Time email arrives, add the sender to your <strong>Contacts</strong>.</>,
      <>Gmail: if it lands in Promotions or Spam, drag it to <strong>Primary</strong> or click <strong>Not Spam</strong>. You can also create a filter for &ldquo;Closing Time&rdquo; set to <strong>Never Send It To Spam</strong>.</>,
      <>Outlook: if it lands in Junk or Other, click <strong>Not Junk</strong> or <strong>Move To Focused</strong>.</>,
    ],
  },
];

const troubleshooting: ReactNode[] = [
  <>Sign in with the same account on every device. Alerts only go to devices connected while signed in as you.</>,
  <>If the button says <strong>Notifications Blocked</strong>, allow notifications for realtynewsnow.app in your browser&apos;s site settings, reload, and click Connect This Device again.</>,
  <>On iPhone, if alerts stop, fully close the Realty News Now app and reopen it while signed in. This reconnects your phone.</>,
  <>Tap an alert to go straight to Closing Time.</>,
  <>New phone or computer? Connect it again. Alert access does not transfer between devices.</>,
];

export default function ClosingTimeAlertSetupPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7059A8]">Closing Time</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-4xl">Never Miss A Deadline Alert</h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
        Follow these steps on each phone and computer you use so Closing Time email and push alerts reach you.
      </p>

      <nav aria-label="Setup steps" className="mt-6 flex flex-wrap gap-2">
        {sections.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            className="inline-flex min-h-[36px] items-center rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-[#301D5D] transition hover:border-[#7059A8] hover:bg-[#F8F5FF]"
          >
            {section.title}
          </a>
        ))}
        <a
          href="#troubleshooting"
          className="inline-flex min-h-[36px] items-center rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-[#301D5D] transition hover:border-[#7059A8] hover:bg-[#F8F5FF]"
        >
          Troubleshooting
        </a>
      </nav>

      <div className="mt-8 space-y-4">
        {sections.map((section) => (
          <section key={section.id} id={section.id} className="scroll-mt-24 border border-slate-200 bg-white p-4 sm:p-6">
            <div className="flex items-start gap-3">
              {section.icon}
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7059A8]">{section.eyebrow}</p>
                <h2 className="mt-1 text-xl font-semibold tracking-[-0.025em] text-slate-950">{section.title}</h2>
              </div>
            </div>
            <ol className="mt-4 space-y-3">
              {section.steps.map((step, index) => (
                <li key={index} className="flex gap-3 text-sm leading-6 text-slate-700">
                  <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#F3EFFB] text-xs font-bold text-[#301D5D]">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            {section.note ? (
              <p className="mt-4 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500">{section.note}</p>
            ) : null}
          </section>
        ))}

        <section id="troubleshooting" className="scroll-mt-24 border border-slate-200 bg-white p-4 sm:p-6">
          <div className="flex items-start gap-3">
            <Wrench className={iconClass} aria-hidden="true" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7059A8]">Still Not Getting Alerts?</p>
              <h2 className="mt-1 text-xl font-semibold tracking-[-0.025em] text-slate-950">Troubleshooting</h2>
            </div>
          </div>
          <ul className="mt-4 space-y-3">
            {troubleshooting.map((item, index) => (
              <li key={index} className="flex gap-3 text-sm leading-6 text-slate-700">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#7059A8]" aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="mt-8">
        <Link
          href="/agents/closing-time"
          className="inline-flex min-h-[44px] items-center rounded-md bg-[#301D5D] px-5 text-sm font-bold text-white transition hover:bg-[#241646]"
        >
          Back To Closing Time
        </Link>
      </div>
    </main>
  );
}
