/**
 * /api/admin/social/[id]
 *   PATCH  — update pub / is_open_house / is_active / display_order
 *   DELETE — remove the post
 */

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withErrorHandling, ApiError } from '@/lib/server/error';
import {
  updateSocialPost,
  deleteSocialPost,
  type SocialPub,
} from '@/lib/server/social-store';

export const runtime = 'nodejs';

export const PATCH = withErrorHandling(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    await requireAdmin();
    const { id: idRaw } = await ctx.params;
    const id = Number(idRaw);
    if (!Number.isInteger(id)) throw new ApiError(400, 'invalid id');

    const body = (await req.json()) as {
      pub?: SocialPub;
      is_open_house?: boolean;
      is_active?: boolean;
      display_order?: number;
    };

    if (body.pub && !['realtyline', 'newsline', 'both'].includes(body.pub)) {
      throw new ApiError(400, 'pub must be realtyline | newsline | both');
    }

    const post = await updateSocialPost(id, body);
    if (!post) throw new ApiError(404, 'post not found');
    return NextResponse.json({ post });
  }
);

export const DELETE = withErrorHandling(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    await requireAdmin();
    const { id: idRaw } = await ctx.params;
    const id = Number(idRaw);
    if (!Number.isInteger(id)) throw new ApiError(400, 'invalid id');

    const ok = await deleteSocialPost(id);
    if (!ok) throw new ApiError(404, 'post not found');
    return new NextResponse(null, { status: 204 });
  }
);
