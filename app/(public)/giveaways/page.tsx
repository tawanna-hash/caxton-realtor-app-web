import PageTitle from '@/components/ui/PageTitle';
import { AdSlot } from '@/components/ads/AdSlot';
import { getServerPub } from '@/lib/publication';
import {
  listPublicGiveaways,
  type PublicGiveawayRow,
} from '@/lib/server/giveaways-store';
import {
  PUBLICATION_LABELS_WITH_BOTH,
  type PublicationId,
} from '@/lib/publications';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Giveaways — Realty News Now' };

// The public app's chosen publication (cookie `caxton_pub`) uses the PubKey
// scheme; giveaways are stored under the admin PublicationId scheme. Map the
// two so a viewer sees their market's giveaways plus any scoped to `both`.
const PUB_TO_MARKET: Record<string, PublicationId> = {
  realtyline: 'austin',
  newsline: 'san_antonio',
};

function formatRange(startsAt: Date, endsAt: Date): string {
  const fmt = (d: Date) =>
    new Date(d).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  return `${fmt(startsAt)} – ${fmt(endsAt)}`;
}

export default async function Page() {
  const pub = await getServerPub();
  const market = PUB_TO_MARKET[pub] ?? null;
  const giveaways = await listPublicGiveaways(market);

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
        <header className="mb-8 sm:mb-10">
          <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
            {giveaways.length > 0 ? 'Enter to win' : 'Coming soon'}
          </p>
          <PageTitle size="md">Giveaways</PageTitle>
          <p className="text-base text-gray-700 font-light leading-relaxed max-w-3xl mt-4">
            Monthly giveaways for licensed Texas REALTORS&reg;. Enter for a
            chance to win event tickets, gear, and more.
          </p>
        </header>

        <AdSlot slug="giveaway_prize_sponsor" className="mb-6" />

        {giveaways.length > 0 ? (
          <ul className="border-t border-gray-200">
            {giveaways.map((g) => (
              <GiveawayCard key={g.id} giveaway={g} />
            ))}
          </ul>
        ) : (
          <div className="border-t border-gray-200 pt-8">
            <p className="text-sm text-gray-600 leading-relaxed">
              We&apos;re finalizing our giveaway calendar. Check back soon, or{' '}
              <a
                href="/subscribe"
                className="text-brand-700 font-medium underline underline-offset-2"
              >
                subscribe
              </a>{' '}
              to be notified when the first one opens.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

function GiveawayCard({ giveaway }: { giveaway: PublicGiveawayRow }) {
  const publicationLabel =
    PUBLICATION_LABELS_WITH_BOTH[
      giveaway.publication as PublicationId | 'both'
    ] ?? null;

  return (
    <li className="border-b border-gray-200 py-6">
      <h2 className="text-lg font-semibold text-brand-700 leading-tight">
        {giveaway.title}
      </h2>
      <p className="text-sm text-gray-700 mt-1">
        <span className="font-medium">Prize:</span> {giveaway.prize}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
        <span>{formatRange(giveaway.starts_at, giveaway.ends_at)}</span>
        {publicationLabel && <span>{publicationLabel}</span>}
      </div>
    </li>
  );
}
