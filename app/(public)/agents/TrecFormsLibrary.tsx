'use client';

import MasterDetail, { DetailFields } from './MasterDetail';
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, FileText, PencilLine, Search } from 'lucide-react';
import {
  TREC_FORM_LIBRARY,
  TREC_FORM_LIBRARY_CATEGORIES,
  type TrecFormLibraryCategory,
} from '@/lib/trec-forms-library';
import type { TrecFormVersion } from '@/lib/trec-form-versions';
import TrecFormActions from './TrecFormActions';

export type TrecLibraryDealContext = {
  hasDeal: boolean;
  locked: boolean;
  selected: Record<string, boolean>;
  filled: Record<string, number>;
  onToggle: (formFamily: string, selected: boolean) => void;
  onOpen: (formFamily: string) => void;
  onUpload: (formFamily: string, mode: 'file' | 'photo') => void;
};

function formatEffectiveDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}

const FORMS_PER_PAGE = 10;

export default function TrecFormsLibrary({ versions, embedded = false, dealContext }: { versions: TrecFormVersion[]; embedded?: boolean; dealContext?: TrecLibraryDealContext }) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
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
  const pageCount = Math.max(1, Math.ceil(visibleForms.length / FORMS_PER_PAGE));
  const currentPage = Math.min(page, pageCount);
  const pagedForms = embedded ? visibleForms : visibleForms.slice((currentPage - 1) * FORMS_PER_PAGE, currentPage * FORMS_PER_PAGE);

  const libraryBody = (
    <>
        <div className={`${embedded ? 'mt-4' : 'mt-6'} grid gap-3 lg:max-w-md`}>
          <label className="relative block">
            <span className="sr-only">Search TREC Forms</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => { setQuery(event.target.value); setPage(1); }}
              placeholder="Search by form name or number"
              className="h-[40px] w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-sm text-slate-950 outline-none focus:border-[#301D5D]"
            />
          </label>
        </div>
        <div className="ds-tabs overflow-x-auto" role="tablist" aria-label="Filter TREC forms by category">
          {TREC_FORM_LIBRARY_CATEGORIES.map((option) => (
            <button key={option} type="button" role="tab" aria-selected={category === option} onClick={() => { setCategory(option); setPage(1); }} className="ds-tab !flex-none !whitespace-nowrap">{option}</button>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-slate-700">{visibleForms.length} {visibleForms.length === 1 ? 'form' : 'forms'}</p>
          <p className="text-xs text-slate-500">Library checked against TREC September 15, 2026</p>
        </div>

        {dealContext ? (
          <div className="mt-4">
            <MasterDetail
              testId="forms-list"
              backLabel="Forms"
              empty={null}
              items={pagedForms.map((form) => ({ id: form.formFamily, title: `${form.formNumber} · ${form.title}`, sub: `${form.category} · Effective ${formatEffectiveDate(form.effectiveDate)}`, trailing: dealContext.selected[form.formFamily] ? 'On Deal' : undefined }))}
              renderDetail={(id) => {
                const form = pagedForms.find((f) => f.formFamily === id);
                if (!form) return null;
                const total = activeByFamily.get(form.formFamily)?.fields.length ?? 0;
                const filled = dealContext.filled[form.formFamily] ?? 0;
                return (
                  <>
                    <h3 className="text-[15px] font-semibold text-[#1B1726]">{form.formNumber} · {form.title}</h3>
                    <DetailFields rows={[
                      ['Category', form.category],
                      ['Effective', formatEffectiveDate(form.effectiveDate)],
                      ['Fields', total > 0 ? (filled > 0 ? `Fillable · ${filled} of ${total}` : `Fillable · ${total} fields`) : 'Notice · Nothing to Fill'],
                    ]} />
                    <label className="flex items-center gap-2 text-sm text-[#1B1726]" title={dealContext.hasDeal ? 'Use on the current deal' : 'Create a Deal First'}>
                      <input
                        type="checkbox"
                        aria-label={`Use ${form.formNumber} on the current deal`}
                        checked={Boolean(dealContext.selected[form.formFamily])}
                        disabled={!dealContext.hasDeal || dealContext.locked}
                        onChange={(event) => dealContext.onToggle(form.formFamily, event.target.checked)}
                      />
                      Use On The Current Deal
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <TrecFormActions
                        family={form.formFamily}
                        disabled={!dealContext.hasDeal || dealContext.locked}
                        onOpen={dealContext.onOpen}
                        onUpload={dealContext.onUpload}
                        extra={(
                          <a
                            href={`/api/agent-command-center/form-pdf?src=${encodeURIComponent(form.pdfUrl)}&name=${encodeURIComponent(`TREC-${form.formNumber.replace(/\s+/g, '-')}`)}&download=1`}
                            download
                            className="ds-row-btn"
                          >
                            <Download className="h-3.5 w-3.5" aria-hidden="true" />Download
                          </a>
                        )}
                      />
                    </div>
                  </>
                );
              }}
            />
          </div>
        ) : (
        <div className={`mt-4 grid gap-3 md:grid-cols-2 ${embedded ? 'max-h-[340px] overflow-y-auto overscroll-contain pr-1' : ''}`}>
          {pagedForms.map((form) => (
            <article key={form.formFamily} className={`flex min-w-0 flex-col justify-between gap-4 rounded-xl border border-slate-200 p-4 ${'bg-white'}`}>
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#EFEAF8] text-[#301D5D]">
                  <FileText className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[#EFEAF8] px-2 py-0.5 text-xs font-semibold text-[#301D5D]">TREC {form.formNumber}</span>
                    <span className="text-xs font-semibold text-slate-500">{form.category}</span>
                  </div>
                  <h3 className="mt-2 text-sm font-semibold leading-5 text-slate-950">{form.title}</h3>
                  <p className="mt-1 text-xs text-slate-500">Effective {formatEffectiveDate(form.effectiveDate)}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <a
                  href={form.category === 'TR Forms' ? form.pdfUrl : `/agents/closing-time?form=${encodeURIComponent(form.formFamily)}#trec-form-workspace`}
                  {...(form.category === 'TR Forms' ? { target: '_blank', rel: 'noreferrer' } : {})}
                  className="inline-flex h-[42px] min-w-0 items-center justify-center gap-2 rounded-md bg-[#301D5D] px-3 text-sm font-bold text-white transition hover:bg-[#42277C]"
                >
                  <PencilLine className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Open &amp; Fill
                </a>
                <a
                  href={`/api/agent-command-center/form-pdf?src=${encodeURIComponent(form.pdfUrl)}&name=${encodeURIComponent(`TREC-${form.formNumber.replace(/\s+/g, '-')}`)}&download=1`}
                  download
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-[42px] min-w-0 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 transition hover:bg-[#F6F3FB]"
                >
                  <Download className="rnn-inline-icon" aria-hidden="true" />
                  Download
                </a>
              </div>
            </article>
          ))}
        </div>
        )}

        {visibleForms.length === 0 && (
          <div className="mt-4 border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
            No TREC forms match that search.
          </div>
        )}

        {!embedded && pageCount > 1 && (
          <nav aria-label="TREC forms pages" className="mt-4 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 transition hover:border-[#301D5D] hover:bg-[#F6F3FB] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Back
            </button>
            <p className="text-sm font-semibold text-slate-700">Page {currentPage} of {pageCount}</p>
            <button
              type="button"
              onClick={() => setPage(Math.min(pageCount, currentPage + 1))}
              disabled={currentPage === pageCount}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-md bg-[#301D5D] px-4 text-sm font-bold text-white transition hover:bg-[#42277C] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </nav>
        )}
    </>
  );

  if (embedded) return <div>{libraryBody}</div>;

  return (
    <section id="trec-forms" className="bg-white">
      <div className="ds-page">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="ds-eyebrow">Official Form Library</p>
            <h2 className="ds-title">TREC Contracts and Forms</h2>
            <p className="ds-subtitle max-w-3xl">
              Search and download all current forms listed in the Texas Real Estate Commission contract library. Always confirm the revision and effective date before use.
            </p>
          </div>
          <a
            href="https://www.trec.texas.gov/agency-information/contracts"
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-[44px] shrink-0 items-center justify-center rounded-md border border-[#301D5D] bg-white px-4 text-sm font-bold text-[#301D5D] transition hover:bg-[#301D5D] hover:text-white"
          >
            TREC Quick Link
          </a>
        </div>

        {libraryBody}
      </div>
    </section>
  );
}
