/**
 * /api/admin/articles/[id]
 *
 *   PATCH  — upsert a local override (title, excerpt, body, image, author,
 *            category, tags, hidden). [id] is the article id from wp-news
 *            transformPost, which is "${publication}:${wpPostId}" format.
 *   DELETE — remove the override (revert all fields to upstream).
 */

import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { requireAdmin } from '@/lib/server/auth/admin';
import { ApiError } from '@/lib/server/error';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import type { Publication } from '@/lib/server/wp-news';
import {
  upsertArticleOverride,
  deleteArticleOverride,
} from '@/lib/server/article-overrides';

export const runtime = 'nodejs';

const VALID_PUBS = new Set<Publication>(['austin', 'san_antonio']);

function parseArticleId(rawId: string): { publication: Publication; wpPostId: string } {
  // wp-news.transformPost generates id as `${publication}-${post.id}`. We
  // store the FULL article id (e.g. "austin-12345") as wp_post_id so the
  // applyOverride lookup `overrides.get(article.id)` is a direct match.
  // Publication is still validated from the id prefix.
  const dash = rawId.indexOf('-');
  if (dash < 0) {
    throw new ApiError(400, 'Invalid article id format');
  }
  const pub = rawId.slice(0, dash);
  if (!VALID_PUBS.has(pub as Publication)) {
    throw new ApiError(400, `Unknown publication: ${pub}`);
  }
  // Sanity check: there should be a post id after the dash.
  if (!rawId.slice(dash + 1)) {
    throw new ApiError(400, 'Missing wp_post_id');
  }
  return { publication: pub as Publication, wpPostId: rawId };
}

function invalidate(publication: Publication): void {
  revalidateTag('wp-news', 'max');
  revalidateTag(`wp-news:${publication}`, 'max');
}

type PatchBody = {
  head?: string | null;
  excerpt?: string | null;
  contentHtml?: string | null;
  imageUrl?: string | null;
  authorName?: string | null;
  authorAvatar?: string | null;
  cat?: string | null;
  tags?: string[] | null;
  hidden?: boolean;
};

const TEXT_FIELDS = [
  'head',
  'excerpt',
  'contentHtml',
  'imageUrl',
  'authorName',
  'authorAvatar',
  'cat',
] as const;

function validateBody(raw: unknown): PatchBody {
  if (!raw || typeof raw !== 'object') {
    throw new ApiError(400, 'Body must be a JSON object');
  }
  const body = raw as Record<string, unknown>;
  const out: PatchBody = {};

  for (const f of TEXT_FIELDS) {
    if (f in body) {
      const v = body[f];
      if (v === null) {
        out[f] = null;
      } else if (typeof v === 'string') {
        out[f] = v;
      } else {
        throw new ApiError(400, `${f} must be a string or null`);
      }
    }
  }

  if ('tags' in body) {
    const v = body.tags;
    if (v === null) {
      out.tags = null;
    } else if (Array.isArray(v) && v.every((t) => typeof t === 'string')) {
      out.tags = v as string[];
    } else {
      throw new ApiError(400, 'tags must be a string[] or null');
    }
  }

  if ('hidden' in body) {
    if (typeof body.hidden !== 'boolean') {
      throw new ApiError(400, 'hidden must be a boolean');
    }
    out.hidden = body.hidden;
  }

  return out;
}

export const PATCH = withAdminTracking(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const { publication, wpPostId } = parseArticleId(id);

    const body = validateBody(await req.json().catch(() => ({})));

    const saved = await upsertArticleOverride({
      publication,
      wpPostId,
      ...body,
      editedBy: admin.email,
    });

    invalidate(publication);

    return NextResponse.json({ ok: true, override: saved });
  },
);

export const DELETE = withAdminTracking(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    await requireAdmin();
    const { id } = await ctx.params;
    const { publication, wpPostId } = parseArticleId(id);

    const deleted = await deleteArticleOverride(publication, wpPostId);
    invalidate(publication);

    return NextResponse.json({ ok: true, deleted });
  },
);
