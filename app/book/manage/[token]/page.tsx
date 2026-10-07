import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { publicBooking } from '@/lib/server/closing-time-schedulers';
import { T } from '@/lib/scheduler-shared';
import CancelButton from './CancelButton';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your Booking', robots: { index: false, follow: false } };

export default async function ManageBooking({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const b = await publicBooking(token);
  if (!b) notFound();
  const t = T[b.language];
  return (
    <main className="mx-auto max-w-[560px] px-4 py-8 font-[Inter,system-ui,sans-serif] text-[14px] text-[#4A4757]">
      <div className="rounded-xl border border-[#E6E5EC] bg-white p-6">
        {b.agentName && <div className="text-[14px] font-semibold text-[#301D5D]">{b.agentName}</div>}
        <h1 className="mt-1 text-[22px] font-semibold text-[#1B1726]">{b.schedulerName}</h1>
        <p className="mt-2 text-[15px] font-medium text-[#1B1726]">{b.when} · {b.lengthMin} {t.min}</p>
        {b.meetingUrl && <p className="mt-1 break-all"><a className="text-[#301D5D] underline" href={b.meetingUrl}>{b.meetingUrl}</a></p>}
        {b.status !== 'booked' ? (
          <div className="mt-4 rounded-lg bg-[#FFEAE6] px-3 py-2 text-[13px] font-medium text-[#661102]">{t.cancelled}</div>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            <a href={`/api/book/manage/${token}/ics`} className="inline-flex min-h-[44px] items-center rounded-lg border border-[#E6E5EC] bg-white px-4 text-[13px] font-medium text-[#1B1726] hover:border-[#301D5D]">{t.addCal}</a>
            {!b.past && <CancelButton token={token} label={t.cancel} done={t.cancelled} />}
          </div>
        )}
        {b.rebook && b.status !== 'booked' && <a href={b.rebook} className="mt-4 inline-flex text-[13px] font-medium text-[#301D5D] underline">Book another time</a>}
      </div>
    </main>
  );
}
