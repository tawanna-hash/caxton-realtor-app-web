'use client';

// Lightweight interactive viewer for static floorplan images (e.g. Newmark's
// schematic JPGs). Zoom (buttons / slider / wheel), pan (drag), rotate (90°
// steps), reset, and fullscreen via the Fullscreen API. No external deps.
//
// This is NOT a substitute for M/I's ML3D Solutions interactive floorplan
// (option toggles, levels, furniture planner) — that requires structured
// vector data the builder must publish. This just makes a flat image
// explorable.

import { useCallback, useEffect, useRef, useState } from 'react';

type Props = {
  src: string;
  alt?: string;
};

const MIN_SCALE = 0.5;
const MAX_SCALE = 5;
const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

const BTN =
  'inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded px-2 text-sm text-gray-700 hover:bg-gray-100';

export default function FloorplanViewer({ src, alt = 'Floorplan' }: Props) {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(
    null,
  );

  const reset = useCallback(() => {
    setScale(1);
    setRotation(0);
    setPos({ x: 0, y: 0 });
  }, []);

  const zoomIn = useCallback(() => setScale((s) => clampScale(s + 0.25)), []);
  const zoomOut = useCallback(() => setScale((s) => clampScale(s - 0.25)), []);
  const rotateLeft = useCallback(() => setRotation((r) => r - 90), []);
  const rotateRight = useCallback(() => setRotation((r) => r + 90), []);

  // Non-passive wheel listener so we can preventDefault (page scroll) while
  // zooming inside the stage.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setScale((s) => clampScale(s - e.deltaY * 0.002));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Track fullscreen state so the stage can grow to fill the viewport.
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    setPos({
      x: drag.current.px + (e.clientX - drag.current.x),
      y: drag.current.py + (e.clientY - drag.current.y),
    });
  };
  const endDrag = () => {
    drag.current = null;
  };

  const transform = `translate(${pos.x}px, ${pos.y}px) scale(${scale}) rotate(${rotation}deg)`;

  return (
    <div ref={containerRef} className="rounded-lg border border-gray-200 bg-gray-50">
      <div className="flex flex-wrap items-center gap-1 border-b border-gray-200 bg-white px-2 py-1.5">
        <button type="button" onClick={zoomOut} aria-label="Zoom out" className={BTN}>
          −
        </button>
        <input
          type="range"
          min={MIN_SCALE}
          max={MAX_SCALE}
          step={0.05}
          value={scale}
          onChange={(e) => setScale(clampScale(parseFloat(e.target.value)))}
          className="w-28 accent-[#5a0e5f]"
          aria-label="Zoom level"
        />
        <button type="button" onClick={zoomIn} aria-label="Zoom in" className={BTN}>
          +
        </button>
        <span className="w-10 text-center text-xs tabular-nums text-gray-500">
          {Math.round(scale * 100)}%
        </span>
        <span className="mx-1 h-5 w-px bg-gray-200" />
        <button type="button" onClick={rotateLeft} aria-label="Rotate left" className={BTN}>
          ↺
        </button>
        <button type="button" onClick={rotateRight} aria-label="Rotate right" className={BTN}>
          ↻
        </button>
        <button type="button" onClick={reset} aria-label="Reset view" className={BTN}>
          Reset
        </button>
        <button
          type="button"
          onClick={() => containerRef.current?.requestFullscreen?.()}
          aria-label="Fullscreen"
          title="Fullscreen"
          className={BTN}
        >
          ⛶
        </button>
      </div>
      <div
        ref={stageRef}
        className="relative flex w-full cursor-grab touch-none select-none items-center justify-center overflow-hidden bg-gray-100 active:cursor-grabbing"
        style={{ height: isFullscreen ? '100%' : 560 }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="max-h-full max-w-full pointer-events-none select-none object-contain"
          style={{ transform, transformOrigin: 'center center' }}
        />
      </div>
    </div>
  );
}
