import { NextResponse } from 'next/server';
import { z } from 'zod';
import { agentCommandCenterWorkspaceSchema } from '@/lib/agent-command-center-workspace';
import { requireUser } from '@/lib/server/auth/user';
import { withErrorHandling } from '@/lib/server/error';
import {
  getAgentCommandCenterWorkspace,
  saveAgentCommandCenterWorkspace,
} from '@/lib/server/agent-command-center-workspaces';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const saveSchema = z.object({
  workspace: agentCommandCenterWorkspaceSchema,
  expectedVersion: z.number().int().positive().nullable(),
}).strict();

function privateResponse(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
    },
  });
}

export const GET = withErrorHandling(async (): Promise<Response> => {
  const user = await requireUser();
  const record = await getAgentCommandCenterWorkspace(user.realtorId);
  return privateResponse({
    workspace: record?.workspace ?? null,
    version: record?.version ?? null,
    updatedAt: record?.updatedAt ?? null,
  });
});

export const PUT = withErrorHandling(async (req: Request): Promise<Response> => {
  const user = await requireUser();
  const input = saveSchema.parse(await req.json());
  const result = await saveAgentCommandCenterWorkspace(
    user.realtorId,
    input.workspace,
    input.expectedVersion,
  );

  if (!result.saved) {
    return privateResponse({
      error: 'A newer workspace is already saved from another device.',
      workspace: result.current?.workspace ?? null,
      version: result.current?.version ?? null,
      updatedAt: result.current?.updatedAt ?? null,
    }, 409);
  }

  return privateResponse({
    workspace: result.record.workspace,
    version: result.record.version,
    updatedAt: result.record.updatedAt,
  });
});
