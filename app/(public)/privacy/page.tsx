import PageTitle from '@/components/ui/PageTitle';
export const metadata = {
  title: 'Privacy Notice — Realty News Now',
  description:
    'How Caxton Publications collects, uses, and protects information in Realty News Now.',
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
      <header className="mb-8 sm:mb-10">
        <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
          Privacy Notice
        </p>
        <PageTitle size="md">
          How we handle your information.
        </PageTitle>
        <p className="text-sm text-gray-500 font-light">
          Effective date: May 11, 2026
        </p>
      </header>

      <section className="space-y-8 text-gray-700 text-base leading-relaxed font-light">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Who we are</h2>
          <p>
            Caxton Publications, Inc. (&ldquo;Caxton,&rdquo; &ldquo;we,&rdquo;
            &ldquo;us&rdquo;) operates Realty News Now (the &ldquo;app&rdquo;) and publishes
            RealtyLine Austin and Newsline San Antonio. We are based in
            Texas. This notice describes the information we collect through the
            app and how we use it.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            Information we collect
          </h2>
          <p className="mb-3">When you use the app, we collect:</p>
          <ul className="space-y-2 ml-6 list-disc">
            <li>
              <strong className="font-semibold text-gray-900">Account information</strong>{' '}
              — your name and email address at sign-up. You may optionally
              tell us your role (REALTOR®, broker, lender, builder, consumer,
              etc.) so we can show you the most relevant content.
            </li>
            <li>
              <strong className="font-semibold text-gray-900">
                Notification preferences
              </strong>{' '}
              — the categories of push notifications and emails you opt into.
            </li>
            <li>
              <strong className="font-semibold text-gray-900">
                Device information
              </strong>{' '}
              — push notification tokens and basic device type for delivering
              notifications.
            </li>
            <li>
              <strong className="font-semibold text-gray-900">
                Usage information
              </strong>{' '}
              — sign-in timestamps, the pages you visit, and aggregate
              engagement data we use to improve the app.
            </li>
            <li>
              <strong className="font-semibold text-gray-900">
                Submissions
              </strong>{' '}
              — content you submit through forms such as giveaway entries,
              event RSVPs, or feedback.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            How we use your information
          </h2>
          <p className="mb-3">We use your information to:</p>
          <ul className="space-y-2 ml-6 list-disc">
            <li>Send you sign-in (magic link) emails.</li>
            <li>Deliver the notifications and content you opted into.</li>
            <li>
              Process your entries into giveaways, RSVPs to events, and similar
              submissions.
            </li>
            <li>
              Improve the app — fixing bugs, understanding which content is
              useful, identifying problems.
            </li>
            <li>Respond to your messages when you contact us.</li>
          </ul>
        </div>

        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            Who we share information with
          </h2>
          <p className="mb-3">
            <strong className="font-semibold text-gray-900">
              We do not sell, rent, or share your subscriber information with
              partners, sponsors, or any third party for marketing purposes.
            </strong>{' '}
            Your contact information stays with us.
          </p>
          <p className="mb-3">
            The only parties that receive any of your information are:
          </p>
          <ul className="space-y-2 ml-6 list-disc">
            <li>
              <strong className="font-semibold text-gray-900">
                Service providers
              </strong>{' '}
              we use to operate the app — including our email delivery
              provider, our cloud hosting providers, our push notification
              service, and our newsletter platform. These providers are bound
              to use your information only to provide their service to us.
            </li>
            <li>
              <strong className="font-semibold text-gray-900">
                Legal requests
              </strong>{' '}
              — when required by law, court order, or to protect our rights or
              the safety of our users.
            </li>
          </ul>
          <p className="mt-3">
            If you choose to enter a giveaway, RSVP to an event, or otherwise
            interact directly with an partner through a clearly labeled
            opt-in, only the information you provide in that specific
            interaction is shared with that partner — and only because you
            chose to share it.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            How long we keep your information
          </h2>
          <p>
            We keep account information as long as your account is active. If
            you delete your account, your personal information is removed from
            our active systems within a reasonable period. Some records may be
            retained longer to comply with legal, accounting, or audit
            obligations.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            Your choices
          </h2>
          <ul className="space-y-2 ml-6 list-disc">
            <li>
              <strong className="font-semibold text-gray-900">
                Access or update your information
              </strong>{' '}
              — email{' '}
              <a
                href="mailto:hello@myrealtyline.com"
                className="text-brand-700 underline underline-offset-2"
              >
                hello@myrealtyline.com
              </a>{' '}
              and we will respond.
            </li>
            <li>
              <strong className="font-semibold text-gray-900">
                Adjust notifications
              </strong>{' '}
              — manage push and email preferences from{' '}
              <span className="font-medium text-gray-900">
                Settings → Notification Preferences
              </span>{' '}
              in the app.
            </li>
            <li>
              <strong className="font-semibold text-gray-900">
                Delete your account
              </strong>{' '}
              — email us with &ldquo;Account Deletion Request&rdquo; in the
              subject line.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            Security
          </h2>
          <p>
            We use industry-standard safeguards to protect your information,
            including encrypted database connections, secure password-less
            authentication, and access controls on our systems. No method of
            transmission or storage is 100% secure, but we work to maintain
            reasonable protections.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            Children
          </h2>
          <p>
            Realty News Now is intended for adults interested in real estate news,
            content, and events in Austin and San Antonio.
            Children under 18 should not use the app without parental
            supervision. We do not knowingly collect personal information from
            anyone under 13. If we discover we have collected information from
            a child under 13, we will delete it as soon as possible. If you
            believe we have collected information from a child under 13,
            please contact us at{' '}
            <a
              href="mailto:hello@myrealtyline.com"
              className="text-brand-700 underline underline-offset-2"
            >
              hello@myrealtyline.com
            </a>
            .
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            Cookies and similar technology
          </h2>
          <p>
            Realty News Now uses cookies and similar technology only for what&apos;s
            needed to operate the app — keeping you signed in, remembering
            your notification preferences, and basic analytics to understand
            which content is useful. We do not use cookies to track you across
            other websites, build advertising profiles, or sell cookie data to
            third parties. You can control cookies through your browser
            settings, though some app features may not work properly if
            cookies are disabled.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            Business transfers
          </h2>
          <p>
            If Caxton Publications, Inc. is involved in a merger, acquisition,
            reorganization, or sale of assets, your information may be
            transferred as part of that transaction. We will notify you (by
            email and/or a notice in the app) before your information becomes
            subject to a different privacy policy. The acquiring entity would
            be required to honor the commitments we have made in this notice
            unless you are notified otherwise and given the opportunity to
            delete your account.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            State privacy rights
          </h2>
          <p>
            Residents of states with consumer privacy laws — including Texas,
            California, Colorado, Connecticut, Delaware, Iowa, Maryland,
            Minnesota, Montana, Nebraska, New Hampshire, New Jersey, Oregon,
            Tennessee, Utah, and Virginia — have rights to access, correct, or
            delete personal information, and to opt out of any sale or sharing
            of personal information. Because we don&apos;t sell or share
            subscriber information for marketing purposes (see above), there
            is nothing to opt out of in that respect. To exercise any other
            privacy rights, email{' '}
            <a
              href="mailto:hello@myrealtyline.com?subject=Privacy%20Request"
              className="text-brand-700 underline underline-offset-2"
            >
              hello@myrealtyline.com
            </a>{' '}
            and we&apos;ll respond within the timeframes required by your
            state&apos;s law.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            Changes to this notice
          </h2>
          <p>
            We may update this notice as our practices change or as required by
            law. Material changes will be communicated through the app or by
            email. The &ldquo;Effective date&rdquo; at the top will reflect the
            most recent revision.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            Contact us
          </h2>
          <p className="mb-4">
            Questions about this notice, requests to access or delete your
            information, or concerns about how your information is handled?
            Reach us any of these ways:
          </p>
          <div className="space-y-2 text-base">
            <p>
              <strong className="font-semibold text-gray-900">Email:</strong>{' '}
              <a
                href="mailto:hello@myrealtyline.com?subject=Privacy%20Request"
                className="text-brand-700 font-medium underline underline-offset-2"
              >
                hello@myrealtyline.com
              </a>
            </p>
            <p>
              <strong className="font-semibold text-gray-900">Phone:</strong>{' '}
              <a
                href="tel:+15129650057"
                className="text-brand-700 font-medium underline underline-offset-2"
              >
                (512) 965-0057
              </a>
            </p>
            <p>
              <strong className="font-semibold text-gray-900">Mail:</strong>
              <br />
              <span className="ml-0">
                Attn: Privacy &mdash; Caxton Publications, Inc.
                <br />
                P.O. Box 81366
                <br />
                Austin, Texas 78708-1366
              </span>
            </p>
          </div>
        </div>
      </section>
        </div>
    </main>
  );
}
