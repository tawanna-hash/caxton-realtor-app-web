'use client';

import { useCallback, useMemo, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { AgreementWithAdvertiser } from '@/lib/agreements';
import type { InvoiceWithAdvertiser } from '@/lib/invoices';
import type { AdvertiserOption } from '@/app/admin/billing/_components/types';
import { SalesTransactionsClient } from '@/app/admin/getpaid/_components/SalesTransactionsClient';

type Props = {
  initialInvoices: InvoiceWithAdvertiser[];
  agreements: AgreementWithAdvertiser[];
  advertisers: AdvertiserOption[];
};

export default function InvoicesClient({
  initialInvoices,
  agreements,
  advertisers,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const seedFromUrl = useMemo(() => {
    if (searchParams.get('create') !== '1') return null;
    const advId = searchParams.get('advertiser_id');
    const agrId = searchParams.get('agreement_id') ?? '';
    const amt = searchParams.get('amount_cents');
    return {
      advertiser_id: advId ? Number(advId) : null,
      agreement_id: agrId,
      amount_cents: amt ? Number(amt) : null,
    };
  }, [searchParams]);
  const editFromUrl = useMemo(() => {
    const editId = searchParams.get('edit');
    return editId ? initialInvoices.find((invoice) => invoice.id === editId) ?? null : null;
  }, [initialInvoices, searchParams]);

  const cleanedRef = useRef(false);
  const consumeUrlSeed = useCallback(() => {
    if (!cleanedRef.current) {
      cleanedRef.current = true;
      router.replace(pathname);
    }
  }, [pathname, router]);

  return (
    <SalesTransactionsClient
      initialInvoices={initialInvoices}
      agreements={agreements}
      advertisers={advertisers}
      workspace="invoices"
      initialCreate={Boolean(seedFromUrl)}
      initialEdit={editFromUrl}
      invoiceSeed={seedFromUrl}
      onConsumeUrlSeed={seedFromUrl || editFromUrl ? consumeUrlSeed : undefined}
    />
  );
}
