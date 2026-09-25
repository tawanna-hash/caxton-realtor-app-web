'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Eye, EyeOff, LockKeyhole, UnlockKeyhole, GripVertical, Undo2, Redo2, ScanLine, Layers, Plus, Check, X, Pencil, Trash2 } from 'lucide-react';
import type { Hotspot, HotspotConfig } from '@/lib/hotspots';
import type { Magazine } from '@/lib/magazines';
import { clampRect, computeZMove, DEFAULT_NEW_RECT, TYPE_LABELS, type ZMove } from '@/lib/hotspot-editor-helpers';
import { destinationIdentity, hotspotDestination, overlappingDuplicates, overlapRatio, reviewProblem, reviewStatus, sameDetectedAction } from '@/lib/hotspot-review';
import { useUrlNumber, useUrlString } from '@/lib/use-url-state';
import HotspotConfigModal from './HotspotConfigModal';
import HotspotCanvas from './HotspotCanvas';

type Change = { id: number; values: Partial<Hotspot> };
type History = { label: string; before: Hotspot[]; after: Hotspot[] };
type Scan = { page_idx: number; status: string; warnings: string[]; found: number };
type Props = { magazine: Magazine; initialHotspots: Hotspot[]; prevIssues: { id: number; issue_label: string; hotspot_count: number }[] };
const button = 'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40';
const primary = `${button} !border-[#301D5D] !bg-[#301D5D] !text-white hover:!bg-[#483074]`;
const input = 'min-h-9 rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-900';
const icon = 'h-4 w-4';

/** Full row snapshots for history, but never overwrite detection provenance or server versions. */
function editable(h: Hotspot): Partial<Hotspot> {
  return {
    page_idx: h.page_idx, x_frac: h.x_frac, y_frac: h.y_frac, w_frac: h.w_frac, h_frac: h.h_frac,
    type: h.type, config: h.config, label: h.label, advertiser_name: h.advertiser_name, advertiser_id: h.advertiser_id,
    z_index: h.z_index || 0, review_status: reviewStatus(h), is_published: h.is_published,
    editor_locked: !!h.editor_locked, editor_hidden: !!h.editor_hidden, is_deleted: !!h.is_deleted,
  };
}

export default function HotspotStudio({ magazine, initialHotspots, prevIssues }: Props) {
  const [hotspots, setHotspots] = useState(initialHotspots);
  const rowsRef = useRef(initialHotspots);
  const [page, setPage] = useUrlNumber('p', 0);
  const [view, setView] = useUrlString<'single' | 'spread'>('view', 'single');
  const [selected, setSelected] = useState<number | null>(null);
  const [checked, setChecked] = useState<number[]>([]);
  const [editing, setEditing] = useState<Hotspot | null>(null);
  const [filter, setFilter] = useState('attention');
  const [search, setSearch] = useState('');
  const [grouped, setGrouped] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [scans, setScans] = useState<Scan[]>([]);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<History[]>([]);
  const [future, setFuture] = useState<History[]>([]);
  const [copyId, setCopyId] = useState('');
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [dragId, setDragId] = useState<number | null>(null);
  const [cleanupResult, setCleanupResult] = useState('');
  const pageIdx = Math.max(0, Math.min(page, magazine.page_count - 1));
  const pages = view === 'single' || pageIdx === 0 ? [pageIdx] :
    [pageIdx % 2 ? pageIdx : pageIdx - 1, pageIdx % 2 ? pageIdx + 1 : pageIdx].filter(p => p < magazine.page_count);
  const blocked = busy || scanning || loading;
  const base = `/api/admin/magazines/${magazine.id}`;

  const replaceRows = useCallback((rows: Hotspot[]) => {
    rowsRef.current = rows; setHotspots(rows);
  }, []);
  const mergeRows = useCallback((updates: Hotspot[]) => {
    const map = new Map(updates.map(h => [h.id, h]));
    replaceRows(rowsRef.current.map(h => map.get(h.id) || h));
  }, [replaceRows]);

  const refresh = useCallback(async () => {
    const response = await fetch(`${base}/hotspot-workspace`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Could not reload hotspots');
    const data = await response.json();
    replaceRows(data.hotspots); setScans(data.scans || []);
  }, [base, replaceRows]);
  useEffect(() => {
    let cancelled = false;
    fetch(`${base}/hotspot-workspace`, { cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error('Could not load saved hotspots');
      const data = await response.json();
      if (!cancelled) { replaceRows(data.hotspots); setScans(data.scans || []); }
    }).catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [base, replaceRows]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (busyRef.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const mutate = useCallback(async (changes: Change[], label: string, record = true) => {
    if (!changes.length) return [];
    if (busyRef.current) throw new Error('Wait for the current save to finish');
    busyRef.current = true; setBusy(true); setError(''); setMessage('Saving…'); setCleanupResult('');
    const before = changes.map(c => rowsRef.current.find(h => h.id === c.id)!);
    try {
      const res = await fetch(`${base}/hotspot-workspace`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changes: changes.map((c, i) => ({ ...c, version: before[i]?.editor_version || 0 })) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      const after = data.hotspots as Hotspot[];
      mergeRows(after);
      if (record) { setHistory(h => [...h.slice(-59), { label, before, after }]); setFuture([]); }
      setMessage(`Saved: ${label}`);
      return after;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed. Your last saved version is unchanged.');
      setMessage('Not saved'); throw err;
    } finally { busyRef.current = false; setBusy(false); }
  }, [base, mergeRows]);
  const act = (changes: Change[], label: string) => { void mutate(changes, label).catch(() => undefined); };
  const undo = useCallback(async (redo = false) => {
    const entry = (redo ? future : history).at(-1);
    if (!entry || busyRef.current) return;
    try {
      await mutate((redo ? entry.after : entry.before).map(h => ({ id: h.id, values: editable(h) })), `${redo ? 'Redo' : 'Undo'} ${entry.label}`, false);
      if (redo) { setFuture(h => h.slice(0, -1)); setHistory(h => [...h, entry]); }
      else { setHistory(h => h.slice(0, -1)); setFuture(h => [...h, entry]); }
    } catch { /* visible save error */ }
  }, [future, history, mutate]);

  const active = hotspots.filter(h => !h.is_deleted && reviewStatus(h) !== 'rejected');
  const focused = active.find(h => h.id === selected);
  const pending = active.filter(h => reviewStatus(h) === 'pending');
  const approved = active.filter(h => reviewStatus(h) === 'approved' && !h.is_published);
  const pageRows = hotspots.filter(h => pages.includes(h.page_idx));
  const sorted = [...pageRows].sort((a, b) => a.page_idx - b.page_idx || (b.z_index || 0) - (a.z_index || 0) || b.id - a.id);
  const numbers = new Map(sorted.filter(h => !h.is_deleted && reviewStatus(h) !== 'rejected').map((h, i) => [h.id, i + 1]));
  const overlapIds = useMemo(() => {
    const ids = new Set<number>();
    const current = hotspots.filter(h => !h.is_deleted && reviewStatus(h) !== 'rejected');
    for (let i = 0; i < current.length; i++) for (let j = i + 1; j < current.length; j++) {
      const a = current[i], b = current[j];
      if (a.page_idx === b.page_idx && overlapRatio(a, b) > 0) { ids.add(a.id); ids.add(b.id); }
    }
    return ids;
  }, [hotspots]);
  // Only overlapping actions with different destinations require a decision.
  // Nested phone/email regions and the containing ad link are intentional.
  const conflictIds = useMemo(() => {
    const ids = new Set<number>();
    const current = hotspots.filter(h => !h.is_deleted && reviewStatus(h) !== 'rejected');
    for (let i = 0; i < current.length; i++) for (let j = i + 1; j < current.length; j++) {
      const a = current[i], b = current[j];
      if (a.page_idx !== b.page_idx || a.type !== b.type || overlapRatio(a, b) < .35 || sameDetectedAction(a, b)) continue;
      const aTarget = destinationIdentity(a.config), bTarget = destinationIdentity(b.config);
      if (aTarget && bTarget && aTarget !== bTarget) { ids.add(a.id); ids.add(b.id); }
    }
    return ids;
  }, [hotspots]);
  const needsAttention = (h: Hotspot) => !!reviewProblem(h) || conflictIds.has(h.id);
  const attention = pending.filter(needsAttention);
  const ready = pending.filter(h => !needsAttention(h));
  const queue = filter === 'attention' ? attention : filter === 'ready' ? ready : filter === 'approved' ? active.filter(h => reviewStatus(h) === 'approved') : filter === 'rejected' ? hotspots.filter(h => h.is_deleted || reviewStatus(h) === 'rejected') : active;
  const listed = queue.filter(h => `${h.label} ${h.advertiser_name} ${hotspotDestination(h.config)} ${h.detection?.evidence || ''}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.page_idx - b.page_idx || (b.z_index || 0) - (a.z_index || 0) || b.id - a.id);
  const groups = grouped ? Array.from(new Set(listed.map(h => `P${h.page_idx + 1} · ${h.advertiser_name || 'Unassigned'}`))).map(name => ({ name, rows: listed.filter(h => `P${h.page_idx + 1} · ${h.advertiser_name || 'Unassigned'}` === name) })) : [{ name: '', rows: listed }];
  const selection = checked.length ? hotspots.filter(h => checked.includes(h.id)) : focused ? [focused] : [];
  const selectable = selection.filter(h => !h.is_deleted && reviewStatus(h) !== 'rejected');
  const approvable = selectable.filter(h => !needsAttention(h));
  const go = (p: number) => { setPage(p); setSelected(null); setChecked([]); };
  const jump = (h: Hotspot) => {
    if (!pages.includes(h.page_idx)) setPage(h.page_idx);
    setSelected(h.id);
  };
  const select = (id: number | null) => {
    setSelected(id);
    const row = rowsRef.current.find(h => h.id === id);
    if (row) document.querySelector<HTMLElement>(`[data-hotspot-page="${row.page_idx}"]`)?.focus({ preventScroll: true });
  };

  const moveLayer = (h: Hotspot, move: ZMove) => {
    const next = computeZMove(active.filter(r => r.page_idx === h.page_idx), h.id, move);
    if (next !== null) act([{ id: h.id, values: { z_index: next } }], 'Layer order');
  };
  const reorder = (source: number, target: Hotspot) => {
    const h = hotspots.find(r => r.id === source);
    if (!h || h.page_idx !== target.page_idx || source === target.id) return;
    const ordered = sorted.filter(r => r.page_idx === target.page_idx && r.id !== source && !r.is_deleted && reviewStatus(r) !== 'rejected');
    ordered.splice(ordered.findIndex(r => r.id === target.id), 0, h);
    act(ordered.map((r, i) => ({ id: r.id, values: { z_index: ordered.length - i } })), 'Reorder layers');
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editing || blocked || preview || (e.target as HTMLElement).closest('input,textarea,select,button,[contenteditable=true]')) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); void undo(e.shiftKey); return; }
      if (!focused || focused.editor_locked || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      e.preventDefault();
      const el = document.querySelector(`[data-hotspot-page="${focused.page_idx}"]`);
      const bounds = el?.getBoundingClientRect();
      const dx = (e.shiftKey ? 10 : 1) / (bounds?.width || 440), dy = (e.shiftKey ? 10 : 1) / (bounds?.height || 600);
      const rect = clampRect({ ...focused,
        x_frac: focused.x_frac + (e.key === 'ArrowLeft' ? -dx : e.key === 'ArrowRight' ? dx : 0),
        y_frac: focused.y_frac + (e.key === 'ArrowUp' ? -dy : e.key === 'ArrowDown' ? dy : 0),
      });
      void mutate([{ id: focused.id, values: rect }], 'Move hotspot').catch(() => undefined);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [blocked, editing, preview, focused, mutate, undo]);

  const create = async (pageIdx: number) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    try {
      const res = await fetch(`${base}/hotspots`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        page_idx: pageIdx, x: DEFAULT_NEW_RECT.x_frac, y: DEFAULT_NEW_RECT.y_frac, w: DEFAULT_NEW_RECT.w_frac, h: DEFAULT_NEW_RECT.h_frac,
        type: 'link', config: { type: 'link', url: 'https://example.com', open_in: 'new_tab' }, is_published: false,
      }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Could not add hotspot');
      const h = data.hotspot as Hotspot;
      replaceRows([...rowsRef.current, h]);
      setHistory(entries => [...entries.slice(-59), { label: 'Add hotspot', before: [{ ...h, is_deleted: true, is_published: false }], after: [h] }]); setFuture([]);
      setSelected(h.id); setEditing(h); setMessage('Saved: new draft');
    } catch (err) { setError(err instanceof Error ? err.message : 'Create failed'); }
    finally { busyRef.current = false; setBusy(false); }
  };

  const scan = async (pageIdx?: number) => {
    if (busyRef.current || scanning) return;
    busyRef.current = true; setScanning(true); setError(''); setMessage('Preparing detection…'); setCleanupResult('');
    try {
      if (pageIdx !== undefined) {
        const res = await fetch(`${base}/extract-page`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ page_idx: pageIdx }) });
        const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Page scan failed');
        replaceRows(data.hotspots); setScans(data.scans || []);
        setMessage(`Page ${pageIdx + 1}: ${data.diagnostics.inserted} new drafts; ${data.diagnostics.skipped_duplicates || 0} existing/duplicate links skipped. Existing edits preserved.`);
        if (data.diagnostics.warnings?.length) setError(data.diagnostics.warnings.join(' · '));
      } else {
        const res = await fetch(`${base}/extract-all`, { method: 'POST' });
        if (!res.ok || !res.body) throw new Error('Could not start detection');
        const reader = res.body.getReader(), decoder = new TextDecoder();
        let buffer = '', done = false;
        const consume = (line: string) => {
          if (!line.trim()) return;
          const event = JSON.parse(line);
          if (event.type === 'error') throw new Error(event.message);
          if (event.type === 'page') setMessage(`Detecting: ${event.completed}/${event.total} pages reviewed by scanner…`);
          if (event.type === 'done') {
            done = true; replaceRows(event.hotspots); setScans(event.scans || []);
            setMessage(`Detection complete: ${event.diagnostics.inserted} new drafts; ${event.diagnostics.skipped_duplicates || 0} existing/duplicate links skipped. Review before publishing.`);
            if (event.errors?.length) setError(event.errors.join(' · '));
          }
        };
        while (true) {
          const chunk = await reader.read(); if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true });
          const lines = buffer.split('\n'); buffer = lines.pop() || '';
          lines.forEach(consume);
        }
        buffer += decoder.decode(); consume(buffer);
        if (!done) throw new Error('Scan interrupted. Completed pages are saved; rescan the remaining pages.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Detection failed');
      await refresh().catch(() => undefined);
    } finally { busyRef.current = false; setScanning(false); }
  };

  const duplicateCleanup = async () => {
    const duplicates = overlappingDuplicates(rowsRef.current);
    if (!duplicates.length) {
      const result = 'No overlapping duplicates found. Separate placements and different destinations are preserved.';
      setMessage(result); setCleanupResult(result); return;
    }
    if (!window.confirm(`Remove ${duplicates.length} overlapping duplicate hotspot(s)? Separate placements stay. Undo is available.`)) return;
    setCleanupResult('Removing overlapping duplicates…');
    try {
      await mutate(duplicates.map(h => ({ id: h.id, values: { is_deleted: true, is_published: false } })), 'Remove overlapping duplicates');
      setCleanupResult(`Removed ${duplicates.length} overlapping duplicate hotspot(s). Undo is available.`);
    } catch (err) {
      setCleanupResult(`Not removed: ${err instanceof Error ? err.message : 'Save failed'}`);
    }
  };

  const copyPrevious = async () => {
    if (!copyId || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    try {
      const res = await fetch(`${base}/hotspots-bulk-copy`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source_magazine_id: Number(copyId), published_only: true }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Copy failed');
      const oldIds = new Set(rowsRef.current.map(h => h.id));
      await refresh();
      const added = rowsRef.current.filter(h => !oldIds.has(h.id));
      setHistory(entries => [...entries.slice(-59), { label: 'Copy previous issue', before: added.map(h => ({ ...h, is_deleted: true, is_published: false })), after: added }]); setFuture([]);
      setMessage(`Copied ${added.length} drafts. Verify positions for this issue.`);
    } catch (err) { setError(err instanceof Error ? err.message : 'Copy failed'); }
    finally { busyRef.current = false; setBusy(false); }
  };

  return (
    <main className="min-h-screen bg-[#f6f5f8] pb-12 text-gray-900">
      <header className="border-b border-gray-200 bg-white px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <nav className="mb-1 text-xs text-gray-600"><Link href="/admin/magazines" className="underline">Magazines</Link> / <Link href={`/admin/magazines/${magazine.id}`} className="underline">{magazine.issue_label}</Link></nav>
            <h1 className="flex items-center gap-2 text-xl font-semibold"><Layers className="h-5 w-5 text-[#7059A8]" /> Hotspot Studio</h1>
            <p className="mt-1 text-sm text-gray-600">Upload → Detect → Review → Publish</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={button} disabled={blocked || !history.length} onClick={() => void undo()} title="Undo (⌘/Ctrl Z)"><Undo2 className={icon} />Undo</button>
            <button className={button} disabled={blocked || !future.length} onClick={() => void undo(true)} title="Redo (⌘/Ctrl Shift Z)"><Redo2 className={icon} />Redo</button>
            <button className={button} disabled={blocked} aria-pressed={preview} onClick={() => setPreview(!preview)}><Eye className={icon} />{preview ? 'Return To Editor' : 'Reader Preview'}</button>
            <button className={button} disabled={blocked} onClick={() => void scan()}><ScanLine className={icon} />{scanning ? 'Detecting…' : 'Detect All'}</button>
            <button className={primary} disabled={blocked || !approved.length} onClick={() => {
              if (window.confirm(`Publish ${approved.length} approved hotspots to readers?`)) act(approved.map(h => ({ id: h.id, values: { is_published: true } })), 'Publish approved');
            }}>Publish Approved ({approved.length})</button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-gray-100 pt-3 text-sm">
          <span>{active.length} Hotspots</span><span className="text-amber-800">{attention.length} Need Attention</span><span>{ready.length} Ready To Review</span><span>{active.filter(h => h.is_published).length} Published</span>
          <button className="font-medium text-[#301D5D] underline" onClick={() => setChecklistOpen(!checklistOpen)}>Page Review Checklist</button>
          <span role="status" className="ml-auto text-xs text-gray-600">{message || 'Ready'}</span>
        </div>
        {error && <div role="alert" className="mt-3 flex flex-wrap items-center gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><span className="flex-1">{error}</span><button className="underline" disabled={blocked} onClick={() => { void refresh().then(() => { setHistory([]); setFuture([]); setError(''); }).catch(e => setError(e.message)); }}>Reload Saved Version</button><button aria-label="Dismiss message" onClick={() => setError('')}><X className={icon} /></button></div>}
      </header>

      {checklistOpen && <section className="border-b border-gray-200 bg-white px-4 py-4">
        <h2 className="mb-2 text-sm font-semibold">Page Review Checklist</h2>
        <p className="mb-3 text-xs text-gray-600">Overlaps are warnings, not always errors. Check that larger regions do not cover smaller actions in Reader Preview.</p>
        <div className="grid max-h-72 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: magazine.page_count }, (_, p) => {
            const rows = active.filter(h => h.page_idx === p), scanState = scans.find(s => s.page_idx === p);
            return <button key={p} onClick={() => go(p)} className={`${button} !items-start !justify-start !text-left`}>
              <span><strong>Page {p + 1}</strong><span className="mt-1 block text-xs font-normal">{rows.filter(h => reviewStatus(h) === 'pending').length} unreviewed · {rows.filter(h => reviewProblem(h)).length} missing/invalid · {rows.filter(h => overlapIds.has(h.id)).length} overlapping</span>
                <span className="mt-1 block text-xs font-normal">Scan: {scanState?.status || 'not scanned'}</span>
                {scanState?.warnings?.map((w, i) => <span key={i} className="mt-1 block text-xs font-normal text-amber-800">{w}</span>)}</span>
            </button>;
          })}
        </div>
      </section>}

      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-white px-4 py-3">
        <button className={button} disabled={pageIdx === 0} onClick={() => go(view === 'spread' ? Math.max(0, pages[0] - 2) : pageIdx - 1)}>Previous</button>
        <label className="text-sm">Page <select aria-label="Page" value={pageIdx} onChange={e => go(Number(e.target.value))} className={input}>{Array.from({ length: magazine.page_count }, (_, p) => <option key={p} value={p}>{p + 1}</option>)}</select> of {magazine.page_count}</label>
        <button className={button} disabled={pages.at(-1)! >= magazine.page_count - 1} onClick={() => go(pages.at(-1)! + 1)}>Next</button>
        <select aria-label="Page layout" className={input} value={view} onChange={e => { setView(e.target.value as 'single' | 'spread'); setChecked([]); }}><option value="single">Single Page</option><option value="spread">Spread</option></select>
        <select aria-label="Zoom" className={input} value={zoom} onChange={e => setZoom(Number(e.target.value))}>{[.6, .8, 1, 1.25, 1.5, 2, 3].map(z => <option key={z} value={z}>{Math.round(z * 100)}%</option>)}</select>
        <button className={button} disabled={blocked} onClick={() => void scan(pageIdx)}>Rescan Page {pageIdx + 1}</button>
        {!preview && <button className={button} disabled={blocked} onClick={() => void create(pageIdx)}><Plus className={icon} />Add Hotspot</button>}
        <span className="text-xs text-gray-500">{preview ? 'Approved + published hotspots. Hidden editor layers remain clickable. Test clicks are not tracked.' : 'Select, then drag. Double-click to edit. Arrow keys nudge; Shift moves 10px. Alt-click cycles overlaps.'}</span>
      </div>

      <div className={`grid items-start ${preview ? 'grid-cols-1' : 'grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px]'}`}>
        <section aria-label="Magazine canvas" className="min-w-0 overflow-auto p-8" style={{ maxHeight: 'calc(100vh - 190px)' }}>
          <div className="flex min-w-max justify-center gap-4">
            {pages.map(p => <HotspotCanvas key={p} pageIdx={p} pageUrl={magazine.page_urls?.[p]} hotspots={pageRows.filter(h => h.page_idx === p)}
              selectedId={selected} numbers={numbers} preview={preview} zoom={zoom} busy={blocked} onSelect={select} onEdit={h => { if (!blocked) setEditing(h); }}
              onMove={(id, rect) => { if (!blocked) act([{ id, values: rect }], 'Move/resize hotspot'); }} />)}
          </div>
        </section>

        {!preview && <aside className="min-w-0 border-l border-gray-200 bg-white xl:sticky xl:top-0">
          <div className="space-y-3 border-b border-gray-200 p-4">
            <h2 className="text-base font-semibold">Review Queue <span className="text-xs font-normal text-gray-500">Jump to any page</span></h2>
            <div className="flex flex-wrap gap-1" role="group" aria-label="Review queue">
              {([['attention', `Needs attention (${attention.length})`], ['ready', `Ready (${ready.length})`], ['approved', 'Approved'], ['all', 'All active']] as const).map(([value, title]) =>
                <button key={value} className={filter === value ? primary : button} aria-pressed={filter === value} onClick={() => { setFilter(value); setChecked([]); }}>{title}</button>)}
            </div>
            <button className={button} disabled={!listed.length} onClick={() => jump(listed[(listed.findIndex(h => h.id === selected) + 1) % listed.length])}>Next in queue</button>
            <input className={`${input} w-full`} aria-label="Search hotspots" placeholder="Search label, partner, or destination" value={search} onChange={e => setSearch(e.target.value)} />
            <div className="flex gap-2"><select aria-label="Review filter" className={`${input} min-w-0 flex-1`} value={filter} onChange={e => { setFilter(e.target.value); setChecked([]); }}>
              <option value="attention">Needs Attention</option><option value="ready">Ready To Review</option><option value="approved">Approved</option><option value="all">All Active</option><option value="rejected">Rejected / Deleted</option>
            </select><label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={grouped} onChange={e => setGrouped(e.target.checked)} />By Page / Partner</label></div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" aria-label="Select all listed hotspots" checked={listed.length > 0 && listed.every(h => checked.includes(h.id))} onChange={e => setChecked(e.target.checked ? listed.map(h => h.id) : [])} />Select All</label>
              <span className="text-xs text-gray-500">{selection.length} selected</span>
              <button className={button} disabled={blocked || !approvable.length} onClick={() => act(approvable.map(h => ({ id: h.id, values: { review_status: 'approved' } })), 'Approve selected')}><Check className={icon} />Approve {approvable.length || ''}</button>
              <button className={button} disabled={blocked || !selectable.length} onClick={() => {
                if (selectable.some(h => h.is_published) && !confirm('Rejecting published hotspots removes them from the reader. Continue?')) return;
                act(selectable.map(h => ({ id: h.id, values: { review_status: 'rejected', is_published: false } })), 'Reject selected');
              }}><X className={icon} />Reject</button>
              {filter === 'rejected' && <button className={button} disabled={blocked || !selection.length} onClick={() => act(selection.map(h => ({ id: h.id, values: { is_deleted: false, review_status: 'pending', is_published: false } })), 'Restore drafts')}>Restore Selected</button>}
            </div>
          </div>

          <div className="max-h-[52vh] overflow-y-auto">
            {!listed.length && <p className="p-5 text-sm text-gray-500">{filter === 'attention' ? 'Nothing needs attention. Check Ready for Review to approve verified links.' : 'No hotspots match this view. Change the queue or search.'}</p>}
            {groups.map(group => <div key={group.name}>
              {group.name && <h3 className="bg-gray-50 px-4 py-2 text-xs font-semibold">{group.name}</h3>}
              {group.rows.map(h => <div key={h.id} data-layer-id={h.id}
                draggable={!blocked} onDragStart={e => { setDragId(h.id); e.dataTransfer.setData('text/plain', String(h.id)); }}
                onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (!blocked) reorder(Number(e.dataTransfer.getData('text/plain')) || dragId!, h); setDragId(null); }}
                className={`border-b border-gray-100 px-3 py-3 ${selected === h.id ? 'bg-[#f2eef9] ring-1 ring-inset ring-[#7059A8]' : 'bg-white'}`}>
                <div className="flex items-start gap-2">
                  <GripVertical className="mt-1 h-4 w-4 shrink-0 cursor-grab text-gray-400" aria-label="Drag to reorder" />
                  <input type="checkbox" className="mt-1.5" aria-label={`Select ${h.label || `hotspot ${h.id}`}`} checked={checked.includes(h.id)} onChange={e => setChecked(ids => e.target.checked ? [...ids, h.id] : ids.filter(id => id !== h.id))} />
                  <button className="min-w-0 flex-1 text-left" onClick={() => jump(h)} onDoubleClick={() => { if (!blocked) setEditing(h); }}>
                    <span className="block truncate text-sm font-medium">{numbers.get(h.id) ? `${numbers.get(h.id)}. ` : ''}{h.label || TYPE_LABELS[h.type]}</span>
                    <span className="mt-0.5 block truncate text-xs text-gray-600">{hotspotDestination(h.config) || 'Needs Destination'}</span>
                    <span className="mt-1 block text-xs text-gray-600">P{h.page_idx + 1} · {h.is_deleted ? 'Deleted' : h.is_published ? 'Published' : reviewStatus(h) === 'approved' ? 'Approved Draft' : reviewStatus(h) === 'rejected' ? 'Rejected' : 'Needs Review'}{h.editor_hidden ? ' · Hidden In Editor' : ''}</span>
                    {h.detection && <span className="mt-1 block text-xs text-gray-500">{h.detection.origin.replace(/_/g, ' ')} · {h.detection.confidence === 'exact' ? 'Direct extraction' : 'Verify detection'}</span>}
                    {(reviewProblem(h) || reviewStatus(h) === 'pending' && h.detection?.needs_match && !h.advertiser_id) && <span className="mt-1 block text-xs text-amber-800">{reviewProblem(h) || 'Verify Partner Match'}</span>}
                    {conflictIds.has(h.id) && <span className="mt-1 block text-xs text-amber-800">Conflicting destination in this area</span>}
                    {overlapIds.has(h.id) && <span className="mt-1 block text-xs text-amber-800">Overlapping click area</span>}
                  </button>
                  <div className="flex flex-col gap-1">
                    <button className="rounded p-1.5 hover:bg-gray-100 disabled:opacity-40" disabled={blocked} aria-label={`${h.editor_hidden ? 'Show' : 'Hide'} layer ${h.id}`} onClick={() => act([{ id: h.id, values: { editor_hidden: !h.editor_hidden } }], 'Editor visibility')}>{h.editor_hidden ? <EyeOff className={icon} /> : <Eye className={icon} />}</button>
                    <button className="rounded p-1.5 hover:bg-gray-100 disabled:opacity-40" disabled={blocked} aria-label={`${h.editor_locked ? 'Unlock' : 'Lock'} layer ${h.id}`} onClick={() => act([{ id: h.id, values: { editor_locked: !h.editor_locked } }], 'Position lock')}>{h.editor_locked ? <LockKeyhole className={icon} /> : <UnlockKeyhole className={icon} />}</button>
                  </div>
                </div>
              </div>)}
            </div>)}
          </div>
          {focused && <section className="space-y-3 border-t border-gray-200 p-4">
            <div className="flex gap-2"><button className={button} disabled={blocked} onClick={() => setEditing(focused)}><Pencil className={icon} />Edit Details</button>
              <button className={button} disabled={blocked} onClick={() => {
                if (confirm('Delete this hotspot? You can undo or restore it from Rejected / Deleted.')) act([{ id: focused.id, values: { is_deleted: true, is_published: false } }], 'Delete hotspot');
              }}><Trash2 className={icon} />Delete</button></div>
            <div className="flex flex-wrap gap-1">{(['back', 'backward', 'forward', 'front'] as ZMove[]).map(move => <button key={move} className={button} disabled={blocked} onClick={() => moveLayer(focused, move)}>{move === 'back' ? 'To Back' : move === 'front' ? 'To Front' : move === 'forward' ? 'Forward' : 'Backward'}</button>)}</div>
            <div className="grid grid-cols-4 gap-2">{(['x_frac', 'y_frac', 'w_frac', 'h_frac'] as const).map((key, i) => <label key={`${focused.id}-${key}-${focused[key]}`} className="text-xs text-gray-600">{['X %', 'Y %', 'W %', 'H %'][i]}
              <input className={`${input} mt-1 w-full`} type="number" step=".1" min="0" max="100" disabled={blocked || focused.editor_locked} defaultValue={Number((focused[key] * 100).toFixed(2))}
                onBlur={e => { const value = Number(e.target.value) / 100; if (Number.isFinite(value) && value !== focused[key]) act([{ id: focused.id, values: clampRect({ ...focused, [key]: value }) }], 'Precise position'); }} /></label>)}</div>
            {focused.detection && <p className="break-words text-xs leading-5 text-gray-600">{focused.detection.evidence}</p>}
            <p className="text-xs text-gray-500">Hiding and locking affect editing only, not publication.</p>
          </section>}
        </aside>}
      </div>
      <footer className="flex flex-wrap items-center gap-2 border-t border-gray-200 bg-white p-4">
        <button className={button} disabled={blocked} onClick={() => void duplicateCleanup()}>Remove Overlapping Duplicates</button>
        {cleanupResult && <p role="status" aria-label="Duplicate cleanup result" className="w-full text-sm text-gray-700">{cleanupResult}</p>}
        {prevIssues.length > 0 && <><select aria-label="Previous issue" className={`${input} max-w-64`} value={copyId} onChange={e => setCopyId(e.target.value)}><option value="">Copy From Previous Issue</option>{prevIssues.map(p => <option key={p.id} value={p.id}>{p.issue_label} ({p.hotspot_count})</option>)}</select><button className={button} disabled={blocked || !copyId} onClick={() => void copyPrevious()}>Copy As Drafts</button></>}
        <p className="text-xs text-gray-500">Undo/redo covers this editing session. Rejected detections and manual corrections survive re-scanning.</p>
      </footer>
      {editing && <HotspotConfigModal key={editing.id} hotspot={editing} defaultPublication={magazine.publication}
        onClose={() => setEditing(null)}
        onSave={async updates => {
          const values: Partial<Hotspot> = { ...updates, config: updates.config as HotspotConfig };
          if (updates.is_published) values.review_status = 'approved';
          else if (editing.config !== updates.config && !editing.is_published) values.review_status = 'pending';
          await mutate([{ id: editing.id, values }], 'Edit hotspot');
          setEditing(null);
        }}
        onRequestDelete={() => {
          if (confirm('Delete this hotspot? You can undo this change.')) {
            void mutate([{ id: editing.id, values: { is_deleted: true, is_published: false } }], 'Delete hotspot').then(() => setEditing(null)).catch(() => undefined);
          }
        }} />}
    </main>
  );
}
