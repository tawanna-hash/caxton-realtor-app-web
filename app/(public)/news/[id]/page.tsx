'use client';

// app/(public)/news/[id]/page.tsx
//
// Full-page article, laid out like /builders and /calendar: it lives inside
// the public site shell (header, bottom tabs, footer) and scrolls with the
// window. The same ArticleReader renders the content, in page mode.

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';


import { ArticleReader } from '@/components/dashboard/FeedAndReader';

type Article = { id?: string | number; head?: string; title?: string } & Record<string, unknown>;

function marketFor(id: string): 'austin' | 'san_antonio' {
  return id.startsWith('san_antonio-') ? 'san_antonio' : 'austin';
}

export default function ArticlePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = decodeURIComponent(String(params?.id ?? ''));
  const market = marketFor(id);
  const pub = market === 'san_antonio' ? 'newsline' : 'realtyline';

  const [articles, setArticles] = useState<Article[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');

  useEffect(() => {
    let alive = true;
    fetch(`/api/news/${market}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => {
        if (!alive) return;
        const list = Array.isArray(data?.articles) ? data.articles : [];
        setArticles(list);
        setState(list.some((a: Article) => String(a?.id) === id) ? 'ready' : 'missing');
      })
      .catch(() => alive && setState('missing'));
    return () => {
      alive = false;
    };
  }, [id, market]);

  // A shared link names its market; remember it so the rest of the site matches.
  useEffect(() => {
    try {
      if (!localStorage.getItem('caxton_pub')) localStorage.setItem('caxton_pub', pub);
    } catch {
      /* storage unavailable */
    }
  }, [pub]);

  const article = articles.find((a) => String(a?.id) === id) ?? null;

  useEffect(() => {
    if (article?.head || article?.title) document.title = `${article.head || article.title} | Realty News Now`;
  }, [article]);

  const goBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back();
    else router.push('/dashboard');
  };

  if (state === 'loading') {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-8 animate-pulse space-y-4" aria-busy="true">
        <div className="h-4 w-40 rounded bg-gray-200" />
        <div className="h-8 w-full rounded bg-gray-200" />
        <div className="h-64 rounded bg-gray-100" />
        <div className="h-4 w-full rounded bg-gray-100" />
        <div className="h-4 w-5/6 rounded bg-gray-100" />
      </div>
    );
  }

  return (
    <ArticleReader
      asPage
      pub={pub}
      article={state === 'ready' ? article : null}
      allArticles={articles}
      onBack={goBack}
      onLatest={() => router.push('/dashboard')}
      onSelectArticle={(a: Article) => a?.id && router.push(`/news/${encodeURIComponent(String(a.id))}`)}
    />
  );
}
