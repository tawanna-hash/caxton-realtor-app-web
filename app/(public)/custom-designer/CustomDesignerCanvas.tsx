'use client';
/* eslint-disable @next/next/no-img-element */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import QRCode from 'qrcode';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  BringToFront,
  CopyPlus,
  Download,
  Image as ImageIcon,
  Layers3,
  LockKeyhole,
  Minus,
  QrCode,
  Redo2,
  RotateCcw,
  SendToBack,
  Shapes,
  Trash2,
  Type,
  Undo2,
} from 'lucide-react';
import {
  PROTECTED_BROKER_ELEMENT_ID,
  createCustomDesignPreset,
  type CustomDesignConfig,
  type CustomDesignElement,
  type CustomDesignElementKind,
} from '@/lib/custom-design';
import { FOOTER_TEMPLATE_META, FOOTER_TEMPLATE_PICKER_IDS, type FooterTemplateId } from '@/lib/footer-templates';

export interface DesignerBrandFields {
  display_name: string;
  professional_title: string;
  brokerage_name: string;
  phone: string;
  office_phone: string;
  email: string;
  website: string;
  logo_url: string;
  photo_url: string;
}

interface Props {
  value: CustomDesignConfig;
  brand: DesignerBrandFields;
  onChange: (value: CustomDesignConfig) => void;
  onLayoutChange?: (layout: FooterTemplateId) => void;
}

type Interaction = {
  mode: 'move' | 'resize';
  pointerId: number;
  startX: number;
  startY: number;
  startElement: CustomDesignElement;
  startDesign: CustomDesignConfig;
};

type InsertKind = 'text' | 'block' | 'image' | 'line' | 'qr';

const uiButton = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-35';
const fieldClass = 'mt-1.5 min-h-10 w-full rounded-md border border-white/10 bg-[#11151c] px-3 text-sm text-slate-100 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20';
const labelClass = 'block text-xs font-semibold text-slate-400';
const TEXT_KINDS: CustomDesignElementKind[] = ['name', 'title', 'brokerage', 'contact', 'text', 'block'];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function nextId(kind: InsertKind) {
  return `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function elementLabel(element: CustomDesignElement) {
  const labels: Record<CustomDesignElementKind, string> = {
    name: 'Agent name', title: 'Professional title', brokerage: 'Brokerage name', contact: 'Contact details',
    logo: 'Brokerage logo', photo: 'Headshot', text: 'Text', qr: 'QR code', block: 'Block / badge',
    image: 'Image / graphic', line: 'Line divider',
  };
  return element.kind === 'text' && element.text?.trim() ? element.text.trim().slice(0, 28) : labels[element.kind];
}

function isProtected(element: CustomDesignElement | null): boolean {
  return element?.kind === 'brokerage' || element?.id === PROTECTED_BROKER_ELEMENT_ID;
}

function sortedElements(elements: CustomDesignElement[]) {
  return [...elements].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
}

export default function CustomDesignerCanvas({ value, brand, onChange, onLayoutChange }: Props) {
  const [dragDraft, setDragDraft] = useState<CustomDesignConfig | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>('name');
  const [past, setPast] = useState<CustomDesignConfig[]>([]);
  const [future, setFuture] = useState<CustomDesignConfig[]>([]);
  const [qrImages, setQrImages] = useState<Record<string, string>>({});
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const interaction = useRef<Interaction | null>(null);
  const dragDraftRef = useRef<CustomDesignConfig | null>(null);
  const design = dragDraft ?? value;
  const elements = useMemo(() => sortedElements(design.elements), [design.elements]);
  const selected = useMemo(() => design.elements.find((element) => element.id === selectedId) ?? null, [design.elements, selectedId]);

  useEffect(() => {
    let cancelled = false;
    const qrElements = design.elements.filter((element) => element.kind === 'qr');
    Promise.all(qrElements.map(async (element) => {
      const destination = element.text?.trim() || brand.website.trim() || 'https://realtynewsnow.com';
      try {
        return [element.id, await QRCode.toDataURL(destination, {
          margin: 1,
          width: 480,
          color: { dark: element.color || design.textColor, light: design.backgroundColor },
        })] as const;
      } catch {
        return [element.id, ''] as const;
      }
    })).then((entries) => { if (!cancelled) setQrImages(Object.fromEntries(entries)); });
    return () => { cancelled = true; };
  }, [brand.website, design.backgroundColor, design.elements, design.textColor]);

  function commit(next: CustomDesignConfig, prior = design) {
    setPast((items) => [...items.slice(-39), prior]);
    setFuture([]);
    onChange(next);
  }

  function updateSelected(patch: Partial<CustomDesignElement>) {
    if (!selected) return;
    commit({ ...design, elements: design.elements.map((element) => element.id === selected.id ? { ...element, ...patch } : element) });
  }

  function undo() {
    const previous = past[past.length - 1];
    if (!previous) return;
    setPast((items) => items.slice(0, -1));
    setFuture((items) => [design, ...items].slice(0, 40));
    onChange(previous);
  }

  function redo() {
    const next = future[0];
    if (!next) return;
    setFuture((items) => items.slice(1));
    setPast((items) => [...items.slice(-39), design]);
    onChange(next);
  }

  function reset() {
    commit(createCustomDesignPreset(design.layout));
    setSelectedId('name');
  }

  function addElement(kind: InsertKind) {
    const id = nextId(kind);
    const top = Math.max(1, ...design.elements.map((element) => element.zIndex ?? 0)) + 1;
    const base = { id, kind, x: 38, y: 40, width: 25, height: 18, zIndex: top, opacity: 1 } satisfies CustomDesignElement;
    const element: CustomDesignElement = kind === 'text' ? {
      ...base, height: 14, fontSize: 18, color: design.textColor, text: 'Add your message', fontFamily: 'Arial', fontWeight: 600, textAlign: 'left',
    } : kind === 'block' ? {
      ...base, width: 22, height: 18, fontSize: 14, color: '#ffffff', text: 'FEATURED', backgroundColor: design.accentColor, borderRadius: 8, fontFamily: 'Arial', fontWeight: 700, textAlign: 'center',
    } : kind === 'image' ? {
      ...base, width: 20, height: 42, src: brand.logo_url || brand.photo_url || undefined, backgroundColor: '#e2e8f0', borderRadius: 4,
    } : kind === 'line' ? {
      ...base, x: 30, y: 68, width: 40, height: 4, backgroundColor: design.accentColor,
    } : {
      ...base, x: 79, y: 56, width: 15, height: 34, text: brand.website || 'https://realtynewsnow.com', color: design.textColor,
    };
    commit({ ...design, elements: [...design.elements, element] });
    setSelectedId(id);
  }

  function duplicateSelected() {
    if (!selected || isProtected(selected)) return;
    const copy = { ...selected, id: nextId(selected.kind as InsertKind), x: clamp(selected.x + 3, 0, 100 - selected.width), y: clamp(selected.y + 5, 0, 100 - selected.height), zIndex: Math.max(...design.elements.map((element) => element.zIndex ?? 0)) + 1 };
    commit({ ...design, elements: [...design.elements, copy] });
    setSelectedId(copy.id);
  }

  function deleteSelected() {
    if (!selected || isProtected(selected)) return;
    commit({ ...design, elements: design.elements.filter((element) => element.id !== selected.id) });
    setSelectedId(null);
  }

  function changeLayer(direction: 'forward' | 'backward') {
    if (!selected || isProtected(selected)) return;
    const ordered = sortedElements(design.elements.filter((element) => !isProtected(element)));
    const index = ordered.findIndex((element) => element.id === selected.id);
    const otherIndex = direction === 'forward' ? index + 1 : index - 1;
    if (index < 0 || otherIndex < 0 || otherIndex >= ordered.length) return;
    const other = ordered[otherIndex];
    const selectedZ = selected.zIndex ?? index + 1;
    const otherZ = other.zIndex ?? otherIndex + 1;
    commit({
      ...design,
      elements: design.elements.map((element) => element.id === selected.id ? { ...element, zIndex: otherZ } : element.id === other.id ? { ...element, zIndex: selectedZ } : element),
    });
  }

  function beginInteraction(event: ReactPointerEvent<HTMLElement>, element: CustomDesignElement, mode: 'move' | 'resize') {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(element.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    interaction.current = { mode, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, startElement: { ...element }, startDesign: design };
  }

  function moveInteraction(event: ReactPointerEvent<HTMLElement>) {
    const active = interaction.current;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!active || active.pointerId !== event.pointerId || !rect) return;
    const dx = (event.clientX - active.startX) / rect.width * 100;
    const dy = (event.clientY - active.startY) / rect.height * 100;
    const start = active.startElement;
    const patch = active.mode === 'move'
      ? { x: clamp(start.x + dx, 0, 100 - start.width), y: clamp(start.y + dy, 0, 100 - start.height) }
      : { width: clamp(start.width + dx, start.kind === 'brokerage' ? 18 : 3, 100 - start.x), height: clamp(start.height + dy, start.kind === 'brokerage' ? 10 : 3, 100 - start.y) };
    const next = { ...active.startDesign, elements: active.startDesign.elements.map((element) => element.id === start.id ? { ...element, ...patch } : element) };
    dragDraftRef.current = next;
    setDragDraft(next);
  }

  function endInteraction(event: ReactPointerEvent<HTMLElement>) {
    const active = interaction.current;
    if (!active || active.pointerId !== event.pointerId) return;
    interaction.current = null;
    const finalDesign = dragDraftRef.current ?? active.startDesign;
    dragDraftRef.current = null;
    setDragDraft(null);
    if (finalDesign !== active.startDesign) {
      setPast((items) => [...items.slice(-39), active.startDesign]);
      setFuture([]);
      onChange(finalDesign);
    }
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
      if ((event.key === 'Delete' || event.key === 'Backspace') && selected && !isProtected(selected)) { event.preventDefault(); deleteSelected(); return; }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd' && selected && !isProtected(selected)) { event.preventDefault(); duplicateSelected(); return; }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); return; }
      if (!selected || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const delta = event.shiftKey ? 2 : 0.5;
      updateSelected({
        x: clamp(selected.x + (event.key === 'ArrowLeft' ? -delta : event.key === 'ArrowRight' ? delta : 0), 0, 100 - selected.width),
        y: clamp(selected.y + (event.key === 'ArrowUp' ? -delta : event.key === 'ArrowDown' ? delta : 0), 0, 100 - selected.height),
      });
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  async function exportPng() {
    setExportStatus('Rendering PNG…');
    try {
      const width = 1200;
      const height = 390;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');
      ctx.fillStyle = design.backgroundColor;
      ctx.fillRect(0, 0, width, height);
      drawDecoration(ctx, design, width, height);
      let failedImages = 0;
      for (const element of elements) {
        try {
          await drawExportElement(ctx, element, brand, design, qrImages[element.id], width, height);
        } catch {
          failedImages += 1;
          drawImageFallback(ctx, element, width, height);
        }
      }
      const url = canvas.toDataURL('image/png');
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `rnn-${design.layout}-design.png`;
      anchor.click();
      setExportStatus(failedImages ? `PNG exported without ${failedImages} unavailable image${failedImages === 1 ? '' : 's'}.` : 'PNG exported.');
    } catch {
      setExportStatus('PNG export could not be completed in this browser.');
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-700/80 bg-[#0d1117] text-slate-100 shadow-2xl" data-testid="custom-designer-studio">
      <div className="grid min-h-[720px] grid-cols-1 xl:grid-cols-[260px_minmax(460px,1fr)_286px]">
        <aside className="border-b border-slate-800 bg-[#11161e] xl:border-b-0 xl:border-r" aria-label="Canvas and layers">
          <PanelHeader eyebrow="Studio" title="Canvas & Layers" icon={<Layers3 className="h-4 w-4" />} />
          <div className="space-y-6 p-4">
            <label className={labelClass}>Format / preset
              <select value={design.layout} onChange={(event) => onLayoutChange?.(event.target.value as FooterTemplateId)} className={fieldClass} data-testid="select-design-format">
                {FOOTER_TEMPLATE_PICKER_IDS.map((id) => <option key={id} value={id}>{FOOTER_TEMPLATE_META[id].label}</option>)}
              </select>
            </label>
            <section>
              <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Insert element</h3>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <InsertCard kind="text" label="Text" icon={<Type />} onClick={addElement} />
                <InsertCard kind="block" label="Block / badge" icon={<Shapes />} onClick={addElement} />
                <InsertCard kind="image" label="Image / graphic" icon={<ImageIcon />} onClick={addElement} />
                <InsertCard kind="line" label="Line divider" icon={<Minus />} onClick={addElement} />
                <InsertCard kind="qr" label="QR code" icon={<QrCode />} onClick={addElement} wide />
              </div>
            </section>
            <section>
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Composition</h3>
                <span className="text-xs text-slate-600">Top first</span>
              </div>
              <div className="mt-3 max-h-72 space-y-1 overflow-y-auto pr-1" data-testid="layer-tree">
                {[...elements].reverse().map((element) => (
                  <button key={element.id} type="button" onClick={() => setSelectedId(element.id)} className={`flex min-h-11 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm transition ${selectedId === element.id ? 'bg-cyan-500/15 text-cyan-200 ring-1 ring-inset ring-cyan-500/35' : 'text-slate-300 hover:bg-white/[0.05]'}`} data-testid={`layer-${element.id}`}>
                    {isProtected(element) ? <LockKeyhole className="h-3.5 w-3.5 shrink-0 text-amber-400" /> : <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-600" />}
                    <span className="min-w-0 flex-1 truncate">{elementLabel(element)}</span>
                    <span className="font-mono text-[10px] text-slate-600">{element.zIndex ?? 0}</span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        </aside>

        <section className="flex min-w-0 flex-col bg-[#171c24]" aria-label="Design workspace">
          <div className="flex min-h-16 flex-wrap items-center gap-2 border-b border-slate-800 px-4 py-3">
            <button type="button" onClick={undo} disabled={!past.length} className={uiButton} aria-label="Undo" title="Undo (Ctrl/⌘ Z)" data-testid="button-undo-design"><Undo2 className="h-4 w-4" /></button>
            <button type="button" onClick={redo} disabled={!future.length} className={uiButton} aria-label="Redo" title="Redo (Ctrl/⌘ Shift Z)" data-testid="button-redo-design"><Redo2 className="h-4 w-4" /></button>
            <button type="button" onClick={reset} className={uiButton} data-testid="button-reset-design"><RotateCcw className="h-4 w-4" /> Reset</button>
            <span className="hidden h-6 w-px bg-slate-700 sm:block" />
            <button type="button" onClick={duplicateSelected} disabled={!selected || isProtected(selected)} className={uiButton} data-testid="button-duplicate-element"><CopyPlus className="h-4 w-4" /> Duplicate</button>
            <button type="button" onClick={deleteSelected} disabled={!selected || isProtected(selected)} className={uiButton} data-testid="button-delete-element"><Trash2 className="h-4 w-4" /> Delete</button>
            <button type="button" onClick={() => void exportPng()} className={`${uiButton} ml-auto border-cyan-400/40 bg-cyan-500 text-slate-950 hover:bg-cyan-400`} data-testid="button-export-png"><Download className="h-4 w-4" /> Export PNG</button>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center overflow-auto bg-[radial-gradient(circle_at_center,_#26303d_0,_#171c24_62%)] p-4 sm:p-8">
            <div className="mb-3 flex w-full max-w-[980px] items-center justify-between text-xs text-slate-500">
              <span>{FOOTER_TEMPLATE_META[design.layout].label} · 1200 × 390 px</span>
              <span>Arrow keys nudge · Shift for 2%</span>
            </div>
            <div className="w-full max-w-[980px] overflow-auto rounded-sm bg-slate-950/40 p-2 shadow-[0_24px_80px_rgba(0,0,0,0.45)] sm:p-5">
              <div ref={canvasRef} className="relative mx-auto aspect-[40/13] min-w-[520px] touch-none overflow-hidden bg-white" style={{ backgroundColor: design.backgroundColor }} onPointerDown={() => setSelectedId(null)} data-testid="custom-design-canvas">
                <CanvasDecoration design={design} />
                {elements.map((element) => {
                  const isSelected = selectedId === element.id;
                  return (
                    <div key={element.id} role="button" tabIndex={0} aria-label={`Select ${elementLabel(element)} element`} onPointerDown={(event) => beginInteraction(event, element, 'move')} onPointerMove={moveInteraction} onPointerUp={endInteraction} onPointerCancel={endInteraction} className={`group absolute flex cursor-move select-none items-center overflow-hidden ${isSelected ? 'outline outline-2 outline-offset-2 outline-cyan-500' : 'hover:outline hover:outline-1 hover:outline-cyan-500/70'}`} style={elementStyle(element, design)} data-testid={`canvas-element-${element.id}`}>
                      <CanvasElementContent element={element} brand={brand} qrImage={qrImages[element.id]} accentColor={design.accentColor} />
                      {isProtected(element) && <span className="absolute right-0 top-0 rounded-bl bg-slate-950/85 p-1 text-amber-300" title="Brokerage name is protected"><LockKeyhole className="h-3 w-3" /></span>}
                      {isSelected && <button type="button" aria-label={`Resize ${elementLabel(element)}`} title="Drag to resize" onPointerDown={(event) => beginInteraction(event, element, 'resize')} onPointerMove={moveInteraction} onPointerUp={endInteraction} onPointerCancel={endInteraction} className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize border-2 border-white bg-cyan-500 shadow" data-testid={`resize-handle-${element.id}`} />}
                    </div>
                  );
                })}
              </div>
            </div>
            {exportStatus && <p className="mt-3 text-xs text-slate-400" role="status" data-testid="status-png-export">{exportStatus}</p>}
          </div>
        </section>

        <aside className="border-t border-slate-800 bg-[#11161e] xl:border-l xl:border-t-0" aria-label="Object properties">
          <PanelHeader eyebrow="Inspector" title={selected ? elementLabel(selected) : 'Object properties'} icon={selected && isProtected(selected) ? <LockKeyhole className="h-4 w-4 text-amber-400" /> : undefined} />
          <div className="space-y-5 p-4">
            {!selected ? <p className="rounded-md border border-dashed border-slate-700 p-4 text-sm leading-6 text-slate-500">Select an object on the artboard or in the layer tree to edit it.</p> : (
              <>
                {isProtected(selected) && <div className="rounded-md border border-amber-400/20 bg-amber-400/10 p-3 text-xs leading-5 text-amber-200">TREC-protected. This brokerage name stays visible and cannot be deleted, duplicated, or placed behind other objects.</div>}
                {TEXT_KINDS.includes(selected.kind) && <TypographyInspector element={selected} design={design} onChange={updateSelected} linked={selected.kind !== 'text' && selected.kind !== 'block'} />}
                {selected.kind === 'qr' && <label className={labelClass}>QR destination<input type="url" value={selected.text ?? ''} onChange={(event) => updateSelected({ text: event.target.value })} placeholder={brand.website || 'https://example.com'} className={fieldClass} data-testid="input-qr-destination" /></label>}
                {selected.kind === 'image' && <label className={labelClass}>Image URL<input type="url" value={selected.src ?? ''} onChange={(event) => updateSelected({ src: event.target.value })} placeholder="https://…" className={fieldClass} data-testid="input-image-url" /></label>}
                {(selected.kind === 'block' || selected.kind === 'line' || selected.kind === 'image') && <ColorInput label={selected.kind === 'line' ? 'Line color' : 'Fill color'} value={selected.backgroundColor || design.accentColor} onChange={(backgroundColor) => updateSelected({ backgroundColor })} />}
                <section className="space-y-3 border-t border-slate-800 pt-4">
                  <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Position & size</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <NumberInput label="X" value={selected.x} min={0} max={100 - selected.width} onChange={(x) => updateSelected({ x })} />
                    <NumberInput label="Y" value={selected.y} min={0} max={100 - selected.height} onChange={(y) => updateSelected({ y })} />
                    <NumberInput label="Width" value={selected.width} min={3} max={100 - selected.x} onChange={(width) => updateSelected({ width })} />
                    <NumberInput label="Height" value={selected.height} min={3} max={100 - selected.y} onChange={(height) => updateSelected({ height })} />
                  </div>
                  <NumberInput label="Opacity %" value={Math.round((selected.opacity ?? 1) * 100)} min={isProtected(selected) ? 100 : 10} max={100} onChange={(opacity) => updateSelected({ opacity: opacity / 100 })} />
                  {(selected.kind === 'block' || selected.kind === 'image') && <NumberInput label="Corner radius" value={selected.borderRadius ?? 0} min={0} max={100} onChange={(borderRadius) => updateSelected({ borderRadius })} />}
                </section>
                <div className="grid grid-cols-2 gap-2 border-t border-slate-800 pt-4">
                  <button type="button" onClick={() => changeLayer('forward')} disabled={isProtected(selected)} className={uiButton} data-testid="button-layer-forward"><BringToFront className="h-4 w-4" /> Forward</button>
                  <button type="button" onClick={() => changeLayer('backward')} disabled={isProtected(selected)} className={uiButton} data-testid="button-layer-backward"><SendToBack className="h-4 w-4" /> Backward</button>
                </div>
              </>
            )}
            <section className="border-t border-slate-800 pt-4">
              <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Canvas</h3>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <ColorInput label="Text" value={design.textColor} onChange={(textColor) => commit({ ...design, textColor })} />
                <ColorInput label="Background" value={design.backgroundColor} onChange={(backgroundColor) => commit({ ...design, backgroundColor })} />
                <ColorInput label="Accent" value={design.accentColor} onChange={(accentColor) => commit({ ...design, accentColor })} />
              </div>
            </section>
          </div>
        </aside>
      </div>
    </div>
  );
}

function PanelHeader({ eyebrow, title, icon }: { eyebrow: string; title: string; icon?: ReactNode }) {
  return <div className="border-b border-slate-800 px-4 py-4"><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-400">{eyebrow}</p><div className="mt-1 flex items-center gap-2"><h2 className="truncate text-base font-semibold text-slate-100">{title}</h2>{icon}</div></div>;
}

function InsertCard({ kind, label, icon, onClick, wide = false }: { kind: InsertKind; label: string; icon: ReactElement; onClick: (kind: InsertKind) => void; wide?: boolean }) {
  return <button type="button" onClick={() => onClick(kind)} className={`group flex min-h-20 flex-col items-start justify-between rounded-md border border-white/10 bg-white/[0.025] p-3 text-left text-xs font-semibold text-slate-300 transition hover:border-cyan-400/50 hover:bg-cyan-400/[0.06] hover:text-white ${wide ? 'col-span-2 min-h-14 flex-row items-center justify-start gap-3' : ''}`} data-testid={`button-add-${kind}`}><span className="text-slate-500 group-hover:text-cyan-300">{icon}</span>{label}</button>;
}

function TypographyInspector({ element, design, onChange, linked }: { element: CustomDesignElement; design: CustomDesignConfig; onChange: (patch: Partial<CustomDesignElement>) => void; linked: boolean }) {
  return <section className="space-y-3">
    <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Typography</h3>
    {linked ? <p className="rounded-md bg-white/[0.04] px-3 py-2 text-xs leading-5 text-slate-400">Content is linked to your saved professional profile.</p> : <label className={labelClass}>Text<input type="text" maxLength={500} value={element.text ?? ''} onChange={(event) => onChange({ text: event.target.value })} className={fieldClass} data-testid="input-selected-text" /></label>}
    <label className={labelClass}>Typeface<select value={element.fontFamily || 'Arial'} onChange={(event) => onChange({ fontFamily: event.target.value })} className={fieldClass} data-testid="select-font-family"><option>Arial</option><option>Georgia</option><option>Helvetica</option><option>Times New Roman</option><option>Verdana</option></select></label>
    <div className="grid grid-cols-2 gap-2"><NumberInput label="Size" value={element.fontSize ?? 14} min={8} max={48} onChange={(fontSize) => onChange({ fontSize })} /><label className={labelClass}>Weight<select value={element.fontWeight ?? 400} onChange={(event) => onChange({ fontWeight: Number(event.target.value) })} className={fieldClass} data-testid="select-font-weight"><option value="300">Light</option><option value="400">Regular</option><option value="600">Semibold</option><option value="700">Bold</option><option value="900">Black</option></select></label></div>
    <div className="grid grid-cols-[1fr_auto] gap-2"><ColorInput label="Color" value={element.color || design.textColor} onChange={(color) => onChange({ color })} /><div><span className="text-xs font-semibold text-slate-400">Align</span><div className="mt-1.5 flex"><AlignButton icon={<AlignLeft />} active={(element.textAlign || 'left') === 'left'} onClick={() => onChange({ textAlign: 'left' })} label="Align left" /><AlignButton icon={<AlignCenter />} active={element.textAlign === 'center'} onClick={() => onChange({ textAlign: 'center' })} label="Align center" /><AlignButton icon={<AlignRight />} active={element.textAlign === 'right'} onClick={() => onChange({ textAlign: 'right' })} label="Align right" /></div></div></div>
  </section>;
}

function AlignButton({ icon, active, onClick, label }: { icon: ReactElement; active: boolean; onClick: () => void; label: string }) {
  return <button type="button" onClick={onClick} aria-label={label} title={label} className={`flex h-10 w-10 items-center justify-center border border-white/10 first:rounded-l-md last:rounded-r-md ${active ? 'bg-cyan-500 text-slate-950' : 'bg-[#11151c] text-slate-400 hover:text-white'}`}>{icon}</button>;
}

function NumberInput({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return <label className={labelClass}>{label}<input type="number" value={Number(value.toFixed(1))} min={min} max={max} step="0.5" onChange={(event) => onChange(clamp(Number(event.target.value) || min, min, max))} className={fieldClass} data-testid={`input-${label.toLowerCase().replace(/\W+/g, '-')}`} /></label>;
}

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block min-w-0 text-[11px] font-semibold text-slate-500"><span className="block truncate">{label}</span><input type="color" value={value} onChange={(event) => onChange(event.target.value)} className="mt-1.5 block h-10 w-full min-w-10 cursor-pointer rounded-md border border-white/10 bg-[#11151c] p-1" data-testid={`color-${label.toLowerCase().replace(/\s+/g, '-')}`} /></label>;
}

function elementStyle(element: CustomDesignElement, design: CustomDesignConfig): CSSProperties {
  return {
    left: `${element.x}%`, top: `${element.y}%`, width: `${element.width}%`, height: `${element.height}%`, zIndex: element.kind === 'brokerage' ? 999 : element.zIndex ?? 1,
    color: element.color || design.textColor, backgroundColor: element.kind === 'block' ? element.backgroundColor || design.accentColor : undefined,
    borderRadius: element.borderRadius ? `${element.borderRadius}px` : undefined, opacity: element.kind === 'brokerage' ? 1 : element.opacity ?? 1,
    fontSize: `clamp(8px, ${(element.fontSize ?? 14) / 800 * 100}vw, ${element.fontSize ?? 14}px)`, fontFamily: element.fontFamily || 'Arial, sans-serif', fontWeight: element.fontWeight,
    textAlign: element.textAlign || 'left', justifyContent: element.textAlign === 'center' ? 'center' : element.textAlign === 'right' ? 'flex-end' : 'flex-start',
  };
}

function CanvasDecoration({ design }: { design: CustomDesignConfig }) {
  if (design.layout === 'banner') return <div className="absolute inset-y-0 left-0 w-[27%]" style={{ backgroundColor: design.textColor }} aria-hidden="true" />;
  if (design.layout === 'signature') return <><div className="absolute inset-y-0 left-0 w-[29%]" style={{ backgroundColor: design.textColor }} aria-hidden="true" /><div className="absolute left-[7%] top-[9%] aspect-square w-[18%] rounded-full border-[8px]" style={{ borderColor: design.accentColor }} aria-hidden="true" /></>;
  if (design.layout === 'two-column') return <div className="absolute inset-x-0 bottom-0 h-[17%]" style={{ backgroundColor: design.accentColor }} aria-hidden="true" />;
  return <><div className="absolute right-0 top-[7%] h-[22%] w-[24%]" style={{ backgroundColor: design.textColor }} aria-hidden="true" /><div className="absolute bottom-[10%] left-[29%] h-[35%] w-[4%]" style={{ backgroundColor: design.textColor, borderTop: `8px solid ${design.accentColor}` }} aria-hidden="true" /></>;
}

function CanvasElementContent({ element, brand, qrImage, accentColor }: { element: CustomDesignElement; brand: DesignerBrandFields; qrImage?: string; accentColor: string }) {
  switch (element.kind) {
    case 'name': return <strong className="w-full truncate">{brand.display_name || 'Your name'}</strong>;
    case 'title': return <span className="w-full truncate uppercase tracking-[0.18em]">{brand.professional_title || 'REALTOR®'}</span>;
    case 'brokerage': return <strong className="w-full text-center uppercase leading-tight">{brand.brokerage_name || 'Broker licensed or registered name'}</strong>;
    case 'contact': return <span className="w-full space-y-[2px] leading-tight"><span className="block"><b style={{ color: accentColor }}>C:</b> {brand.phone || 'Mobile phone'}</span><span className="block"><b style={{ color: accentColor }}>O:</b> {brand.office_phone || 'Office phone'}</span><span className="block truncate">{brand.email || 'Email address'}</span><span className="block truncate">{brand.website || 'Website'}</span></span>;
    case 'logo': return brand.logo_url ? <img src={brand.logo_url} alt="Brokerage logo" draggable={false} className="h-full w-full object-contain" /> : <ImageFallback label="Brokerage logo" />;
    case 'photo': return brand.photo_url ? <img src={brand.photo_url} alt="" draggable={false} className="h-full w-full rounded-full object-cover" /> : <ImageFallback label="Headshot" round />;
    case 'image': return element.src ? <><ImageFallback label="Image unavailable" /><img src={element.src} alt="Custom graphic" draggable={false} className="absolute inset-0 h-full w-full object-contain" onError={(event) => { event.currentTarget.style.display = 'none'; }} /></> : <ImageFallback label="Add image URL" />;
    case 'qr': return qrImage ? <img src={qrImage} alt="QR code" draggable={false} className="h-full w-full object-contain" /> : <ImageFallback label="QR" />;
    case 'text': return <span className="w-full whitespace-pre-wrap leading-tight">{element.text || 'Custom text'}</span>;
    case 'block': return <span className="w-full px-2 text-center leading-tight">{element.text || 'Badge'}</span>;
    case 'line': return <span className="block h-[3px] w-full" style={{ backgroundColor: element.backgroundColor || accentColor }} />;
  }
}

function ImageFallback({ label, round = false }: { label: string; round?: boolean }) {
  return <span className={`flex h-full w-full items-center justify-center border border-dashed border-current bg-slate-200/70 p-1 text-center text-[10px] font-bold uppercase text-slate-500 ${round ? 'rounded-full' : ''}`}>{label}</span>;
}

function drawDecoration(ctx: CanvasRenderingContext2D, design: CustomDesignConfig, width: number, height: number) {
  if (design.layout === 'banner') { ctx.fillStyle = design.textColor; ctx.fillRect(0, 0, width * .27, height); }
  else if (design.layout === 'signature') { ctx.fillStyle = design.textColor; ctx.fillRect(0, 0, width * .29, height); ctx.strokeStyle = design.accentColor; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(width * .16, height * .37, width * .09, 0, Math.PI * 2); ctx.stroke(); }
  else if (design.layout === 'two-column') { ctx.fillStyle = design.accentColor; ctx.fillRect(0, height * .83, width, height * .17); }
  else { ctx.fillStyle = design.textColor; ctx.fillRect(width * .76, height * .07, width * .24, height * .22); ctx.fillRect(width * .29, height * .55, width * .04, height * .35); ctx.fillStyle = design.accentColor; ctx.fillRect(width * .29, height * .55, width * .04, 8); }
}

function imageForElement(element: CustomDesignElement, brand: DesignerBrandFields, qrImage?: string) {
  if (element.kind === 'logo') return brand.logo_url;
  if (element.kind === 'photo') return brand.photo_url;
  if (element.kind === 'image') return element.src;
  if (element.kind === 'qr') return qrImage;
  return undefined;
}

async function loadCanvasImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Image unavailable'));
    image.src = src;
  });
}

function drawImageFallback(ctx: CanvasRenderingContext2D, element: CustomDesignElement, width: number, height: number) {
  const x = width * element.x / 100, y = height * element.y / 100, w = width * element.width / 100, h = height * element.height / 100;
  ctx.save(); ctx.fillStyle = '#e2e8f0'; ctx.fillRect(x, y, w, h); ctx.fillStyle = '#64748b'; ctx.font = '600 12px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('IMAGE UNAVAILABLE', x + w / 2, y + h / 2, Math.max(20, w - 8)); ctx.restore();
}

async function drawExportElement(ctx: CanvasRenderingContext2D, element: CustomDesignElement, brand: DesignerBrandFields, design: CustomDesignConfig, qrImage: string | undefined, width: number, height: number) {
  const x = width * element.x / 100, y = height * element.y / 100, w = width * element.width / 100, h = height * element.height / 100;
  ctx.save(); ctx.globalAlpha = element.kind === 'brokerage' ? 1 : element.opacity ?? 1;
  if (element.kind === 'line') { ctx.fillStyle = element.backgroundColor || design.accentColor; ctx.fillRect(x, y + h / 2 - 2, w, 4); ctx.restore(); return; }
  if (element.kind === 'block') { ctx.fillStyle = element.backgroundColor || design.accentColor; ctx.fillRect(x, y, w, h); }
  const imageSrc = imageForElement(element, brand, qrImage);
  if (['logo', 'photo', 'image', 'qr'].includes(element.kind)) {
    if (!imageSrc) { drawImageFallback(ctx, element, width, height); ctx.restore(); return; }
    const image = await loadCanvasImage(imageSrc);
    const scale = Math.min(w / image.naturalWidth, h / image.naturalHeight);
    const drawW = image.naturalWidth * scale, drawH = image.naturalHeight * scale;
    ctx.drawImage(image, x + (w - drawW) / 2, y + (h - drawH) / 2, drawW, drawH);
    ctx.restore(); return;
  }
  const content: Record<string, string> = { name: brand.display_name || 'Your name', title: brand.professional_title || 'REALTOR®', brokerage: brand.brokerage_name || 'Broker licensed or registered name', text: element.text || 'Custom text', block: element.text || 'Badge' };
  const lines = element.kind === 'contact' ? [`C: ${brand.phone || 'Mobile phone'}`, `O: ${brand.office_phone || 'Office phone'}`, brand.email || 'Email address', brand.website || 'Website'] : [content[element.kind] || ''];
  ctx.fillStyle = element.color || design.textColor; ctx.font = `${element.fontWeight ?? (element.kind === 'name' || element.kind === 'brokerage' ? 700 : 400)} ${element.fontSize ?? 14}px ${element.fontFamily || 'Arial'}`; ctx.textBaseline = 'middle';
  const align = element.textAlign || (element.kind === 'brokerage' || element.kind === 'block' ? 'center' : 'left'); ctx.textAlign = align; const tx = align === 'center' ? x + w / 2 : align === 'right' ? x + w : x;
  const lineHeight = (element.fontSize ?? 14) * 1.25; const startY = y + h / 2 - (lines.length - 1) * lineHeight / 2;
  lines.forEach((line, index) => ctx.fillText(line, tx, startY + index * lineHeight, w)); ctx.restore();
}
