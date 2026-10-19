'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { TrecFormVersion } from '@/lib/trec-form-versions';
import TrecPdfPagePreview from '../../../agents/TrecPdfPagePreview';
import { BTN, BTN_PRIMARY, BTN_SECONDARY } from '../../ui';

export default function FillClient({ version }: { version: TrecFormVersion }) {
  const storeKey = `contracts-fill-${version.formFamily}`;
  const [values, setValues] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try { setValues(JSON.parse(window.localStorage.getItem(storeKey) ?? '{}') as Record<string, string>); } catch { /* start blank */ }
    setLoaded(true);
  }, [storeKey]);
  useEffect(() => {
    if (loaded) window.localStorage.setItem(storeKey, JSON.stringify(values));
  }, [loaded, storeKey, values]);

  const pageFields = useMemo(() => version.fields.filter((f) => f.page === page), [version, page]);
  const filled = Object.values(values).filter((v) => v.trim() !== '').length;

  async function download() {
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/contract-dates/fill-pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ family: version.formFamily, values }) });
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? 'Could not build the PDF.');
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url; a.download = `TREC-${version.formNumber}-filled.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not build the PDF.'); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-[#301D5D]">TREC {version.formNumber} · {version.title}</h2>
          <p className="text-sm text-[#5B5470]">{filled} fields filled. Your entries stay in this browser until you download.</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Link href="/contracts/forms" className={BTN_SECONDARY}>Back To Library</Link>
          <button type="button" className={BTN} onClick={() => { if (window.confirm('Clear everything you typed on this form?')) setValues({}); }}>Clear</button>
          <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={() => void download()}>{busy ? 'Building...' : 'Download Filled PDF'}</button>
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="overflow-x-auto rounded-lg border border-[#D9D2E9] bg-white"><div className="min-w-[720px]">
        <TrecPdfPagePreview
          pdfUrl={version.pdfUrl}
          pageNumber={page}
          formNumber={version.formNumber}
          fields={pageFields}
          values={values}
          onFieldChange={(id, value) => setValues((v) => ({ ...v, [id]: value }))}
        />
      </div></div>
      <div className="flex items-center justify-between gap-3">
        <button type="button" className={BTN_SECONDARY} disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Back</button>
        <p className="text-center text-sm font-semibold text-[#301D5D]">Page {page} of {version.pageCount}</p>
        <button type="button" className={BTN_PRIMARY} disabled={page === version.pageCount} onClick={() => setPage((p) => Math.min(version.pageCount, p + 1))}>Next</button>
      </div>
    </div>
  );
}
