'use client';

import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Download, Trash2 } from 'lucide-react';

const BTN = 'inline-flex items-center gap-1.5 rounded-md border border-[#E6E5EC] bg-white px-3 py-1.5 text-[13px] font-medium text-[#301D5D] hover:!bg-[#EFEAF8] hover:!text-[#301D5D] disabled:opacity-50';
const INPUT = 'w-full max-w-[260px] rounded-md border border-[#E6E5EC] bg-white px-3 py-1.5 text-[14px] text-[#1B1726]';
const MAX_BYTES = 40 * 1024 * 1024;

type Item = { id: string; file: File };

function parseRanges(spec: string, total: number): number[] {
  const out = new Set<number>();
  for (const part of spec.split(',').map((p) => p.trim()).filter(Boolean)) {
    const m = part.match(/^(\d*)\s*-\s*(\d*)$/);
    if (m) {
      const a = m[1] ? Number(m[1]) : 1; const b = m[2] ? Number(m[2]) : total;
      for (let i = Math.max(1, a); i <= Math.min(total, b); i += 1) out.add(i - 1);
    } else if (/^\d+$/.test(part)) { const n = Number(part); if (n >= 1 && n <= total) out.add(n - 1); }
    else throw new Error(`"${part}" is not a page or range. Use a format like 1-3, 5, 8-.`);
  }
  return [...out].sort((a, b) => a - b);
}

function save(bytes: Uint8Array, name: string) {
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function imageToPdfPage(doc: import('pdf-lib').PDFDocument, file: File) {
  // Re-encode through a canvas so any phone photo format (HEIC excluded by browsers) becomes JPEG, and rotate per EXIF automatically.
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, 2200 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not read image'))), 'image/jpeg', 0.85));
  const img = await doc.embedJpg(new Uint8Array(await blob.arrayBuffer()));
  const w = 612; const h = Math.round((img.height / img.width) * w);
  const page = doc.addPage(h > 792 ? [Math.round((img.width / img.height) * 792), 792] : [w, h]);
  const { width, height } = page.getSize();
  page.drawImage(img, { x: 0, y: 0, width, height });
}

export default function DocumentToolsPanel() {
  const [items, setItems] = useState<Item[]>([]);
  const [single, setSingle] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [spec, setSpec] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const addRef = useRef<HTMLInputElement>(null);
  const oneRef = useRef<HTMLInputElement>(null);

  const run = async (fn: () => Promise<string>) => {
    setBusy(true); setMsg(null);
    try { setMsg({ ok: true, text: await fn() }); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Something went wrong' }); }
    finally { setBusy(false); }
  };

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const next = [...files].filter((f) => /pdf|jpeg|jpg|png/i.test(f.type) || /\.(pdf|jpe?g|png)$/i.test(f.name));
    if (next.some((f) => f.size > MAX_BYTES)) { setMsg({ ok: false, text: 'Each file must be under 40 MB.' }); return; }
    setItems((cur) => [...cur, ...next.map((file) => ({ id: `${file.name}-${file.size}-${Math.random()}`, file }))]);
  };
  const move = (i: number, d: -1 | 1) => setItems((cur) => { const n = [...cur]; const j = i + d; if (j < 0 || j >= n.length) return n; [n[i], n[j]] = [n[j], n[i]]; return n; });

  const merge = () => run(async () => {
    const { PDFDocument } = await import('pdf-lib');
    const out = await PDFDocument.create();
    for (const { file } of items) {
      if (/pdf/i.test(file.type) || /\.pdf$/i.test(file.name)) {
        const src = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: false });
        (await out.copyPages(src, src.getPageIndices())).forEach((p) => out.addPage(p));
      } else await imageToPdfPage(out, file);
    }
    save(await out.save(), `combined-${new Date().toISOString().slice(0, 10)}.pdf`);
    return `Combined ${items.length} files into ${out.getPageCount()} pages.`;
  });

  const pickSingle = async (f: File | undefined) => {
    if (!f) return;
    setSingle(null); setPageCount(0); setMsg(null);
    await run(async () => {
      if (f.size > MAX_BYTES) throw new Error('The file must be under 40 MB.');
      const { PDFDocument } = await import('pdf-lib');
      const doc = await PDFDocument.load(await f.arrayBuffer());
      setSingle(f); setPageCount(doc.getPageCount());
      return `${f.name} has ${doc.getPageCount()} pages.`;
    });
  };

  const pageOp = (kind: 'extract' | 'remove' | 'rotate90' | 'rotate180' | 'rotate270') => run(async () => {
    if (!single) throw new Error('Choose a PDF first.');
    const { PDFDocument, degrees } = await import('pdf-lib');
    const doc = await PDFDocument.load(await single.arrayBuffer());
    const total = doc.getPageCount();
    const chosen = spec.trim() ? parseRanges(spec, total) : kind.startsWith('rotate') ? doc.getPageIndices() : [];
    if (!chosen.length) throw new Error('Enter the pages to use, for example 1-3, 5.');
    const base = single.name.replace(/\.pdf$/i, '');
    if (kind === 'extract') {
      const out = await PDFDocument.create();
      (await out.copyPages(doc, chosen)).forEach((p) => out.addPage(p));
      save(await out.save(), `${base}-pages.pdf`);
      return `Saved ${chosen.length} pages.`;
    }
    if (kind === 'remove') {
      if (chosen.length >= total) throw new Error('That would remove every page.');
      [...chosen].reverse().forEach((i) => doc.removePage(i));
      save(await doc.save(), `${base}-edited.pdf`);
      return `Removed ${chosen.length} pages. ${doc.getPageCount()} remain.`;
    }
    const by = kind === 'rotate90' ? 90 : kind === 'rotate180' ? 180 : 270;
    chosen.forEach((i) => { const p = doc.getPage(i); p.setRotation(degrees((p.getRotation().angle + by) % 360)); });
    save(await doc.save(), `${base}-rotated.pdf`);
    return `Rotated ${chosen.length} pages.`;
  });

  return (
    <div className="ds-page space-y-4">
      <div>
        <h2 className="text-[22px] font-semibold text-[#1B1726]">Document Tools</h2>
        <p className="mt-1 text-[14px] text-[#4A4757]">Combine, scan, split and rotate PDFs.</p>
      </div>
      <section className="ds-card">
        <h2 className="text-[15px] font-semibold text-[#1B1726]">Combine Files And Scan To PDF</h2>
        <p className="mt-1 text-[14px] text-[#4A4757]">Add PDFs and photos, put them in order, and download one PDF. Phone photos of paper contracts become pages. Files stay on your device. Nothing is uploaded.</p>
        <input ref={addRef} type="file" multiple accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={BTN} onClick={() => addRef.current?.click()}>Add Files</button>
          <button type="button" className={BTN} disabled={busy || items.length < 1} onClick={() => void merge()}><Download className="h-3.5 w-3.5" aria-hidden="true" />Download PDF</button>
        </div>
        <ul className="mt-3 divide-y divide-[#E6E5EC]">
          {items.map((it, i) => (
            <li key={it.id} className="flex items-center justify-between gap-2 py-2 text-[14px] text-[#1B1726]">
              <span className="min-w-0 truncate">{i + 1}. {it.file.name}</span>
              <span className="flex gap-1">
                <button type="button" aria-label="Move up" className={BTN} onClick={() => move(i, -1)}><ArrowUp className="h-3.5 w-3.5" /></button>
                <button type="button" aria-label="Move down" className={BTN} onClick={() => move(i, 1)}><ArrowDown className="h-3.5 w-3.5" /></button>
                <button type="button" aria-label="Remove file" className={BTN} onClick={() => setItems((c) => c.filter((x) => x.id !== it.id))}><Trash2 className="h-3.5 w-3.5" /></button>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="ds-card">
        <h2 className="text-[15px] font-semibold text-[#1B1726]">Split, Remove And Rotate Pages</h2>
        <p className="mt-1 text-[14px] text-[#4A4757]">Choose a PDF, then enter pages such as 1-3, 5, 8-. Leave pages empty to rotate every page.</p>
        <input ref={oneRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { void pickSingle(e.target.files?.[0]); e.target.value = ''; }} />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" className={BTN} disabled={busy} onClick={() => oneRef.current?.click()}>Choose PDF</button>
          {single && <span className="text-[13px] text-[#7A7787]">{single.name} · {pageCount} pages</span>}
        </div>
        {single && (
          <div className="mt-3 space-y-2">
            <input className={INPUT} placeholder="Pages, For Example 1-3, 5" value={spec} onChange={(e) => setSpec(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              <button type="button" className={BTN} disabled={busy} onClick={() => void pageOp('extract')}>Save These Pages</button>
              <button type="button" className={BTN} disabled={busy} onClick={() => void pageOp('remove')}>Remove These Pages</button>
              <button type="button" className={BTN} disabled={busy} onClick={() => void pageOp('rotate90')}>Rotate 90</button>
              <button type="button" className={BTN} disabled={busy} onClick={() => void pageOp('rotate180')}>Rotate 180</button>
              <button type="button" className={BTN} disabled={busy} onClick={() => void pageOp('rotate270')}>Rotate 270</button>
            </div>
          </div>
        )}
      </section>
      {msg && <p role="status" className={`text-[14px] ${msg.ok ? 'text-[#005A00]' : 'text-[#661102]'}`}>{msg.text}</p>}
    </div>
  );
}
