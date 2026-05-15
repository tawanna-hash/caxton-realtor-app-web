'use client';

import { useEffect, useState } from 'react';
import type { ArticleListItem, ArticleReport } from './_types';

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

      {report && (
        <div className="bg-white border border-gray-200 rounded-md p-6">
          <p className="text-xs uppercase tracking-wider text-gray-500 mb-3">
            Report preview (raw — branded view in next commit)
          </p>
          <pre className="text-xs bg-gray-50 border border-gray-200 rounded p-4 overflow-x-auto">
            {JSON.stringify(report, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
