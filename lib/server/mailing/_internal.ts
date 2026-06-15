// lib/server/mailing/_internal.ts
//
// Shared internals for the mailing modules. Not part of the public API.

import type { NeonQueryFunction } from '@neondatabase/serverless';

export type Sql = NeonQueryFunction<false, false>;

export function normString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}
