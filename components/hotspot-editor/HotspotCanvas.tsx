'use client';
import { useEffect, useRef, useState } from 'react';
import { Rnd } from 'react-rnd';
import { toPublicHotspot, type Hotspot } from '@/lib/hotspots';
import { clampRect, TYPE_COLORS } from '@/lib/hotspot-editor-helpers';
import HotspotLayer from '@/components/HotspotLayer';
import { reviewStatus } from '@/lib/hotspot-review';

type Rect = Pick<Hotspot, 'x_frac' | 'y_frac' | 'w_frac' | 'h_frac'>;
export default function HotspotCanvas({ pageIdx, pageUrl, hotspots, selectedId, numbers, preview, zoom, busy, onSelect, onEdit, onMove }: {
  pageIdx: number; pageUrl?: string; hotspots: Hotspot[]; selectedId: number | null;
  numbers: Map<number, number>; preview: boolean; zoom: number; busy: boolean;
  onSelect: (id: number | null) => void; onEdit: (h: Hotspot) => void; onMove: (id: number, rect: Rect) => void;
}) {
  const image = useRef<HTMLImageElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = image.current;
    if (!el) return;
    const update = () => { if (el.clientWidth && el.clientHeight) setSize({ width: el.clientWidth, height: el.clientHeight }); };
    const observer = new ResizeObserver(update);
    observer.observe(el);
    el.addEventListener('load', update);
    update();
    return () => { observer.disconnect(); el.removeEventListener('load', update); };
  }, [pageUrl]);
  const active = hotspots.filter(h => !h.is_deleted && reviewStatus(h) !== 'rejected');
  const visible = active.filter(h => preview ? h.is_published || reviewStatus(h) === 'approved' : !h.editor_hidden)
    .sort((a, b) => (a.z_index || 0) - (b.z_index || 0) || a.id - b.id);
  if (!pageUrl) return <div className="p-8 text-sm text-gray-600">Page {pageIdx + 1} image unavailable. Upload page images in magazine settings.</div>;
  return (
    <div className="relative shrink-0 bg-white focus:outline-none" tabIndex={0} aria-label={`Page ${pageIdx + 1} hotspot canvas`} data-hotspot-page={pageIdx} style={{ width: `${440 * zoom}px`, isolation: 'isolate' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={image} src={pageUrl} alt={`Magazine page ${pageIdx + 1}`} draggable={false} className="block h-auto w-full select-none" onClick={() => onSelect(null)} />
      {preview ? <HotspotLayer hotspots={visible.map(toPublicHotspot)} displayWidth={size.width} displayHeight={size.height} preview /> :
        size.width > 0 && visible.map((h, rank) => {
          const selected = selectedId === h.id;
          const color = TYPE_COLORS[h.type]?.stroke || '#7059a8';
          return (
            <Rnd key={`${h.id}-${size.width}`} bounds="parent"
              size={{ width: Math.max(8, h.w_frac * size.width), height: Math.max(8, h.h_frac * size.height) }}
              position={{ x: h.x_frac * size.width, y: h.y_frac * size.height }}
              disableDragging={busy || !!h.editor_locked || !selected}
              enableResizing={selected && !busy && !h.editor_locked}
              cancel="button"
              onDragStop={(_, p) => onMove(h.id, clampRect({ ...h, x_frac: p.x / size.width, y_frac: p.y / size.height }))}
              onResizeStop={(_, __, ref, ___, p) => onMove(h.id, clampRect({ x_frac: p.x / size.width, y_frac: p.y / size.height, w_frac: ref.offsetWidth / size.width, h_frac: ref.offsetHeight / size.height }))}
              onMouseDown={e => {
                e.stopPropagation();
                if (e.altKey) {
                  const rect = image.current!.getBoundingClientRect();
                  const x = (e.clientX - rect.left) / rect.width, y = (e.clientY - rect.top) / rect.height;
                  const hits = [...visible].reverse().filter(a => x >= a.x_frac && x <= a.x_frac + a.w_frac && y >= a.y_frac && y <= a.y_frac + a.h_frac);
                  const current = hits.findIndex(a => a.id === selectedId);
                  onSelect(hits[(current + 1) % hits.length]?.id ?? h.id);
                } else onSelect(h.id);
              }}
              onDoubleClick={() => onEdit(h)}
              style={{ zIndex: selected ? visible.length + 2 : rank + 1, border: `2px ${reviewStatus(h) === 'approved' ? 'solid' : 'dashed'} ${color}`, background: selected ? `${color.replace('rgb(', 'rgba(').replace(')', ', 0.12)')}` : 'transparent', outline: selected ? '2px solid #301D5D' : 'none', outlineOffset: 2, cursor: h.editor_locked ? 'default' : selected ? 'move' : 'pointer' }}
              data-hotspot-id={h.id}>
              <button type="button" aria-label={`Select hotspot ${numbers.get(h.id)}`} onClick={e => { e.stopPropagation(); onSelect(h.id); }}
                className="absolute -left-1 -top-5 min-w-6 rounded-sm px-1 text-xs font-semibold text-white"
                style={{ background: color }}>{numbers.get(h.id)}{h.editor_locked ? ' L' : ''}</button>
            </Rnd>
          );
        })}
    </div>
  );
}
