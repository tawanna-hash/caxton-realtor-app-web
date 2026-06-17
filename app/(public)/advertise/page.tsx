import Link from 'next/link';
import PageTitle from '@/components/ui/PageTitle';
export const metadata = {
  title: 'Advertise with Us — Realty News Now',
  description:
    'Print and digital advertising across RealtyLine Austin and Newsline San Antonio — reaching 89,000+ Texas real estate professionals.',
};

export default function AdvertisePage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-12 md:py-16">
      <header className="mb-10">
        <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
          Advertise
        </p>
        <p className="text-sm uppercase tracking-[0.18em] text-gray-700 font-semibold mb-4">
          Print {'\u00b7'} Digital {'\u00b7'} Social {'\u00b7'} Mobile.{' '}
          <span className="text-gray-500 font-normal normal-case tracking-normal">
            One powerful marketing platform.
          </span>
        </p>
        <PageTitle>
          Reach our audience wherever they are
        </PageTitle>
        <p className="text-base text-gray-700 font-light leading-relaxed max-w-3xl">
          Whether they{'\u2019'}re reading our print edition, browsing our
          digital replica, engaging on social media, or accessing content
          through our mobile web app, your brand stays visible across every
          touchpoint. Our integrated media platform delivers consistent
          exposure and meaningful engagement, ensuring your message reaches
          readers when, where, and how they prefer to consume information.
        </p>
      </header>

      <section className="mb-12 rounded-2xl border border-purple-200 bg-gradient-to-br from-purple-50 to-fuchsia-50 p-6 md:p-7">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-purple-700 font-semibold mb-2">
              New {'·'} Self-service portal
            </p>
            <h2 className="font-serif text-2xl text-gray-900 mb-1" style={{ fontFamily: 'Georgia, serif' }}>
              Buy a placement in two minutes.
            </h2>
            <p className="text-sm text-gray-700 leading-relaxed max-w-xl">
              Six digital ad formats from $200, pick your market and dates,
              instant checkout {'—'} no sales call required.
            </p>
          </div>
          <Link
            href="/advertise/portal"
            className="shrink-0 inline-flex items-center gap-2 rounded-lg bg-purple-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-purple-800 transition"
          >
            Open self-service portal
            <span aria-hidden>{'→'}</span>
          </Link>
        </div>
      </section>

      <section className="mb-12">
        <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-5">
          Our combined audience
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="border border-gray-200 px-4 py-5">
            <p className="text-3xl font-semibold text-[#1a2a44] tracking-tight">
              43K
            </p>
            <p className="text-xs uppercase tracking-wider text-gray-500 mt-1 font-medium">
              RealtyLine
              <br />
              email subscribers
            </p>
          </div>
          <div className="border border-gray-200 px-4 py-5">
            <p className="text-3xl font-semibold text-[#1a2a44] tracking-tight">
              21K
            </p>
            <p className="text-xs uppercase tracking-wider text-gray-500 mt-1 font-medium">
              RealtyLine
              <br />
              print readership
            </p>
          </div>
          <div className="border border-gray-200 px-4 py-5">
            <p className="text-3xl font-semibold text-[#3D0740] tracking-tight">
              11K
            </p>
            <p className="text-xs uppercase tracking-wider text-gray-500 mt-1 font-medium">
              Newsline San Antonio
              <br />
              email subscribers
            </p>
          </div>
          <div className="border border-gray-200 px-4 py-5">
            <p className="text-3xl font-semibold text-[#3D0740] tracking-tight">
              14K
            </p>
            <p className="text-xs uppercase tracking-wider text-gray-500 mt-1 font-medium">
              Newsline San Antonio
              <br />
              print readership
            </p>
          </div>
        </div>
        <p className="text-sm text-gray-500 mt-4 font-light italic">
          Active REALTORS®, brokers, builders, lenders, title professionals,
          and industry partners across Austin, San Antonio, and surrounding
          markets.
        </p>
      </section>

      <hr className="border-gray-200 my-12" />

      <section className="mb-12">
        <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-5">
          What every partnership includes
        </p>
        <p className="text-base text-gray-700 leading-relaxed font-light mb-6">
          Our packages are built around exposure plus engagement {'\u2014'} we
          don&apos;t just place an ad and walk away. Every partner gets a mix
          of these editorial and audience perks alongside their paid placements:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 text-base">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-gray-900 mb-1">
              Featured advertiser article
            </p>
            <p className="text-gray-700 font-light leading-relaxed">
              Our editorial team interviews you or your team and publishes a
              feature piece on your people, products, or services.
            </p>
          </div>

          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-gray-900 mb-1">
              Event coverage
            </p>
            <p className="text-gray-700 font-light leading-relaxed">
              We send a photographer to your events and capture live Facebook
              coverage {'\u2014'} turning a single event into ongoing marketing
              assets.
            </p>
          </div>

          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-gray-900 mb-1">
              Press release distribution
            </p>
            <p className="text-gray-700 font-light leading-relaxed">
              Submit press releases to be reviewed and run in print and digital
              issues alongside our editorial coverage.
            </p>
          </div>

          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-gray-900 mb-1">
              Unlimited event calendar
            </p>
            <p className="text-gray-700 font-light leading-relaxed">
              Add as many of your events as you want to our public event
              calendar {'\u2014'} open houses, CE classes, mixers, anything
              you&apos;re hosting.
            </p>
          </div>

          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-gray-900 mb-1">
              Builder inventory inclusion
            </p>
            <p className="text-gray-700 font-light leading-relaxed">
              Builders and developers can have current inventory featured in
              our weekly e-Blast to subscribers actively shopping the market.
            </p>
          </div>

          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-gray-900 mb-1">
              Design support
            </p>
            <p className="text-gray-700 font-light leading-relaxed">
              Adobe InDesign templates for print, plus banner specs and design
              guidance for digital, social, and mobile {'\u2014'} so your
              creative reads consistently across every channel.
            </p>
          </div>
        </div>
      </section>

      <hr className="border-gray-200 my-12" />

      <section className="mb-12">
        <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
          Where your ads run
        </p>
        <h2
          className="font-serif text-2xl md:text-3xl text-gray-900 leading-tight mb-3"
          style={{ fontFamily: 'Georgia, serif' }}
        >
          Four channels. One integrated buy.
        </h2>
        <p className="text-base text-gray-700 leading-relaxed font-light mb-8 max-w-3xl">
          Mix and match across all four {'\u2014'} or start with the channel
          that fits your audience and add the rest later. Every channel is
          priced independently in the media kit.
        </p>

        <div className="space-y-6">
          {/* PRINT */}
          <div className="border border-gray-200 p-6 md:p-7">
            <div className="flex items-baseline justify-between gap-3 mb-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium">
                  Channel 01
                </p>
                <h3
                  className="font-serif text-xl text-gray-900 mt-1"
                  style={{ fontFamily: 'Georgia, serif' }}
                >
                  Print magazine
                </h3>
              </div>
              <p className="text-sm text-gray-500 font-light italic shrink-0">
                From $880
              </p>
            </div>
            <p className="text-sm text-gray-700 font-light leading-relaxed mb-4">
              Monthly RealtyLine and Newsline San Antonio editions,
              hand-delivered and racked across Central and South Texas.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="border border-gray-100 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-900">
                  Full Page
                </p>
                <p className="text-xs text-gray-700 font-light mt-1">
                  10&Prime; {'\u00d7'} 11.0833&Prime;
                </p>
              </div>
              <div className="border border-gray-100 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-900">
                  Half Page
                </p>
                <p className="text-xs text-gray-700 font-light mt-1">
                  10&Prime; {'\u00d7'} 5.25&Prime; horizontal
                  <br />
                  4.8333&Prime; {'\u00d7'} 11.0833&Prime; vertical
                </p>
              </div>
              <div className="border border-gray-100 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-900">
                  Quarter Page
                </p>
                <p className="text-xs text-gray-700 font-light mt-1">
                  4.8333&Prime; {'\u00d7'} 5.25&Prime;
                </p>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-3 font-light italic">
              Adobe InDesign templates provided for any size. Print runs in
              both the monthly issue and the clickable digital replica.
            </p>
          </div>

          {/* DIGITAL */}
          <div className="border border-gray-200 p-6 md:p-7">
            <div className="flex items-baseline justify-between gap-3 mb-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium">
                  Channel 02
                </p>
                <h3
                  className="font-serif text-xl text-gray-900 mt-1"
                  style={{ fontFamily: 'Georgia, serif' }}
                >
                  Digital + email
                </h3>
              </div>
              <p className="text-sm text-gray-500 font-light italic shrink-0">
                From $200/week
              </p>
            </div>
            <p className="text-sm text-gray-700 font-light leading-relaxed mb-4">
              17 digital placements across realtynewsnow.app plus dedicated
              e-Blasts to 54K+ active subscribers. Every digital impression is
              click-tracked.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="border border-gray-100 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-900">
                  Web banners
                </p>
                <p className="text-xs text-gray-700 font-light mt-1">
                  728{'\u00d7'}90, 300{'\u00d7'}250, 300{'\u00d7'}600 {'\u00b7'}
                  article top, sidebar, mid-inline, bottom
                </p>
              </div>
              <div className="border border-gray-100 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-900">
                  Feed cards
                </p>
                <p className="text-xs text-gray-700 font-light mt-1">
                  1080{'\u00d7'}600 native, every 6th feed card,
                  marked SPONSORED
                </p>
              </div>
              <div className="border border-gray-100 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-900">
                  Newsletter banner
                </p>
                <p className="text-xs text-gray-700 font-light mt-1">
                  600{'\u00d7'}200, top of every weekly e-Blast send
                </p>
              </div>
              <div className="border border-gray-100 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-900">
                  Dedicated e-Blast
                </p>
                <p className="text-xs text-gray-700 font-light mt-1">
                  Exclusive email to the full subscriber list {'\u2014'} your
                  design, full inbox real estate
                </p>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-3 font-light italic">
              <Link href="/advertise/placements" className="underline underline-offset-2">
                Browse all 17 digital placements
              </Link>{' '}
              with live pricing in the self-service portal.
            </p>
          </div>

          {/* SOCIAL */}
          <div className="border border-gray-200 p-6 md:p-7">
            <div className="flex items-baseline justify-between gap-3 mb-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium">
                  Channel 03
                </p>
                <h3
                  className="font-serif text-xl text-gray-900 mt-1"
                  style={{ fontFamily: 'Georgia, serif' }}
                >
                  Social
                </h3>
              </div>
              <p className="text-sm text-gray-500 font-light italic shrink-0">
                Included with packages
              </p>
            </div>
            <p className="text-sm text-gray-700 font-light leading-relaxed mb-4">
              Reach beyond our subscriber list through our highly engaged
              Facebook, Instagram, and LinkedIn audiences {'\u2014'} where
              Texas real estate professionals actually spend their time.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="border border-gray-100 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-900">
                  Branded post shares
                </p>
                <p className="text-xs text-gray-700 font-light mt-1">
                  Featured article + ad creative cross-posted across all three
                  networks
                </p>
              </div>
              <div className="border border-gray-100 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-900">
                  Live event coverage
                </p>
                <p className="text-xs text-gray-700 font-light mt-1">
                  Facebook Live + Instagram stories on the day of your event
                </p>
              </div>
              <div className="border border-gray-100 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-900">
                  Up to 4 event images
                </p>
                <p className="text-xs text-gray-700 font-light mt-1">
                  Published to Facebook, Instagram, and the website
                  (Pkg No. 2)
                </p>
              </div>
            </div>
          </div>

          {/* MOBILE */}
          <div className="border border-gray-200 p-6 md:p-7">
            <div className="flex items-baseline justify-between gap-3 mb-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium">
                  Channel 04
                </p>
                <h3
                  className="font-serif text-xl text-gray-900 mt-1"
                  style={{ fontFamily: 'Georgia, serif' }}
                >
                  Mobile web app
                </h3>
              </div>
              <p className="text-sm text-gray-500 font-light italic shrink-0">
                From $400/week
              </p>
            </div>
            <p className="text-sm text-gray-700 font-light leading-relaxed mb-4">
              Premium app-only placements that hit subscribers in the moment
              they open Realty News Now on their phone.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="border border-gray-100 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-900">
                  Splash / welcome
                </p>
                <p className="text-xs text-gray-700 font-light mt-1">
                  1080{'\u00d7'}1920 fullscreen, first session of the day
                </p>
              </div>
              <div className="border border-gray-100 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-900">
                  Push notification sponsor
                </p>
                <p className="text-xs text-gray-700 font-light mt-1">
                  Max 1 sponsored push per week {'\u00b7'} 256{'\u00d7'}256 icon
                </p>
              </div>
              <div className="border border-gray-100 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-900">
                  Mobile sticky banner
                </p>
                <p className="text-xs text-gray-700 font-light mt-1">
                  320{'\u00d7'}50 / 320{'\u00d7'}100 persistent at bottom
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <hr className="border-gray-200 my-12" />

      <section className="mb-12">
        <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-5">
          Frequently asked
        </p>

        <div className="space-y-6 text-base">
          <div>
            <p className="font-semibold text-gray-900 mb-1">
              Can I request a specific ad placement?
            </p>
            <p className="text-gray-700 font-light leading-relaxed">
              Yes. Premium positions and position guarantees are available.
              Details on availability and pricing are in the media kit.
            </p>
          </div>

          <div>
            <p className="font-semibold text-gray-900 mb-1">
              Do you offer pre-payment discounts?
            </p>
            <p className="text-gray-700 font-light leading-relaxed">
              Yes. Contracts paid in full at signing receive a pre-payment
              discount. Details are in the media kit.
            </p>
          </div>

          <div>
            <p className="font-semibold text-gray-900 mb-1">
              What are the 2026 print deadlines?
            </p>
            <p className="text-gray-700 font-light leading-relaxed">
              Each magazine has its own monthly production schedule. Current
              deadlines are published at{' '}
              <a
                href="https://www.realtyline.us/2026-deadlines-2/"
                className="text-[#1a2a44] font-medium underline underline-offset-2"
                target="_blank"
                rel="noopener noreferrer"
              >
                realtyline.us/2026-deadlines
              </a>{' '}
              and{' '}
              <a
                href="https://www.newslinesa.com/2026-deadlines/"
                className="text-[#3D0740] font-medium underline underline-offset-2"
                target="_blank"
                rel="noopener noreferrer"
              >
                newslinesa.com/2026-deadlines
              </a>
              .
            </p>
          </div>

          <div>
            <p className="font-semibold text-gray-900 mb-1">
              Do you provide a design template?
            </p>
            <p className="text-gray-700 font-light leading-relaxed">
              Yes. We provide Adobe InDesign templates for advertisers who want
              to design in-house.
            </p>
          </div>

          <div>
            <p className="font-semibold text-gray-900 mb-1">
              What payment methods do you accept?
            </p>
            <p className="text-gray-700 font-light leading-relaxed">
              Check, ACH, Visa, MasterCard, and American Express. A small
              processing fee applies to credit card payments.
            </p>
          </div>

          <div>
            <p className="font-semibold text-gray-900 mb-1">
              How do I get rate information?
            </p>
            <p className="text-gray-700 font-light leading-relaxed">
              Rates depend on commitment length, ad size, and the package mix
              you choose. We&apos;ll send a full media kit with rates after you
              reach out — just email the publication you&apos;re interested in.
            </p>
          </div>
        </div>
      </section>

      <hr className="border-gray-200 my-12" />

      <section className="bg-gray-50 border-l-4 border-[#1a2a44] px-6 py-6 md:px-8 md:py-8">
        <p className="text-sm uppercase tracking-[0.2em] text-gray-700 font-medium mb-4">
          Request a media kit
        </p>
        <p className="text-base text-gray-700 leading-relaxed font-light mb-6">
          Tell us which publication, what your business does, and what
          you&apos;re hoping to accomplish. We&apos;ll send the current rates
          and a recommendation on which package fits.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-[#1a2a44] mb-2">
              RealtyLine — Austin
            </p>
            <a
              href="mailto:hello@myrealtyline.com?subject=Media%20Kit%20Request%20%E2%80%94%20RealtyLine"
              className="text-base font-medium text-[#1a2a44] underline underline-offset-2"
            >
              hello@myrealtyline.com
            </a>
          </div>

          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-[#3D0740] mb-2">
              Newsline San Antonio — San Antonio
            </p>
            <a
              href="mailto:hello@newslinesa.com?subject=Media%20Kit%20Request%20%E2%80%94%20Newsline"
              className="text-base font-medium text-[#3D0740] underline underline-offset-2"
            >
              hello@newslinesa.com
            </a>
          </div>
        </div>
      </section>

      <footer className="mt-12 pt-8 border-t border-gray-200">
        <p className="text-sm text-gray-500 font-light">
          Not sure which publication fits? Email either address above and
          we&apos;ll route you to the right team.
        </p>
      </footer>
    </main>
  );
}
