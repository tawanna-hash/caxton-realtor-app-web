'use client';

import {
  ArrowDown,
  ArrowUp,
  Download,
  Image as ImageIcon,
  Minus,
  MousePointer2,
  RotateCcw,
  Square,
  Trash2,
  Type,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

type Format = 'signature' | 'flyer' | 'social' | 'card';
type LayerType = 'text' | 'shape' | 'image' | 'line';

type Layer = {
  id: string;
  type: LayerType;
  name: string;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  text?: string;
  fontSize?: number;
  fontWeight?: number;
  color: string;
  background?: string;
  radius?: number;
  src?: string;
};

const FORMATS: Record<Format, { label: string; width: number; height: number }> = {
  signature: { label: 'Email Signature (450 × 150 px)', width: 450, height: 150 },
  flyer: { label: 'Marketing Flyer (600 × 750 px)', width: 600, height: 750 },
  social: { label: 'Square Promotion (500 × 500 px)', width: 500, height: 500 },
  card: { label: 'Modern Business Card (550 × 320 px)', width: 550, height: 320 },
};

const INITIAL_LAYERS: Layer[] = [
  {
    id: 'profile-avatar',
    type: 'image',
    name: 'Profile Avatar',
    src: '',
    width: 80,
    height: 80,
    radius: 50,
    x: 30,
    y: 35,
    z: 5,
    color: '#e4e4e7',
  },
  {
    id: 'name-title',
    type: 'text',
    name: 'Name Title',
    text: 'Sarah Jenkins',
    fontSize: 22,
    fontWeight: 700,
    width: 220,
    height: 28,
    x: 135,
    y: 32,
    z: 10,
    color: '#1f2937',
  },
  {
    id: 'job-role',
    type: 'text',
    name: 'Job Role',
    text: 'Senior VP of Product Design',
    fontSize: 13,
    fontWeight: 400,
    width: 230,
    height: 20,
    x: 135,
    y: 64,
    z: 9,
    color: '#6366f1',
  },
  {
    id: 'divider',
    type: 'line',
    name: 'Structural Divider',
    width: 280,
    height: 1,
    x: 135,
    y: 92,
    z: 4,
    color: '#e5e7eb',
  },
  {
    id: 'action-button',
    type: 'shape',
    name: 'Action Button',
    text: 'Schedule Sync',
    width: 110,
    height: 26,
    radius: 4,
    x: 135,
    y: 105,
    z: 8,
    color: '#ffffff',
    background: '#18181b',
  },
];

const cloneInitialLayers = () => INITIAL_LAYERS.map((layer) => ({ ...layer }));

export default function DesignerClient() {
  const [format, setFormat] = useState<Format>('signature');
  const [layers, setLayers] = useState<Layer[]>(cloneInitialLayers);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [boardColor, setBoardColor] = useState('#ffffff');
  const boardRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef(INITIAL_LAYERS.length);
  const dragRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const dimensions = FORMATS[format];
  const selected = layers.find((layer) => layer.id === selectedId) ?? null;
  const orderedLayers = useMemo(() => [...layers].sort((a, b) => b.z - a.z), [layers]);

  const updateLayer = (id: string, patch: Partial<Layer>) => {
    setLayers((current) => current.map((layer) => (layer.id === id ? { ...layer, ...patch } : layer)));
  };

  const addLayer = (type: LayerType) => {
    counterRef.current += 1;
    const number = counterRef.current;
    const base = {
      id: `layer-${number}`,
      type,
      x: 40,
      y: 40,
      z: Math.max(10, ...layers.map((layer) => layer.z)) + 1,
      color: '#18181b',
    };
    let layer: Layer;
    if (type === 'text') {
      layer = { ...base, name: `Typography ${number}`, text: 'New Text Block', width: 190, height: 30, fontSize: 18, fontWeight: 700 };
    } else if (type === 'shape') {
      layer = { ...base, name: `Block ${number}`, text: 'View Portfolio', width: 120, height: 36, radius: 4, color: '#ffffff', background: '#6366f1' };
    } else if (type === 'image') {
      layer = { ...base, name: `Graphic ${number}`, src: '', width: 80, height: 80, radius: 12, color: '#e4e4e7' };
    } else {
      layer = { ...base, name: `Line ${number}`, width: 160, height: 2, color: '#e4e4e7' };
    }
    setLayers((current) => [...current, layer]);
    setSelectedId(layer.id);
  };

  const reset = () => {
    setLayers(cloneInitialLayers());
    setSelectedId(null);
    setBoardColor('#ffffff');
  };

  const changeFormat = (next: Format) => {
    setFormat(next);
    reset();
  };

  const startDrag = (event: React.PointerEvent, layer: Layer) => {
    if (!boardRef.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = boardRef.current.getBoundingClientRect();
    const scaleX = dimensions.width / rect.width;
    const scaleY = dimensions.height / rect.height;
    dragRef.current = {
      id: layer.id,
      offsetX: (event.clientX - rect.left) * scaleX - layer.x,
      offsetY: (event.clientY - rect.top) * scaleY - layer.y,
    };
    setSelectedId(layer.id);
  };

  const moveDrag = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    const board = boardRef.current;
    if (!drag || !board) return;
    const rect = board.getBoundingClientRect();
    const scaleX = dimensions.width / rect.width;
    const scaleY = dimensions.height / rect.height;
    const layer = layers.find((item) => item.id === drag.id);
    if (!layer) return;
    const nextX = Math.max(0, Math.min(dimensions.width - layer.width, (event.clientX - rect.left) * scaleX - drag.offsetX));
    const nextY = Math.max(0, Math.min(dimensions.height - layer.height, (event.clientY - rect.top) * scaleY - drag.offsetY));
    updateLayer(drag.id, { x: Math.round(nextX), y: Math.round(nextY) });
  };

  const shiftDepth = (id: string, amount: number) => {
    const layer = layers.find((item) => item.id === id);
    if (layer) updateLayer(id, { z: Math.max(1, layer.z + amount) });
  };

  const removeLayer = (id: string) => {
    setLayers((current) => current.filter((layer) => layer.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const exportPng = async () => {
    const canvas = document.createElement('canvas');
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.fillStyle = boardColor;
    context.fillRect(0, 0, dimensions.width, dimensions.height);

    for (const layer of [...layers].sort((a, b) => a.z - b.z)) {
      if (layer.type === 'text') {
        context.fillStyle = layer.color;
        context.font = `${layer.fontWeight ?? 400} ${layer.fontSize ?? 16}px Arial, sans-serif`;
        context.textBaseline = 'top';
        context.fillText(layer.text ?? '', layer.x, layer.y);
      } else if (layer.type === 'line') {
        context.fillStyle = layer.color;
        context.fillRect(layer.x, layer.y, layer.width, layer.height);
      } else if (layer.type === 'shape') {
        context.fillStyle = layer.background ?? '#6366f1';
        context.beginPath();
        context.roundRect(layer.x, layer.y, layer.width, layer.height, layer.radius ?? 0);
        context.fill();
        context.fillStyle = layer.color;
        context.font = '600 12px Arial, sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(layer.text ?? '', layer.x + layer.width / 2, layer.y + layer.height / 2);
        context.textAlign = 'left';
        context.textBaseline = 'top';
      } else if (layer.src) {
        await new Promise<void>((resolve) => {
          const image = new Image();
          image.crossOrigin = 'anonymous';
          image.onload = () => {
            context.save();
            if ((layer.radius ?? 0) >= 50) {
              context.beginPath();
              context.ellipse(layer.x + layer.width / 2, layer.y + layer.height / 2, layer.width / 2, layer.height / 2, 0, 0, Math.PI * 2);
              context.clip();
            }
            context.drawImage(image, layer.x, layer.y, layer.width, layer.height);
            context.restore();
            resolve();
          };
          image.onerror = () => resolve();
          image.src = layer.src ?? '';
        });
      } else {
        context.fillStyle = layer.color;
        context.fillRect(layer.x, layer.y, layer.width, layer.height);
      }
    }

    const anchor = document.createElement('a');
    anchor.download = `rnn-${format}-${Date.now()}.png`;
    anchor.href = canvas.toDataURL('image/png');
    anchor.click();
  };

  return (
    <main className="min-h-[calc(100vh-64px)] bg-[#0f0f11] text-zinc-100">
      <div className="border-b border-zinc-700 bg-[#18181b] px-4 py-3 sm:px-5">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-400">Platinum Tools</p>
            <h1 className="text-lg font-bold">Studio Collateral Workspace</h1>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={reset} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-zinc-700 px-3 text-sm font-semibold hover:bg-zinc-800">
              <RotateCcw size={15} /> Reset
            </button>
            <button type="button" onClick={exportPng} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-indigo-500 px-4 text-sm font-semibold text-white hover:bg-indigo-600">
              <Download size={15} /> Export PNG
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1600px] lg:grid-cols-[280px_minmax(0,1fr)_300px]">
        <aside className="border-b border-zinc-700 bg-[#18181b] lg:min-h-[calc(100vh-129px)] lg:border-b-0 lg:border-r">
          <PanelHeading>Canvas Framework</PanelHeading>
          <div className="space-y-5 p-4">
            <Field label="Layout dimensions">
              <select value={format} onChange={(event) => changeFormat(event.target.value as Format)} className="studio-input">
                {Object.entries(FORMATS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
              </select>
            </Field>
            <div>
              <SectionLabel>Insert elements</SectionLabel>
              <div className="grid grid-cols-2 gap-2">
                <InsertButton icon={<Type size={18} />} label="Text Node" onClick={() => addLayer('text')} />
                <InsertButton icon={<Square size={18} />} label="Block Shape" onClick={() => addLayer('shape')} />
                <InsertButton icon={<ImageIcon size={18} />} label="Avatar / Graphic" onClick={() => addLayer('image')} />
                <InsertButton icon={<Minus size={18} />} label="Line Matrix" onClick={() => addLayer('line')} />
              </div>
            </div>
            <div>
              <SectionLabel>Layers deck</SectionLabel>
              <div className="space-y-1.5">
                {orderedLayers.map((layer) => (
                  <button
                    key={layer.id}
                    type="button"
                    onClick={() => setSelectedId(layer.id)}
                    className={`flex min-h-10 w-full items-center justify-between rounded-md border px-3 text-left text-xs ${selectedId === layer.id ? 'border-indigo-500 bg-indigo-500/10' : 'border-zinc-700 bg-zinc-800 hover:border-zinc-500'}`}
                  >
                    <span className="truncate font-medium">{layer.name}</span>
                    <span className="ml-2 font-mono text-zinc-500">Z:{layer.z}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </aside>

        <section className="flex min-h-[460px] items-center justify-center overflow-auto bg-[#0f0f11] p-5 sm:p-10" onPointerMove={moveDrag} onPointerUp={() => { dragRef.current = null; }}>
          <div className="rounded-md bg-[radial-gradient(#3f3f46_1px,transparent_1px)] bg-[size:16px_16px] p-5">
            <div
              ref={boardRef}
              className="relative max-w-full overflow-hidden shadow-2xl touch-none"
              style={{ width: dimensions.width, aspectRatio: `${dimensions.width}/${dimensions.height}`, backgroundColor: boardColor }}
              onPointerDown={(event) => {
                if (event.target === event.currentTarget) setSelectedId(null);
              }}
            >
              {[...layers].sort((a, b) => a.z - b.z).map((layer) => (
                <div
                  key={layer.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Select ${layer.name}`}
                  onPointerDown={(event) => startDrag(event, layer)}
                  onKeyDown={(event) => {
                    const delta = event.shiftKey ? 10 : 1;
                    if (event.key === 'ArrowLeft') updateLayer(layer.id, { x: Math.max(0, layer.x - delta) });
                    if (event.key === 'ArrowRight') updateLayer(layer.id, { x: Math.min(dimensions.width - layer.width, layer.x + delta) });
                    if (event.key === 'ArrowUp') updateLayer(layer.id, { y: Math.max(0, layer.y - delta) });
                    if (event.key === 'ArrowDown') updateLayer(layer.id, { y: Math.min(dimensions.height - layer.height, layer.y + delta) });
                  }}
                  className={`absolute cursor-move select-none ${selectedId === layer.id ? 'ring-2 ring-indigo-500 ring-offset-1' : 'hover:ring-1 hover:ring-indigo-400'}`}
                  style={{ left: layer.x, top: layer.y, width: layer.width, height: layer.height, zIndex: layer.z }}
                >
                  <LayerVisual layer={layer} />
                </div>
              ))}
            </div>
          </div>
        </section>

        <aside className="border-t border-zinc-700 bg-[#18181b] lg:min-h-[calc(100vh-129px)] lg:border-l lg:border-t-0">
          <PanelHeading>Properties Inspector</PanelHeading>
          <div className="p-4">
            {!selected ? (
              <div className="rounded-lg border border-dashed border-zinc-700 p-6 text-center">
                <MousePointer2 className="mx-auto mb-3 text-zinc-500" size={24} />
                <p className="text-sm leading-6 text-zinc-400">Select an element on the canvas or in the layer deck to edit it.</p>
                <Field label="Canvas color">
                  <input type="color" value={boardColor} onChange={(event) => setBoardColor(event.target.value)} className="studio-color" />
                </Field>
              </div>
            ) : (
              <div className="space-y-4">
                <Field label="Layer label">
                  <input value={selected.name} onChange={(event) => updateLayer(selected.id, { name: event.target.value })} className="studio-input" />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <NumberField label="Position X" value={selected.x} onChange={(x) => updateLayer(selected.id, { x })} />
                  <NumberField label="Position Y" value={selected.y} onChange={(y) => updateLayer(selected.id, { y })} />
                  <NumberField label="Width" value={selected.width} min={1} onChange={(width) => updateLayer(selected.id, { width })} />
                  <NumberField label="Height" value={selected.height} min={1} onChange={(height) => updateLayer(selected.id, { height })} />
                </div>
                {(selected.type === 'text' || selected.type === 'shape') && (
                  <Field label={selected.type === 'text' ? 'Typography content' : 'Inner label'}>
                    <input value={selected.text ?? ''} onChange={(event) => updateLayer(selected.id, { text: event.target.value })} className="studio-input" />
                  </Field>
                )}
                {selected.type === 'text' && (
                  <div className="grid grid-cols-2 gap-2">
                    <NumberField label="Font size" value={selected.fontSize ?? 16} min={8} onChange={(fontSize) => updateLayer(selected.id, { fontSize })} />
                    <Field label="Weight">
                      <select value={selected.fontWeight} onChange={(event) => updateLayer(selected.id, { fontWeight: Number(event.target.value) })} className="studio-input">
                        <option value={400}>Regular</option>
                        <option value={700}>Bold</option>
                      </select>
                    </Field>
                  </div>
                )}
                {selected.type === 'image' && (
                  <>
                    <Field label="Image resource URL">
                      <input value={selected.src ?? ''} onChange={(event) => updateLayer(selected.id, { src: event.target.value })} placeholder="https://…" className="studio-input" />
                    </Field>
                    <NumberField label="Corner masking (%)" value={selected.radius ?? 0} min={0} max={50} onChange={(radius) => updateLayer(selected.id, { radius })} />
                  </>
                )}
                {selected.type === 'shape' && (
                  <>
                    <Field label="Background color">
                      <input type="color" value={selected.background} onChange={(event) => updateLayer(selected.id, { background: event.target.value })} className="studio-color" />
                    </Field>
                    <NumberField label="Corner radius" value={selected.radius ?? 0} min={0} onChange={(radius) => updateLayer(selected.id, { radius })} />
                  </>
                )}
                <Field label={selected.type === 'shape' ? 'Text color' : selected.type === 'image' ? 'Fallback color' : 'Color'}>
                  <input type="color" value={selected.color} onChange={(event) => updateLayer(selected.id, { color: event.target.value })} className="studio-color" />
                </Field>
                <div className="grid grid-cols-3 gap-2 border-t border-zinc-700 pt-4">
                  <IconButton label="Move forward" icon={<ArrowUp size={15} />} onClick={() => shiftDepth(selected.id, 1)} />
                  <IconButton label="Move backward" icon={<ArrowDown size={15} />} onClick={() => shiftDepth(selected.id, -1)} />
                  <IconButton label="Delete" icon={<Trash2 size={15} />} onClick={() => removeLayer(selected.id)} destructive />
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
      <style jsx global>{`
        .studio-input {
          width: 100%;
          min-height: 40px;
          border: 1px solid #3f3f46;
          border-radius: 6px;
          background: #27272a;
          padding: 8px 10px;
          color: #f4f4f5;
          font-size: 13px;
        }
        .studio-input:focus { border-color: #6366f1; outline: none; }
        .studio-color {
          width: 100%;
          height: 40px;
          cursor: pointer;
          border: 1px solid #3f3f46;
          border-radius: 6px;
          background: #27272a;
          padding: 3px;
        }
      `}</style>
    </main>
  );
}

function LayerVisual({ layer }: { layer: Layer }) {
  if (layer.type === 'text') {
    return <div className="h-full whitespace-nowrap font-sans leading-tight" style={{ color: layer.color, fontSize: layer.fontSize, fontWeight: layer.fontWeight }}>{layer.text}</div>;
  }
  if (layer.type === 'shape') {
    return <div className="flex h-full w-full items-center justify-center text-center font-sans text-xs font-semibold" style={{ color: layer.color, backgroundColor: layer.background, borderRadius: layer.radius }}>{layer.text}</div>;
  }
  if (layer.type === 'line') {
    return <div className="h-full w-full" style={{ backgroundColor: layer.color }} />;
  }
  if (layer.src) {
    // User-supplied URLs must render directly so the same source can be drawn to the export canvas.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={layer.src} alt="" draggable={false} className="h-full w-full object-cover" style={{ borderRadius: `${layer.radius ?? 0}%` }} />;
  }
  return <div className="flex h-full w-full items-center justify-center bg-zinc-200 text-zinc-400" style={{ borderRadius: `${layer.radius ?? 0}%` }}><ImageIcon size={24} /></div>;
}

function PanelHeading({ children }: { children: React.ReactNode }) {
  return <div className="border-b border-zinc-700 px-4 py-4 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-400">{children}</div>;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 border-b border-zinc-700 pb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-400">{children}</p>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.04em] text-zinc-400">{label}</span>{children}</label>;
}

function NumberField({ label, value, onChange, min, max }: { label: string; value: number; onChange: (value: number) => void; min?: number; max?: number }) {
  return <Field label={label}><input type="number" value={value} min={min} max={max} onChange={(event) => onChange(Number(event.target.value) || 0)} className="studio-input" /></Field>;
}

function InsertButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-lg border border-transparent bg-zinc-800 px-2 text-xs font-medium text-zinc-200 hover:border-indigo-500 hover:bg-zinc-700">{icon}{label}</button>;
}

function IconButton({ icon, label, onClick, destructive = false }: { icon: React.ReactNode; label: string; onClick: () => void; destructive?: boolean }) {
  return <button type="button" title={label} aria-label={label} onClick={onClick} className={`flex min-h-10 items-center justify-center rounded-md border ${destructive ? 'border-red-900 text-red-400 hover:bg-red-950' : 'border-zinc-700 text-zinc-300 hover:bg-zinc-800'}`}>{icon}</button>;
}
