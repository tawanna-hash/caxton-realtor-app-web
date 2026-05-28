'use client';

import { useEffect, useState } from 'react';
import type { ArticleListItem, ArticleReport, EventListItem, EventReport, ReportOverrides } from './_types';
import { ReportPreview, buildReportHtml, buildReportPlainText } from './_components/ReportPreview';
import { EventReportPreview, buildEventReportHtml, buildEventReportPlainText } from './_components/EventReportPreview';
import AdvertisersReportTab from './_components/AdvertisersReportTab';

type DaysOption = 7 | 30 | 90 | 180;

const DAYS_OPTIONS: Array<{ value: DaysOption; label: string }> = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 180, label: '180 days' },
];

export default function AdminReportsPage() {
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
  const [activeTab, setActiveTab] = useState<'articles' | 'events' | 'advertisers'>('articles');

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

  // Load articles list on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setArticlesLoading(true);
      try {
        const res = await fetch('/api/admin/reports/articles-list?days=180', {
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
  }, []);

  // Load events list on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setEventsListLoading(true);
      try {
        const res = await fetch('/api/admin/reports/events-list?days=180', {
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
  }, []);

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
      setEventReport(body.report);
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
      setReport(body.report);
    } catch (err) {
      setReportError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setReportLoading(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-8">
        <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-1">
          Admin
        </p>
        <h1 className="text-2xl md:text-3xl font-semibold text-gray-900 tracking-tight">
          Client Reports
        </h1>
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
                onClick={() => setActiveTab(tab.key)}
                className={[
                  'px-1 pb-3 text-sm font-medium border-b-2 transition-colors',
                  isActive
                    ? 'border-[#1a2a44] text-gray-900'
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
            <select
              value={selectedArticleId}
              onChange={(e) => setSelectedArticleId(e.target.value)}
              className="w-full max-w-2xl border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="">— Select an article —</option>
              {articles.map((a) => (
                <option key={a.article_id} value={a.article_id}>
                  [{a.pub || '?'}] {a.title} · {a.opens} opens
                </option>
              ))}
            </select>
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
                    isActive ? 'bg-[#1a2a44] text-white' : 'bg-white text-gray-700 hover:bg-gray-50',
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
            className="bg-[#1a2a44] hover:bg-[#243556] text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
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
        return (
          <div className="space-y-6">
            <div className="bg-white border border-gray-200 rounded-md p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-4">Customize report</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Article title <span className="text-gray-400 font-normal">(override)</span>
                  </label>
                  <input
                    type="text"
                    value={titleOverride}
                    onChange={(e) => setTitleOverride(e.target.value)}
                    placeholder={r.article.title || 'Untitled article'}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">Leave blank to use the article&apos;s tracked title (often missing for older articles).</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Publication <span className="text-gray-400 font-normal">(override)</span>
                  </label>
                  <select
                    value={pubOverride}
                    onChange={(e) => setPubOverride(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
                  >
                    <option value="">— Use tracked publication —</option>
                    <option value="RealtyLine Austin">RealtyLine Austin</option>
                    <option value="Newsline San Antonio">Newsline San Antonio</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">Drives header branding and colors.</p>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Editorial note <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={noteOverride}
                  onChange={(e) => setNoteOverride(e.target.value)}
                  placeholder="e.g. This article was featured in your June newsletter and on the RealtyLine homepage May 10–12."
                  rows={3}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div className="flex items-center gap-3 mt-4 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={copyHtml}
                  className="bg-[#1a2a44] hover:bg-[#243556] text-white px-4 py-2 rounded-md text-sm font-medium"
                >
                  Copy HTML
                </button>
                <button
                  type="button"
                  onClick={copyPlain}
                  className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-md text-sm font-medium"
                >
                  Copy plain text
                </button>
                {copyStatus && (
                  <span className="text-xs text-gray-600">{copyStatus}</span>
                )}
              </div>
            </div>

            <div>
              <p className="text-xs uppercase tracking-wider text-gray-500 mb-3">Preview</p>
              <ReportPreview report={r} overrides={overrides} />
            </div>
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
            <select
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="w-full max-w-2xl border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="">— Select an event —</option>
              {eventsList.map((e) => (
                <option key={e.event_id} value={e.event_id}>
                  [{e.pub || '?'}] {e.title} · {e.card_clicks} clicks, {e.registrations} regs
                </option>
              ))}
            </select>
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
                    isActive ? 'bg-[#1a2a44] text-white' : 'bg-white text-gray-700 hover:bg-gray-50',
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
            className="bg-[#1a2a44] hover:bg-[#243556] text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
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
        return (
          <div className="space-y-6">
            <div className="bg-white border border-gray-200 rounded-md p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-4">Customize report</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Event title <span className="text-gray-400 font-normal">(override)</span>
                  </label>
                  <input
                    type="text"
                    value={eventTitleOverride}
                    onChange={(e) => setEventTitleOverride(e.target.value)}
                    placeholder={r.event.title || 'Untitled event'}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">Leave blank to use the event&apos;s tracked title.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Publication <span className="text-gray-400 font-normal">(override)</span>
                  </label>
                  <select
                    value={eventPubOverride}
                    onChange={(e) => setEventPubOverride(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
                  >
                    <option value="">— Use tracked publication —</option>
                    <option value="RealtyLine Austin">RealtyLine Austin</option>
                    <option value="Newsline San Antonio">Newsline San Antonio</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">Drives header branding and colors.</p>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Editorial note <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={eventNoteOverride}
                  onChange={(e) => setEventNoteOverride(e.target.value)}
                  placeholder="e.g. This event was promoted in the May newsletter and on the homepage May 1–7."
                  rows={3}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div className="flex items-center gap-3 mt-4 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={copyHtml}
                  className="bg-[#1a2a44] hover:bg-[#243556] text-white px-4 py-2 rounded-md text-sm font-medium"
                >
                  Copy HTML
                </button>
                <button
                  type="button"
                  onClick={copyPlain}
                  className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-md text-sm font-medium"
                >
                  Copy plain text
                </button>
                {eventCopyStatus && (
                  <span className="text-xs text-gray-600">{eventCopyStatus}</span>
                )}
              </div>
            </div>

            <div>
              <p className="text-xs uppercase tracking-wider text-gray-500 mb-3">Preview</p>
              <EventReportPreview report={r} overrides={overrides} />
            </div>
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
