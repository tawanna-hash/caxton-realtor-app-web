// caxton-social-v2
// Admin curator for Facebook Page posts.
//   • Page URL  (facebook.com/{page}/posts/{id})  → auto-fetch via Graph API
//
// Group + Reel URLs are intentionally NOT supported — those require manual
// caption + thumbnail entry that the team chose to skip (Option B). The
// server still has a manual-entry code path on disk (route.ts) but the UI
// no longer exposes it; if we ever want to bring back manual curation,
// re-enable the rich form (see git history of this file before v2).

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { adminApi } from '@/lib/admin-api';

type SocialPub = 'realtyline' | 'newsline' | 'both';
type UrlKind = 'page' | 'group' | 'reel' | 'unknown';

// We only let Page URLs through. Everything else gets a hard error in-UI
// and the form's submit button stays disabled.
function isSupportedKind(k: UrlKind): boolean {
  return k === 'page';
}

interface FeaturedSocialPost {
  id: number;
  fb_post_id: string;
  page_id: string;
  permalink_url: string;
  message: string | null;
  image_url: string | null;
  posted_at: string | null;
  pub: SocialPub;
  is_open_house: boolean;
  is_active: boolean;
  display_order: number;
  refreshed_at: string;
  created_at: string;
  created_by: string | null;
}

const PUB_LABEL: Record<SocialPub, string> = {
  realtyline: 'RealtyLine',
  newsline: 'Newsline',
  both: 'Both',
};

/**
 * Lightweight client-side URL sniffer. The server is the source of truth via
 * parseFacebookPostUrl(), but we want the form to know whether to ask the
 * admin for manual fields before the request is made.
 */
function detectUrlKind(input: string): UrlKind {
  const raw = input.trim();
  if (!raw) return 'unknown';
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return 'unknown';
  }
  if (
    !/(^|\.)facebook\.com$/i.test(u.hostname) &&
    !/(^|\.)fb\.com$/i.test(u.hostname)
  ) {
    return 'unknown';
  }
  const segments = u.pathname.split('/').filter(Boolean);
  if (segments[0] === 'groups') return 'group';
  if (segments[0] === 'reel') return 'reel';
  return 'page';
}

function formatDate(iso: string | null): string {
  if (!iso) return '\u2014';
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function SocialClient() {
  const [posts, setPosts] = useState<FeaturedSocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add-post form state
  const [url, setUrl] = useState('');
  const [pub, setPub] = useState<SocialPub>('both');
  const [isOpenHouse, setIsOpenHouse] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formMsg, setFormMsg] = useState<string | null>(null);

  const urlKind = useMemo(() => detectUrlKind(url), [url]);

  const refetch = useCallback(async () => {
    try {
      const data = (await adminApi.listSocialPosts()) as {
        posts: FeaturedSocialPost[];
      };
      setPosts(data.posts);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial admin list fetch; setState in effect is the intended pattern here
    void refetch();
  }, [refetch]);

  const handleAdd = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!url.trim()) return;
      if (!isSupportedKind(urlKind)) {
        setFormError(
          'Only Facebook Page post URLs are supported. Group posts and reels are not curated through this tool.'
        );
        return;
      }
      setSubmitting(true);
      setFormError(null);
      setFormMsg(null);

      try {
        await adminApi.addSocialPost({
          url: url.trim(),
          pub,
          is_open_house: isOpenHouse,
        });

        setUrl('');
        setIsOpenHouse(false);
        setFormMsg('Page post added (metadata auto-fetched from Facebook).');
        await refetch();
      } catch (err) {
        setFormError(err instanceof Error ? err.message : 'Failed to add post');
      } finally {
        setSubmitting(false);
      }
    },
    [url, pub, isOpenHouse, urlKind, refetch]
  );

  const handlePatch = useCallback(
    async (
      id: number,
      patch: Partial<{
        pub: SocialPub;
        is_open_house: boolean;
        is_active: boolean;
        display_order: number;
      }>
    ) => {
      try {
        await adminApi.updateSocialPost(id, patch);
        await refetch();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Update failed');
      }
    },
    [refetch]
  );

  const handleDelete = useCallback(
    async (id: number) => {
      if (!confirm('Remove this post from the feed?')) return;
      try {
        await adminApi.deleteSocialPost(id);
        await refetch();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Delete failed');
      }
    },
    [refetch]
  );

  const grouped = useMemo(() => {
    const active = posts.filter((p) => p.is_active);
    const inactive = posts.filter((p) => !p.is_active);
    return { active, inactive };
  }, [posts]);

  const canSubmit = url.trim() && !submitting && isSupportedKind(urlKind);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Social posts</h1>
        <p className="text-sm text-gray-700 mt-1">
          Curate Facebook Page posts that surface in the RealtyLine + Newsline
          feeds. Caption + image are pulled automatically from the Graph API.
          Reels and group posts aren&rsquo;t supported.
        </p>
      </div>

      {/* ────────── Add form ────────── */}
      <section className="mb-8 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-medium text-gray-900 mb-3">Add a post</h2>
        <form onSubmit={handleAdd} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Facebook post URL
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.facebook.com/myrealtyline/posts/123…"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
              required
            />
            <p className="mt-1 text-xs text-gray-500">
              {urlKind === 'page' && (
                <span className="text-emerald-700">
                  ✓ Page URL detected — caption + image will be pulled
                  automatically from the Graph API.
                </span>
              )}
              {urlKind === 'group' && (
                <span className="text-red-700">
                  ✗ Group URL not supported. Curate Page posts only.
                </span>
              )}
              {urlKind === 'reel' && (
                <span className="text-red-700">
                  ✗ Reel URL not supported. Curate Page posts only.
                </span>
              )}
              {urlKind === 'unknown' && (
                <>
                  Paste a Page post URL like{' '}
                  <code>facebook.com/{'{page}'}/posts/{'{id}'}</code>.
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Publication
              </label>
              <select
                value={pub}
                onChange={(e) => setPub(e.target.value as SocialPub)}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="both">Both</option>
                <option value="realtyline">RealtyLine Austin</option>
                <option value="newsline">Newsline San Antonio</option>
              </select>
            </div>

            <label className="inline-flex items-center gap-2 mt-6 text-sm text-gray-800">
              <input
                type="checkbox"
                checked={isOpenHouse}
                onChange={(e) => setIsOpenHouse(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              Open House (pins to top of feed)
            </label>

            <button
              type="submit"
              disabled={!canSubmit}
              className="ml-auto mt-6 rounded-md bg-[#1a2a44] px-4 py-2 text-sm font-medium text-white hover:bg-[#243556] disabled:opacity-50"
            >
              {submitting ? 'Adding…' : '+ Add post'}
            </button>
          </div>

          {formError && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">
              {formError}
            </div>
          )}
          {formMsg && (
            <div className="rounded-md bg-green-50 p-3 text-sm text-green-800 ring-1 ring-green-200">
              {formMsg}
            </div>
          )}
        </form>
      </section>

      {/* ────────── List ────────── */}
      {loading && <p className="text-gray-700">Loading…</p>}
      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200 mb-4">
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          <SocialList
            title="Active"
            posts={grouped.active}
            onPatch={handlePatch}
            onDelete={handleDelete}
          />
          <SocialList
            title="Inactive"
            posts={grouped.inactive}
            onPatch={handlePatch}
            onDelete={handleDelete}
          />
        </>
      )}
    </div>
  );
}

interface ListProps {
  title: string;
  posts: FeaturedSocialPost[];
  onPatch: (
    id: number,
    patch: Partial<{
      pub: SocialPub;
      is_open_house: boolean;
      is_active: boolean;
      display_order: number;
    }>
  ) => void | Promise<void>;
  onDelete: (id: number) => void | Promise<void>;
}

function SocialList({ title, posts, onPatch, onDelete }: ListProps) {
  if (posts.length === 0) {
    return (
      <section className="mb-8">
        <h2 className="text-lg font-medium text-gray-900 mb-3">{title}</h2>
        <p className="text-sm text-gray-500">None.</p>
      </section>
    );
  }

  return (
    <section className="mb-8">
      <h2 className="text-lg font-medium text-gray-900 mb-3">
        {title} <span className="text-sm text-gray-500">({posts.length})</span>
      </h2>

      <div className="space-y-3">
        {posts.map((p) => {
          const isGroup = /\/groups\//i.test(p.permalink_url);
          return (
            <article
              key={p.id}
              className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm flex gap-4"
            >
              {p.image_url ? (
                <div className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-md bg-gray-100">
                  <Image
                    src={p.image_url}
                    alt=""
                    fill
                    sizes="96px"
                    className="object-cover"
                    unoptimized
                  />
                </div>
              ) : (
                <div className="h-24 w-24 flex-shrink-0 rounded-md bg-gray-100 flex items-center justify-center text-xs text-gray-400">
                  No image
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={
                          isGroup
                            ? 'inline-flex items-center rounded-sm bg-amber-100 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.15em] font-semibold text-amber-800'
                            : 'inline-flex items-center rounded-sm bg-blue-100 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.15em] font-semibold text-[#1877F2]'
                        }
                      >
                        {isGroup ? 'Group · Manual' : 'Page · Auto'}
                      </span>
                      {p.is_open_house && (
                        <span className="inline-flex items-center rounded-sm bg-[#C8A75B] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.15em] font-semibold text-white">
                          Open House
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-900 line-clamp-2">
                      {p.message || (
                        <em className="text-gray-500">(no caption)</em>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      Posted {formatDate(p.posted_at)} ·{' '}
                      <a
                        href={p.permalink_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-gray-700"
                      >
                        View on Facebook
                      </a>
                    </p>
                  </div>

                  <button
                    onClick={() => onDelete(p.id)}
                    className="text-xs text-red-700 hover:text-red-900 hover:underline whitespace-nowrap"
                  >
                    Delete
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <label className="inline-flex items-center gap-1.5 text-xs text-gray-800">
                    <input
                      type="checkbox"
                      checked={p.is_active}
                      onChange={(e) =>
                        onPatch(p.id, { is_active: e.target.checked })
                      }
                      className="h-3.5 w-3.5 rounded border-gray-300"
                    />
                    Active
                  </label>

                  <label className="inline-flex items-center gap-1.5 text-xs text-gray-800">
                    <input
                      type="checkbox"
                      checked={p.is_open_house}
                      onChange={(e) =>
                        onPatch(p.id, { is_open_house: e.target.checked })
                      }
                      className="h-3.5 w-3.5 rounded border-gray-300"
                    />
                    Open House
                  </label>

                  <div className="inline-flex items-center gap-1.5 text-xs text-gray-800">
                    <span>Pub:</span>
                    <select
                      value={p.pub}
                      onChange={(e) =>
                        onPatch(p.id, { pub: e.target.value as SocialPub })
                      }
                      className="rounded border border-gray-300 px-1.5 py-0.5 text-xs"
                    >
                      <option value="both">Both</option>
                      <option value="realtyline">RealtyLine</option>
                      <option value="newsline">Newsline</option>
                    </select>
                    <span className="text-gray-400">({PUB_LABEL[p.pub]})</span>
                  </div>

                  <div className="inline-flex items-center gap-1.5 text-xs text-gray-800">
                    <span>Order:</span>
                    <input
                      type="number"
                      value={p.display_order}
                      onChange={(e) =>
                        onPatch(p.id, {
                          display_order: Number(e.target.value) || 0,
                        })
                      }
                      className="w-16 rounded border border-gray-300 px-1.5 py-0.5 text-xs"
                    />
                  </div>

                  <span className="ml-auto text-[11px] text-gray-400">
                    Refreshed {formatDate(p.refreshed_at)}
                  </span>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
