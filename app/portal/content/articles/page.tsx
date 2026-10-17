import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentPortalUser } from '@/lib/server/portal-session';
import { getPartnerArticles } from '@/lib/server/portal-content';
import { ensureSchema } from '@/lib/db';
import { PageIntro } from '@/components/portal/Mint';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function fmt(d: string): string {
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, day ?? 1)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export default async function PortalArticlesPage() {
  const user = await getCurrentPortalUser();
  if (!user) redirect('/portal/error?code=auth');
  await ensureSchema();
  const articles = await getPartnerArticles(user.advertiser_id);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/portal/content" className="text-sm text-[#42277C] hover:underline">&larr; My Content</Link>
        <PageIntro title="Featured articles">Articles tagged to you appear here automatically once published.</PageIntro>
      </div>
      {articles.length === 0 ? (
        <div className="rounded-md border border-dashed border-gray-300 p-8 text-center text-gray-500">No featured articles yet.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {articles.map((a) => {
            const body = (
              <>
                {a.imageUrl && (
                  <div className="aspect-[16/9] bg-gray-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.imageUrl} alt={a.title} className="h-full w-full object-cover" loading="lazy" />
                  </div>
                )}
                <div className="p-4">
                  <div className="text-xs text-gray-500">{fmt(a.publishedAt)}{a.author ? ` - ${a.author}` : ''}</div>
                  <div className="font-serif text-lg text-gray-900 mt-0.5">{a.title}</div>
                  {a.excerpt && <p className="text-sm text-gray-600 mt-1 line-clamp-3">{a.excerpt}</p>}
                </div>
              </>
            );
            const cls = 'block rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm transition hover:shadow-md hover:border-[#301D5D]/40';
            return a.articleUrl ? (
              <a key={a.id} href={a.articleUrl} target="_blank" rel="noopener noreferrer" className={cls}>{body}</a>
            ) : (
              <div key={a.id} className={cls}>{body}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}
