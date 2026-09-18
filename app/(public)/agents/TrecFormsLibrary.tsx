'use client';

import { useMemo, useState } from 'react';
import { Download, FileText, PencilLine, Search } from 'lucide-react';
import {
  TREC_FORM_LIBRARY,
  TREC_FORM_LIBRARY_CATEGORIES,
  type TrecFormLibraryCategory,
} from '@/lib/trec-forms-library';
import type { TrecFormVersion } from '@/lib/trec-form-versions';

function formatEffectiveDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}

export default function TrecFormsLibrary({ versions }: { versions: TrecFormVersion[] }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'All Forms' | TrecFormLibraryCategory>('All Forms');
  const activeByFamily = useMemo(
    () => new Map(versions.filter((version) => version.isActive).map((version) => [version.formFamily, version])),
    [versions],
  );
  const forms = useMemo(() => TREC_FORM_LIBRARY.map((form) => {
    const active = activeByFamily.get(form.formFamily);
    return active
      ? {
          ...form,
          formNumber: active.formNumber,
          title: active.title,
          effectiveDate: active.effectiveDate,
          pdfUrl: active.pdfUrl,
          local: active.pdfUrl.startsWith('/'),
        }
      : form;
  }), [activeByFamily]);
  const visibleForms = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return forms.filter((form) => (
      (category === 'All Forms' || form.category === category)
      && (!normalizedQuery || `${form.formNumber} ${form.title}`.toLowerCase().includes(normalizedQuery))
    ));
  }, [category, forms, query]);

  return (
    <section id="trec-forms" className="border-y border-slate-200 bg-[#F7F5F1]">
      <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8 lg:py-16">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7059A8]">Official form library</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-slate-950 sm:text-4xl">TREC Contracts and Forms</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              Search and download all current forms listed in the Texas Real Estate Commission contract library. Always confirm the revision and effective date before use.
            </p>
          </div>
          <a
            href="https://www.trec.texas.gov/agency-information/contracts"
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-[44px] shrink-0 items-center justify-center rounded-md border border-[#301D5D] bg-white px-4 text-sm font-bold text-[#301D5D] transition hover:bg-[#301D5D] hover:text-white"
          >
            Verify on TREC
          </a>
        </div>

        <div className="mt-7 grid gap-3 lg:grid-cols-[minmax(260px,0.8fr)_1.2fr]">
          <label className="relative block">
            <span className="sr-only">Search TREC forms</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by form name or number"
              className="h-[46px] w-full rounded-md border border-slate-300 bg-white pl-10 pr-3 text-sm text-slate-950 outline-none focus:border-[#301D5D]"
            />
          </label>
          <div className="flex flex-wrap gap-2" aria-label="Filter TREC forms by category">
            {TREC_FORM_LIBRARY_CATEGORIES.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setCategory(option)}
                className={`h-[46px] rounded-md border px-4 text-sm font-bold transition ${
                  category === option
                    ? 'border-[#301D5D] bg-[#301D5D] text-white'
                    : 'border-slate-300 bg-white text-slate-700 hover:border-[#7059A8] hover:bg-[#F8F5FF]'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-slate-700">{visibleForms.length} {visibleForms.length === 1 ? 'form' : 'forms'}</p>
          <p className="text-xs text-slate-500">Library checked against TREC September 15, 2026</p>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {visibleForms.map((form) => (
            <article key={form.formFamily} className="flex min-w-0 flex-col justify-between gap-5 border border-slate-200 bg-white p-5">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#EEE8F9] text-[#5B438C]">
                  <FileText className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-[#F2EEE7] px-2 py-1 text-xs font-bold text-[#301D5D]">TREC {form.formNumber}</span>
                    <span className="text-xs font-semibold text-slate-500">{form.category}</span>
                  </div>
                  <h3 className="mt-2 text-sm font-semibold leading-5 text-slate-950">{form.title}</h3>
                  <p className="mt-1 text-xs text-slate-500">Effective {formatEffectiveDate(form.effectiveDate)}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <a
                  href={`/agents/closing-time?form=${encodeURIComponent(form.formFamily)}#trec-form-workspace`}
                  className="inline-flex h-[42px] min-w-0 items-center justify-center gap-2 rounded-md bg-[#301D5D] px-3 text-sm font-bold text-white transition hover:bg-[#42277C]"
                >
                  <PencilLine className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Open &amp; fill
                </a>
                <a
                  href={form.pdfUrl}
                  download={form.local ? `TREC-${form.formNumber.replace(/\s+/g, '-')}.pdf` : undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-[42px] min-w-0 items-center justify-center gap-2 rounded-md border border-[#301D5D] bg-white px-3 text-sm font-bold text-[#301D5D] transition hover:bg-[#F8F5FF]"
                >
                  <Download className="rnn-inline-icon" aria-hidden="true" />
                  Download
                </a>
              </div>
            </article>
          ))}
        </div>

        {visibleForms.length === 0 && (
          <div className="mt-4 border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
            No TREC forms match that search.
          </div>
        )}
      </div>
    </section>
  );
}
