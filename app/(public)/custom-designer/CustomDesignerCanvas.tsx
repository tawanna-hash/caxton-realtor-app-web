'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import QRCode from 'qrcode';
import {
  CopyPlus,
  LockKeyhole,
  Plus,
  QrCode,
  Redo2,
  RotateCcw,
  Trash2,
  Undo2,
} from 'lucide-react';
import {
  createCustomDesignPreset,
  isCustomElement,
  type CustomDesignConfig,
  type CustomDesignElement,
} from '@/lib/custom-design';

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
}

type Interaction = {
  mode: 'move' | 'resize';
  pointerId: number;
  startX: number;
  startY: number;
  startElement: CustomDesignElement;
  startDesign: CustomDesignConfig;
};

const controlClass =
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-700 transition hover:border-gray-400 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40';

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function nextId(kind: 'text' | 'qr') {
  return `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function CustomDesignerCanvas({ value, brand, onChange }: Props) {
  const [dragDraft, setDragDraft] = useState<CustomDesignConfig | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>('name');
  const [past, setPast] = useState<CustomDesignConfig[]>([]);
  const [future, setFuture] = useState<CustomDesignConfig[]>([]);
  const [qrImages, setQrImages] = useState<Record<string, string>>({});
  const canvasRef = useRef<HTMLDivElement>(null);
  const interaction = useRef<Interaction | null>(null);
  const dragDraftRef = useRef<CustomDesignConfig | null>(null);
  const design = dragDraft ?? value;

  const selected = useMemo(
    () => design.elements.find((element) => element.id === selectedId) ?? null,
    [design.elements, selectedId],
  );

  useEffect(() => {
    let cancelled = false;
    const qrElements = design.elements.filter((element) => element.kind === 'qr');
    Promise.all(qrElements.map(async (element) => {
      const destination = element.text?.trim() || brand.website.trim() || 'https://realtynewsnow.com';
      try {
        return [element.id, await QRCode.toDataURL(destination, {
          margin: 1,
          width: 320,
          color: { dark: design.textColor, light: design.backgroundColor },
        })] as const;
      } catch {
        return [element.id, ''] as const;
      }
    })).then((entries) => {
      if (!cancelled) setQrImages(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [brand.website, design.backgroundColor, design.elements, design.textColor]);

  function commit(next: CustomDesignConfig, prior = design) {
    setPast((items) => [...items.slice(-39), prior]);
    setFuture([]);
    onChange(next);
  }

  function updateSelected(patch: Partial<CustomDesignElement>) {
    if (!selected) return;
    commit({
      ...design,
      elements: design.elements.map((element) => (
        element.id === selected.id ? { ...element, ...patch } : element
      )),
    });
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
    const next = createCustomDesignPreset(design.layout);
    commit(next);
    setSelectedId('name');
  }

  function addElement(kind: 'text' | 'qr') {
    const id = nextId(kind);
    const element: CustomDesignElement = kind === 'text'
      ? {
        id,
        kind,
        x: 36,
        y: 70,
        width: 32,
        height: 14,
        fontSize: 16,
        color: design.textColor,
        text: 'Add your message',
      }
      : {
        id,
        kind,
        x: 82,
        y: 61,
        width: 13,
        height: 31,
        text: brand.website || 'https://realtynewsnow.com',
      };
    commit({ ...design, elements: [...design.elements, element] });
    setSelectedId(id);
  }

  function duplicateSelected() {
    if (!selected || !isCustomElement(selected)) return;
    const copy = {
      ...selected,
      id: nextId(selected.kind),
      x: clamp(selected.x + 3, 0, 96),
      y: clamp(selected.y + 5, 0, 96),
    };
    commit({ ...design, elements: [...design.elements, copy] });
    setSelectedId(copy.id);
  }

  function deleteSelected() {
    if (!selected || !isCustomElement(selected)) return;
    commit({ ...design, elements: design.elements.filter((element) => element.id !== selected.id) });
    setSelectedId(null);
  }

  function beginInteraction(
    event: ReactPointerEvent<HTMLElement>,
    element: CustomDesignElement,
    mode: 'move' | 'resize',
  ) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(element.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    interaction.current = {
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startElement: { ...element },
      startDesign: design,
    };
  }

  function moveInteraction(event: ReactPointerEvent<HTMLElement>) {
    const active = interaction.current;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!active || active.pointerId !== event.pointerId || !rect) return;
    const dx = (event.clientX - active.startX) / rect.width * 100;
    const dy = (event.clientY - active.startY) / rect.height * 100;
    const start = active.startElement;
    const patch = active.mode === 'move'
      ? {
        x: clamp(start.x + dx, 0, 100 - start.width),
        y: clamp(start.y + dy, 0, 100 - start.height),
      }
      : {
        width: clamp(start.width + dx, start.kind === 'brokerage' ? 18 : 4, 100 - start.x),
        height: clamp(start.height + dy, start.kind === 'brokerage' ? 10 : 4, 100 - start.y),
      };
    const next = {
      ...design,
      elements: design.elements.map((element) => (
        element.id === start.id ? { ...element, ...patch } : element
      )),
    };
    dragDraftRef.current = next;
    setDragDraft(next);
  }

  function endInteraction(event: ReactPointerEvent<HTMLElement>) {
    const active = interaction.current;
    if (!active || active.pointerId !== event.pointerId) return;
    interaction.current = null;
    const finalDesign = dragDraftRef.current ?? design;
    dragDraftRef.current = null;
    setDragDraft(null);
    setPast((items) => [...items.slice(-39), active.startDesign]);
    setFuture([]);
    onChange(finalDesign);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if ((event.key === 'Delete' || event.key === 'Backspace') && selected && isCustomElement(selected)) {
        event.preventDefault();
        deleteSelected();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => addElement('text')} className={controlClass} data-testid="button-add-custom-text">
          <Plus className="h-4 w-4" aria-hidden="true" /> Add text
        </button>
        <button type="button" onClick={() => addElement('qr')} className={controlClass} data-testid="button-add-qr-code">
          <QrCode className="h-4 w-4" aria-hidden="true" /> Add QR
        </button>
        <span className="mx-1 hidden h-6 w-px bg-gray-300 sm:block" aria-hidden="true" />
        <button type="button" onClick={undo} disabled={!past.length} className={controlClass} aria-label="Undo" title="Undo" data-testid="button-undo-design">
          <Undo2 className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" onClick={redo} disabled={!future.length} className={controlClass} aria-label="Redo" title="Redo" data-testid="button-redo-design">
          <Redo2 className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" onClick={reset} className={controlClass} data-testid="button-reset-design">
          <RotateCcw className="h-4 w-4" aria-hidden="true" /> Reset layout
        </button>
        <span className="ml-auto text-xs font-medium text-gray-500">Drag to move · use the corner handle to resize</span>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-300 bg-gray-200 p-2 shadow-inner sm:p-5">
        <div
          ref={canvasRef}
          className="relative mx-auto aspect-[40/13] w-full max-w-[900px] touch-none overflow-hidden shadow-lg"
          style={{ backgroundColor: design.backgroundColor }}
          onPointerDown={() => setSelectedId(null)}
          data-testid="custom-design-canvas"
        >
          <CanvasDecoration design={design} />
          {design.elements.map((element) => {
            const isSelected = selectedId === element.id;
            const color = element.color || design.textColor;
            return (
              <div
                key={element.id}
                role="button"
                tabIndex={0}
                aria-label={`Select ${element.kind} element`}
                onPointerDown={(event) => beginInteraction(event, element, 'move')}
                onPointerMove={moveInteraction}
                onPointerUp={endInteraction}
                onPointerCancel={endInteraction}
                onKeyDown={(event) => {
                  const delta = event.shiftKey ? 2 : 0.5;
                  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
                  event.preventDefault();
                  commit({
                    ...design,
                    elements: design.elements.map((item) => item.id === element.id ? {
                      ...item,
                      x: clamp(item.x + (event.key === 'ArrowLeft' ? -delta : event.key === 'ArrowRight' ? delta : 0), 0, 100 - item.width),
                      y: clamp(item.y + (event.key === 'ArrowUp' ? -delta : event.key === 'ArrowDown' ? delta : 0), 0, 100 - item.height),
                    } : item),
                  });
                }}
                className={`group absolute flex cursor-move select-none items-center overflow-hidden ${
                  isSelected ? 'z-20 outline outline-2 outline-offset-2 outline-[#078fca]' : 'z-10 hover:outline hover:outline-1 hover:outline-[#078fca]/60'
                }`}
                style={{
                  left: `${element.x}%`,
                  top: `${element.y}%`,
                  width: `${element.width}%`,
                  height: `${element.height}%`,
                  color,
                  fontSize: `clamp(8px, ${(element.fontSize ?? 14) / 800 * 100}vw, ${element.fontSize ?? 14}px)`,
                }}
                data-testid={`canvas-element-${element.id}`}
              >
                <CanvasElementContent element={element} brand={brand} qrImage={qrImages[element.id]} accentColor={design.accentColor} />
                {element.kind === 'brokerage' && (
                  <span className="absolute right-0 top-0 rounded-sm bg-white/90 p-0.5 text-gray-600" title="Broker name is protected">
                    <LockKeyhole className="h-3 w-3" aria-hidden="true" />
                  </span>
                )}
                {isSelected && (
                  <button
                    type="button"
                    aria-label={`Resize ${element.kind}`}
                    title="Drag to resize"
                    onPointerDown={(event) => beginInteraction(event, element, 'resize')}
                    onPointerMove={moveInteraction}
                    onPointerUp={endInteraction}
                    onPointerCancel={endInteraction}
                    className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize border-2 border-white bg-[#078fca] shadow"
                    data-testid={`resize-handle-${element.id}`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 rounded-lg border border-gray-200 bg-white p-4 md:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-gray-500">
            {selected ? `Editing ${selected.kind}` : 'Element controls'}
          </p>
          {!selected && <p className="mt-2 text-sm text-gray-600">Select an element on the canvas to edit it.</p>}
          {selected && ['name', 'title', 'brokerage', 'contact', 'text'].includes(selected.kind) && (
            <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px_64px]">
              {selected.kind === 'text' ? (
                <label className="text-sm font-medium text-gray-700">
                  Text
                  <input
                    type="text"
                    value={selected.text ?? ''}
                    maxLength={500}
                    onChange={(event) => updateSelected({ text: event.target.value })}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                    data-testid="input-selected-text"
                  />
                </label>
              ) : (
                <div className="self-end rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-600">
                  Content is linked to the professional profile.
                </div>
              )}
              <label className="text-sm font-medium text-gray-700">
                Font size
                <input
                  type="number"
                  min={8}
                  max={48}
                  value={selected.fontSize ?? 14}
                  onChange={(event) => updateSelected({ fontSize: clamp(Number(event.target.value) || 8, 8, 48) })}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                  data-testid="input-selected-font-size"
                />
              </label>
              <ColorControl label="Color" value={selected.color || design.textColor} onChange={(color) => updateSelected({ color })} />
            </div>
          )}
          {selected?.kind === 'qr' && (
            <label className="mt-3 block text-sm font-medium text-gray-700">
              QR destination
              <input
                type="url"
                value={selected.text ?? ''}
                onChange={(event) => updateSelected({ text: event.target.value })}
                placeholder={brand.website || 'https://example.com'}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                data-testid="input-qr-destination"
              />
            </label>
          )}
        </div>
        <div className="flex items-end gap-2">
          <button type="button" onClick={duplicateSelected} disabled={!selected || !isCustomElement(selected)} className={controlClass} data-testid="button-duplicate-element">
            <CopyPlus className="h-4 w-4" aria-hidden="true" /> Duplicate
          </button>
          <button
            type="button"
            onClick={deleteSelected}
            disabled={!selected || !isCustomElement(selected)}
            className={`${controlClass} text-red-700`}
            data-testid="button-delete-element"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function ColorControl({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="text-xs font-semibold text-gray-600">
      {label}
      <input
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 block h-10 w-full min-w-12 cursor-pointer rounded-md border border-gray-300 bg-white p-1"
        data-testid={`color-${label.toLowerCase().replace(/\s+/g, '-')}`}
      />
    </label>
  );
}

function CanvasDecoration({ design }: { design: CustomDesignConfig }) {
  if (design.layout === 'banner') {
    return <div className="absolute inset-y-0 left-0 w-[27%]" style={{ backgroundColor: design.textColor }} aria-hidden="true" />;
  }
  if (design.layout === 'signature') {
    return (
      <>
        <div className="absolute inset-y-0 left-0 w-[29%]" style={{ backgroundColor: design.textColor }} aria-hidden="true" />
        <div className="absolute left-[7%] top-[9%] aspect-square w-[18%] rounded-full border-[8px]" style={{ borderColor: design.accentColor }} aria-hidden="true" />
      </>
    );
  }
  if (design.layout === 'two-column') {
    return <div className="absolute inset-x-0 bottom-0 h-[17%]" style={{ backgroundColor: design.accentColor }} aria-hidden="true" />;
  }
  return (
    <>
      <div className="absolute right-0 top-[7%] h-[22%] w-[24%]" style={{ backgroundColor: design.textColor }} aria-hidden="true" />
      <div className="absolute bottom-[10%] left-[29%] h-[35%] w-[4%]" style={{ backgroundColor: design.textColor, borderTop: `8px solid ${design.accentColor}` }} aria-hidden="true" />
    </>
  );
}

function CanvasElementContent({
  element,
  brand,
  qrImage,
  accentColor,
}: {
  element: CustomDesignElement;
  brand: DesignerBrandFields;
  qrImage?: string;
  accentColor: string;
}) {
  switch (element.kind) {
    case 'name':
      return <strong className="w-full truncate">{brand.display_name || 'Your name'}</strong>;
    case 'title':
      return <span className="w-full truncate uppercase tracking-[0.18em]">{brand.professional_title || 'REALTOR®'}</span>;
    case 'brokerage':
      return <strong className="w-full text-center uppercase leading-tight">{brand.brokerage_name || 'Broker licensed or registered name'}</strong>;
    case 'contact':
      return (
        <span className="w-full space-y-[2px] leading-tight">
          <span className="block"><b style={{ color: accentColor }}>C:</b> {brand.phone || 'Mobile phone'}</span>
          <span className="block"><b style={{ color: accentColor }}>O:</b> {brand.office_phone || 'Office phone'}</span>
          <span className="block truncate">{brand.email || 'Email address'}</span>
          <span className="block truncate">{brand.website || 'Website'}</span>
        </span>
      );
    case 'logo':
      return brand.logo_url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={brand.logo_url} alt="Brokerage logo" draggable={false} className="h-full w-full object-contain" />
        : <span className="flex h-full w-full items-center justify-center border border-dashed border-current text-center text-[10px] font-bold uppercase">Brokerage logo</span>;
    case 'photo':
      return brand.photo_url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={brand.photo_url} alt="" draggable={false} className="h-full w-full rounded-full object-cover" />
        : <span className="flex aspect-square h-full max-w-full items-center justify-center rounded-full bg-gray-200 text-[10px] font-bold uppercase text-gray-500">Headshot</span>;
    case 'qr':
      return qrImage
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={qrImage} alt="QR code" draggable={false} className="h-full w-full object-contain" />
        : <span className="flex h-full w-full items-center justify-center bg-gray-100 text-[10px]">QR</span>;
    case 'text':
      return <span className="w-full whitespace-pre-wrap leading-tight">{element.text || 'Custom text'}</span>;
  }
}
