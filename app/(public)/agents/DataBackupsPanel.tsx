'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';

type Backup = { id: string; kind: string; dealCount: number; createdAt: string };
type Preview = {
  total: number; valid: number; skipped: Array<{ row: number; reason: string }>; mapped: Record<string, string>;
  sample: Array<{ propertyAddress: string; buyerNames: string; sellerNames: string; effectiveDate: string; closingDate: string; status: string }>;
};

const BTN = 'inline-flex items-center gap-1.5 rounded-md border border-[#E6E5EC] bg-white px-3 py-1.5 text-[13px] font-medium text-[#301D5D] hover:!bg-[#EFEAF8] hover:!text-[#301D5D] disabled:opacity-50';
const KIND: Record<string, string> = { monthly: 'Monthly', manual: 'Manual', 'pre-import': 'Before Import' };
const API = '/api/closing-time/data';

export default function DataBackupsPanel() {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadBackups = useCallback(async () => {
    const res = await fetch(`${API}?action=backups`, { credentials: 'same-origin' });
    if (res.ok) setBackups((await res.json()).backups ?? []);
  }, []);
  useEffect(() => { void loadBackups(); }, [loadBackups]);

  async function post(body: Record<string, unknown>) {
    const res = await fetch(API, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message ?? data?.error ?? 'Something went wrong');
    return data;
  }

  async function backupNow() {
    setBusy(true); setMsg(null);
    try { await post({ action: 'backup' }); await loadBackups(); setMsg({ ok: true, text: 'Backup saved.' }); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Backup failed' }); }
    finally { setBusy(false); }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setMsg(null); setPreview(null); setFileName(file.name);
    const text = await file.text();
    setCsv(text); setBusy(true);
    try { setPreview((await post({ action: 'import-preview', csv: text })).preview); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not read the file' }); }
    finally { setBusy(false); }
  }

  async function runImport() {
    setBusy(true); setMsg(null);
    try {
      const r = await post({ action: 'import', csv });
      setMsg({ ok: true, text: r.added ? `${r.added} deals imported. Reloading.` : 'Nothing new to import. Those addresses already exist.' });
      if (r.added) setTimeout(() => window.location.reload(), 1200);
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Import failed' }); }
    finally { setBusy(false); }
  }

  return (
    <div className="ds-page space-y-4">
      <div>
        <h2 className="text-[22px] font-semibold text-[#1B1726]">Data And Backups</h2>
        <p className="mt-1 text-[14px] text-[#4A4757]">Export your data and keep monthly backups.</p>
      </div>
      <section className="ds-card">
        <h2 className="text-[15px] font-semibold text-[#1B1726]">Export Your Data</h2>
        <p className="mt-1 text-[14px] text-[#4A4757]">Your deals and contacts belong to you. Download them any time in open formats.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a className={BTN} href={`${API}?action=export&format=json`}><Download className="h-3.5 w-3.5" aria-hidden="true" />Everything (JSON)</a>
          <a className={BTN} href={`${API}?action=export&format=deals-csv`}><Download className="h-3.5 w-3.5" aria-hidden="true" />Deals (CSV)</a>
          <a className={BTN} href={`${API}?action=export&format=contacts-csv`}><Download className="h-3.5 w-3.5" aria-hidden="true" />Contacts (CSV)</a>
        </div>
      </section>

      <section className="ds-card">
        <h2 className="text-[15px] font-semibold text-[#1B1726]">Monthly Backups</h2>
        <p className="mt-1 text-[14px] text-[#4A4757]">A backup is saved on the first of each month, and before every import. The last 12 are kept. Texas brokers must keep transaction records for four years.</p>
        <div className="mt-3"><button type="button" className={BTN} disabled={busy} onClick={() => void backupNow()}>Back Up Now</button></div>
        <ul className="mt-3 divide-y divide-[#E6E5EC]">
          {backups.length === 0 && <li className="py-2 text-[14px] text-[#6B6878]">No backups yet.</li>}
          {backups.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-3 py-2 text-[14px] text-[#1B1726]">
              <span>{new Date(b.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })} <span className="text-[#6B6878]">· {KIND[b.kind] ?? b.kind} · {b.dealCount} deals</span></span>
              <a className={BTN} href={`${API}?action=download-backup&id=${b.id}`}><Download className="h-3.5 w-3.5" aria-hidden="true" />Download</a>
            </li>
          ))}
        </ul>
      </section>

      <section className="ds-card">
        <h2 className="text-[15px] font-semibold text-[#1B1726]">Import Deals</h2>
        <p className="mt-1 text-[14px] text-[#4A4757]">Upload a CSV from dotloop, Paperless Pipeline, a spreadsheet or any other system. The first row must be column names. A column named Property Address is required. Buyers, Sellers, Effective Date, Closing Date, Status, Lender and Notes are optional. Deals with an address you already have are skipped.</p>
        <div className="mt-3">
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
          <button type="button" className={BTN} disabled={busy} onClick={() => fileRef.current?.click()}><Upload className="h-3.5 w-3.5" aria-hidden="true" />Choose CSV File</button>
          {fileName && <span className="ml-3 text-[13px] text-[#6B6878]">{fileName}</span>}
        </div>
        {preview && (
          <div className="mt-4 space-y-2 text-[14px] text-[#1B1726]">
            <p>{preview.valid} of {preview.total} rows are ready to import.{preview.skipped.length > 0 && ` ${preview.skipped.length} skipped.`}</p>
            <p className="text-[13px] text-[#6B6878]">Matched Columns: {Object.entries(preview.mapped).map(([k, v]) => `${k} = ${v}`).join(', ') || 'none'}</p>
            {preview.sample.length > 0 && (
              <div className="overflow-x-auto rounded-md border border-[#E6E5EC]">
                <table className="min-w-full text-left text-[13px]">
                  <thead className="bg-[#F6F3FB] text-[11px] font-medium uppercase tracking-wide text-[#6B6878]">
                    <tr><th className="px-3 py-2">Address</th><th className="px-3 py-2">Buyers</th><th className="px-3 py-2">Sellers</th><th className="px-3 py-2">Effective</th><th className="px-3 py-2">Closing</th><th className="px-3 py-2">Status</th></tr>
                  </thead>
                  <tbody className="divide-y divide-[#E6E5EC]">
                    {preview.sample.map((r, i) => (<tr key={i}><td className="px-3 py-2">{r.propertyAddress}</td><td className="px-3 py-2">{r.buyerNames}</td><td className="px-3 py-2">{r.sellerNames}</td><td className="px-3 py-2">{r.effectiveDate}</td><td className="px-3 py-2">{r.closingDate}</td><td className="px-3 py-2">{r.status}</td></tr>))}
                  </tbody>
                </table>
              </div>
            )}
            {preview.skipped.slice(0, 5).map((s) => (<p key={s.row} className="text-[13px] text-[#661102]">Row {s.row}: {s.reason}</p>))}
            <button type="button" className={BTN} disabled={busy || preview.valid === 0} onClick={() => void runImport()}>Import {preview.valid} Deals</button>
          </div>
        )}
        {msg && <p role="status" className={`mt-3 text-[14px] ${msg.ok ? 'text-[#005A00]' : 'text-[#661102]'}`}>{msg.text}</p>}
      </section>
    </div>
  );
}
