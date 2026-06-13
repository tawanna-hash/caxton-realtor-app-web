'use client';

// app/(public)/resources/_components/ResourceFloater.tsx
//
// Shared floating action pill for every /resources calculator page.
// Wraps <FloaterPill> and bakes in the four standard actions:
//   Back - Share - Download - Print
//
// Download flow (Session 22+):
//   Tapping Download opens <FooterPickerSheet>. The sheet handles three
//   states: signed-out (prompt to sign in), signed-in/incomplete-profile
//   (warning callout + template grid), signed-in/complete (template
//   grid). On confirm, the sheet returns a template id (or null) and
//   the brand fields; we hand those to downloadCalcReport().
//
// Each page supplies:
//   - shareTitle / shareText: copy for navigator.share()
//   - buildReport(): () => CalcReport - invoked when Download is tapped.
//     Generated lazily so the report reflects the latest input state.

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import FloaterPill, { type FloaterAction } from '@/components/ui/FloaterPill';
import { downloadCalcReport, type CalcReport } from './calcPdf';
import FooterPickerSheet, { type FooterPickerResult } from './FooterPickerSheet';

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
  const [pickerOpen, setPickerOpen] = useState(false);

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
    const shareData = { title: shareTitle, text: shareText, url };
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share(shareData);
      } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        window.alert('Link copied to clipboard');
      }
    } catch (err) {
      // user cancelled - no-op
      console.log('[ResourceFloater] share cancelled or failed:', err);
    }
  }, [shareTitle, shareText]);

  const onDownload = useCallback(() => {
    setPickerOpen(true);
  }, []);

  const onPickerConfirm = useCallback(async (pick: FooterPickerResult) => {
    setPickerOpen(false);
    try {
      const report = buildReport();
      if (pick.template && pick.brand) {
        report.brandFooter = { template: pick.template, brand: pick.brand };
      }
      await downloadCalcReport(report);
    } catch (err) {
      console.error('[ResourceFloater] PDF generation failed:', err);
      window.alert('Could not generate PDF - please try again.');
    }
  }, [buildReport]);

  const onPrint = useCallback(() => {
    if (typeof window !== 'undefined') window.print();
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
      <FloaterPill
        actions={actions}
        bottomOffsetClass={bottomOffsetClass}
      />
      <FooterPickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onConfirm={onPickerConfirm}
      />
    </>
  );
}
