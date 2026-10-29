'use client';

import { useEffect, useRef, useState } from 'react';
import { A } from '@/components/anchor/ui';
import {
  EMPTY_W9, formatTin, validateW9, W9_CLASSIFICATIONS, W9_REVISION, W9_TAX_YEAR,
  type W9Data, type W9Signature,
} from '@/lib/w9';

type PdfJs = {
  getDocument: (o: { url: string }) => { promise: Promise<{ getPage: (n: number) => Promise<PdfPage> }> };
  GlobalWorkerOptions: { workerSrc: string };
};
type PdfPage = {
  getViewport: (o: { scale: number }) => { width: number; height: number };
  render: (o: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void> };
};

const PREVIEW_W = 640;
const DEFAULT_SIG = { x: 0.125, y: 0.716, w: 0.2 }; // sits on the "Signature of U.S. person" line
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const label = 'mb-1 block text-xs font-medium text-[color:var(--ds-body)]';
const section = 'rounded-[10px] bg-white p-5 space-y-4';

function Field({ id, text, children, hint }: { id: string; text: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label htmlFor={id} className={label}>{text}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-[color:var(--ds-body)]">{hint}</p>}
    </div>
  );
}

/** Prepare a signature: optional white-background removal, then trim to the ink. */
async function prepareImage(file: File, removeWhite: boolean): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('That image could not be read. Use a PNG or JPEG.'));
      i.src = url;
    });
    const scale = Math.min(1, 1200 / img.width);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * scale));
    c.height = Math.max(1, Math.round(img.height * scale));
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const plain = c.toDataURL('image/png');
    try {
      const px = ctx.getImageData(0, 0, c.width, c.height);
      let minX = c.width, minY = c.height, maxX = -1, maxY = -1;
      for (let y = 0; y < c.height; y++) {
        for (let x = 0; x < c.width; x++) {
          const i = (y * c.width + x) * 4;
          const lo = Math.min(px.data[i], px.data[i + 1], px.data[i + 2]);
          if (removeWhite) {
            if (lo > 235) px.data[i + 3] = 0;
            else if (lo > 190) px.data[i + 3] = Math.round(((235 - lo) / 45) * 255);
          }
          if (px.data[i + 3] > 40 && lo < 200) {
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
          }
        }
      }
      // Nothing detectable as ink: keep the original image so something always shows.
      if (maxX < 0) return plain;
      const pad = 6;
      minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
      maxX = Math.min(c.width - 1, maxX + pad); maxY = Math.min(c.height - 1, maxY + pad);
      const out = document.createElement('canvas');
      out.width = maxX - minX + 1;
      out.height = maxY - minY + 1;
      const octx = out.getContext('2d')!;
      octx.putImageData(px, -minX, -minY, minX, minY, out.width, out.height);
      return out.toDataURL('image/png');
    } catch {
      return plain;
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function W9Form() {
  const [d, setD] = useState<W9Data>({ ...EMPTY_W9, signedDate: today() });
  const [rawFile, setRawFile] = useState<File | null>(null);
  const [removeWhite, setRemoveWhite] = useState(true);
  const [sigUrl, setSigUrl] = useState<string | null>(null);
  const [sigAspect, setSigAspect] = useState(0.25);
  const [pos, setPos] = useState(DEFAULT_SIG);
  const [pageH, setPageH] = useState(PREVIEW_W * (791.968 / 611.976));
  const [recipient, setRecipient] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<null | 'email' | 'download'>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const takeFile = (f: File | undefined | null) => {
    if (!f) return;
    if (!/^image\/(png|jpe?g)$/.test(f.type)) { setMsg({ ok: false, text: 'Signature must be a PNG or JPEG image.' }); return; }
    if (f.size > 8_000_000) { setMsg({ ok: false, text: 'Signature image must be under 8 MB.' }); return; }
    setMsg(null);
    setPos(DEFAULT_SIG);
    setRawFile(f);
  };

  const set = <K extends keyof W9Data>(k: K, v: W9Data[K]) => setD((p) => ({ ...p, [k]: v }));
  const sig: W9Signature | null = sigUrl ? { dataUrl: sigUrl, ...pos } : null;
  const problems = validateW9(d, sig);

  // Render page 1 of the blank IRS form as the placement surface.
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs' as any)) as unknown as PdfJs;
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        const doc = await pdfjs.getDocument({ url: '/forms/fw9.pdf' }).promise;
        const page = await doc.getPage(1);
        const base = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: (PREVIEW_W / base.width) * Math.min(2, window.devicePixelRatio || 1) });
        const canvas = canvasRef.current;
        if (!canvas || !live) return;
        canvas.width = vp.width;
        canvas.height = vp.height;
        setPageH((base.height / base.width) * PREVIEW_W);
        await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp }).promise;
      } catch {
        if (live) setMsg({ ok: false, text: 'The form preview could not be loaded. You can still fill and send the form.' });
      }
    })();
    return () => { live = false; };
  }, []);

  // Rebuild the signature image when the file or the transparency option changes.
  useEffect(() => {
    if (!rawFile) return;
    let live = true;
    prepareImage(rawFile, removeWhite)
      .then((url) => {
        if (!live) return;
        const i = new Image();
        i.onload = () => { if (live) { setSigAspect(i.height / i.width); setSigUrl(url); } };
        i.src = url;
      })
      .catch((e: Error) => live && setMsg({ ok: false, text: e.message }));
    return () => { live = false; };
  }, [rawFile, removeWhite]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const box = pageRef.current!.getBoundingClientRect();
    drag.current = { dx: e.clientX - box.left - pos.x * box.width, dy: e.clientY - box.top - pos.y * box.height };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const box = pageRef.current!.getBoundingClientRect();
    const h = pos.w * sigAspect * (box.width / box.height);
    setPos((p) => ({
      ...p,
      x: Math.min(1 - p.w, Math.max(0, (e.clientX - box.left - drag.current!.dx) / box.width)),
      y: Math.min(1 - h, Math.max(0, (e.clientY - box.top - drag.current!.dy) / box.height)),
    }));
  };
  const nudge = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.01 : 0.002;
    const m: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const v = m[e.key];
    if (!v) return;
    e.preventDefault();
    setPos((p) => ({ ...p, x: Math.min(1 - p.w, Math.max(0, p.x + v[0])), y: Math.min(0.98, Math.max(0, p.y + v[1])) }));
  };

  const submit = async (action: 'email' | 'download') => {
    setMsg(null);
    setShowErrors(true);
    if (problems.length) return;
    if (action === 'email' && !/^\S+@\S+\.\S+$/.test(recipient.trim())) {
      setMsg({ ok: false, text: 'Enter a valid recipient email.' });
      return;
    }
    setBusy(action);
    try {
      const r = await fetch('/api/admin/get-paid/w9', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, recipient: recipient.trim() || undefined, message: note, data: d, signature: sig }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? 'Something went wrong.');
      }
      if (action === 'download') {
        const url = URL.createObjectURL(await r.blob());
        const a = document.createElement('a');
        a.href = url;
        a.download = `W-9-${W9_TAX_YEAR}-${d.name.trim().replace(/\s+/g, '-')}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        setMsg({ ok: true, text: 'Completed W-9 downloaded.' });
      } else {
        setMsg({ ok: true, text: `Completed W-9 emailed to ${recipient.trim()} as a PDF attachment.` });
      }
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Something went wrong.' });
    } finally {
      setBusy(null);
    }
  };

  const tinPlaceholder = d.tinType === 'ssn' ? '123-45-6789' : '12-3456789';
  const showForeign = d.classification === 'partnership' || d.classification === 'trust_estate' || d.classification === 'llc';

  return (
    <div className="mx-auto max-w-[1200px] space-y-5 p-4 sm:p-6">
      <div>
        <h1 className={A.title}>Form W-9 for {W9_TAX_YEAR}</h1>
        <p className={A.subtitle}>
          Fill the official IRS Request for Taxpayer Identification Number and Certification ({W9_REVISION}, the current final IRS revision), place a signature, then generate the PDF and email it in one step. Nothing is saved on the server.
        </p>
      </div>

      {msg && <div className={msg.ok ? A.notice : A.error} role="status">{msg.text}</div>}
      {showErrors && problems.length > 0 && (
        <div className={A.error} role="alert">
          <p className="font-medium">Complete these before generating:</p>
          <ul className="mt-1 list-disc pl-5">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,680px)]">
        <div className="space-y-5">
          <section className={section}>
            <h2 className="text-sm font-semibold text-[color:var(--ds-ink)]">Name and classification</h2>
            <Field id="w9-name" text="1. Name of entity/individual">
              <input id="w9-name" className={A.input} value={d.name} onChange={(e) => set('name', e.target.value)} autoComplete="name" />
            </Field>
            <Field id="w9-biz" text="2. Business name/disregarded entity name, if different">
              <input id="w9-biz" className={A.input} value={d.businessName} onChange={(e) => set('businessName', e.target.value)} />
            </Field>
            <Field id="w9-class" text="3a. Federal tax classification">
              <select id="w9-class" className={A.input} value={d.classification} onChange={(e) => set('classification', e.target.value as W9Data['classification'])}>
                <option value="">Select one</option>
                {W9_CLASSIFICATIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </Field>
            {d.classification === 'llc' && (
              <Field id="w9-llc" text="LLC tax classification">
                <select id="w9-llc" className={A.input} value={d.llcTaxClass} onChange={(e) => set('llcTaxClass', e.target.value as W9Data['llcTaxClass'])}>
                  <option value="">Select</option>
                  <option value="C">C - C corporation</option>
                  <option value="S">S - S corporation</option>
                  <option value="P">P - Partnership</option>
                </select>
              </Field>
            )}
            {d.classification === 'other' && (
              <Field id="w9-other" text="Other (describe)">
                <input id="w9-other" className={A.input} value={d.otherText} onChange={(e) => set('otherText', e.target.value)} />
              </Field>
            )}
            {showForeign && (
              <label className="flex items-start gap-2 text-sm text-[color:var(--ds-ink)]">
                <input type="checkbox" className="mt-1" checked={d.foreignOwners} onChange={(e) => set('foreignOwners', e.target.checked)} />
                3b. This entity has foreign partners, owners or beneficiaries (flow-through entity)
              </label>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="w9-exempt" text="4. Exempt payee code (if any)">
                <input id="w9-exempt" className={A.input} maxLength={3} value={d.exemptPayeeCode} onChange={(e) => set('exemptPayeeCode', e.target.value)} />
              </Field>
              <Field id="w9-fatca" text="4. FATCA reporting code (if any)">
                <input id="w9-fatca" className={A.input} maxLength={3} value={d.fatcaCode} onChange={(e) => set('fatcaCode', e.target.value)} />
              </Field>
            </div>
          </section>

          <section className={section}>
            <h2 className="text-sm font-semibold text-[color:var(--ds-ink)]">Address</h2>
            <Field id="w9-addr" text="5. Address (number, street, apt. or suite no.)">
              <input id="w9-addr" className={A.input} value={d.address} onChange={(e) => set('address', e.target.value)} autoComplete="street-address" />
            </Field>
            <Field id="w9-csz" text="6. City, state and ZIP code">
              <input id="w9-csz" className={A.input} value={d.cityStateZip} onChange={(e) => set('cityStateZip', e.target.value)} />
            </Field>
            <Field id="w9-req" text="Requester's name and address (optional)">
              <textarea id="w9-req" rows={3} className={A.input} value={d.requester} onChange={(e) => set('requester', e.target.value)} />
            </Field>
            <Field id="w9-acct" text="7. Account number(s) (optional)">
              <input id="w9-acct" className={A.input} value={d.accountNumbers} onChange={(e) => set('accountNumbers', e.target.value)} />
            </Field>
          </section>

          <section className={section}>
            <h2 className="text-sm font-semibold text-[color:var(--ds-ink)]">Part I: Taxpayer identification number</h2>
            <div className="flex gap-4 text-sm text-[color:var(--ds-ink)]">
              {(['ein', 'ssn'] as const).map((t) => (
                <label key={t} className="flex items-center gap-2">
                  <input type="radio" name="tin-type" checked={d.tinType === t} onChange={() => setD((p) => ({ ...p, tinType: t, tin: formatTin(t, p.tin) }))} />
                  {t === 'ein' ? 'Employer identification number (EIN)' : 'Social security number (SSN)'}
                </label>
              ))}
            </div>
            <Field id="w9-tin" text={d.tinType === 'ssn' ? 'SSN' : 'EIN'} hint="Used only to build this PDF. It is not stored or logged.">
              <input id="w9-tin" className={A.input} inputMode="numeric" autoComplete="off" placeholder={tinPlaceholder} value={d.tin} onChange={(e) => set('tin', formatTin(d.tinType, e.target.value))} />
            </Field>
          </section>

          <section className={section}>
            <h2 className="text-sm font-semibold text-[color:var(--ds-ink)]">Part II: Certification and signature</h2>
            <label className="flex items-start gap-2 text-sm text-[color:var(--ds-ink)]">
              <input type="checkbox" className="mt-1" checked={d.certified} onChange={(e) => set('certified', e.target.checked)} />
              <span>
                Under penalties of perjury, I certify that the number shown is my correct TIN; I am not subject to backup withholding (or have not been notified that I am); I am a U.S. citizen or other U.S. person; and any FATCA code entered is correct.
              </span>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <span className={label}>Signature image (PNG or JPEG)</span>
                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Upload signature image. Drop a file here or press Enter to browse."
                  onClick={() => fileInput.current?.click()}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.current?.click(); } }}
                  onDragOver={(e) => { e.preventDefault(); setOver(true); }}
                  onDragLeave={() => setOver(false)}
                  onDrop={(e) => { e.preventDefault(); setOver(false); takeFile(e.dataTransfer.files?.[0]); }}
                  className={`flex min-h-[92px] cursor-pointer flex-col items-center justify-center gap-1 rounded-[10px] border-2 border-dashed px-3 py-4 text-center text-sm transition-colors ${over ? 'border-[color:var(--ds-primary)] bg-[color:var(--ds-selected)]' : 'border-[color:var(--ds-line)] bg-white hover:bg-[color:var(--ds-hover)]'}`}
                >
                  {sigUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={sigUrl} alt="Uploaded signature" className="max-h-12 max-w-full object-contain" />
                  ) : null}
                  <span className="font-medium text-[color:var(--ds-primary)]">{rawFile ? 'Replace signature' : 'Drop signature here or click to browse'}</span>
                  <span className="text-xs text-[color:var(--ds-body)]">{rawFile ? rawFile.name : 'PNG or JPEG, up to 8 MB'}</span>
                </div>
                <input ref={fileInput} id="w9-sig" type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => { takeFile(e.target.files?.[0]); e.target.value = ''; }} />
              </div>
              <Field id="w9-date" text="Date signed">
                <input id="w9-date" type="date" className={A.input} value={d.signedDate} onChange={(e) => set('signedDate', e.target.value)} />
              </Field>
            </div>
            {sigUrl && (
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm text-[color:var(--ds-ink)]">
                  <input type="checkbox" checked={removeWhite} onChange={(e) => setRemoveWhite(e.target.checked)} />
                  Make the white background transparent
                </label>
                <Field id="w9-size" text={`Signature size: ${Math.round(pos.w * 100)}% of page width`}>
                  <input id="w9-size" type="range" min={8} max={50} value={Math.round(pos.w * 100)} className="w-full"
                    onChange={(e) => setPos((p) => ({ ...p, w: Number(e.target.value) / 100 }))} />
                </Field>
                <button type="button" className={A.small} onClick={() => setPos((p) => ({ ...DEFAULT_SIG, w: p.w }))}>Snap to signature line</button>
              </div>
            )}
          </section>

          <section className={section}>
            <h2 className="text-sm font-semibold text-[color:var(--ds-ink)]">Generate and send</h2>
            <Field id="w9-to" text="Email the completed PDF to">
              <input id="w9-to" type="email" className={A.input} value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="name@example.com" />
            </Field>
            <Field id="w9-note" text="Message (optional)">
              <textarea id="w9-note" rows={3} className={A.input} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <div className="flex flex-wrap gap-3">
              <button type="button" className={A.primary} disabled={busy !== null} onClick={() => void submit('email')}>
                {busy === 'email' ? 'Generating and sending...' : 'Generate PDF and email'}
              </button>
              <button type="button" className={A.outline} disabled={busy !== null} onClick={() => void submit('download')}>
                {busy === 'download' ? 'Generating...' : 'Download PDF only'}
              </button>
            </div>
          </section>
        </div>

        <div className="lg:sticky lg:top-4 lg:self-start">
          <p className="mb-2 text-xs text-[color:var(--ds-body)]">
            Drop a signature image anywhere on the form, then drag it onto the Part II line. Arrow keys nudge it (hold Shift for larger steps). The preview shows the blank form; fields are filled when the PDF is generated.
          </p>
          <div className="overflow-x-auto">
            <div ref={pageRef} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); takeFile(e.dataTransfer.files?.[0]); }} className="relative border border-slate-300 bg-white shadow-sm" style={{ width: PREVIEW_W, height: pageH }}>
              <canvas ref={canvasRef} style={{ width: PREVIEW_W, height: pageH }} aria-label="IRS Form W-9 page 1" />
              {sigUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={sigUrl}
                  alt="Signature position. Use arrow keys to move."
                  tabIndex={0}
                  draggable={false}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={() => { drag.current = null; }}
                  onKeyDown={nudge}
                  className="absolute cursor-move touch-none select-none outline-dashed outline-1 outline-[color:var(--ds-primary)] focus:outline-2"
                  style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%`, width: `${pos.w * 100}%` }}
                />
              )}
              {d.signedDate && sigUrl && (
                <span className="pointer-events-none absolute text-[11px] text-black" style={{ left: 425 / 611.976 * PREVIEW_W, top: pageH - (196 + 10) / 791.968 * pageH }}>
                  {d.signedDate.slice(5, 7)}/{d.signedDate.slice(8)}/{d.signedDate.slice(0, 4)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
