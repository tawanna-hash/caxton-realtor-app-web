'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, ExternalLink, FileText, PencilLine, Trash2, Upload } from 'lucide-react';
import Tip from './Tip';

type CustomForm = { fillable?: boolean; id: string; section: string; title: string; filename: string; url: string; size: number; createdAt: string };

const formatSize = (bytes: number) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export type CustomFormsDealContext = {
  hasDeal: boolean;
  locked: boolean;
  checks: Record<string, boolean>;
  onToggle: (formId: string, selected: boolean) => void;
};

export default function CustomFormsPanel({ section, label, dealContext }: { section: 'trec' | 'brokerage'; label: string; dealContext?: CustomFormsDealContext }) {
  const [forms, setForms] = useState<CustomForm[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/agent-command-center/forms-library', { cache: 'no-store' });
      const data = await res.json() as { forms?: CustomForm[] };
      setForms((data.forms ?? []).filter((f) => f.section === section));
    } catch { /* leave list empty */ } finally { setLoaded(true); }
  }, [section]);
  useEffect(() => { void load(); }, [load]);

  const upload = async (files: FileList | File[] | null | undefined) => {
    const list = Array.from(files ?? []);
    if (!list.length) return;
    setError(''); setUploading(true);
    for (const file of list) {
      try {
        const body = new FormData();
        body.append('file', file); body.append('section', section);
        const res = await fetch('/api/agent-command-center/forms-library', { method: 'POST', body });
        const data = await res.json().catch(() => ({})) as { form?: CustomForm; error?: string };
        if (!res.ok || !data.form) throw new Error(data.error || `Could not upload ${file.name}.`);
        setForms((prev) => [data.form as CustomForm, ...prev]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed.');
      }
    }
    setUploading(false);
  };

  const remove = async (form: CustomForm) => {
    if (!window.confirm(`Remove "${form.title}" from your ${label.toLowerCase()}?`)) return;
    setForms((prev) => prev.filter((f) => f.id !== form.id));
    await fetch(`/api/agent-command-center/forms-library?id=${encodeURIComponent(form.id)}`, { method: 'DELETE' }).catch(() => undefined);
  };

  return (
    <div className="mt-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); void upload(e.dataTransfer.files); }}
        className={`flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center ${dragOver ? 'border-[#301D5D] bg-[#EFEAF8]' : 'border-slate-300 bg-white'}`}
      >
        <Upload className="h-6 w-6 text-[#7059A8]" aria-hidden="true" />
        <p className="text-sm font-medium text-slate-900">{uploading ? 'Uploading…' : `Drop ${label.toLowerCase()} PDFs here`}</p>
        <Tip text="PDF only, up to 15 MB each" />
        <button type="button" disabled={uploading} onClick={() => inputRef.current?.click()}>Upload PDF</button>
        <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple className="hidden" onChange={(e) => { void upload(e.target.files); e.target.value = ''; }} />
      </div>
      {error && <p className="mt-2 text-xs text-[#661102]" role="alert">{error}</p>}
      <p className="mt-4 text-sm font-semibold text-slate-700">{forms.length} {forms.length === 1 ? 'form' : 'forms'}</p>
      {loaded && forms.length === 0 && <p className="mt-2 text-sm text-slate-500">Nothing here yet. Upload a form to add it.</p>}
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {forms.map((form) => (
          <article key={form.id} className="flex min-w-0 flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#EFEAF8] text-[#5B3FA0]"><FileText className="h-5 w-5" aria-hidden="true" /></span>
              <div className="min-w-0">
                <h3 className="break-words text-sm font-semibold leading-5 text-slate-950">{form.title}</h3>
                <p className="mt-1 text-xs text-slate-500">{formatSize(form.size)} · Added {new Date(form.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
              </div>
            </div>
            {dealContext && (
              <label className="flex items-center gap-2 text-xs text-slate-600" title={dealContext.hasDeal ? 'Adds this form to Documents for the current deal' : 'Create a Deal First'}>
                <input type="checkbox" checked={Boolean(dealContext.checks[`bf:${form.id}`])} disabled={!dealContext.hasDeal || dealContext.locked} onChange={(e) => dealContext.onToggle(form.id, e.target.checked)} />
                Use On Current Deal
              </label>
            )}
            {!form.fillable && <Tip text="This PDF has no fillable fields, so it can be opened and downloaded but not filled in." />}
            <div className="flex flex-wrap gap-2">
              {form.fillable && (
                <a href={`/agents/closing-time?form=${encodeURIComponent(`custom-${form.id}`)}#trec-form-workspace`} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#301D5D] px-3 text-sm font-bold text-white"><PencilLine className="h-4 w-4" aria-hidden="true" />Open &amp; Fill</a>
              )}
              <a href={form.url} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 hover:bg-[#F4F3F8]"><ExternalLink className="h-4 w-4" aria-hidden="true" />Open</a>
              <a href={form.url} download={form.filename} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 hover:bg-[#F4F3F8]"><Download className="h-4 w-4" aria-hidden="true" />Download</a>
              <button type="button" aria-label={`Remove ${form.title}`} onClick={() => void remove(form)}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
