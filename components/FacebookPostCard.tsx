// caxton-social-v1
// Renders a curated Facebook post in the dashboard feed. Style matches the
// surrounding ArticleCard (same horizontal padding, image proportions, body
// type scale) with two distinguishing touches:
//   • a blue Facebook "f" badge + "Social" eyebrow so readers know the source
//   • a gold "OPEN HOUSE" pill when is_open_house = true (also pinned to top
//     of the feed; the pin happens upstream in the feed assembly)

'use client';

import { useCallback, useEffect, useRef } from 'react';

export interface FacebookFeedPost {
  id: number;
  fb_post_id: string;
  permalink_url: string;
  message: string | null;
  image_url: string | null;
  posted_at: string | null;
  is_open_house: boolean;
  display_order: number;
}

interface Props {
  post: FacebookFeedPost;
  pub: 'realtyline' | 'newsline';
  track?: (event: string, data: Record<string, unknown>) => void;
}

function formatPostedAt(iso: string | null): string {
  if (!iso) return '';
  try {
    const dt = new Date(iso);
    const diffMs = Date.now() - dt.getTime();
    const diffH = Math.floor(diffMs / 36e5);
    if (diffH < 1) return 'Just now';
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `${diffD}d ago`;
    return dt.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

function FacebookGlyph() {
  return (
    <span
      aria-hidden
      className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#1877F2] text-white text-xs font-bold"
      style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}
    >
      f
    </span>
  );
}

export default function FacebookPostCard({ post, pub, track }: Props) {
  const ref = useRef<HTMLAnchorElement | null>(null);

  // Impression tracking — fires once when 50%+ of the card enters viewport.
  useEffect(() => {
    const el = ref.current;
    if (!el || !track) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          track('social_post_impression', {
            postId: post.id,
            fbPostId: post.fb_post_id,
            isOpenHouse: post.is_open_house,
            publication: pub,
          });
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [post.id, post.fb_post_id, post.is_open_house, pub, track]);

  const onClick = useCallback(() => {
    track?.('social_post_click', {
      postId: post.id,
      fbPostId: post.fb_post_id,
      isOpenHouse: post.is_open_house,
      publication: pub,
    });
  }, [post.id, post.fb_post_id, post.is_open_house, pub, track]);

  const message = post.message?.trim() || '';
  const truncated =
    message.length > 220 ? message.slice(0, 217).trimEnd() + '…' : message;

  return (
    <a
      ref={ref}
      href={post.permalink_url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      className="block w-full text-left px-4 py-5 hover:bg-gray-50 transition-colors"
    >
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <span className="text-xs uppercase tracking-[0.15em] font-medium text-[#1877F2] mb-2 flex items-center gap-1.5">
            <FacebookGlyph />
            Social
            {post.is_open_house && (
              <span className="ml-1 inline-flex items-center rounded-sm bg-[#C8A75B] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.15em] font-semibold text-white">
                Open House
              </span>
            )}
          </span>
          <p className="text-base text-gray-900 leading-snug mb-2 font-medium whitespace-pre-line">
            {truncated || <em className="text-gray-500">View post on Facebook</em>}
          </p>
          <p className="text-xs text-gray-400 font-light">
            {formatPostedAt(post.posted_at)} · View on Facebook
          </p>
        </div>
        {post.image_url && (
          <div className="flex-shrink-0 w-32 h-28 bg-gray-100 border border-gray-200 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={post.image_url}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
        )}
      </div>
    </a>
  );
}
