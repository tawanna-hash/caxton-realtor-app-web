// caxton-social-v3
// Admin curator for Facebook Page + Group posts.
//
//   • Page URL  (facebook.com/{page}/posts/{id})       → auto-fetch via Graph API
//   • Group URL (facebook.com/groups/{gid}/posts/{pid})  → harvest public OG tags,
//                                                           admin reviews & edits,
//                                                           then submits as manual
//   • Reel URL  (facebook.com/reel/{id})                  → rejected (App Review needed)
//
// The group flow uses POST /api/admin/social/harvest to fetch caption + image
// from the public HTML's OpenGraph tags. If that fails (login wall, private
// group, etc.) the admin can still type the fields in by hand.

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { adminApi } from '@/lib/admin-api';

import PageTitle from '@/components/ui/PageTitle';
type SocialPub = 'realtyline' | 'newsline' | 'both';
type UrlKind = 'page' | 'group' | 'reel' | 'unknown';

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

interface HarvestResponse {
  kind: UrlKind;
  fbPostId: string;
  pageHint: string | null;
  harvested: boolean;
  message: string | null;
  imageUrl: string | null;
  postedAt: string | null;
  reason?: string;
}

const PUB_LABEL: Record<SocialPub, string> = {
  realtyline: 'RealtyLine',
  newsline: 'Newsline San Antonio',
  both: 'Both',
};

/**
 * Lightweight client-side URL sniffer. The server is the source of truth via
 * parseFacebookPostUrl(), but we want the form to know whether to show the
 * Graph-API path, the Group harvester path, or the rejection notice — all
 * before the request is made.
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

/** Convert ISO timestamp to value suitable for <input type="datetime-local"> */
function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    // Adjust for local timezone offset so the displayed time matches the
    // wall-clock time the user sees on Facebook.
    const tzOffset = d.getTimezoneOffset() * 60_000;
    return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
  } catch {
    return '';
  }
}

/** Convert datetime-local input value back to a full ISO timestamp. */
function fromDatetimeLocalValue(v: string): string | null {
  if (!v) return null;
  try {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
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

  // Group-post manual-entry fields (populated by harvester, editable by admin)
  const [groupCaption, setGroupCaption] = useState('');
  const [groupImageUrl, setGroupImageUrl] = useState('');
  const [groupPostedAt, setGroupPostedAt] = useState(''); // datetime-local string
  const [harvesting, setHarvesting] = useState(false);
  const [harvestStatus, setHarvestStatus] = useState<
    | { kind: 'idle' }
    | { kind: 'ok'; message: string }
    | { kind: 'warn'; message: string }
  >({ kind: 'idle' });

  const urlKind = useMemo(() => detectUrlKind(url), [url]);

  // Reset the group-specific fields whenever the URL changes (or stops
  // being a group URL) so the form doesn't carry stale data into a new
  // attempt.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: clearing dependent fields when the URL input changes
    setGroupCaption('');
    setGroupImageUrl('');
    setGroupPostedAt('');
    setHarvestStatus({ kind: 'idle' });
  }, [url]);

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

  const handleHarvest = useCallback(async () => {
    if (!url.trim() || urlKind !== 'group') return;
    setHarvesting(true);
    setFormError(null);
    setFormMsg(null);
    try {
      const result = (await adminApi.harvestSocialPost({
        url: url.trim(),
      })) as HarvestResponse;
      if (result.harvested) {
        setGroupCaption(result.message ?? '');
        setGroupImageUrl(result.imageUrl ?? '');
        setGroupPostedAt(toDatetimeLocalValue(result.postedAt));
        const bits: string[] = [];
        if (result.message) bits.push('caption');
        if (result.imageUrl) bits.push('image');
        if (result.postedAt) bits.push('posted-at');
        setHarvestStatus({
          kind: 'ok',
          message: `Pulled ${bits.join(' + ')} from Facebook. Review + edit, then click Add post.`,
        });
      } else {
        setHarvestStatus({
          kind: 'warn',
          message:
            result.reason ??
            "Couldn't pull metadata from this URL — fill the fields in manually.",
        });
      }
    } catch (err) {
      setHarvestStatus({
        kind: 'warn',
        message:
          err instanceof Error
            ? err.message
            : 'Harvest failed — fill the fields in manually.',
      });
    } finally {
      setHarvesting(false);
    }
  }, [url, urlKind]);

  const handleAdd = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!url.trim()) return;
      if (urlKind === 'reel' || urlKind === 'unknown') {
        setFormError(
          urlKind === 'reel'
            ? 'Reel URLs are not supported. Paste a Facebook Page post or Group post URL instead.'
            : 'URL not recognized. Paste a Facebook Page post or Group post URL.'
        );
        return;
      }

      setSubmitting(true);
      setFormError(null);
      setFormMsg(null);

      try {
        if (urlKind === 'group') {
          // Group submission requires either a caption or an image.
          const captionTrim = groupCaption.trim();
          const imageUrlTrim = groupImageUrl.trim();
          if (!captionTrim && !imageUrlTrim) {
            setFormError(
              'Group posts need a caption or an image. Click "Harvest from Facebook" to pull them automatically, or paste them in manually.'
            );
            setSubmitting(false);
            return;
          }
          await adminApi.addSocialPost({
            url: url.trim(),
            pub,
            is_open_house: isOpenHouse,
            message: captionTrim || null,
            image_url: imageUrlTrim || null,
            posted_at: fromDatetimeLocalValue(groupPostedAt),
          });
          setFormMsg('Group post added.');
        } else {
          // Page post — server auto-fetches caption + image from Graph API.
          await adminApi.addSocialPost({
            url: url.trim(),
            pub,
            is_open_house: isOpenHouse,
          });
          setFormMsg('Page post added (metadata auto-fetched from Facebook).');
        }

        setUrl('');
        setIsOpenHouse(false);
        setGroupCaption('');
        setGroupImageUrl('');
        setGroupPostedAt('');
        setHarvestStatus({ kind: 'idle' });
        await refetch();
      } catch (err) {
        setFormError(err instanceof Error ? err.message : 'Failed to add post');
      } finally {
        setSubmitting(false);
      }
    },
    [url, pub, isOpenHouse, urlKind, groupCaption, groupImageUrl, groupPostedAt, refetch]
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

  const canSubmit =
    !!url.trim() &&
    !submitting &&
    (urlKind === 'page' ||
      (urlKind === 'group' &&
        (groupCaption.trim().length > 0 || groupImageUrl.trim().length > 0)));

  return (
    <div className="p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <PageTitle size="md">Social posts</PageTitle>
          <p className="text-sm text-gray-700 mt-1">
            Curate Facebook posts that surface in the RealtyLine + Newsline San Antonio feeds.
            Page posts auto-fetch via the Graph API; Group posts use a one-click
            harvester that pulls the caption + image from the post&rsquo;s public
            preview.
          </p>
        </div>
      </div>

      {/* ────────── Add form ────────── */}
      <section className="mb-8 rounded-md border border-gray-200 bg-white p-5 shadow-sm">
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
              placeholder="https://www.facebook.com/myrealtyline/posts/123… or /groups/{id}/posts/{id}"
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
                <span className="text-blue-700">
                  ✓ Group URL detected — click <strong>Harvest from Facebook</strong>{' '}
                  below to pull caption + image, then review &amp; submit.
                </span>
              )}
              {urlKind === 'reel' && (
                <span className="text-red-700">
                  ✗ Reel URL not supported. Curate Page or Group posts only.
                </span>
              )}
              {urlKind === 'unknown' && (
                <>
                  Paste a Page post URL (
                  <code>facebook.com/{'{page}'}/posts/{'{id}'}</code>) or a Group
                  post URL (
                  <code>facebook.com/groups/{'{id}'}/posts/{'{id}'}</code>).
                </>
              )}
            </p>
          </div>

          {/* ─── Group harvester + manual-entry fields ─── */}
          {urlKind === 'group' && (
            <div className="rounded-md border border-blue-200 bg-blue-50/60 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-gray-700">
                  Group posts can&rsquo;t be read through the Graph API. Click
                  Harvest to pull caption + image from the post&rsquo;s public
                  preview; you can edit before saving.
                </p>
                <button
                  type="button"
                  onClick={handleHarvest}
                  disabled={harvesting || !url.trim()}
                  className="whitespace-nowrap rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {harvesting ? 'Harvesting…' : 'Harvest from Facebook'}
                </button>
              </div>

              {harvestStatus.kind === 'ok' && (
                <div className="rounded-md bg-emerald-50 p-2.5 text-xs text-emerald-800 ring-1 ring-emerald-200">
                  {harvestStatus.message}
                </div>
              )}
              {harvestStatus.kind === 'warn' && (
                <div className="rounded-md bg-amber-50 p-2.5 text-xs text-amber-900 ring-1 ring-amber-200">
                  {harvestStatus.message}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Caption
                </label>
                <textarea
                  value={groupCaption}
                  onChange={(e) => setGroupCaption(e.target.value)}
                  rows={3}
                  placeholder="Paste or edit the post caption…"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Image URL
                  </label>
                  <input
                    type="url"
                    value={groupImageUrl}
                    onChange={(e) => setGroupImageUrl(e.target.value)}
                    placeholder="https://…"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Posted at
                  </label>
                  <input
                    type="datetime-local"
                    value={groupPostedAt}
                    onChange={(e) => setGroupPostedAt(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
                  />
                </div>
              </div>

              {groupImageUrl && (
                <div className="flex items-start gap-3">
                  <span className="text-xs text-gray-600 pt-1">Preview:</span>
                  <div className="relative h-24 w-24 overflow-hidden rounded-md bg-gray-100 border border-gray-200">
                    {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary remote thumbnail, not whitelisted in next.config */}
                    <img
                      src={groupImageUrl}
                      alt="Harvested preview"
                      className="h-full w-full object-cover"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

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
                className="h-4 w-4 rounded-md border-gray-300"
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
    // BUG-41: explain *why* the list is empty and what to do next, instead of a bare "None."
    return (
      <section className="mb-8">
        <h2 className="text-lg font-medium text-gray-900 mb-3">{title}</h2>
        <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center">
          <p className="text-sm text-gray-700 font-medium mb-1">No posts curated yet</p>
          <p className="text-xs text-gray-500">
            Paste a Facebook Page or Group post URL above to add one. Reels and personal-profile posts aren&apos;t supported.
          </p>
        </div>
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
              className="rounded-md border border-gray-200 bg-white p-4 shadow-sm flex gap-4"
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
                            ? 'inline-flex items-center rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.15em] font-semibold text-amber-800'
                            : 'inline-flex items-center rounded-md bg-blue-100 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.15em] font-semibold text-[#1877F2]'
                        }
                      >
                        {isGroup ? 'Group · Harvested' : 'Page · Auto'}
                      </span>
                      {p.is_open_house && (
                        <span className="inline-flex items-center rounded-md bg-[#C8A75B] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.15em] font-semibold text-white">
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
                      className="h-3.5 w-3.5 rounded-md border-gray-300"
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
                      className="h-3.5 w-3.5 rounded-md border-gray-300"
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
                      className="rounded-md border border-gray-300 px-1.5 py-0.5 text-xs"
                    >
                      <option value="both">Both</option>
                      <option value="realtyline">RealtyLine</option>
                      <option value="newsline">Newsline San Antonio</option>
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
                      className="w-16 rounded-md border border-gray-300 px-1.5 py-0.5 text-xs"
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
