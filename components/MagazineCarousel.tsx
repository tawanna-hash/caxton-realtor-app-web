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
type SortOrder = 'newest' | 'oldest';

export default function MagazineCarousel({ publication, brandColor, onOpen, onMagazinesLoaded }: MagazineCarouselProps) {
  const [magazines, setMagazines] = useState<Magazine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
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
  const availableYears = Array.from(new Set(magazines.map((magazine) => magazine.year))).sort(
    (a, b) => b - a,
  );
  const query = search.trim().toLowerCase();
  const filteredMagazines = magazines
    .filter((magazine) => {
      if (yearFilter !== 'all' && magazine.year !== Number(yearFilter)) return false;
      if (!query) return true;
      return (
        magazine.issue_label.toLowerCase().includes(query) ||
        String(magazine.year).includes(query)
      );
    })
    .sort((a, b) => {
      const aValue = a.year * 12 + a.month;
      const bValue = b.year * 12 + b.month;
      return sortOrder === 'newest' ? bValue - aValue : aValue - bValue;
    });
  const issuesByYear = filteredMagazines.reduce<Array<{ year: number; issues: Magazine[] }>>(
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
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10 grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="relative block">
              <span className="sr-only">Search issues</span>
              <svg
                aria-hidden="true"
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search issues by month or year"
                className="min-h-12 w-full rounded-md border border-gray-300 bg-white py-3 pl-11 pr-4 text-base text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
              />
            </label>
            <label className="relative block">
              <span className="sr-only">Filter issues by year</span>
              <select
                value={yearFilter}
                onChange={(event) => setYearFilter(event.target.value)}
                className="min-h-12 w-full appearance-none rounded-md border border-gray-300 bg-white px-4 py-3 pr-11 text-base text-gray-900 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
              >
                <option value="all">All Years</option>
                {availableYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
              <svg
                aria-hidden="true"
                className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-gray-500"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </label>
            <label className="relative block">
              <span className="sr-only">Sort issues</span>
              <select
                value={sortOrder}
                onChange={(event) => setSortOrder(event.target.value as SortOrder)}
                className="min-h-12 w-full appearance-none rounded-md border border-gray-300 bg-white px-4 py-3 pr-11 text-base text-gray-900 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
              >
                <option value="newest">Newest to Oldest</option>
                <option value="oldest">Oldest to Newest</option>
              </select>
              <svg
                aria-hidden="true"
                className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-gray-500"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </label>
          </div>

          {issuesByYear.length === 0 ? (
            <div className="rounded-md border border-gray-200 bg-white px-6 py-12 text-center">
              <p className="text-sm font-medium text-gray-700">No issues match your search.</p>
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setYearFilter('all');
                }}
                className="mt-3 text-sm font-medium underline underline-offset-4"
                style={{ color: brandColor }}
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="space-y-10">
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
      )}
    </div>
  );
}
