// app/(public)/newsletter/page.tsx
//
// Public landing page for the weekly digital newsletter. Distinct from
// /subscribe (which is for the print magazine). Linked from the public nav
// drawer ("Digital Newsletters") and from every inline NewsletterCTA's
// "All Newsletters" link.

import PageTitle from '@/components/ui/PageTitle';
import NewsletterCTA from '@/components/NewsletterCTA';

export const metadata = {
  title: 'Newsletter — RealtyLine & Newsline',
  description: 'Sign up for our free weekly newsletter. Stay current on new builders, communities, inventory, giveaways, and events.',
};

export default function NewsletterLandingPage() {
  return (
    <div className="max-w-3xl mx-auto px-5 py-10">
      <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
        Newsletter
      </p>
      <PageTitle>The Weekly Newsletter</PageTitle>
      <p className="text-base text-gray-700 font-light leading-relaxed max-w-3xl mb-10">
        Every Friday. One short email. Everything we published that week —
        new builders, communities, inventory drops, giveaways, and events —
        in one place.
      </p>

      <div className="mb-12">
        <NewsletterCTA source="newsletter_landing" variant="card" />
      </div>

      <section className="mb-12">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What you&rsquo;ll get</h2>
        <ul className="space-y-3 text-base text-gray-700 font-light leading-relaxed">
          <li className="flex gap-3">
            <span className="text-gray-400">&bull;</span>
            <span>
              <strong className="font-medium text-gray-900">New builders &amp; communities.</strong>{' '}
              First look at every fresh master-plan and builder that joins the directory.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-gray-400">&bull;</span>
            <span>
              <strong className="font-medium text-gray-900">Inventory drops.</strong>{' '}
              Move-in-ready homes added that week, with prices, square footage, and addresses.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-gray-400">&bull;</span>
            <span>
              <strong className="font-medium text-gray-900">Events.</strong>{' '}
              Realtor mixers, lunch &amp; learns, builder open houses on the calendar.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-gray-400">&bull;</span>
            <span>
              <strong className="font-medium text-gray-900">Giveaways.</strong>{' '}
              New entries, draw dates, winners.
            </span>
          </li>
        </ul>
      </section>

      <section className="mb-12 border-t border-gray-200 pt-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Choose your edition</h2>
        <p className="text-base text-gray-700 font-light leading-relaxed mb-4">
          We publish two newsletters. Pick the one for your market &mdash; or
          switch publications from the nav drawer to subscribe to both.
        </p>
        <ul className="space-y-2 text-sm text-gray-700">
          <li>
            <strong className="font-medium text-gray-900">RealtyLine</strong> &mdash; Austin metro
          </li>
          <li>
            <strong className="font-medium text-gray-900">Newsline</strong> &mdash; San Antonio metro
          </li>
        </ul>
      </section>

      <p className="text-xs text-gray-500 leading-relaxed">
        By subscribing you agree to receive weekly emails from Realty News Now.
        Unsubscribe anytime with one click. See our{' '}
        <a href="/privacy" className="underline">Privacy Notice</a>.
      </p>
    </div>
  );
}
