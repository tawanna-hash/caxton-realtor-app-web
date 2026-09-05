'use client';

import { useEffect, useRef, useState } from 'react';
import { ArchiveRestore, Square } from 'lucide-react';

type ImportStatus = {
  total: number;
  preserved: number;
  remaining: number;
};

type ImportResult = {
  filename: string;
  monthLabel: string;
  status: 'imported' | 'preserved' | 'failed';
  error?: string;
};

type Progress = {
  processed: number;
  total: number;
  imported: number;
  preserved: number;
  failed: number;
};

export default function RealtyLineEventImageImport({
  onComplete,
}: {
  onComplete: () => void | Promise<void>;
}) {
  const [status, setStatus] = useState<ImportStatus | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failures, setFailures] = useState<ImportResult[]>([]);
  const stopRequested = useRef(false);

  const loadStatus = async () => {
    const response = await fetch('/api/admin/event-images/import-realtyline', {
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Could not load import status (${response.status})`);
    setStatus(await response.json());
  };

  useEffect(() => {
    // The status request resolves asynchronously; this effect intentionally
    // initializes the import summary when the protected admin panel mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadStatus().catch((e) => {
      setError(e instanceof Error ? e.message : 'Could not load import status');
    });
  }, []);

  const runImport = async () => {
    setRunning(true);
    setError(null);
    setFailures([]);
    stopRequested.current = false;
    let index = 0;
    let imported = 0;
    let preserved = 0;
    let failed = 0;

    try {
      while (!stopRequested.current) {
        const response = await fetch('/api/admin/event-images/import-realtyline', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ index, batchSize: 5 }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || `Import stopped (${response.status})`);
        }

        const results = (data.results ?? []) as ImportResult[];
        imported += results.filter((result) => result.status === 'imported').length;
        preserved += results.filter((result) => result.status === 'preserved').length;
        const batchFailures = results.filter((result) => result.status === 'failed');
        failed += batchFailures.length;
        if (batchFailures.length > 0) {
          setFailures((current) => [...current, ...batchFailures]);
        }

        index = Number(data.nextIndex) || index + results.length;
        setProgress({
          processed: index,
          total: Number(data.total) || status?.total || 0,
          imported,
          preserved,
          failed,
        });

        if (data.complete) break;
      }

      await loadStatus();
      await onComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The import stopped unexpectedly');
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <ArchiveRestore size={18} className="text-brand-700" />
            <h2 className="text-sm font-semibold text-gray-900">
              RealtyLine Protected Import
            </h2>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-gray-600">
            Imports RL_ event photos into their RealtyLine.us month and year folders.
            Existing app images are detected by title or filename and preserved unchanged.
          </p>
        </div>
        <div className="shrink-0">
          {running ? (
            <button
              type="button"
              onClick={() => {
                stopRequested.current = true;
              }}
              className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Square size={14} /> Stop after batch
            </button>
          ) : (
            <button
              type="button"
              onClick={runImport}
              disabled={!status || status.remaining === 0}
              className="inline-flex items-center gap-2 rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ArchiveRestore size={15} />
              {status?.remaining === 0 ? 'Import complete' : 'Start protected import'}
            </button>
          )}
        </div>
      </div>

      {status && (
        <div className="mt-4 grid grid-cols-3 gap-3">
          <Metric label="Source photos" value={status.total} />
          <Metric label="Already preserved" value={status.preserved} />
          <Metric label="Remaining" value={status.remaining} />
        </div>
      )}

      {progress && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between text-xs text-gray-600">
            <span>
              Processed {Math.min(progress.processed, progress.total)} of {progress.total}
            </span>
            <span>
              {progress.imported} imported · {progress.preserved} preserved · {progress.failed} failed
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-brand-700 transition-[width]"
              style={{
                width: `${progress.total > 0 ? Math.min(100, (progress.processed / progress.total) * 100) : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {failures.length > 0 && (
        <details className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <summary className="cursor-pointer font-medium">
            {failures.length} failed image{failures.length === 1 ? '' : 's'}
          </summary>
          <ul className="mt-2 max-h-48 space-y-1 overflow-auto text-xs">
            {failures.map((failure, index) => (
              <li key={`${failure.filename}-${index}`}>
                {failure.filename} ({failure.monthLabel}): {failure.error || 'Import failed'}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-gray-50 px-3 py-2">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-gray-900">{value.toLocaleString()}</p>
    </div>
  );
}
