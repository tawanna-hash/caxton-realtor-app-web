import Link from 'next/link';
import { Crown, ExternalLink, Palette } from 'lucide-react';

export const metadata = {
  title: 'Platinum Tools | Realty News Now',
  description: 'Premium subscriber tools from Realty News Now.',
};

export default function RnnPlatinumPage() {
  return (
    <main className="mx-auto max-w-5xl px-5 py-10 sm:py-14">
      <section className="rounded-2xl bg-[#301D5D] px-6 py-10 text-white sm:px-10">
        <Crown size={30} />
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
          Open access
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Platinum Tools</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-white/75">Your professional tools are ready.</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/testimonial-hub" className="inline-flex min-h-11 items-center gap-2 rounded-md bg-white px-5 text-sm font-semibold text-[#301D5D]">
            Open Testimonials HUB <ExternalLink size={15} />
          </Link>
          <Link href="/custom-designer" className="inline-flex min-h-11 items-center gap-2 rounded-md border border-white/30 px-5 text-sm font-semibold text-white hover:bg-white/10">
            <Palette size={15} /> Open Custom Designer
          </Link>
        </div>
      </section>
    </main>
  );
}
