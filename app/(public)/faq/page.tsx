import PageTitle from '@/components/ui/PageTitle';
export const metadata = {
  title: 'Frequently Asked Questions — Realty News Now',
  description:
    'Common questions about signing in, notifications, account, and troubleshooting for Realty News Now by Caxton Publications.',
};

export default function FaqPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-12 md:py-16">
      <header className="mb-10">
        <p className="text-sm uppercase tracking-[0.25em] text-gray-500 font-medium mb-3">
          Frequently Asked Questions
        </p>
        <PageTitle>
          Common questions, quick answers.
        </PageTitle>
        <p className="mt-4 text-base text-gray-600 font-light leading-relaxed">
          Don&apos;t see your question?{' '}
          <a
            href="mailto:hello@myrealtyline.com?subject=App%20Question"
            className="text-[#1a2a44] font-medium underline underline-offset-2"
          >
            Email us
          </a>{' '}
          and we&apos;ll get back to you.
        </p>
      </header>

      <section className="mb-10">
        <p className="text-sm font-semibold uppercase tracking-wider text-[#1a2a44] mb-5">
          Getting started
        </p>

        <div className="space-y-6">
          <div>
            <p className="font-semibold text-gray-900 mb-1">Who can use this app?</p>
            <p className="text-gray-700 font-light leading-relaxed">
              Anyone can sign up. Realty News Now is built for the Austin and San
              Antonio real estate community — REALTORS®, brokers, lenders,
              title professionals, builders, homebuyers, and anyone who wants
              to follow the local market. Some features (like REALTOR®-only
              giveaways or industry-specific content) may have additional
              eligibility, but the app and its core content are open to
              everyone.
            </p>
          </div>

          <div>
            <p className="font-semibold text-gray-900 mb-1">Is it really free?</p>
            <p className="text-gray-700 font-light leading-relaxed">
              Yes. There is no subscription fee. The app is supported by the
              same advertising partners who support our print and digital
              magazines.
            </p>
          </div>

          <div>
            <p className="font-semibold text-gray-900 mb-1">
              How do I sign in?
            </p>
            <p className="text-gray-700 font-light leading-relaxed">
              We use magic links — no passwords. Enter your email and we send
              you a one-time sign-in link. Click it and you&apos;re in. Links
              expire after a short time for security.
            </p>
          </div>

          <div>
            <p className="font-semibold text-gray-900 mb-1">
              Why no passwords?
            </p>
            <p className="text-gray-700 font-light leading-relaxed">
              Magic links are simpler, more secure, and remove the most common
              account-recovery headache for users — forgotten passwords.
            </p>
          </div>
        </div>
      </section>

      <hr className="border-gray-200 my-10" />

      <section className="mb-10">
        <p className="text-sm font-semibold uppercase tracking-wider text-[#1a2a44] mb-5">
          Notifications &amp; content
        </p>

        <div className="space-y-6">
          <div>
            <p className="font-semibold text-gray-900 mb-1">
              What does the app cover — RealtyLine, Newsline, or both?
            </p>
            <p className="text-gray-700 font-light leading-relaxed">
              Both. RealtyLine covers Austin and Central Texas; Newsline covers
              San Antonio and South Texas. You can choose which publication&apos;s
              content you want to see in your feed, or follow both.
            </p>
          </div>

          <div>
            <p className="font-semibold text-gray-900 mb-1">
              How do push notifications work?
            </p>
            <p className="text-gray-700 font-light leading-relaxed">
              You can opt in during sign-up or in settings. You control which
              types of notifications you receive — new issues, upcoming events,
              giveaways, breaking news, or advertiser features.
            </p>
          </div>

          <div>
            <p className="font-semibold text-gray-900 mb-1">
              How do I change or turn off notifications?
            </p>
            <p className="text-gray-700 font-light leading-relaxed">
              Open the app, go to{' '}
              <span className="font-medium">Settings → Notification Preferences</span>,
              and toggle each category individually. Or turn them all off in one
              tap.
            </p>
          </div>
        </div>
      </section>

      <hr className="border-gray-200 my-10" />

      <section className="mb-10">
        <p className="text-sm font-semibold uppercase tracking-wider text-[#1a2a44] mb-5">
          Your account
        </p>

        <div className="space-y-6">
          <div>
            <p className="font-semibold text-gray-900 mb-1">
              How do I change my email address?
            </p>
            <p className="text-gray-700 font-light leading-relaxed">
              Email us at{' '}
              <a
                href="mailto:hello@myrealtyline.com?subject=Email%20Address%20Change"
                className="text-[#1a2a44] underline underline-offset-2"
              >
                hello@myrealtyline.com
              </a>{' '}
              from your current email address and let us know the new one.
              We&apos;ll update your account and reverify.
            </p>
          </div>

          <div>
            <p className="font-semibold text-gray-900 mb-1">
              How do I delete my account?
            </p>
            <p className="text-gray-700 font-light leading-relaxed">
              Email{' '}
              <a
                href="mailto:hello@myrealtyline.com?subject=Account%20Deletion%20Request"
                className="text-[#1a2a44] underline underline-offset-2"
              >
                hello@myrealtyline.com
              </a>{' '}
              with the subject line &ldquo;Account Deletion Request.&rdquo; We&apos;ll
              confirm and then deactivate your account within 7 business days.
            </p>
          </div>

          <div>
            <p className="font-semibold text-gray-900 mb-1">
              What happens to my data if I delete my account?
            </p>
            <p className="text-gray-700 font-light leading-relaxed">
              Your personal information is removed from active systems. Some
              records may be retained for accounting, legal, or audit purposes —
              full details are in our{' '}
              <a
                href="/privacy"
                className="text-[#1a2a44] underline underline-offset-2"
              >
                Privacy Notice
              </a>
              .
            </p>
          </div>
        </div>
      </section>

      <hr className="border-gray-200 my-10" />

      <section className="mb-10">
        <p className="text-sm font-semibold uppercase tracking-wider text-[#1a2a44] mb-5">
          Troubleshooting
        </p>

        <div className="space-y-6">
          <div>
            <p className="font-semibold text-gray-900 mb-1">
              My magic link didn&apos;t arrive.
            </p>
            <p className="text-gray-700 font-light leading-relaxed">
              Check your spam folder first — magic links sometimes get caught
              there. If it&apos;s still missing after a few minutes, request a
              new one. Each new request invalidates the previous link.
            </p>
          </div>

          <div>
            <p className="font-semibold text-gray-900 mb-1">
              My magic link says it&apos;s expired or invalid.
            </p>
            <p className="text-gray-700 font-light leading-relaxed">
              Links expire after a short time for security, and each one can
              only be used once. If yours expired, just go back to the sign-in
              screen and request a new one.
            </p>
          </div>

          <div>
            <p className="font-semibold text-gray-900 mb-1">
              I&apos;m having trouble signing in.
            </p>
            <p className="text-gray-700 font-light leading-relaxed">
              Email{' '}
              <a
                href="mailto:hello@myrealtyline.com?subject=Sign-in%20Issue"
                className="text-[#1a2a44] underline underline-offset-2"
              >
                hello@myrealtyline.com
              </a>{' '}
              with the email address you&apos;re trying to use, and we&apos;ll
              look into it.
            </p>
          </div>

          <div>
            <p className="font-semibold text-gray-900 mb-1">
              I found a bug or have a feature suggestion.
            </p>
            <p className="text-gray-700 font-light leading-relaxed">
              We&apos;d love to hear it. Email{' '}
              <a
                href="mailto:hello@myrealtyline.com?subject=App%20Feedback"
                className="text-[#1a2a44] underline underline-offset-2"
              >
                hello@myrealtyline.com
              </a>{' '}
              and include a screenshot if you can.
            </p>
          </div>
        </div>
      </section>

      <footer className="mt-12 pt-8 border-t border-gray-200">
        <p className="text-sm text-gray-500 font-light">
          Still stuck? Email{' '}
          <a
            href="mailto:hello@myrealtyline.com"
            className="text-[#1a2a44] font-medium underline underline-offset-2"
          >
            hello@myrealtyline.com
          </a>{' '}
          and a real person will write back.
        </p>
      </footer>
    </main>
  );
}
