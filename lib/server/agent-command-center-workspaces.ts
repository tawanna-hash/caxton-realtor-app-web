import { query } from '@/lib/server/db/neon';
import {
  agentCommandCenterWorkspaceSchema,
  type AgentCommandCenterWorkspace,
} from '@/lib/agent-command-center-workspace';

export type StoredAgentCommandCenterWorkspace = {
  workspace: AgentCommandCenterWorkspace;
  version: number;
  updatedAt: string;
};

type WorkspaceRow = {
  workspace: unknown;
  version: number;
  updated_at: string | Date;
};

let schemaPromise: Promise<void> | null = null;

export function ensureAgentCommandCenterWorkspaceSchema(): Promise<void> {
  if (schemaPromise) return schemaPromise;

  schemaPromise = (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS agent_command_center_workspaces (
        realtor_id UUID PRIMARY KEY REFERENCES realtors(id) ON DELETE CASCADE,
        workspace JSONB NOT NULL DEFAULT '{"deals":[]}'::jsonb,
        version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS agent_command_center_workspaces_updated_idx
      ON agent_command_center_workspaces (updated_at DESC)
    `);
  })().catch((error) => {
    schemaPromise = null;
    throw error;
  });

  return schemaPromise;
}

function toStoredWorkspace(row: WorkspaceRow): StoredAgentCommandCenterWorkspace {
  const workspace = agentCommandCenterWorkspaceSchema.parse(row.workspace);
  return {
    workspace,
    version: row.version,
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : row.updated_at.toISOString(),
  };
}

export async function getAgentCommandCenterWorkspace(
  realtorId: string,
): Promise<StoredAgentCommandCenterWorkspace | null> {
  await ensureAgentCommandCenterWorkspaceSchema();
  const rows = await query<WorkspaceRow>(
    `SELECT workspace, version, updated_at
     FROM agent_command_center_workspaces
     WHERE realtor_id = $1
     LIMIT 1`,
    [realtorId],
  );
  return rows[0] ? toStoredWorkspace(rows[0]) : null;
}

export type SaveWorkspaceResult =
  | { saved: true; record: StoredAgentCommandCenterWorkspace }
  | { saved: false; current: StoredAgentCommandCenterWorkspace | null };

export async function saveAgentCommandCenterWorkspace(
  realtorId: string,
  workspace: AgentCommandCenterWorkspace,
  expectedVersion: number | null,
): Promise<SaveWorkspaceResult> {
  await ensureAgentCommandCenterWorkspaceSchema();
  const serialized = JSON.stringify(workspace);

  if (expectedVersion === null) {
    const rows = await query<WorkspaceRow>(
      `INSERT INTO agent_command_center_workspaces (realtor_id, workspace, version)
       VALUES ($1, $2::jsonb, 1)
       ON CONFLICT (realtor_id) DO NOTHING
       RETURNING workspace, version, updated_at`,
      [realtorId, serialized],
    );
    if (rows[0]) return { saved: true, record: toStoredWorkspace(rows[0]) };
    return { saved: false, current: await getAgentCommandCenterWorkspace(realtorId) };
  }

  const rows = await query<WorkspaceRow>(
    `UPDATE agent_command_center_workspaces
     SET workspace = $2::jsonb,
         version = version + 1,
         updated_at = NOW()
     WHERE realtor_id = $1
       AND version = $3
     RETURNING workspace, version, updated_at`,
    [realtorId, serialized, expectedVersion],
  );
  if (rows[0]) return { saved: true, record: toStoredWorkspace(rows[0]) };
  return { saved: false, current: await getAgentCommandCenterWorkspace(realtorId) };
}
