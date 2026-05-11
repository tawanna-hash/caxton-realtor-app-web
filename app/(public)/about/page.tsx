export const metadata = {
  title: 'About Us — Caxton Publications',
  description:
    'Caxton Publications has been putting a face on real estate since 1995. Publishers of RealtyLine (Austin) and Newsline San Antonio.',
};

export default function AboutPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-12 md:py-16">
      <header className="mb-10">
        <p className="text-sm uppercase tracking-[0.25em] text-gray-500 font-medium mb-3">
          About Us
        </p>
        <h1 className="text-3xl md:text-4xl font-semibold text-gray-900 tracking-tight">
          Putting A Face on Real Estate since 1995.
        </h1>
      </header>

      <section className="space-y-6 text-gray-700 text-base md:text-lg leading-relaxed font-light">
        <p>
          Caxton Publications, Inc. is an independent, family-run publisher serving
          the Texas real estate community. We produce two monthly magazines —{' '}
          <strong className="font-semibold text-gray-900">RealtyLine</strong> in
          Austin, founded in 1995, and{' '}
          <strong className="font-semibold text-gray-900">Newsline San Antonio</strong>,
          originally founded in 1982 and relaunched in 2025. Together our
          publications reach thousands of licensed REALTORS®, brokers, builders,
          lenders, and industry partners across Central and South Texas.
        </p>

        <p>
          Our coverage focuses on the people behind the transactions — the agents
          closing deals, the brokerages shaping the market, the builders opening
          new communities, and the associations advocating for the profession.
          Editorial work for both publications is led on the desk by Caroline
          Carver, Assistant Editor, working alongside our regular contributors
          and photographers across both markets.
        </p>

        <p>
          <strong className="font-semibold text-gray-900">HarmonyOne</strong>{' '}
          — launched in May 2026 — is the next chapter. It brings everything
          our print readers love about RealtyLine and Newsline into a single
          mobile experience: latest news, upcoming events, our digital
          magazine archive, builder inventory, giveaways, and direct access to
          the businesses that advertise with us. It is free to use, and it
          always will be.
        </p>

        <hr className="border-gray-200 my-10" />

        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-4">
            Partnerships &amp; memberships
          </p>
          <p className="text-base text-gray-700 leading-relaxed font-light mb-6">
            We are proud members of and active partners with the organizations
            that shape Texas real estate:
          </p>

          <div className="space-y-6 text-base">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-gray-900 mb-2">
                REALTOR® associations
              </p>
              <ul className="space-y-1 text-gray-700 font-light">
                <li>National Association of REALTORS® (NAR)</li>
                <li>Texas REALTORS®</li>
                <li>Austin Board of REALTORS® (ABoR)</li>
                <li>San Antonio Board of REALTORS® (SABOR)</li>
                <li>Five Points Board of REALTORS</li>
              </ul>
            </div>

            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-gray-900 mb-2">
                Home builder associations
              </p>
              <ul className="space-y-1 text-gray-700 font-light">
                <li>Home Builders Association of Greater Austin</li>
                <li>Greater San Antonio Builders Association (GSABA)</li>
              </ul>
            </div>

            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-gray-900 mb-2">
                Affinity groups
              </p>
              <ul className="space-y-1 text-gray-700 font-light">
                <li>
                  Women&apos;s Council of REALTORS® Austin Chapter
                  <span className="text-sm text-gray-500 italic">
                    {' '}— RealtyLine, honorary member
                  </span>
                </li>
                <li>Women&apos;s Council of REALTORS® San Antonio Chapter</li>
                <li>
                  National Association of Hispanic Real Estate Professionals
                  (NAHREP) San Antonio Chapter
                </li>
              </ul>
            </div>
          </div>
        </div>

        <hr className="border-gray-200 my-10" />

        <div className="bg-gray-50 border-l-4 border-[#1a2a44] px-6 py-5">
          <p className="text-base font-medium text-gray-900 mb-2">
            A note from our team
          </p>
          <p className="text-base text-gray-700 leading-relaxed font-light italic">
            &ldquo;Our job has never been to chase the latest market headline.
            It&apos;s to celebrate the people doing the work — and to make sure
            the right introductions happen between the agents, builders, and
            businesses who serve them. That mission is what RealtyLine has always
            been about, and it&apos;s what this app is built on.&rdquo;
          </p>
          <p className="text-sm text-gray-500 mt-3 font-medium">
            — Tawanna Verock, Associate Publisher &amp; Co-Owner
          </p>
        </div>

        <div className="mt-10">
          <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-4">
            Leadership
          </p>
          <dl className="space-y-3 text-base text-gray-700">
            <div className="flex flex-col sm:flex-row sm:gap-3">
              <dt className="font-semibold text-gray-900 sm:w-48">Doren Carver</dt>
              <dd className="font-light">Publisher &amp; Co-Owner</dd>
            </div>
            <div className="flex flex-col sm:flex-row sm:gap-3">
              <dt className="font-semibold text-gray-900 sm:w-48">Tawanna Verock</dt>
              <dd className="font-light">Associate Publisher &amp; Co-Owner</dd>
            </div>
            <div className="flex flex-col sm:flex-row sm:gap-3">
              <dt className="font-semibold text-gray-900 sm:w-48">Caroline Carver</dt>
              <dd className="font-light">Assistant Editor</dd>
            </div>
          </dl>
        </div>
      </section>

      <footer className="mt-12 pt-8 border-t border-gray-200">
        <p className="text-sm text-gray-500 font-light">
          Questions, story ideas, or partnership inquiries?{' '}
          <a
            href="mailto:hello@myrealtyline.com"
            className="text-[#1a2a44] font-medium underline underline-offset-2"
          >
            hello@myrealtyline.com
          </a>
        </p>
      </footer>
    </main>
  );
}
