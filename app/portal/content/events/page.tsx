import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentPortalUser } from '@/lib/server/portal-session';
import { getPartnerEventMonths } from '@/lib/server/portal-content';
import { ensureSchema } from '@/lib/db';
import { PageIntro } from '@/components/portal/Mint';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function PortalEventImagesPage() {
  const user = await getCurrentPortalUser();
  if (!user) redirect('/portal/error?code=auth');
  await ensureSchema();
  const months = await getPartnerEventMonths(user.advertiser_id, user.name);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/portal/content" className="text-sm text-[#42277C] hover:underline">&larr; My Content</Link>
        <PageIntro title="Event images">Photos tagged to you appear here automatically, organized in monthly folders. Click a photo to open the full size.</PageIntro>
      </div>
      {months.length === 0 ? (
        <div className="rounded-md border border-dashed border-gray-300 p-8 text-center text-gray-500">No event photos tagged to you yet.</div>
      ) : (
        <div className="space-y-4">
          {months.map((m, idx) => (
            <details key={m.monthKey} open={idx === 0} className="rounded-xl border border-gray-200 bg-white shadow-sm">
              <summary className="cursor-pointer list-none px-5 py-4 flex items-center justify-between">
                <span className="font-serif text-lg text-gray-900">{m.monthLabel}</span>
                <span className="rounded-full bg-[#F0EBFA] text-[#301D5D] px-2 py-0.5 text-[11px] font-medium">{m.photos.length} photo{m.photos.length === 1 ? '' : 's'}</span>
              </summary>
              <div className="px-5 pb-5 grid gap-3 grid-cols-2 md:grid-cols-4">
                {m.photos.map((p) => (
                  <a key={p.id} href={p.imageUrl} target="_blank" rel="noopener noreferrer" className="block group">
                    <div className="aspect-square overflow-hidden rounded-lg bg-gray-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.thumbnailUrl ?? p.imageUrl} alt={p.title} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
                    </div>
                    <div className="mt-1 text-xs text-gray-700 truncate">{p.title}</div>
                  </a>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
