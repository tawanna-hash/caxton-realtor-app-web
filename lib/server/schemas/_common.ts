/**
 * Shared zod schemas + helpers used across admin API routes.
 *
 * Goal: stop hand-writing the same `Number(searchParams.get('limit'))` +
 * `Number.isFinite(…)` + clamp dance in every list route. Compose
 * `paginationSchema` (or extend it) with route-specific filters, then
 * call `parseQuery(req, schema)` from within a `withErrorHandling`
 * wrapper. Zod errors are caught centrally and rendered as 400 by
 * `lib/server/error.ts`.
 *
 * Example:
 *
 *   const listQuerySchema = paginationSchema.extend({
 *     status: z.enum(['pending', 'active', 'rejected']).optional(),
 *   });
 *
 *   export const GET = withErrorHandling(async (req: NextRequest) => {
 *     await requireAdmin();
 *     const { limit, offset, status } = parseQuery(req, listQuerySchema);
 *     // …
 *   });
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Reusable primitives
// ---------------------------------------------------------------------------

/**
 * UUID string (v1–v5). Used for path `[id]` segments and id-shaped bodies.
 */
export const uuidSchema = z.string().uuid();

/**
 * Single `{ id }` param object — pass `params` from a `[id]` route here.
 *
 *   const { id } = idParamSchema.parse(await ctx.params);
 */
export const idParamSchema = z.object({
  id: uuidSchema,
});
export type IdParam = z.infer<typeof idParamSchema>;

/**
 * Sort direction shared by every list route.
 */
export const sortDirSchema = z
  .enum(['asc', 'desc'])
  .default('desc');

/**
 * Pagination defaults: `limit` 1..500 (default 100), `offset` ≥ 0
 * (default 0). `z.coerce.number()` accepts the string form the browser
 * sends in URLSearchParams.
 *
 * Extend (don't redefine) when a list route needs filter params:
 *
 *   const schema = paginationSchema.extend({
 *     market: z.enum(['austin', 'san_antonio']).optional(),
 *     q:      z.string().trim().min(1).max(200).optional(),
 *   });
 */
export const paginationSchema = z.object({
  limit:  z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});
export type Pagination = z.infer<typeof paginationSchema>;

/**
 * Bulk action over a list of ids. Used by `/mailing/holding/promote`,
 * `/reject`, etc. `min(1)` so empty arrays 400 instead of silently
 * succeeding. `max(1000)` caps single-request damage.
 */
export const bulkIdsSchema = z.object({
  ids: z.array(uuidSchema).min(1).max(1000),
});
export type BulkIds = z.infer<typeof bulkIdsSchema>;

/**
 * Tagged-union "ID or ids" body — accept either `{ id }` or `{ ids }`,
 * since some legacy clients send the singular. Routes can `.transform()`
 * to a canonical array.
 */
export const idOrIdsSchema = z.union([
  z.object({ id: uuidSchema }).transform(({ id }) => ({ ids: [id] })),
  bulkIdsSchema,
]);

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------

/**
 * Parse a `URLSearchParams`-style record against a schema. We feed the
 * raw `Object.fromEntries` output, which means repeated keys collapse
 * to their last value — that's the same behavior Next gives you from
 * `req.nextUrl.searchParams.get(name)`, so callers won't see a change
 * in semantics.
 *
 * Throws `ZodError` on failure; the centralized `withErrorHandling`
 * converts that to a 400 with `details: { field: ['…'] }`.
 */
export function parseQuery<S extends z.ZodTypeAny>(
  req: Request,
  schema: S,
): z.infer<S> {
  const url = new URL(req.url);
  return schema.parse(Object.fromEntries(url.searchParams.entries()));
}

/**
 * Parse a JSON request body against a schema, with a friendlier 400
 * when the body itself isn't valid JSON (e.g. empty POST).
 *
 * Throws `ApiError(400)` for malformed JSON, `ZodError` for shape errors.
 */
export async function parseJson<S extends z.ZodTypeAny>(
  req: Request,
  schema: S,
): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    // Lazy-import to avoid a circular dep between this file and error.ts.
    const { ApiError } = await import('@/lib/server/error');
    throw new ApiError(400, 'Invalid JSON body');
  }
  return schema.parse(raw);
}
