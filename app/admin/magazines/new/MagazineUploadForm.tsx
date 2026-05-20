'use client';

// app/admin/magazines/new/MagazineUploadForm.tsx
//
// New-issue upload form. Full flow:
//   1. Admin fills in metadata (publication, year, month, label, sort date)
//   2. Selects cover image, PDF (optional), and page images (multiple)
//   3. Clicks "Create Issue" → form posts metadata to /api/admin/magazines
//      which returns { id }
//   4. With the new id, the form uploads each file via @vercel/blob/client
//      upload() with pathnames under magazine-covers/{id}/, magazine-pdfs/{id}/,
//      magazine-pages/{id}/
//   5. If a PDF was uploaded, /api/admin/magazines/extract-text is called
//      with the blob URL to get per-page text
//   6. PATCH /api/admin/magazines/{id} attaches all URLs + page_texts
//   7. Redirect to /admin/magazines

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { upload } from '@vercel/blob/client';

type Pub = 'austin' | 'san_antonio';

type StepStatus = 'pending' | 'running' | 'done' | 'error';

interface StepState {
  label: string;
  status: StepStatus;
  detail?: string;
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export default function MagazineUploadForm() {
  const router = useRouter();

  const now = new Date();
  const [publication, setPublication] = useState<Pub>('austin');
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [issueLabel, setIssueLabel] = useState<string>('');
  const [sortDate, setSortDate] = useState<string>(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`,
  );

  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pageFiles, setPageFiles] = useState<File[]>([]);

  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<StepState[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<number | null>(null);

  const sortedPageFiles = useMemo(() => {
    return [...pageFiles].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
    );
  }, [pageFiles]);

  function updateStep(idx: number, patch: Partial<StepState>) {
    setSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  function validate(): string | null {
    if (!issueLabel.trim()) return 'Issue label is required.';
    if (!coverFile) return 'Cover image is required.';
    if (pageFiles.length === 0) return 'At least one page image is required.';
    if (year < 2000 || year > 2100) return 'Year must be 2000–2100.';
    if (month < 1 || month > 12) return 'Month must be 1–12.';
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const validation = validate();
    if (validation) {
      setError(validation);
      return;
    }

    setRunning(true);
    const stepList: StepState[] = [
      { label: 'Create magazine record', status: 'pending' },
      { label: `Upload cover image`, status: 'pending' },
      ...(pdfFile ? [{ label: 'Upload PDF', status: 'pending' as StepStatus }] : []),
      { label: `Upload ${sortedPageFiles.length} page image(s)`, status: 'pending' },
      ...(pdfFile ? [{ label: 'Extract page text from PDF', status: 'pending' as StepStatus }] : []),
      { label: 'Attach URLs to magazine record', status: 'pending' },
    ];
    setSteps(stepList);

    // Step 1: create the row
    updateStep(0, { status: 'running' });
    let id: number;
    try {
      const r = await fetch('/api/admin/magazines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publication,
          year,
          month,
          issue_label: issueLabel.trim(),
          sort_date: sortDate,
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || `create failed (${r.status})`);
      }
      const data = await r.json();
      id = data.magazine.id;
      setCreatedId(id);
      updateStep(0, { status: 'done', detail: `id=${id}` });
    } catch (err: unknown) {
      const msg = errMessage(err);
      updateStep(0, { status: 'error', detail: msg });
      setError(msg);
      setRunning(false);
      return;
    }

    let stepIdx = 1;

    // Step 2: upload cover
    updateStep(stepIdx, { status: 'running' });
    let coverUrl: string;
    try {
      const blob = await upload(`magazine-covers/${id}/${coverFile!.name}`, coverFile!, {
        access: 'public',
        handleUploadUrl: '/api/admin/magazines/upload-token',
      });
      coverUrl = blob.url;
      updateStep(stepIdx, { status: 'done' });
    } catch (err: unknown) {
      const msg = errMessage(err);
      updateStep(stepIdx, { status: 'error', detail: msg });
      setError(`Cover upload failed: ${msg}`);
      setRunning(false);
      return;
    }
    stepIdx++;

    // Step 3: upload PDF (optional)
    let pdfUrl: string | null = null;
    if (pdfFile) {
      updateStep(stepIdx, { status: 'running' });
      try {
        const blob = await upload(`magazine-pdfs/${id}/${pdfFile.name}`, pdfFile, {
          access: 'public',
          handleUploadUrl: '/api/admin/magazines/upload-token',
        });
        pdfUrl = blob.url;
        updateStep(stepIdx, { status: 'done' });
      } catch (err: unknown) {
        const msg = errMessage(err);
        updateStep(stepIdx, { status: 'error', detail: msg });
        setError(`PDF upload failed: ${msg}`);
        setRunning(false);
        return;
      }
      stepIdx++;
    }

    // Step 4: upload page images
    updateStep(stepIdx, { status: 'running' });
    const pageUrls: string[] = [];
    for (let i = 0; i < sortedPageFiles.length; i++) {
      const f = sortedPageFiles[i];
      try {
        const blob = await upload(`magazine-pages/${id}/${f.name}`, f, {
          access: 'public',
          handleUploadUrl: '/api/admin/magazines/upload-token',
        });
        pageUrls.push(blob.url);
        updateStep(stepIdx, {
          status: 'running',
          detail: `${i + 1} / ${sortedPageFiles.length}`,
        });
      } catch (err: unknown) {
        const msg = errMessage(err);
        updateStep(stepIdx, {
          status: 'error',
          detail: `failed on page ${i + 1}: ${msg}`,
        });
        setError(`Page upload failed on page ${i + 1}: ${msg}`);
        setRunning(false);
        return;
      }
    }
    updateStep(stepIdx, { status: 'done', detail: `${pageUrls.length} pages` });
    stepIdx++;

    // Step 5: extract text (only if PDF was uploaded)
    let pageTexts: string[] | null = null;
    if (pdfUrl) {
      updateStep(stepIdx, { status: 'running' });
      try {
        const r = await fetch('/api/admin/magazines/extract-text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pdf_url: pdfUrl }),
        });
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error || `extract failed (${r.status})`);
        }
        const data = await r.json();
        pageTexts = data.pages;
        updateStep(stepIdx, {
          status: 'done',
          detail: `${pageTexts?.length ?? 0} pages extracted`,
        });
      } catch (err: unknown) {
        const msg = errMessage(err);
        // Extraction failure is non-fatal — search just won't work for this issue.
        updateStep(stepIdx, {
          status: 'error',
          detail: `${msg} (continuing without search)`,
        });
        pageTexts = null;
      }
      stepIdx++;
    }

    // Step 6: PATCH everything onto the row
    updateStep(stepIdx, { status: 'running' });
    try {
      const patchBody: Record<string, unknown> = {
        cover_url: coverUrl,
        page_urls: pageUrls,
        page_count: pageUrls.length,
      };
      if (pdfUrl) patchBody.reader_url = pdfUrl;
      if (pageTexts) patchBody.page_texts = pageTexts;
      const r = await fetch(`/api/admin/magazines/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchBody),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || `patch failed (${r.status})`);
      }
      updateStep(stepIdx, { status: 'done' });
    } catch (err: unknown) {
      const msg = errMessage(err);
      updateStep(stepIdx, { status: 'error', detail: msg });
      setError(`Final attach failed: ${msg}. The magazine record and uploaded files exist; you can edit the record manually.`);
      setRunning(false);
      return;
    }

    setTimeout(() => router.push('/admin/magazines'), 800);
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <Link href="/admin/magazines" className="text-sm text-blue-600 hover:underline">
            ← Back to magazines
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900 mt-2">New Magazine Issue</h1>
        </div>

        <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-md p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Publication</label>
            <select
              value={publication}
              onChange={(e) => setPublication(e.target.value as Pub)}
              disabled={running}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            >
              <option value="austin">RealtyLine (Austin)</option>
              <option value="san_antonio">Newsline (San Antonio)</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
              <input
                type="number"
                min={2000}
                max={2100}
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                disabled={running}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Month</label>
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                disabled={running}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              >
                {Array.from({ length: 12 }).map((_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {new Date(2020, i, 1).toLocaleString('en-US', { month: 'long' })}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Issue label
            </label>
            <input
              type="text"
              value={issueLabel}
              onChange={(e) => setIssueLabel(e.target.value)}
              disabled={running}
              placeholder="e.g. February 2026"
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Sort date (controls feed order)
            </label>
            <input
              type="date"
              value={sortDate}
              onChange={(e) => setSortDate(e.target.value)}
              disabled={running}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cover image</label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)}
              disabled={running}
              className="block w-full text-sm"
            />
            {coverFile && (
              <p className="text-xs text-gray-500 mt-1">{coverFile.name} ({Math.round(coverFile.size / 1024)} KB)</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              PDF (optional — enables in-issue text search)
            </label>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
              disabled={running}
              className="block w-full text-sm"
            />
            {pdfFile && (
              <p className="text-xs text-gray-500 mt-1">{pdfFile.name} ({Math.round(pdfFile.size / 1024 / 1024)} MB)</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Page images (multi-select; will be sorted by filename)
            </label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={(e) => setPageFiles(e.target.files ? Array.from(e.target.files) : [])}
              disabled={running}
              className="block w-full text-sm"
            />
            {pageFiles.length > 0 && (
              <p className="text-xs text-gray-500 mt-1">
                {pageFiles.length} file(s) selected · order: {sortedPageFiles.slice(0, 3).map((f) => f.name).join(', ')}
                {sortedPageFiles.length > 3 ? ` … ${sortedPageFiles[sortedPageFiles.length - 1].name}` : ''}
              </p>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-3 py-2 rounded text-sm">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <button
              type="submit"
              disabled={running}
              className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-md font-medium text-sm disabled:opacity-50"
            >
              {running ? 'Uploading…' : 'Create Issue'}
            </button>
            {createdId && !running && (
              <Link
                href={`/admin/magazines/${createdId}`}
                className="text-sm text-blue-600 hover:underline"
              >
                Edit this issue →
              </Link>
            )}
          </div>

          {steps.length > 0 && (
            <div className="mt-4 border-t border-gray-200 pt-4 space-y-1.5">
              {steps.map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <StatusDot status={s.status} />
                  <span className={s.status === 'error' ? 'text-red-700' : 'text-gray-700'}>
                    {s.label}
                  </span>
                  {s.detail && (
                    <span className={`text-xs ${s.status === 'error' ? 'text-red-600' : 'text-gray-400'}`}>
                      · {s.detail}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: StepStatus }) {
  if (status === 'done') return <span className="w-3 h-3 rounded-full bg-green-500 inline-block" />;
  if (status === 'running') return <span className="w-3 h-3 rounded-full bg-blue-500 inline-block animate-pulse" />;
  if (status === 'error') return <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />;
  return <span className="w-3 h-3 rounded-full bg-gray-300 inline-block" />;
}
