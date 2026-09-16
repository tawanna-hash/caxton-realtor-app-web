'use client';

import { useRef, useState } from 'react';
import { CheckCircle2, ExternalLink, FileUp, LoaderCircle } from 'lucide-react';
import PageTitle from '@/components/ui/PageTitle';
import type { TrecFormVersion } from '@/lib/trec-form-versions';
import { TREC_FORM_LIBRARY } from '@/lib/trec-forms-library';

export default function AgentCenterAdminClient({ initialVersions }: { initialVersions: TrecFormVersion[] }) {
  const [versions, setVersions] = useState(initialVersions);
  const [formNumber, setFormNumber] = useState('');
  const [title, setTitle] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const refresh = async () => {
    const response = await fetch('/api/admin/agent-center/trec-forms', { credentials: 'same-origin' });
    const data = await response.json() as { versions?: TrecFormVersion[]; error?: string };
    if (!response.ok || !data.versions) throw new Error(data.error || 'Could not refresh form versions.');
    setVersions(data.versions);
  };

  const upload = async () => {
    if (!file || !formNumber.trim() || !effectiveDate) {
      setError('Choose the official fillable PDF and enter its form number and effective date.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('formNumber', formNumber.trim());
      formData.append('title', title.trim());
      formData.append('effectiveDate', effectiveDate);
      formData.append('activate', 'true');
      const response = await fetch('/api/admin/agent-center/trec-forms', {
        method: 'POST',
        credentials: 'same-origin',
        body: formData,
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Could not upload the form.');
      await refresh();
      setFile(null);
      setFormNumber('');
      setTitle('');
      setEffectiveDate('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      setMessage('The new official form version is active.');
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Could not upload the form.');
    } finally {
      setBusy(false);
    }
  };

  const activate = async (id: string) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/admin/agent-center/trec-forms', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Could not activate the form.');
      await refresh();
      setMessage('The selected official form version is active.');
    } catch (activationError) {
      setError(activationError instanceof Error ? activationError.message : 'Could not activate the form.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-[1300px] space-y-6 px-5 py-7 lg:px-8">
      <header>
        <p className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-[#7059A8]">Admin · Agent Center</p>
        <PageTitle size="md">TREC form versions</PageTitle>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Upload only official fillable PDFs published by TREC. Each form family keeps its own active revision, so the contract and attached addenda remain available together in the agent transaction packet.
        </p>
      </header>

      <section className="border border-[#D9D0BF] bg-[#FFFDF8] p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-slate-950">Add an Official Revision</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">The upload becomes active only for its matching form family. Previous revisions remain in history and are never overwritten.</p>
        <div className="mt-5 grid gap-4 lg:grid-cols-[0.8fr_1.3fr_1fr_1.4fr_auto] lg:items-end">
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-800">TREC form number</span>
            <input value={formNumber} onChange={(event) => setFormNumber(event.target.value)} className="h-[46px] w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#301D5D]" placeholder="Example: 20-20" />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-800">Official form title</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} className="h-[46px] w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#301D5D]" placeholder="Example: Third Party Financing Addendum" />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-800">Effective date</span>
            <input type="date" value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} className="h-[46px] w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#301D5D]" />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-800">Official fillable PDF</span>
            <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="block h-[46px] w-full rounded-md border border-slate-300 bg-white text-sm file:mr-3 file:h-[44px] file:border-0 file:border-r file:border-slate-300 file:bg-[#F7F3EB] file:px-4 file:text-sm file:font-bold file:text-[#301D5D]" />
          </label>
          <button type="button" onClick={() => void upload()} disabled={busy} className="inline-flex h-[46px] items-center justify-center gap-2 rounded-md bg-[#301D5D] px-5 text-sm font-bold text-white hover:bg-[#241548] disabled:cursor-not-allowed disabled:opacity-60">
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileUp className="h-4 w-4" aria-hidden="true" />}
            Upload and activate
          </button>
        </div>
        {error && <p role="alert" className="mt-4 border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        {message && <p role="status" className="mt-4 border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>}
      </section>

      <section className="border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-950">Version History</h2>
        </div>
        <div className="divide-y divide-slate-200">
          {versions.map((version) => (
            <article key={version.id} className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-slate-950">TREC {version.formNumber}</h3>
                  {version.isActive && <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-800"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />Active</span>}
                </div>
                <p className="mt-1 text-sm font-semibold text-slate-800">{version.title}</p>
                <p className="mt-1 text-sm text-slate-600">Effective {version.effectiveDate} · {version.pageCount} pages · {version.fields.length} fillable controls</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a href={version.pdfUrl} target="_blank" rel="noreferrer" className="inline-flex h-[40px] items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 hover:bg-slate-50">
                  Review PDF <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </a>
                {!version.isActive && (
                  <button type="button" disabled={busy} onClick={() => void activate(version.id)} className="h-[40px] rounded-md bg-[#301D5D] px-4 text-sm font-bold text-white hover:bg-[#241548] disabled:opacity-60">Make active</button>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-950">Agent Download Library</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">All {TREC_FORM_LIBRARY.length} current TREC contract-library forms are available to signed-in agents. Upload a newer revision above to replace the active download for that form family without deleting its history.</p>
        </div>
        <div className="grid gap-px bg-slate-200 sm:grid-cols-2 xl:grid-cols-3">
          {TREC_FORM_LIBRARY.map((form) => (
            <article key={form.formFamily} className="flex min-w-0 items-center justify-between gap-3 bg-white px-5 py-4">
              <div className="min-w-0">
                <p className="text-xs font-bold text-[#7059A8]">TREC {form.formNumber}</p>
                <h3 className="mt-1 text-sm font-semibold leading-5 text-slate-950">{form.title}</h3>
                <p className="mt-1 text-xs text-slate-500">{form.category} · Effective {form.effectiveDate}</p>
              </div>
              <a href={form.pdfUrl} target="_blank" rel="noreferrer" aria-label={`Download TREC ${form.formNumber}`} className="inline-flex h-[40px] shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-xs font-bold text-slate-800 hover:bg-slate-50">
                Download
              </a>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
