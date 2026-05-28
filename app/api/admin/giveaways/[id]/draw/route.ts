/**
 * /api/admin/giveaways/:id/draw
 *   POST — randomly pick a winner (weighted by ticket count) and notify by email.
 *
 * Winner selection happens inside a DB transaction (FOR UPDATE on the
 * giveaway row) to make sure two admins clicking Draw at the same time
 * can't both succeed. The winner email is best-effort — failures are
 * logged but don't break the response, so a flaky email provider can't
 * roll back a successful draw.
 */

import { NextResponse } from 'next/server';
import { requireAdmin, getRequestIp } from '@/lib/server/auth/admin';
import { withErrorHandling, ApiError } from '@/lib/server/error';
import { drawGiveawayWinner } from '@/lib/server/giveaways-store';
import { logAudit } from '@/lib/server/audit';
import { getEmailProvider } from '@/lib/server/email';
import { renderGiveawayWinnerEmail } from '@/lib/server/email/templates';
import { logger } from '@/lib/server/logger';
import { giveawayIdParamSchema } from '@/lib/server/schemas/giveaways';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export const POST = withErrorHandling(async (_req: Request, ctx: Ctx) => {
  const admin = await requireAdmin();
  const { id } = giveawayIdParamSchema.parse(await ctx.params);

  const drawn = await drawGiveawayWinner(id, admin.adminId);
  if (!drawn.ok) {
    switch (drawn.error.kind) {
      case 'not_found':
        throw new ApiError(404, 'Giveaway not found');
      case 'already_drawn':
        throw new ApiError(400, 'A winner has already been drawn for this giveaway');
      case 'not_ended':
        throw new ApiError(400, 'Cannot draw a winner before the giveaway ends');
      case 'no_entries':
        throw new ApiError(400, 'No entries to draw from');
    }
  }

  const { winner, giveaway } = drawn.result;

  await logAudit({
    adminId: admin.adminId,
    action: 'giveaway.draw',
    entityType: 'giveaway',
    entityId: id,
    afterState: { winnerRealtorId: winner.id },
    ipAddress: await getRequestIp(),
  });

  // Send winner notification email — non-blocking. A flaky email provider
  // shouldn't undo a successful draw.
  try {
    const template = renderGiveawayWinnerEmail({
      firstName: winner.first_name,
      giveawayTitle: giveaway.title,
      prize: giveaway.prize,
      publication: giveaway.publication,
    });
    const emailResult = await getEmailProvider().send({
      to: { email: winner.email, name: winner.first_name },
      subject: template.subject,
      text: template.text,
      html: template.html,
      emailType: 'giveaway_winner',
      tags: ['giveaway_winner'],
    });
    if (emailResult.success) {
      logger.info(
        { email: winner.email, giveawayId: id, messageId: emailResult.messageId },
        'Giveaway winner email sent',
      );
    } else {
      logger.warn(
        { email: winner.email, giveawayId: id, error: emailResult.error },
        'Giveaway winner email failed',
      );
    }
  } catch (err) {
    logger.warn({ err, giveawayId: id }, 'Giveaway winner email crashed');
  }

  return NextResponse.json({
    success: true,
    winner: {
      id: winner.id,
      email: winner.email,
      firstName: winner.first_name,
      lastName: winner.last_name,
    },
  });
});
