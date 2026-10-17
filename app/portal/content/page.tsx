// app/portal/content/page.tsx — card-style hub for partner content.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentPortalUser } from '@/lib/server/portal-session';
import { getPartnerContentCounts } from '@/lib/server/portal-content';
import { ensureSchema } from '@/lib/db';
import { PageIntro, IconSquare, type MintTone } from '@/components/portal/Mint';
import { BookOpen, Camera, Building2, MapPin, Newspaper, Users } from 'lucide-react';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function PortalContentHub() {
  const user = await getCurrentPortalUser();
  if (!user) redirect('/portal/error?code=auth');
  await ensureSchema();
  const c = await getPartnerContentCounts(user.advertiser_id, user.name, user.publication);

  const cards: { href: string; title: string; blurb: string; stat: string; auto: boolean; tone: MintTone; Icon: typeof BookOpen }[] = [
    { href: '/portal/content/issues', title: 'Monthly issues', blurb: 'Issues you appear in, with your page numbers.', stat: `${c.issues} issue${c.issues === 1 ? '' : 's'}`, auto: true, tone: 'purple', Icon: BookOpen },
    { href: '/portal/content/events', title: 'Event images', blurb: 'Photos tagged to you, organized by month.', stat: `${c.eventPhotos} photos in ${c.eventMonths} folders`, auto: true, tone: 'green', Icon: Camera },
    { href: '/portal/content/articles', title: 'Featured articles', blurb: 'Articles published about you.', stat: `${c.articles} articles`, auto: true, tone: 'red', Icon: Newspaper },
    { href: '/portal/content/logos', title: 'Logo files', blurb: 'Your approved logos. Upload and manage.', stat: `${c.logos} sets`, auto: false, tone: 'blue', Icon: Building2 },
    { href: '/portal/content/locations', title: 'Locations', blurb: 'Offices and communities.', stat: `${c.locations} locations`, auto: false, tone: 'green', Icon: MapPin },
    { href: '/portal/content/staff', title: 'Staff', blurb: 'People we should know and feature.', stat: `${c.staff} people`, auto: false, tone: 'purple', Icon: Users },
  ];

  return (
    <div className="space-y-6">
      <PageIntro title="My Content">Issues, event images, and articles update automatically as we publish and tag them for you.</PageIntro>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Link key={card.href} href={card.href}
            className="group rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-[#301D5D]/40 hover:shadow-md">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <IconSquare tone={card.tone} size="lg"><card.Icon className="h-6 w-6" /></IconSquare>
                <h2 className="!text-lg !font-normal !text-gray-800">{card.title}</h2>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${card.auto ? 'bg-[#F0EBFA] text-[#301D5D]' : 'bg-gray-100 text-gray-600'}`}>
                {card.auto ? 'Automatic' : 'You manage'}
              </span>
            </div>
            <p className="mt-2 text-sm text-gray-600">{card.blurb}</p>
            <div className="mt-4 text-sm font-medium text-[#301D5D]">{card.stat} <span aria-hidden className="inline-block transition group-hover:translate-x-0.5">&rarr;</span></div>
          </Link>
        ))}
      </div>
    </div>
  );
}
