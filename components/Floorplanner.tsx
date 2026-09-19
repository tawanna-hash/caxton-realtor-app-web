'use client';

// components/Floorplanner.tsx
//
// Ground-up interactive floorplan viewer. Takes a single floorplan image
// (builder-supplied PNG/JPG) and layers pan, pinch/wheel zoom, mirror,
// a self-calibrating measure tool, and draggable text notes on top of it.
// No canvas library — pan/zoom is a CSS transform on a natural-size content
// layer, and annotations are an SVG overlay living inside that same
// transform, so everything scales/pans/mirrors together for free.
//
// Coordinate system: all annotation points are stored in "natural image
// space" (0..naturalWidth, 0..naturalHeight), independent of zoom/pan, so
// they stay pinned to the artwork. viewportToNatural() converts a pointer
// event into that space, accounting for the current pan/zoom transform and
// the mirror flip (which happens in a nested layer with its own
// transform-origin, so it needs its own bit of math — see comment there).
//
// The measure tool has no external scale reference (unlike a georeferenced
// plan), so it calibrates itself: the first segment a user draws prompts
// for its real-world length, and every segment after that is computed from
// that ratio until the user re-calibrates.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Move, Ruler, Type, FlipHorizontal2, Undo2, ZoomIn, ZoomOut, Maximize2, X, Check } from 'lucide-react';

type Mode = 'pan' | 'measure' | 'text';

type Point = { x: number; y: number };

type MeasureAnnotation = {
  id: string;
  kind: 'measure';
  a: Point;
  b: Point;
};

type TextAnnotation = {
  id: string;
  kind: 'text';
  pos: Point;
  text: string;
};

type Annotation = MeasureAnnotation | TextAnnotation;

type Transform = { scale: number; x: number; y: number };

const MIN_SCALE_MULT = 1; // can't zoom out past "fit"
const MAX_SCALE_MULT = 8; // relative to fit scale
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SLOP = 24; // px

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

// Feet-and-inches, floor-plan style: 14'-6"
function formatFeetInches(feetDecimal: number): string {
  const totalInches = Math.round(feetDecimal * 12);
  let feet = Math.floor(totalInches / 12);
  let inches = totalInches % 12;
  if (inches === 12) {
    feet += 1;
    inches = 0;
  }
  return `${feet}'-${inches}"`;
}

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `ann_${idCounter}_${Date.now().toString(36)}`;
}

// Builder-exported floorplan SVGs commonly ship with a viewBox but no
// width/height on the root <svg> (they're meant to scale to a container).
// An <img> loading one of those reports a fallback naturalWidth/Height
// (observed: 150x150 in Chrome) instead of the real coordinate space, which
// would make us render — and then zoom into — a tiny rasterized image.
// So for SVG sources we fetch the markup and read viewBox/width/height
// ourselves; for everything else (and if the fetch fails, e.g. cross-origin
// without CORS) we fall back to the normal <img> probe.
async function resolveNaturalSize(src: string): Promise<{ w: number; h: number }> {
  if (/\.svg(\?|#|$)/i.test(src)) {
    try {
      const res = await fetch(src);
      const text = await res.text();
      const widthMatch = text.match(/<svg[^>]*\swidth=["']([\d.]+)(?:px)?["']/i);
      const heightMatch = text.match(/<svg[^>]*\sheight=["']([\d.]+)(?:px)?["']/i);
      if (widthMatch && heightMatch) {
        return { w: parseFloat(widthMatch[1]), h: parseFloat(heightMatch[1]) };
      }
      const viewBoxMatch = text.match(/viewBox=["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)/i);
      if (viewBoxMatch) {
        return { w: parseFloat(viewBoxMatch[1]), h: parseFloat(viewBoxMatch[2]) };
      }
    } catch {
      // Fall through to the <img> probe below (e.g. cross-origin without CORS).
    }
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = reject;
    img.src = src;
  });
}

export type FloorplannerProps = {
  src: string;
  alt?: string;
  planName?: string | null;
  /** Optional stat line, e.g. "3 Bedrooms | 2 Baths | 2,637 Sq. Ft." */
  subtitle?: string | null;
  onClose?: () => void;
  className?: string;
};

export default function Floorplanner({
  src,
  alt,
  planName,
  subtitle,
  onClose,
  className,
}: FloorplannerProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  // Reset natural size during render (not in an effect) when src changes,
  // per https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes —
  // avoids a frame of the old floorplan rendered at the new src's eventual size.
  const [prevSrc, setPrevSrc] = useState(src);
  if (src !== prevSrc) {
    setPrevSrc(src);
    setNatural(null);
  }
  const [fitScale, setFitScale] = useState(1);
  const [transform, setTransform] = useState<Transform>({ scale: 1, x: 0, y: 0 });
  const [mirror, setMirror] = useState(false);
  const [mode, setMode] = useState<Mode>('pan');
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [pixelsPerFoot, setPixelsPerFoot] = useState<number | null>(null);
  const [pendingMeasureStart, setPendingMeasureStart] = useState<Point | null>(null);
  const [calibrating, setCalibrating] = useState<{ annId: string; pixels: number } | null>(null);
  const [calibrationInput, setCalibrationInput] = useState('');
  const [draggingTextId, setDraggingTextId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);

  const userZoomedRef = useRef(false);
  const pointersRef = useRef<Map<number, Point>>(new Map());
  const pinchStartRef = useRef<{ dist: number; scale: number } | null>(null);
  const panStartRef = useRef<{ client: Point; transform: Transform } | null>(null);
  const lastTapRef = useRef<{ t: number; p: Point } | null>(null);
  const movedRef = useRef(false);

  const fit = useCallback((w: number, h: number) => {
    const vp = viewportRef.current;
    if (!vp) return;
    const rect = vp.getBoundingClientRect();
    const s = Math.min(rect.width / w, rect.height / h);
    setFitScale(s);
    setTransform({
      scale: s,
      x: (rect.width - w * s) / 2,
      y: (rect.height - h * s) / 2,
    });
    userZoomedRef.current = false;
  }, []);

  useEffect(() => {
    let cancelled = false;
    resolveNaturalSize(src)
      .then(({ w, h }) => {
        if (cancelled) return;
        setNatural({ w, h });
        fit(w, h);
      })
      .catch(() => {
        // Leave natural null — the viewport shows "Loading floor plan…"
        // indefinitely rather than a broken/blank canvas.
      });
    return () => {
      cancelled = true;
    };
  }, [src, fit]);

  // Re-fit on container resize, but only while the user hasn't zoomed yet.
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp || !natural) return;
    const ro = new ResizeObserver(() => {
      if (!userZoomedRef.current) fit(natural.w, natural.h);
    });
    ro.observe(vp);
    return () => ro.disconnect();
  }, [natural, fit]);

  const minScale = fitScale * MIN_SCALE_MULT;
  const maxScale = fitScale * MAX_SCALE_MULT;

  const clampScale = useCallback(
    (s: number) => Math.min(maxScale, Math.max(minScale, s)),
    [minScale, maxScale]
  );

  const zoomAt = useCallback(
    (anchor: Point, factor: number) => {
      setTransform((prev) => {
        const newScale = clampScale(prev.scale * factor);
        const nx = (anchor.x - prev.x) / prev.scale;
        const ny = (anchor.y - prev.y) / prev.scale;
        return {
          scale: newScale,
          x: anchor.x - nx * newScale,
          y: anchor.y - ny * newScale,
        };
      });
      userZoomedRef.current = true;
    },
    [clampScale]
  );

  const resetView = useCallback(() => {
    if (natural) fit(natural.w, natural.h);
  }, [natural, fit]);

  // Wheel zoom needs a non-passive listener to preventDefault (React's
  // synthetic onWheel is passive and can't stop page scroll).
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = vp.getBoundingClientRect();
      const anchor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const factor = Math.exp(-e.deltaY * 0.0015);
      zoomAt(anchor, factor);
    };
    vp.addEventListener('wheel', handler, { passive: false });
    return () => vp.removeEventListener('wheel', handler);
  }, [zoomAt]);

  // Viewport-local (relative to viewport rect) -> natural image space,
  // accounting for pan/zoom and, separately, the mirror flip.
  const viewportToNatural = useCallback(
    (local: Point): Point | null => {
      if (!natural) return null;
      const contentX = (local.x - transform.x) / transform.scale;
      const contentY = (local.y - transform.y) / transform.scale;
      // Mirror is a scaleX(-1) around the center of the natural.w box,
      // nested inside the pan/zoom transform, so undo it the same way.
      const x = mirror ? natural.w - contentX : contentX;
      const y = contentY;
      return { x, y };
    },
    [natural, transform, mirror]
  );

  const localFromClient = useCallback((client: Point): Point | null => {
    const vp = viewportRef.current;
    if (!vp) return null;
    const rect = vp.getBoundingClientRect();
    return { x: client.x - rect.left, y: client.y - rect.top };
  }, []);

  const finishMeasure = useCallback((a: Point, b: Point) => {
    if (dist(a, b) < 4) return; // ignore accidental taps
    const id = nextId();
    const ann: MeasureAnnotation = { id, kind: 'measure', a, b };
    setAnnotations((prev) => [...prev, ann]);
    setPixelsPerFoot((current) => {
      if (current != null) return current;
      // First-ever measurement: prompt to calibrate.
      setCalibrating({ annId: id, pixels: dist(a, b) });
      setCalibrationInput('');
      return current;
    });
  }, []);

  const placeText = useCallback((pos: Point) => {
    const id = nextId();
    setAnnotations((prev) => [...prev, { id, kind: 'text', pos, text: 'Note' }]);
    setEditingTextId(id);
  }, []);

  // ── Pointer handling: pan, pinch-zoom, and tool taps all share one set
  //    of handlers on the viewport so touch and mouse behave the same way.
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (draggingTextId) return;
      (e.target as Element).setPointerCapture?.(e.pointerId);
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      movedRef.current = false;

      if (pointersRef.current.size === 2) {
        const pts = Array.from(pointersRef.current.values());
        pinchStartRef.current = { dist: dist(pts[0], pts[1]), scale: transform.scale };
        panStartRef.current = null;
      } else if (pointersRef.current.size === 1) {
        panStartRef.current = { client: { x: e.clientX, y: e.clientY }, transform };
      }
    },
    [transform, draggingTextId]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!pointersRef.current.has(e.pointerId)) return;
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointersRef.current.size === 2 && pinchStartRef.current) {
        const pts = Array.from(pointersRef.current.values());
        const d = dist(pts[0], pts[1]);
        const mid = midpoint(pts[0], pts[1]);
        const local = localFromClient(mid);
        if (!local) return;
        const factor = d / pinchStartRef.current.dist;
        const newScale = clampScale(pinchStartRef.current.scale * factor);
        setTransform((prev) => {
          const nx = (local.x - prev.x) / prev.scale;
          const ny = (local.y - prev.y) / prev.scale;
          return { scale: newScale, x: local.x - nx * newScale, y: local.y - ny * newScale };
        });
        userZoomedRef.current = true;
        movedRef.current = true;
        return;
      }

      if (pointersRef.current.size === 1 && panStartRef.current) {
        const start = panStartRef.current;
        const dx = e.clientX - start.client.x;
        const dy = e.clientY - start.client.y;
        if (Math.hypot(dx, dy) > 4) movedRef.current = true;
        // In measure/text mode a still finger places a point; only pan
        // once the drag clearly moved, so taps stay precise.
        if (mode === 'pan' || movedRef.current) {
          setTransform({ scale: start.transform.scale, x: start.transform.x + dx, y: start.transform.y + dy });
        }
      }
    },
    [clampScale, localFromClient, mode]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const wasSingle = pointersRef.current.size === 1;
      pointersRef.current.delete(e.pointerId);
      if (pointersRef.current.size < 2) pinchStartRef.current = null;
      if (pointersRef.current.size === 0) panStartRef.current = null;

      if (!wasSingle) return;
      if (movedRef.current) {
        movedRef.current = false;
        return;
      }

      const local = localFromClient({ x: e.clientX, y: e.clientY });
      if (!local) return;

      if (mode === 'pan') {
        // Double-tap/double-click to zoom.
        const now = Date.now();
        const last = lastTapRef.current;
        lastTapRef.current = { t: now, p: local };
        if (last && now - last.t < DOUBLE_TAP_MS && dist(last.p, local) < DOUBLE_TAP_SLOP) {
          if (transform.scale < fitScale * 1.9) {
            zoomAt(local, (fitScale * 2.2) / transform.scale);
          } else {
            resetView();
          }
          lastTapRef.current = null;
        }
        return;
      }

      const natPoint = viewportToNatural(local);
      if (!natPoint) return;

      if (mode === 'measure') {
        if (!pendingMeasureStart) {
          setPendingMeasureStart(natPoint);
        } else {
          finishMeasure(pendingMeasureStart, natPoint);
          setPendingMeasureStart(null);
        }
      } else if (mode === 'text') {
        placeText(natPoint);
      }
    },
    [mode, localFromClient, transform.scale, fitScale, zoomAt, resetView, viewportToNatural, pendingMeasureStart, finishMeasure, placeText]
  );

  const undo = useCallback(() => {
    setAnnotations((prev) => {
      if (prev.length === 0) return prev;
      const removed = prev[prev.length - 1];
      if (removed.kind === 'measure' && calibrating?.annId === removed.id) {
        setCalibrating(null);
      }
      // If we removed the very measurement that set the scale, and no
      // other measurement remains to anchor it, drop the calibration too.
      const rest = prev.slice(0, -1);
      if (removed.kind === 'measure' && !rest.some((a) => a.kind === 'measure')) {
        setPixelsPerFoot(null);
      }
      return rest;
    });
    setPendingMeasureStart(null);
  }, [calibrating]);

  const recalibrate = useCallback(() => {
    setPixelsPerFoot(null);
    const measures = annotations.filter((a): a is MeasureAnnotation => a.kind === 'measure');
    const last = measures[measures.length - 1];
    if (last) {
      setCalibrating({ annId: last.id, pixels: dist(last.a, last.b) });
      setCalibrationInput('');
    }
  }, [annotations]);

  const confirmCalibration = useCallback(() => {
    if (!calibrating) return;
    const feet = parseFloat(calibrationInput);
    if (!feet || feet <= 0) return;
    setPixelsPerFoot(calibrating.pixels / feet);
    setCalibrating(null);
  }, [calibrating, calibrationInput]);

  // ── Text-annotation dragging (separate pointer handlers on the label
  //    itself, so it doesn't fight the canvas pan/measure/text handlers).
  const dragStateRef = useRef<{ id: string; startClient: Point; startPos: Point } | null>(null);

  const onTextPointerDown = useCallback(
    (e: React.PointerEvent, ann: TextAnnotation) => {
      e.stopPropagation();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      dragStateRef.current = { id: ann.id, startClient: { x: e.clientX, y: e.clientY }, startPos: ann.pos };
      setDraggingTextId(ann.id);
    },
    []
  );

  const onTextPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragStateRef.current;
      if (!drag) return;
      const dx = (e.clientX - drag.startClient.x) / transform.scale;
      const dy = (e.clientY - drag.startClient.y) / transform.scale;
      const dxNat = mirror ? -dx : dx;
      setAnnotations((prev) =>
        prev.map((a) =>
          a.kind === 'text' && a.id === drag.id
            ? { ...a, pos: { x: drag.startPos.x + dxNat, y: drag.startPos.y + dy } }
            : a
        )
      );
    },
    [transform.scale, mirror]
  );

  const onTextPointerUp = useCallback(() => {
    dragStateRef.current = null;
    setDraggingTextId(null);
  }, []);

  const removeAnnotation = useCallback((id: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const measureLabel = useCallback(
    (a: Point, b: Point) => {
      const px = dist(a, b);
      return pixelsPerFoot ? formatFeetInches(px / pixelsPerFoot) : `${Math.round(px)}px`;
    },
    [pixelsPerFoot]
  );

  const cursorClass = useMemo(() => {
    if (mode === 'measure' || mode === 'text') return 'cursor-crosshair';
    return transform.scale > minScale ? 'cursor-grab' : 'cursor-default';
  }, [mode, transform.scale, minScale]);

  return (
    <div className={`relative flex flex-col bg-gray-950 text-white ${className ?? ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-gray-900/95 border-b border-white/10 shrink-0">
        <div className="min-w-0">
          {planName && <div className="font-semibold truncate">{planName}</div>}
          {subtitle && <div className="text-xs text-white/60 truncate">{subtitle}</div>}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close floorplan"
            className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Viewport */}
      <div
        ref={viewportRef}
        className={`relative flex-1 overflow-hidden touch-none select-none bg-white ${cursorClass}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {natural && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: natural.w,
              height: natural.h,
              transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
              transformOrigin: '0 0',
            }}
          >
            <div
              style={{
                width: natural.w,
                height: natural.h,
                transform: mirror ? 'scaleX(-1)' : undefined,
                transformOrigin: '50% 50%',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={alt ?? planName ?? 'Floor plan'}
                width={natural.w}
                height={natural.h}
                draggable={false}
                className="block max-w-none select-none pointer-events-none"
              />

              <svg
                width={natural.w}
                height={natural.h}
                viewBox={`0 0 ${natural.w} ${natural.h}`}
                className="absolute inset-0 pointer-events-none overflow-visible"
              >
                {annotations
                  .filter((a): a is MeasureAnnotation => a.kind === 'measure')
                  .map((a) => {
                    const mid = midpoint(a.a, a.b);
                    const strokeW = 2 / transform.scale;
                    return (
                      <g key={a.id}>
                        <line
                          x1={a.a.x}
                          y1={a.a.y}
                          x2={a.b.x}
                          y2={a.b.y}
                          stroke="#2563eb"
                          strokeWidth={strokeW}
                        />
                        <circle cx={a.a.x} cy={a.a.y} r={4 / transform.scale} fill="#2563eb" />
                        <circle cx={a.b.x} cy={a.b.y} r={4 / transform.scale} fill="#2563eb" />
                        <g
                          transform={`translate(${mid.x} ${mid.y}) scale(${1 / transform.scale}) ${
                            mirror ? 'scale(-1,1)' : ''
                          }`}
                        >
                          <rect x={-30} y={-11} width={60} height={20} rx={4} fill="rgba(15,15,15,0.85)" />
                          <text
                            x={0}
                            y={0}
                            fill="#facc15"
                            fontSize={12}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fontWeight={600}
                          >
                            {measureLabel(a.a, a.b)}
                          </text>
                        </g>
                      </g>
                    );
                  })}

                {pendingMeasureStart && (
                  <circle
                    cx={pendingMeasureStart.x}
                    cy={pendingMeasureStart.y}
                    r={4 / transform.scale}
                    fill="#2563eb"
                  />
                )}
              </svg>

              {/* Text annotations: plain positioned HTML (not SVG) so they can
                  host a real input while editing; counter-scaled/mirrored so
                  label size & orientation stay constant on screen. */}
              {annotations
                .filter((a): a is TextAnnotation => a.kind === 'text')
                .map((a) => (
                  <div
                    key={a.id}
                    style={{
                      position: 'absolute',
                      left: a.pos.x,
                      top: a.pos.y,
                      transform: `translate(-50%, -50%) scale(${1 / transform.scale}) ${
                        mirror ? 'scaleX(-1)' : ''
                      }`,
                      transformOrigin: 'center',
                      pointerEvents: 'auto',
                    }}
                    onPointerDown={(e) => onTextPointerDown(e, a)}
                    onPointerMove={onTextPointerMove}
                    onPointerUp={onTextPointerUp}
                    onPointerCancel={onTextPointerUp}
                    className="group"
                  >
                    {editingTextId === a.id ? (
                      <input
                        autoFocus
                        defaultValue={a.text}
                        onBlur={(e) => {
                          const text = e.target.value.trim() || 'Note';
                          setAnnotations((prev) =>
                            prev.map((x) => (x.id === a.id ? { ...x, text } : x))
                          );
                          setEditingTextId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        }}
                        className="px-2 py-1 text-sm rounded-md bg-blue-600 text-white shadow-lg outline-none w-32 placeholder:text-blue-100"
                      />
                    ) : (
                      <div
                        className="flex items-center gap-1 px-2 py-1 rounded-md bg-blue-600 text-white text-sm font-medium shadow-lg cursor-move whitespace-nowrap"
                        onDoubleClick={() => setEditingTextId(a.id)}
                      >
                        {a.text}
                        <button
                          type="button"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={() => removeAnnotation(a.id)}
                          aria-label="Delete note"
                          className="ml-1 text-blue-200 hover:text-white"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </div>
        )}

        {!natural && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">
            Loading floor plan…
          </div>
        )}

        {/* Calibration prompt */}
        {calibrating && (
          <div className="absolute inset-x-0 bottom-4 flex justify-center px-4 pointer-events-none">
            <div
              className="pointer-events-auto flex items-center gap-2 bg-gray-900 border border-white/15 rounded-full pl-4 pr-2 py-2 shadow-xl"
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
            >
              <span className="text-sm text-white/80 whitespace-nowrap">This line is how many feet?</span>
              <input
                autoFocus
                inputMode="decimal"
                value={calibrationInput}
                onChange={(e) => setCalibrationInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && confirmCalibration()}
                placeholder="e.g. 12"
                className="w-16 px-2 py-1 text-sm rounded-md bg-white text-gray-900 outline-none"
              />
              <button
                type="button"
                onClick={confirmCalibration}
                aria-label="Set scale"
                className="w-8 h-8 rounded-full bg-yellow-400 text-gray-900 flex items-center justify-center hover:bg-yellow-300"
              >
                <Check className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {mode === 'measure' && pendingMeasureStart && !calibrating && (
          <div className="absolute inset-x-0 top-3 flex justify-center pointer-events-none">
            <div className="bg-gray-900/90 border border-white/15 rounded-full px-3 py-1.5 text-xs text-white/80">
              Tap the other end of the wall
            </div>
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-900/95 border-t border-white/10 shrink-0 overflow-x-auto">
        <div className="flex items-center gap-1">
          <ToolButton active={mode === 'pan'} label="Pan" onClick={() => { setMode('pan'); setPendingMeasureStart(null); }}>
            <Move className="w-4 h-4" />
          </ToolButton>
          <ToolButton active={mode === 'measure'} label="Measure" onClick={() => setMode('measure')}>
            <Ruler className="w-4 h-4" />
          </ToolButton>
          <ToolButton active={mode === 'text'} label="Note" onClick={() => setMode('text')}>
            <Type className="w-4 h-4" />
          </ToolButton>
          <ToolButton active={mirror} label="Mirror" onClick={() => setMirror((m) => !m)}>
            <FlipHorizontal2 className="w-4 h-4" />
          </ToolButton>
          {pixelsPerFoot != null && (
            <button
              type="button"
              onClick={recalibrate}
              className="hidden sm:inline text-[11px] text-white/50 hover:text-white/80 px-2 whitespace-nowrap"
            >
              Reset scale
            </button>
          )}
        </div>

        <div className="flex items-center gap-1">
          <ToolButton label="Undo" disabled={annotations.length === 0} onClick={undo}>
            <Undo2 className="w-4 h-4" />
          </ToolButton>
          <ToolButton
            label="Zoom out"
            disabled={!natural || transform.scale <= minScale + 0.0001}
            onClick={() => {
              const vp = viewportRef.current;
              if (!vp) return;
              const rect = vp.getBoundingClientRect();
              zoomAt({ x: rect.width / 2, y: rect.height / 2 }, 1 / 1.4);
            }}
          >
            <ZoomOut className="w-4 h-4" />
          </ToolButton>
          <ToolButton
            label="Zoom in"
            disabled={!natural || transform.scale >= maxScale - 0.0001}
            onClick={() => {
              const vp = viewportRef.current;
              if (!vp) return;
              const rect = vp.getBoundingClientRect();
              zoomAt({ x: rect.width / 2, y: rect.height / 2 }, 1.4);
            }}
          >
            <ZoomIn className="w-4 h-4" />
          </ToolButton>
          <ToolButton label="Fit" onClick={resetView}>
            <Maximize2 className="w-4 h-4" />
          </ToolButton>
        </div>
      </div>
    </div>
  );
}

function ToolButton({
  active,
  disabled,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center transition-colors ${
        active ? 'bg-yellow-400 text-gray-900' : 'bg-white/10 text-white hover:bg-white/20'
      } ${disabled ? 'opacity-30 pointer-events-none' : ''}`}
    >
      {children}
    </button>
  );
}
