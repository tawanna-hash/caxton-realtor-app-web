'use client';

import { useEffect, useRef, useState } from 'react';
import type { Magazine } from '@/lib/magazines';
import { fetchMagazines } from '@/lib/magazines';
import { trackEvent } from '../app/posthog-provider';
import PageTitle from '@/components/ui/PageTitle';
import { usePtrRefresh } from '@/hooks/use-ptr-refresh';

interface MagazineCarouselProps {
  publication: string;
  brandColor: string;
  onOpen: (m: Magazine) => void;
  onMagazinesLoaded?: (mags: Magazine[]) => void;
}

type Tab = 'current' | 'all';

export default function MagazineCarousel({ publication, brandColor, onOpen, onMagazinesLoaded }: MagazineCarouselProps) {
  const [magazines, setMagazines] = useState<Magazine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  // PTR nonce — see hooks/use-ptr-refresh. Bumps on every pull-to-refresh
  // so the fetch effect below re-runs.
  const ptrNonce = usePtrRefresh();

  // Stable ref to the callback so it doesn't retrigger the fetch effect each render.
  const loadedCbRef = useRef(onMagazinesLoaded);
  useEffect(() => {
    loadedCbRef.current = onMagazinesLoaded;
  }, [onMagazinesLoaded]);

  useEffect(() => {
    let cancelled = false;
    // setState calls are batched inside an async chain (not
    // synchronously in the effect body) which is the recommended
    // pattern; suppress the over-eager rule for this hook.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    fetchMagazines(publication)
      .then((data) => {
        if (!cancelled) {
          setMagazines(data);
          setLoading(false);
          if (loadedCbRef.current) loadedCbRef.current(data);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message || 'Failed to load magazines');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
    // ptrNonce intentionally retriggers the fetch on pull-to-refresh.
  }, [publication, ptrNonce]);

  if (loading) {
    return (
      <div className="px-4 py-12 bg-gray-50">
        <div className="flex gap-4 justify-center">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex-shrink-0 w-44 h-60 bg-gray-200 animate-pulse rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-12 bg-gray-50">
        <p className="text-sm text-red-600 text-center">Couldn&apos;t load magazines: {error}</p>
      </div>
    );
  }

  if (magazines.length === 0) {
    return (
      <div className="px-4 py-12 bg-gray-50 text-center">
        <p className="text-sm text-gray-500">No issues available yet.</p>
      </div>
    );
  }

  const current = magazines[0];
  const issuesByYear = magazines.reduce<Array<{ year: number; issues: Magazine[] }>>(
    (groups, magazine) => {
      const group = groups.find((item) => item.year === magazine.year);
      if (group) group.issues.push(magazine);
      else groups.push({ year: magazine.year, issues: [magazine] });
      return groups;
    },
    [],
  );

  function issueCard(magazine: Magazine, featured = false) {
    const isCurrent = magazine.id === current.id;
    return (
      <div
        key={magazine.id}
        className={featured ? 'w-full max-w-[240px] mx-auto' : 'w-full min-w-0'}
      >
        <button
          onClick={() => {
            trackEvent('magazine_archive_issue_opened', {
              magazine_id: magazine.id,
              issue_label: magazine.issue_label,
              publication,
            });
            onOpen(magazine);
          }}
          className="group block w-full text-left"
          aria-label={`Open ${magazine.issue_label}`}
        >
          <div className="relative w-full aspect-[3/4] overflow-hidden border border-gray-200 bg-white shadow-sm transition duration-200 group-hover:-translate-y-1 group-hover:shadow-lg group-focus-visible:ring-2 group-focus-visible:ring-offset-2 active:scale-[0.98]">
            {magazine.cover_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={magazine.cover_url}
                alt={`${magazine.issue_label} cover`}
                className="h-full w-full object-contain"
                loading={featured ? 'eager' : 'lazy'}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs uppercase tracking-wider text-gray-400">
                No cover
              </div>
            )}
          </div>
          <div className="mt-3 text-center">
            <p className="text-[11px] font-medium uppercase leading-5 tracking-[0.16em] text-gray-800 sm:text-xs">
              {magazine.issue_label}
            </p>
            {isCurrent && (
              <p
                className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em]"
                style={{ color: brandColor }}
              >
                Current Issue
              </p>
            )}
          </div>
        </button>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 pt-10 pb-12">
      <div className="px-4 mb-6">
        <PageTitle align="center">Issues Archive</PageTitle>
      </div>

      <div className="flex items-center justify-center gap-8 mb-8 text-xs uppercase tracking-[0.2em] font-medium">
        <button
          onClick={() => setTab('current')}
          className={tab === 'current' ? 'text-gray-900 border-b-2 border-gray-900 pb-1.5' : 'text-gray-400 pb-1.5'}
        >
          Current Issue
        </button>
        <button
          onClick={() => setTab('all')}
          className={tab === 'all' ? 'text-gray-900 border-b-2 border-gray-900 pb-1.5' : 'text-gray-400 pb-1.5'}
        >
          All Issues
        </button>
      </div>

      {tab === 'current' ? (
        <div className="px-5">{issueCard(current, true)}</div>
      ) : (
        <div className="mx-auto max-w-7xl space-y-10 px-4 sm:px-6 lg:px-8">
          {issuesByYear.map((group) => (
            <section key={group.year} aria-labelledby={`issues-${group.year}`}>
              <div className="mb-5 flex items-center gap-4">
                <h2
                  id={`issues-${group.year}`}
                  className="shrink-0 text-sm font-semibold tracking-[0.18em] text-gray-700"
                >
                  {group.year}
                </h2>
                <div className="h-px flex-1 bg-gray-200" />
                <span className="shrink-0 text-xs text-gray-400">
                  {group.issues.length} {group.issues.length === 1 ? 'issue' : 'issues'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-5 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {group.issues.map((magazine) => issueCard(magazine))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
