'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ArticleListItem, ArticleReport, EventListItem, EventReport, ReportOverrides } from './_types';
import { ReportPreview, buildReportHtml, buildReportPlainText } from './_components/ReportPreview';
import { EventReportPreview, buildEventReportHtml, buildEventReportPlainText } from './_components/EventReportPreview';
import AdvertisersReportTab from './_components/AdvertisersReportTab';
import EditReportDrawer from './_components/EditReportDrawer';
import ReportPicker, { type PickerItem } from './_components/ReportPicker';

import PageTitle from '@/components/ui/PageTitle';
type DaysOption = 7 | 30 | 90 | 180;

const DAYS_OPTIONS: Array<{ value: DaysOption; label: string }> = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 180, label: '180 days' },
];

type TabKey = 'articles' | 'events' | 'advertisers';

function parseTab(value: string | null): TabKey {
  return value === 'events' || value === 'advertisers' ? value : 'articles';
}

// Next 15+/16 disables static prerender bailout for useSearchParams() unless
// it sits inside a <Suspense> boundary. The outer page provides that boundary
// so the inner component (which actually reads the URL) is allowed to
// suspend during prerender without erroring the build.
export default function AdminReportsPage() {
  return (
    <Suspense fallback={
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="text-sm text-gray-500">Loading reports…</div>
      </div>
    }>
      <AdminReportsPageInner />
    </Suspense>
  );
}

function AdminReportsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [articles, setArticles] = useState<ArticleListItem[]>([]);
  const [articlesLoading, setArticlesLoading] = useState(true);
  const [articlesError, setArticlesError] = useState<string | null>(null);

  const [selectedArticleId, setSelectedArticleId] = useState<string>('');
  const [days, setDays] = useState<DaysOption>(30);

  const [report, setReport] = useState<ArticleReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const [titleOverride, setTitleOverride] = useState('');
  const [pubOverride, setPubOverride] = useState('');
  const [noteOverride, setNoteOverride] = useState('');
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  // Edit drawer (Articles tab). Parent owns open state so the same
  // drawer instance can be reused across multiple generated reports.
  const [articleEditOpen, setArticleEditOpen] = useState(false);

  // The active tab is derived directly from the URL so deep links and the
  // browser's back/forward buttons just work. Clicking a tab updates the
  // URL via router.replace below, which feeds back into this value.
  const activeTab: TabKey = parseTab(searchParams.get('tab'));

  function selectTab(next: TabKey) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'articles') params.delete('tab'); else params.set('tab', next);
    // Switching tabs clears any advertiser-specific deep-link param.
    if (next !== 'advertisers') params.delete('advertiserId');
    const qs = params.toString();
    router.replace(qs ? `/admin/reports?${qs}` : '/admin/reports', { scroll: false });
  }

  // Events tab state (parallel to the articles tab state above)
  const [eventsList, setEventsList] = useState<EventListItem[]>([]);
  const [eventsListLoading, setEventsListLoading] = useState(true);
  const [eventsListError, setEventsListError] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [eventDays, setEventDays] = useState<DaysOption>(30);
  const [eventReport, setEventReport] = useState<EventReport | null>(null);
  const [eventReportLoading, setEventReportLoading] = useState(false);
  const [eventReportError, setEventReportError] = useState<string | null>(null);
  const [eventTitleOverride, setEventTitleOverride] = useState('');
  const [eventPubOverride, setEventPubOverride] = useState('');
  const [eventNoteOverride, setEventNoteOverride] = useState('');
  const [eventCopyStatus, setEventCopyStatus] = useState<string | null>(null);
  // Edit drawer (Events tab) — parallel to articleEditOpen above.
  const [eventEditOpen, setEventEditOpen] = useState(false);

  // Load articles list. Re-fetches whenever the user changes the date-range
  // selector so the picker's "N opens" badge always reflects the same window
  // the generated report will use. Without this the picker would show opens
  // over a fixed 180-day window while the report queries the user's selected
  // window, leading to confusing mismatches (picker says "16 opens", report
  // shows 0).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setArticlesLoading(true);
      setArticlesError(null);
      try {
        const res = await fetch(`/api/admin/reports/articles-list?days=${days}`, {
          credentials: 'include',
        });
        const body = (await res.json().catch(() => null)) as
          | { ok: boolean; articles?: ArticleListItem[]; error?: string }
          | null;
        if (cancelled) return;
        if (!res.ok || !body?.ok || !body.articles) {
          setArticlesError(body?.error || 'Failed to load articles list.');
          return;
        }
        setArticles(body.articles);
      } catch (err) {
        if (!cancelled) {
          setArticlesError(err instanceof Error ? err.message : 'Network error');
        }
      } finally {
        if (!cancelled) setArticlesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [days]);

  // Load events list. Same pattern as the articles list above — re-fetch on
  // date-range change so the picker badge matches the report window.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setEventsListLoading(true);
      setEventsListError(null);
      try {
        const res = await fetch(`/api/admin/reports/events-list?days=${eventDays}`, {
          credentials: 'include',
        });
        const body = (await res.json().catch(() => null)) as
          | { ok: boolean; events?: EventListItem[]; error?: string }
          | null;
        if (cancelled) return;
        if (!res.ok || !body?.ok || !body.events) {
          setEventsListError(body?.error || 'Failed to load events list.');
          return;
        }
        setEventsList(body.events);
      } catch (err) {
        if (!cancelled) {
          setEventsListError(err instanceof Error ? err.message : 'Network error');
        }
      } finally {
        if (!cancelled) setEventsListLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [eventDays]);

  async function generateEventReport() {
    if (!selectedEventId) return;
    setEventReportLoading(true);
    setEventReportError(null);
    setEventReport(null);
    try {
      const params = new URLSearchParams({
        event_id: selectedEventId,
        days: String(eventDays),
      });
      const res = await fetch(`/api/admin/reports/event?${params}`, {
        credentials: 'include',
      });
      const body = (await res.json().catch(() => null)) as
        | { ok: boolean; report?: EventReport; error?: string }
        | null;
      if (!res.ok || !body?.ok || !body.report) {
        setEventReportError(body?.error || 'Failed to generate event report.');
        setEventReportLoading(false);
        return;
      }
      // The /event endpoint only sees data inside the selected window. When
      // that window has no tracked events, title/pub come back null even
      // though we already know them from the events-list call. Patch the
      // report client-side with the list-item title and pub so the
      // preview/header don't fall back to "Untitled event".
      const listMeta = eventsList.find((e) => e.event_id === selectedEventId);
      const patched: EventReport = {
        ...body.report,
        event: {
          ...body.report.event,
          title: body.report.event.title ?? listMeta?.title ?? null,
          pub: body.report.event.pub ?? listMeta?.pub ?? null,
        },
      };
      setEventReport(patched);
    } catch (err) {
      setEventReportError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setEventReportLoading(false);
    }
  }

  async function generateReport() {
    if (!selectedArticleId) return;
    setReportLoading(true);
    setReportError(null);
    setReport(null);
    try {
      const params = new URLSearchParams({
        article_id: selectedArticleId,
        days: String(days),
      });
      const res = await fetch(`/api/admin/reports/article?${params}`, {
        credentials: 'include',
      });
      const body = (await res.json().catch(() => null)) as
        | { ok: boolean; report?: ArticleReport; error?: string }
        | null;
      if (!res.ok || !body?.ok || !body.report) {
        setReportError(body?.error || 'Failed to generate report.');
        setReportLoading(false);
        return;
      }
      // Same client-side patch as event report: if title/pub came back null
      // because the rolling window is empty, use the list-item title/pub
      // we already have so the preview renders correctly.
      const listMeta = articles.find((a) => a.article_id === selectedArticleId);
      const patched: ArticleReport = {
        ...body.report,
        article: {
          ...body.report.article,
          title: body.report.article.title ?? listMeta?.title ?? null,
          pub: body.report.article.pub ?? listMeta?.pub ?? null,
        },
      };
      setReport(patched);
    } catch (err) {
      setReportError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setReportLoading(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="mb-8">
        <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-1">
          Admin
        </p>
        <PageTitle size="md">
          Client Reports
        </PageTitle>
        <p className="text-sm text-gray-600 font-light mt-2 max-w-2xl">
          Generate engagement reports for client handoff.
          Pick an article and date range, then copy the
          branded HTML or plain text into an email.
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="flex gap-6">
          {([
            { key: 'articles', label: 'Articles' },
            { key: 'events', label: 'Events' },
            { key: 'advertisers', label: 'Advertisers' },
          ] as const).map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => selectTab(tab.key)}
                className={[
                  'px-1 pb-3 text-sm font-medium border-b-2 transition-colors',
                  isActive
                    ? 'border-brand-700 text-gray-900'
                    : 'border-transparent text-gray-500 hover:text-gray-700',
                ].join(' ')}
                aria-current={isActive ? 'page' : undefined}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {activeTab === 'articles' && (
      <>
      {/* Controls */}
      <div className="bg-white border border-gray-200 rounded-md p-6 mb-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Article
          </label>
          {articlesLoading ? (
            <div className="text-sm text-gray-500">Loading articles…</div>
          ) : articlesError ? (
            <div className="text-sm text-red-700">{articlesError}</div>
          ) : articles.length === 0 ? (
            <div className="text-sm text-gray-500">
              No articles with tracking data in the last 180 days.
            </div>
          ) : (
            <ReportPicker
              items={articles.map<PickerItem>((a) => ({
                id: a.article_id,
                title: a.title,
                pub: a.pub,
                metric: `${a.opens} ${a.opens === 1 ? 'open' : 'opens'}`,
              }))}
              selectedId={selectedArticleId}
              onSelect={setSelectedArticleId}
              placeholder="Search articles by title or publication…"
              emptyLabel="No articles match your search."
            />
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Date range
          </label>
          <div className="inline-flex bg-white border border-gray-200 rounded-md overflow-hidden">
            {DAYS_OPTIONS.map((opt, idx) => {
              const isActive = opt.value === days;
              const isFirst = idx === 0;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDays(opt.value)}
                  className={[
                    'px-4 py-2 text-sm font-medium transition-colors',
                    !isFirst ? 'border-l border-gray-200' : '',
                    isActive ? 'bg-brand-700 text-white' : 'bg-white text-gray-700 hover:bg-gray-50',
                  ].filter(Boolean).join(' ')}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <button
            type="button"
            onClick={generateReport}
            disabled={!selectedArticleId || reportLoading}
            className="bg-brand-700 hover:bg-brand-800 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {reportLoading ? 'Generating…' : 'Generate report'}
          </button>
        </div>
      </div>

      {/* Report output (skeleton — branded preview comes in R3b) */}
      {reportError && (
        <div className="border border-red-300 bg-red-50 px-4 py-3 rounded-md mb-6">
          <p className="text-sm text-red-900">{reportError}</p>
        </div>
      )}

      {report && (() => {
        const r = report;
        const overrides: ReportOverrides = {
          title: titleOverride,
          pub_display: pubOverride,
          editorial_note: noteOverride,
        };
        async function copyHtml() {
          try {
            await navigator.clipboard.writeText(buildReportHtml(r, overrides));
            setCopyStatus('HTML copied to clipboard');
            setTimeout(() => setCopyStatus(null), 2500);
          } catch {
            setCopyStatus('Copy failed — select and copy manually');
            setTimeout(() => setCopyStatus(null), 3500);
          }
        }
        async function copyPlain() {
          try {
            await navigator.clipboard.writeText(buildReportPlainText(r, overrides));
            setCopyStatus('Plain text copied to clipboard');
            setTimeout(() => setCopyStatus(null), 2500);
          } catch {
            setCopyStatus('Copy failed — select and copy manually');
            setTimeout(() => setCopyStatus(null), 3500);
          }
        }
        const resolvedTitle = (titleOverride.trim() || r.article.title || 'Untitled article');
        const resolvedPub = pubOverride.trim() || 'Tracked publication';
        const hasNote = noteOverride.trim().length > 0;
        return (
          <div className="space-y-6">
            <div className="bg-white border border-gray-200 rounded-md p-6">
              <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-gray-900">Report customization</h2>
                  <p className="text-xs text-gray-500 mt-1">
                    Override the title, publication branding, and editorial
                    note before copying. Click Edit to open the editor.
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setArticleEditOpen(true)}
                    className="px-3 py-1.5 text-sm font-medium rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-gray-800"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={copyHtml}
                    className="bg-brand-700 hover:bg-brand-800 text-white px-3 py-1.5 rounded-md text-sm font-medium"
                  >
                    Copy HTML
                  </button>
                  <button
                    type="button"
                    onClick={copyPlain}
                    className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-3 py-1.5 rounded-md text-sm font-medium"
                  >
                    Copy plain text
                  </button>
                </div>
              </div>
              <dl className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3 text-sm">
                <div className="min-w-0">
                  <dt className="text-xs uppercase tracking-wider text-gray-500">Title</dt>
                  <dd className="text-gray-900 truncate" title={resolvedTitle}>{resolvedTitle}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs uppercase tracking-wider text-gray-500">Publication</dt>
                  <dd className="text-gray-900 truncate">{resolvedPub}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs uppercase tracking-wider text-gray-500">Editorial note</dt>
                  <dd className={hasNote ? 'text-gray-900 line-clamp-2' : 'text-gray-400'}>
                    {hasNote ? noteOverride : 'None'}
                  </dd>
                </div>
              </dl>
              {copyStatus && (
                <p className="text-xs text-gray-600 mt-3">{copyStatus}</p>
              )}
            </div>

            <div>
              <p className="text-xs uppercase tracking-wider text-gray-500 mb-3">Preview</p>
              <ReportPreview report={r} overrides={overrides} />
            </div>

            <EditReportDrawer
              open={articleEditOpen}
              kind="article"
              subjectLabel={resolvedTitle}
              overrides={overrides}
              onTitleChange={setTitleOverride}
              onPubDisplayChange={setPubOverride}
              onEditorialNoteChange={setNoteOverride}
              onCopyHtml={copyHtml}
              onCopyPlain={copyPlain}
              copyStatus={copyStatus}
              titlePlaceholder={r.article.title || 'Untitled article'}
              onClose={() => setArticleEditOpen(false)}
            />
          </div>
        );
      })()}
      </>
      )}

      {activeTab === 'events' && (
      <>
      {/* Events controls */}
      <div className="bg-white border border-gray-200 rounded-md p-6 mb-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Event
          </label>
          {eventsListLoading ? (
            <div className="text-sm text-gray-500">Loading events…</div>
          ) : eventsListError ? (
            <div className="text-sm text-red-700">{eventsListError}</div>
          ) : eventsList.length === 0 ? (
            <div className="text-sm text-gray-500">
              No events with tracking data in the last 180 days.
            </div>
          ) : (
            <ReportPicker
              items={eventsList.map<PickerItem>((e) => ({
                id: e.event_id,
                title: e.title,
                pub: e.pub,
                metric: `${e.card_clicks} ${e.card_clicks === 1 ? 'click' : 'clicks'} · ${e.registrations} ${e.registrations === 1 ? 'reg' : 'regs'}`,
              }))}
              selectedId={selectedEventId}
              onSelect={setSelectedEventId}
              placeholder="Search events by title or publication…"
              emptyLabel="No events match your search."
            />
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Date range
          </label>
          <div className="inline-flex bg-white border border-gray-200 rounded-md overflow-hidden">
            {DAYS_OPTIONS.map((opt, idx) => {
              const isActive = opt.value === eventDays;
              const isFirst = idx === 0;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setEventDays(opt.value)}
                  className={[
                    'px-4 py-2 text-sm font-medium transition-colors',
                    !isFirst ? 'border-l border-gray-200' : '',
                    isActive ? 'bg-brand-700 text-white' : 'bg-white text-gray-700 hover:bg-gray-50',
                  ].filter(Boolean).join(' ')}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <button
            type="button"
            onClick={generateEventReport}
            disabled={!selectedEventId || eventReportLoading}
            className="bg-brand-700 hover:bg-brand-800 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {eventReportLoading ? 'Generating…' : 'Generate report'}
          </button>
        </div>
      </div>

      {eventReportError && (
        <div className="border border-red-300 bg-red-50 px-4 py-3 rounded-md mb-6">
          <p className="text-sm text-red-900">{eventReportError}</p>
        </div>
      )}

      {eventReport && (() => {
        const r = eventReport;
        const overrides: ReportOverrides = {
          title: eventTitleOverride,
          pub_display: eventPubOverride,
          editorial_note: eventNoteOverride,
        };
        async function copyHtml() {
          try {
            await navigator.clipboard.writeText(buildEventReportHtml(r, overrides));
            setEventCopyStatus('HTML copied to clipboard');
            setTimeout(() => setEventCopyStatus(null), 2500);
          } catch {
            setEventCopyStatus('Copy failed — select and copy manually');
            setTimeout(() => setEventCopyStatus(null), 3500);
          }
        }
        async function copyPlain() {
          try {
            await navigator.clipboard.writeText(buildEventReportPlainText(r, overrides));
            setEventCopyStatus('Plain text copied to clipboard');
            setTimeout(() => setEventCopyStatus(null), 2500);
          } catch {
            setEventCopyStatus('Copy failed — select and copy manually');
            setTimeout(() => setEventCopyStatus(null), 3500);
          }
        }
        const resolvedTitle = (eventTitleOverride.trim() || r.event.title || 'Untitled event');
        const resolvedPub = eventPubOverride.trim() || 'Tracked publication';
        const hasNote = eventNoteOverride.trim().length > 0;
        return (
          <div className="space-y-6">
            <div className="bg-white border border-gray-200 rounded-md p-6">
              <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-gray-900">Report customization</h2>
                  <p className="text-xs text-gray-500 mt-1">
                    Override the title, publication branding, and editorial
                    note before copying. Click Edit to open the editor.
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setEventEditOpen(true)}
                    className="px-3 py-1.5 text-sm font-medium rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-gray-800"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={copyHtml}
                    className="bg-brand-700 hover:bg-brand-800 text-white px-3 py-1.5 rounded-md text-sm font-medium"
                  >
                    Copy HTML
                  </button>
                  <button
                    type="button"
                    onClick={copyPlain}
                    className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-3 py-1.5 rounded-md text-sm font-medium"
                  >
                    Copy plain text
                  </button>
                </div>
              </div>
              <dl className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3 text-sm">
                <div className="min-w-0">
                  <dt className="text-xs uppercase tracking-wider text-gray-500">Title</dt>
                  <dd className="text-gray-900 truncate" title={resolvedTitle}>{resolvedTitle}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs uppercase tracking-wider text-gray-500">Publication</dt>
                  <dd className="text-gray-900 truncate">{resolvedPub}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs uppercase tracking-wider text-gray-500">Editorial note</dt>
                  <dd className={hasNote ? 'text-gray-900 line-clamp-2' : 'text-gray-400'}>
                    {hasNote ? eventNoteOverride : 'None'}
                  </dd>
                </div>
              </dl>
              {eventCopyStatus && (
                <p className="text-xs text-gray-600 mt-3">{eventCopyStatus}</p>
              )}
            </div>

            <div>
              <p className="text-xs uppercase tracking-wider text-gray-500 mb-3">Preview</p>
              <EventReportPreview report={r} overrides={overrides} />
            </div>

            <EditReportDrawer
              open={eventEditOpen}
              kind="event"
              subjectLabel={resolvedTitle}
              overrides={overrides}
              onTitleChange={setEventTitleOverride}
              onPubDisplayChange={setEventPubOverride}
              onEditorialNoteChange={setEventNoteOverride}
              onCopyHtml={copyHtml}
              onCopyPlain={copyPlain}
              copyStatus={eventCopyStatus}
              titlePlaceholder={r.event.title || 'Untitled event'}
              onClose={() => setEventEditOpen(false)}
            />
          </div>
        );
      })()}
      </>
      )}

      {activeTab === 'advertisers' && (
        <AdvertisersReportTab />
      )}

    </div>
  );
}
