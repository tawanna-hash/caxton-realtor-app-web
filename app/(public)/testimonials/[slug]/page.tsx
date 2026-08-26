import { notFound } from 'next/navigation';
import { ExternalLink, Quote, Star, Video } from 'lucide-react';
import { getPublicShowcase } from '@/lib/server/testimonials-store';
import { PUBLICATIONS } from '@/lib/publications';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Ctx) {
  const { slug } = await params;
  const showcase = await getPublicShowcase(slug);
  if (!showcase) return { title: 'Testimonials | Realty News Now' };
  return {
    title: `${showcase.profile.display_name} Testimonials | Realty News Now`,
    description: showcase.profile.bio || `Client testimonials for ${showcase.profile.display_name}.`,
  };
}

export default async function TestimonialShowcasePage({ params }: Ctx) {
  const { slug } = await params;
  const showcase = await getPublicShowcase(slug);
  if (!showcase) notFound();
  const { profile, testimonials } = showcase;

  return (
    <main className="bg-[#faf8f4]">
      <section className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            {profile.headshot_url ? (
              // Profile images are owner-supplied Blob URLs with dynamic hosts.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.headshot_url} alt={profile.display_name} className="h-24 w-24 rounded-full object-cover shadow-sm" />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#301D5D] text-2xl font-semibold text-white">{profile.display_name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('')}</div>
            )}
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#301D5D]">Client stories</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-950">{profile.display_name}</h1>
              {(profile.professional_title || profile.company) && <p className="mt-2 text-base text-gray-600">{[profile.professional_title, profile.company].filter(Boolean).join(' · ')}</p>}
              {profile.bio && <p className="mt-4 max-w-2xl text-base leading-7 text-gray-600">{profile.bio}</p>}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-950">What clients say</h2>
            <p className="mt-1 text-sm text-gray-500">{testimonials.length} published testimonial{testimonials.length === 1 ? '' : 's'}</p>
          </div>
        </div>

        {testimonials.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-stone-300 bg-white px-6 py-14 text-center">
            <Quote className="mx-auto text-stone-300" size={34} />
            <p className="mt-4 text-sm text-gray-600">Published client stories will appear here.</p>
          </div>
        ) : (
          <div className="mt-7 columns-1 gap-5 md:columns-2">
            {testimonials.map((testimonial) => (
              <article key={testimonial.id} className="mb-5 break-inside-avoid rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <Quote size={22} className="text-[#301D5D]" />
                  {testimonial.format === 'video' && <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600"><Video size={13} /> Video</span>}
                </div>
                {testimonial.rating && <div className="mt-4 flex gap-0.5 text-amber-500" aria-label={`${testimonial.rating} out of 5 stars`}>{Array.from({ length: testimonial.rating }).map((_, index) => <Star key={index} size={15} fill="currentColor" />)}</div>}
                <blockquote className="mt-4 text-lg leading-8 text-gray-800">“{testimonial.quote}”</blockquote>
                {testimonial.format === 'video' && testimonial.video_url && <a href={testimonial.video_url} target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#301D5D] underline underline-offset-4"><Video size={16} /> Watch testimonial</a>}
                <footer className="mt-5 border-t border-stone-100 pt-4">
                  <div className="flex items-center gap-3">
                    {testimonial.image_url && (
                      // Client images are owner-supplied Blob URLs with dynamic hosts.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={testimonial.image_url} alt="" className="h-11 w-11 rounded-full object-cover" loading="lazy" />
                    )}
                    <div>
                      <div className="text-sm font-semibold text-gray-950">{testimonial.client_name}</div>
                      {(testimonial.client_title || testimonial.client_company) && <div className="mt-0.5 text-xs text-gray-500">{[testimonial.client_title, testimonial.client_company].filter(Boolean).join(', ')}</div>}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    <span>{testimonial.is_global ? 'All markets' : testimonial.markets.map((id) => PUBLICATIONS.find((publication) => publication.id === id)?.market).filter(Boolean).join(', ')}</span>
                    {testimonial.source_url && <a href={testimonial.source_url} target="_blank" rel="noreferrer" aria-label="View original testimonial" className="inline-flex min-h-11 items-center gap-1 font-medium text-[#301D5D]"><ExternalLink size={13} /> Original</a>}
                  </div>
                </footer>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
