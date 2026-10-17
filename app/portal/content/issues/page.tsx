import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentPortalUser } from '@/lib/server/portal-session';
import { getPartnerIssues } from '@/lib/server/portal-content';
import { ensureSchema } from '@/lib/db';
import { PageIntro } from '@/components/portal/Mint';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function PortalIssuesPage() {
  const user = await getCurrentPortalUser();
  if (!user) redirect('/portal/error?code=auth');
  await ensureSchema();
  const issues = await getPartnerIssues(user.advertiser_id, user.publication);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/portal/content" className="text-sm text-[#42277C] hover:underline">&larr; My Content</Link>
        <PageIntro title="Monthly issues">Issues you appear in show up here automatically, with your page numbers.</PageIntro>
      </div>
      {issues.length === 0 ? (
        <div className="rounded-md border border-dashed border-gray-300 p-8 text-center text-gray-500">You are not in any issues yet. Issues appear here once your ad or listing is published.</div>
      ) : (
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {issues.map((i) => (
            <a key={i.id} href={`/magazine/${i.id}`} target="_blank" rel="noopener noreferrer"
              className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm transition hover:shadow-md hover:border-[#301D5D]/40">
              <div className="aspect-[3/4] bg-gray-50 flex items-center justify-center border-b border-gray-100">
                {i.coverUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={i.coverUrl} alt={i.label} className="h-full w-full object-contain object-center" loading="lazy" />
                )}
              </div>
              <div className="p-3">
                <div className="font-medium text-gray-900 text-sm">{i.label}</div>
                <div className="text-xs text-gray-500">
                  {i.partnerPages.length > 0 ? `You appear on page${i.partnerPages.length > 1 ? 's' : ''} ${i.partnerPages.join(', ')}` : `${i.pageCount} pages`}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
