'use client';

// app/admin/billing/sign/[token]/SignaturePad.tsx
//
// Three-tab signature capture used in Step 5 of the sign wizard:
//   1. Type   — typed legal name (default)
//   2. Draw   — finger / mouse / stylus signature on a canvas → PNG blob
//   3. Upload — pre-signed PDF or image
//
// Emits a SignatureValue describing what the wizard should send to the
// `/api/sign/[token]` POST endpoint.

import { useEffect, useRef, useState } from 'react';

const ACCENT = '#dc2626';

export type SignatureMethod = 'type' | 'draw' | 'upload';

export type SignatureValue =
  | { method: 'type'; signerName: string }
  | { method: 'draw'; signerName: string; pngBlob: Blob | null }
  | { method: 'upload'; signerName: string; file: File | null };

type Props = {
  /** Initial typed name (e.g. ag.rep_name). */
  initialSignerName: string;
  /** Whether terms checkbox is ticked — disables inputs if not. */
  enabled: boolean;
  /** Called whenever the signature state changes. */
  onChange: (value: SignatureValue) => void;
};

// ── Tab button ─────────────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  children,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
        active
          ? 'text-gray-900'
          : 'text-gray-500 hover:text-gray-800 border-transparent'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      style={active ? { borderColor: ACCENT } : undefined}
    >
      {children}
    </button>
  );
}

// ── DrawCanvas ─────────────────────────────────────────────────────────────

function DrawCanvas({
  enabled,
  onPngChange,
}: {
  enabled: boolean;
  onPngChange: (blob: Blob | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  // Resize the backing store to match CSS size at devicePixelRatio so the
  // line stays crisp on retina without ballooning the export. Run once on
  // mount and on window resize.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    function resize() {
      if (!canvas) return;
      const ratio = window.devicePixelRatio || 1;
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      canvas.width = Math.floor(cssW * ratio);
      canvas.height = Math.floor(cssH * ratio);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(ratio, ratio);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 2.2;
        ctx.strokeStyle = '#111827';
      }
    }
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  function getPos(e: PointerEvent | React.PointerEvent): { x: number; y: number } {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!enabled) return;
    e.preventDefault();
    drawingRef.current = true;
    const canvas = canvasRef.current!;
    canvas.setPointerCapture(e.pointerId);
    const ctx = canvas.getContext('2d')!;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    e.preventDefault();
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasInk) setHasInk(true);
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const canvas = canvasRef.current!;
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    // Export current canvas as PNG and bubble up.
    canvas.toBlob((blob) => onPngChange(blob), 'image/png');
  }

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
    onPngChange(null);
  }

  return (
    <div>
      <div
        className={`relative rounded-md border-2 border-dashed bg-white ${
          enabled ? 'border-gray-300' : 'border-gray-200 bg-gray-50'
        }`}
        style={{ height: 180 }}
      >
        <canvas
          ref={canvasRef}
          className="w-full h-full touch-none rounded-md"
          style={{ cursor: enabled ? 'crosshair' : 'not-allowed' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        />
        {!hasInk && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-gray-400 text-xs">
            Sign here
          </div>
        )}
      </div>
      <div className="flex justify-end mt-2">
        <button
          type="button"
          onClick={clear}
          disabled={!enabled || !hasInk}
          className="text-xs text-gray-600 hover:text-gray-900 disabled:text-gray-300 disabled:cursor-not-allowed"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

// ── UploadField ────────────────────────────────────────────────────────────

function UploadField({
  enabled,
  onFileChange,
}: {
  enabled: boolean;
  onFileChange: (file: File | null) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFile(f: File | null) {
    setError(null);
    if (!f) {
      setFile(null);
      onFileChange(null);
      return;
    }
    const okType = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(f.type);
    if (!okType) {
      setError('Only PDF, PNG, JPEG, or WEBP files are allowed.');
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError('File must be under 10 MB.');
      return;
    }
    setFile(f);
    onFileChange(f);
  }

  return (
    <div>
      <label
        className={`flex items-center justify-center w-full rounded-md border-2 border-dashed cursor-pointer transition-colors ${
          enabled ? 'border-gray-300 hover:border-gray-400 bg-white' : 'border-gray-200 bg-gray-50 cursor-not-allowed'
        }`}
        style={{ height: 120 }}
      >
        <input
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/webp"
          disabled={!enabled}
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          className="hidden"
        />
        <div className="text-center px-4">
          {file ? (
            <>
              <div className="text-sm font-medium text-gray-900">{file.name}</div>
              <div className="text-xs text-gray-500 mt-1">{(file.size / 1024).toFixed(0)} KB · click to replace</div>
            </>
          ) : (
            <>
              <div className="text-sm text-gray-700">Click to choose a file</div>
              <div className="text-xs text-gray-400 mt-1">PDF, PNG, JPEG, or WEBP · up to 10 MB</div>
            </>
          )}
        </div>
      </label>
      {error && <div className="text-xs text-red-600 mt-2">{error}</div>}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────

export default function SignaturePad({ initialSignerName, enabled, onChange }: Props) {
  const [method, setMethod] = useState<SignatureMethod>('type');
  const [signerName, setSignerName] = useState(initialSignerName);
  const [drawnPng, setDrawnPng] = useState<Blob | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  // Bubble current state up whenever any input changes. Keep this in
  // useEffect so the parent always sees the latest combination of fields,
  // including when the user switches tabs.
  useEffect(() => {
    if (method === 'type') {
      onChange({ method: 'type', signerName });
    } else if (method === 'draw') {
      onChange({ method: 'draw', signerName, pngBlob: drawnPng });
    } else {
      onChange({ method: 'upload', signerName, file: uploadedFile });
    }
    // We intentionally exclude `onChange` to avoid re-firing on parent renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method, signerName, drawnPng, uploadedFile]);

  return (
    <div
      className={`rounded-md border-2 p-4 space-y-4 transition-colors ${
        enabled ? 'border-amber-400 bg-amber-50/40' : 'border-gray-200'
      }`}
    >
      <div className="text-xs text-gray-600 font-medium">Digital Signature</div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <TabButton active={method === 'type'} onClick={() => setMethod('type')} disabled={!enabled}>
          Type
        </TabButton>
        <TabButton active={method === 'draw'} onClick={() => setMethod('draw')} disabled={!enabled}>
          Draw
        </TabButton>
        <TabButton active={method === 'upload'} onClick={() => setMethod('upload')} disabled={!enabled}>
          Upload
        </TabButton>
      </div>

      {/* Always-shown name field — used by all methods. */}
      <div>
        <div className="text-xs text-gray-500 mb-1">Full legal name *</div>
        <input
          value={signerName}
          onChange={(e) => setSignerName(e.target.value)}
          disabled={!enabled}
          placeholder="Full legal name"
          className="w-full px-3 py-2 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 disabled:bg-gray-100 disabled:text-gray-400"
        />
      </div>

      {/* Method-specific UI */}
      {method === 'type' && (
        <div>
          <div className="text-xs text-gray-500 mb-1">Preview</div>
          <div
            className="w-full px-3 py-4 rounded-md border border-gray-300 bg-white text-2xl text-gray-900"
            style={{ fontFamily: '"Brush Script MT", "Caveat", "Pacifico", cursive' }}
          >
            {signerName.trim() || <span className="text-gray-300 text-base">Your typed signature will appear here</span>}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            By typing your name, you are providing a legally binding electronic signature.
          </p>
        </div>
      )}

      {method === 'draw' && (
        <div>
          <div className="text-xs text-gray-500 mb-1">Draw your signature below</div>
          <DrawCanvas enabled={enabled} onPngChange={setDrawnPng} />
        </div>
      )}

      {method === 'upload' && (
        <div>
          <div className="text-xs text-gray-500 mb-1">Upload a signed agreement (PDF or image)</div>
          <UploadField enabled={enabled} onFileChange={setUploadedFile} />
        </div>
      )}
    </div>
  );
}
