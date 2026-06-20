import PageTitle from '@/components/ui/PageTitle';

export const metadata = {
  title: 'Support — Realty News Now',
  description:
    'Get help with Realty News Now: account access, app issues, advertiser questions, or anything else. We respond within one business day.',
};

const SUPPORT_EMAIL = 'tawanna@myrealtyline.com';

export default function SupportPage() {
  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
      <header className="mb-8 sm:mb-10">
        <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
          Support
        </p>
        <PageTitle size="md">How can we help?</PageTitle>
        <p className="text-base text-gray-700 font-light leading-relaxed max-w-3xl mt-4">
          We&apos;re a small team and we read every message. Reach out and
          you&apos;ll hear back within one business day.
        </p>
      </header>

      <section className="mb-12">
        <p className="text-sm font-semibold uppercase tracking-wider text-[#301D5D] mb-5">
          Email us
        </p>
        <div className="rounded-md border border-gray-200 bg-gray-50 p-6">
          <p className="text-gray-700 font-light leading-relaxed mb-4">
            The fastest way to reach us is by email. Please include your account
            email, the device you&apos;re using (iPhone model + iOS version helps),
            and a screenshot if you can.
          </p>
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=Realty%20News%20Now%20Support`}
            className="inline-flex items-center px-5 py-2.5 rounded-md bg-[#301D5D] text-white font-medium hover:bg-[#301D5D] transition"
          >
            {SUPPORT_EMAIL}
          </a>
          <p className="text-sm text-gray-500 font-light mt-4">
            Response time: within one business day, Monday–Friday.
          </p>
        </div>
      </section>

      <section className="mb-12">
        <p className="text-sm font-semibold uppercase tracking-wider text-[#301D5D] mb-5">
          Common topics
        </p>
        <div className="space-y-6">
          <div>
            <p className="font-semibold text-gray-900 mb-1">
              I can&apos;t sign in to my account.
            </p>
            <p className="text-gray-700 font-light leading-relaxed">
              Use the &ldquo;Forgot password&rdquo; link on the sign-in screen to reset
              your password by email. If the reset email doesn&apos;t arrive within
              a few minutes, check your spam folder, then email us with the
              address on your account.
            </p>
          </div>

          <div>
            <p className="font-semibold text-gray-900 mb-1">
              The app shows a blank screen or won&apos;t load.
            </p>
            <p className="text-gray-700 font-light leading-relaxed">
              Realty News Now requires an internet connection. Make sure
              you&apos;re online, then force-close the app and reopen it. If the
              problem persists, uninstall and reinstall from the App Store. Your
              account data is stored on our servers, so nothing will be lost.
            </p>
          </div>

          <div>
            <p className="font-semibold text-gray-900 mb-1">
              I&apos;m not receiving email notifications.
            </p>
            <p className="text-gray-700 font-light leading-relaxed">
              Check that {SUPPORT_EMAIL} is added to your contacts so our emails
              aren&apos;t filtered. Visit your account profile inside the app to
              confirm notification preferences are turned on. If you still
              aren&apos;t getting them after 24 hours, email us with the address
              on your account.
            </p>
          </div>

          <div>
            <p className="font-semibold text-gray-900 mb-1">
              I&apos;m an advertiser with a billing question.
            </p>
            <p className="text-gray-700 font-light leading-relaxed">
              Email us at {SUPPORT_EMAIL} with your business name and we&apos;ll
              pull up your account. Existing campaign questions, invoice copies,
              and changes to your contract all flow through this address.
            </p>
          </div>

          <div>
            <p className="font-semibold text-gray-900 mb-1">
              How do I delete my account?
            </p>
            <p className="text-gray-700 font-light leading-relaxed">
              Email {SUPPORT_EMAIL} from the address on your account with the
              subject &ldquo;Delete my account&rdquo; and we&apos;ll remove your
              record from our database within 7 business days. Some information
              tied to active advertising campaigns may be retained for
              accounting/audit purposes as described in our{' '}
              <a
                href="/privacy"
                className="text-[#301D5D] font-medium underline underline-offset-2"
              >
                privacy notice
              </a>
              .
            </p>
          </div>

          <div>
            <p className="font-semibold text-gray-900 mb-1">
              I have a press, partnership, or sponsorship inquiry.
            </p>
            <p className="text-gray-700 font-light leading-relaxed">
              Send the details to {SUPPORT_EMAIL} and we&apos;ll route your
              message to the right person on our team.
            </p>
          </div>
        </div>
      </section>

      <section className="mb-4">
        <p className="text-sm font-semibold uppercase tracking-wider text-[#301D5D] mb-5">
          More resources
        </p>
        <ul className="space-y-2 text-gray-700 font-light leading-relaxed">
          <li>
            <a
              href="/faq"
              className="text-[#301D5D] font-medium underline underline-offset-2"
            >
              Frequently asked questions
            </a>
          </li>
          <li>
            <a
              href="/privacy"
              className="text-[#301D5D] font-medium underline underline-offset-2"
            >
              Privacy notice
            </a>
          </li>
          <li>
            <a
              href="/terms"
              className="text-[#301D5D] font-medium underline underline-offset-2"
            >
              Terms of service
            </a>
          </li>
        </ul>
      </section>

      <p className="text-sm text-gray-500 font-light mt-12 pt-6 border-t border-gray-100">
        Realty News Now is published by Caxton Publications, Inc.
      </p>
        </div>
    </main>
  );
}
