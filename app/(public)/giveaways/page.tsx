import ComingSoon from '@/components/ComingSoon';
import { AdSlot } from '@/components/ads/AdSlot';

export const metadata = { title: 'Giveaways — Realty News Now' };

export default function Page() {
  return (
    <>
      <div className="max-w-3xl mx-auto px-4 pt-6">
        <AdSlot slug="giveaway_prize_sponsor" />
      </div>
      <ComingSoon
        title="Giveaways"
        description="Monthly giveaways for licensed Texas REALTORS®. Enter for a chance to win event tickets, gear, and more."
      />
    </>
  );
}
