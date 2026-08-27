'use client';

// app/(public)/resources/_components/ResourceFloater.tsx
//
// Shared floating action pill for every /resources calculator page.
// Wraps <FloaterPill> and bakes in the four standard actions:
//   Back - Share - Download - Print
//
// Signed-in REALTORS automatically receive their saved custom branding
// on printed, downloaded, and file-shared calculator sheets.

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import FloaterPill, { type FloaterAction } from '@/components/ui/FloaterPill';
import { createCalcReportFile, downloadCalcReport, type CalcReport } from './calcPdf';
import { printCurrentPage } from '@/lib/native/print';
import { getApiBase } from '@/lib/api-base';
import type { FooterBrand, FooterTemplateId } from '@/lib/footer-templates';

const API = getApiBase();
const DESIGNER_SIGNATURE_STORAGE_KEY = 'rnn:custom-designer-signature';

type BrandFooter = {
  template: FooterTemplateId;
  brand: FooterBrand;
};

interface Props {
  /** Share dialog title - usually the calculator name. */
  shareTitle: string;
  /** Share dialog body - one-line summary. */
  shareText: string;
  /** Lazy report builder. Called on Download - should return current state. */
  buildReport: () => CalcReport;
  /** Optional offset override. Defaults to 'bottom-[96px]' - clears the
   *  AppShell BottomNav (~72px tall) with a small visual gap. */
  bottomOffsetClass?: string;
}

export default function ResourceFloater({
  shareTitle,
  shareText,
  buildReport,
  bottomOffsetClass = 'bottom-[96px]',
}: Props) {
  const router = useRouter();
  const [brandFooter, setBrandFooter] = useState<BrandFooter | null>(null);

  useEffect(() => {
    let cancelled = false;
    let designerBrandingTimeout: number | undefined;
    let designerBranding: BrandFooter | null = null;
    try {
      const saved = window.localStorage.getItem(DESIGNER_SIGNATURE_STORAGE_KEY);
      if (saved) {
        const signature = JSON.parse(saved) as {
          name?: string;
          title?: string;
          company?: string;
          phone?: string;
          email?: string;
          website?: string;
          photo?: string;
          logo?: string;
        };
        if (signature.name?.trim() && signature.company?.trim()) {
          designerBranding = {
            template: 'signature',
            brand: {
              name: signature.name,
              company: signature.company,
              title: signature.title || null,
              email: signature.email || null,
              phone: signature.phone || null,
              office_phone: null,
              website: signature.website || null,
              logo_url: signature.logo || null,
              photo_url: signature.photo || null,
              address: null,
              address_2: null,
              city: null,
              state: null,
              zip: null,
              license_number: null,
              tagline: null,
              publication: null,
            },
          };
          designerBrandingTimeout = window.setTimeout(() => {
            if (!cancelled) setBrandFooter(designerBranding);
          }, 0);
        }
      }
    } catch {}

    fetch(`${API}/calculator-branding`, { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) return null;
        const data = await response.json();
        return (data?.branding ?? null) as BrandFooter | null;
      })
      .then((branding) => {
        if (!cancelled && !designerBranding) setBrandFooter(branding);
      })
      .catch(() => {
        if (!cancelled && !designerBranding) setBrandFooter(null);
      });
    return () => {
      cancelled = true;
      if (designerBrandingTimeout !== undefined) {
        window.clearTimeout(designerBrandingTimeout);
      }
    };
  }, []);

  const buildBrandedReport = useCallback((): CalcReport => {
    const report = buildReport();
    return brandFooter ? { ...report, brandFooter } : report;
  }, [brandFooter, buildReport]);

  const onBack = useCallback(() => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/resources');
    }
  }, [router]);

  const onShare = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const url = window.location.href;
    const { haptics } = await import('@/lib/native/haptics');
    haptics.light();
    try {
      const report = buildBrandedReport();
      const file = await createCalcReportFile(report);
      const payload: ShareData = {
        title: shareTitle,
        text: shareText,
        files: [file],
      };
      if (
        typeof navigator.share === 'function'
        && (typeof navigator.canShare !== 'function' || navigator.canShare(payload))
      ) {
        await navigator.share(payload);
        return;
      }

      await downloadCalcReport(report);
      const { share: nativeShare } = await import('@/lib/native/share');
      const res = await nativeShare({ title: shareTitle, text: shareText, url });
      if (res.ok) {
        window.alert('The branded PDF was downloaded and the calculator link was shared.');
      } else {
        window.alert('The branded PDF was downloaded. Attach it to your email or text.');
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error('[ResourceFloater] PDF sharing failed:', err);
      window.alert('Could not share the calculator sheet. Please try Download instead.');
    }
  }, [buildBrandedReport, shareTitle, shareText]);

  const onDownload = useCallback(async () => {
    try {
      const report = buildBrandedReport();
      await downloadCalcReport(report);
    } catch (err) {
      console.error('[ResourceFloater] PDF generation failed:', err);
      window.alert('Could not generate PDF - please try again.');
    }
  }, [buildBrandedReport]);

  const onPrint = useCallback(() => {
    void printCurrentPage();
  }, []);

  const actions: FloaterAction[] = [
    {
      key: 'back',
      label: 'Back',
      onClick: onBack,
      icon: <path d="m15 18-6-6 6-6" />,
    },
    {
      key: 'share',
      label: 'Share',
      onClick: onShare,
      icon: (
        <>
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
          <polyline points="16 6 12 2 8 6" />
          <line x1="12" y1="2" x2="12" y2="15" />
        </>
      ),
    },
    {
      key: 'download',
      label: 'Download',
      onClick: onDownload,
      icon: (
        <>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </>
      ),
    },
    {
      key: 'print',
      label: 'Print',
      onClick: onPrint,
      icon: (
        <>
          <polyline points="6 9 6 2 18 2 18 9" />
          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
          <rect x="6" y="14" width="12" height="8" />
        </>
      ),
    },
  ];

  return (
    <>
      <div className="print:hidden">
        <FloaterPill
          actions={actions}
          bottomOffsetClass={bottomOffsetClass}
        />
      </div>
      {brandFooter && <PrintBrandFooter brand={brandFooter.brand} />}
    </>
  );
}

function PrintBrandFooter({ brand }: { brand: FooterBrand }) {
  const contact = [brand.phone, brand.email, brand.website].filter(Boolean).join('  •  ');
  const location = [
    [brand.address, brand.address_2].filter(Boolean).join(', '),
    [[brand.city, brand.state].filter(Boolean).join(', '), brand.zip].filter(Boolean).join(' '),
  ].filter(Boolean).join('  •  ');
  return (
    <aside
      aria-label="REALTOR contact information"
      className="hidden print:fixed print:inset-x-0 print:bottom-0 print:z-50 print:flex print:items-center print:gap-4 print:border-t-2 print:border-[#c4a35a] print:bg-white print:px-8 print:py-3 print:text-gray-900"
    >
      {brand.photo_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={brand.photo_url} alt="" className="h-14 w-14 rounded-full object-cover" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">{brand.name || brand.company || 'REALTOR®'}</p>
        <p className="text-xs">
          {[brand.title, brand.company].filter(Boolean).join(' · ')}
        </p>
        {contact && <p className="mt-0.5 text-[10px] text-gray-700">{contact}</p>}
        {location && <p className="text-[10px] text-gray-600">{location}</p>}
        <p className="text-[10px] text-gray-600">
          {[
            brand.license_number
              ? `TREC #${brand.license_number.replace(/^TREC\s*#?/i, '')}`
              : null,
            brand.tagline,
          ].filter(Boolean).join('  •  ')}
        </p>
      </div>
      {brand.logo_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={brand.logo_url} alt="" className="h-12 w-20 object-contain" />
      )}
    </aside>
  );
}
