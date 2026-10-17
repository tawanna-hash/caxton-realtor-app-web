import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentPortalUser } from '@/lib/server/portal-session';
import { getPartnerIssues } from '@/lib/server/portal-content';
import { ensureSchema } from '@/lib/db';
import PageTitle from '@/components/ui/PageTitle';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function PortalIssuesPage() {
  const user = await getCurrentPortalUser();
  if (!user) redirect('/portal/error?code=auth');
  await ensureSchema();
  const issues = await getPartnerIssues(user.advertiser_id, user.publication);

  return (
    <div className="space-y-6">
      <header>
        <Link href="/portal/content" className="text-sm text-[#42277C] hover:underline">&larr; My Content</Link>
        <PageTitle size="md">Monthly issues</PageTitle>
        <p className="text-gray-600 mt-1">New issues appear here automatically. Issues with your ad show the page numbers.</p>
      </header>
      {issues.length === 0 ? (
        <div className="rounded-md border border-dashed border-gray-300 p-8 text-center text-gray-500">No issues published yet.</div>
      ) : (
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {issues.map((i) => (
            <a key={i.id} href={`/magazine/${i.id}`} target="_blank" rel="noopener noreferrer"
              className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm transition hover:shadow-md hover:border-[#301D5D]/40">
              <div className="aspect-[3/4] bg-gray-100">
                {i.coverUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={i.coverUrl} alt={i.label} className="h-full w-full object-cover" loading="lazy" />
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
