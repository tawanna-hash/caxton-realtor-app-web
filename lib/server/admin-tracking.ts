// lib/server/admin-tracking.ts
//
// withAdminTracking — HOC that wraps admin API route handlers to
// automatically fire PostHog events for all mutations (POST/PUT/PATCH/DELETE).
// GET requests are not tracked (they're reads — too noisy).
//
// Usage:
//   export const POST = withAdminTracking(async (req) => { ... });
//
// The wrapper:
// 1. Resolves the admin identity from the session cookie for distinctId
// 2. Extracts a human-readable action name from the route path + method
// 3. Fires captureServerEvent with method, path, status, and duration
// 4. Composes with withErrorHandling so errors are still handled properly
//
// Events fire as: admin_action
// Properties: { method, path, action, status, duration_ms }

import type { NextRequest } from 'next/server';
import { captureServerEvent, flushServerEvents } from './posthog';
import { withErrorHandling } from './error';

// Extract admin email from JWT cookie for distinctId.
// We can't fully verify the JWT here (Edge-incompatible), but we can
// read it lazily. This runs in Node runtime (all admin routes use runtime='nodejs').
async function getAdminDistinctId(req: NextRequest): Promise<string> {
  try {
    // Try to decode the admin session cookie without full verification.
    // We just need the email for analytics distinctId.
    const cookie = req.cookies.get('caxton_admin_session_v2')?.value ||
                   req.cookies.get('caxton_admin_session')?.value;
    if (!cookie) return 'admin_unknown';

    // JWT payload is base64url-encoded in the second segment
    const parts = cookie.split('.');
    if (parts.length < 2) return 'admin_unknown';

    // Decode base64url
    const payload = Buffer.from(parts[1], 'base64url').toString('utf-8');
    const claims = JSON.parse(payload);
    return claims.email || claims.adminId || 'admin_unknown';
  } catch {
    return 'admin_unknown';
  }
}

// Convert a route path like /api/admin/event-images/upload to "event_images:upload"
function pathToAction(method: string, pathname: string): string {
  // Strip /api/admin/ prefix
  const base = pathname.replace(/^\/api\/admin\//, '');
  // Replace / with : and remove UUIDs/numbers
  const cleaned = base
    .replace(/\/[a-f0-9-]{8,}/g, '/:id')  // UUIDs
    .replace(/\/\d+/g, '/:id')              // numeric IDs
    .replace(/\//g, ':');
  return `${cleaned}:${method.toLowerCase()}`;
}

const TRACKED_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function withAdminTracking<
  Args extends unknown[],
>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return withErrorHandling(async (...args: Args): Promise<Response> => {
    const startTime = Date.now();

    // Try to extract the request object (first arg is usually NextRequest)
    const req = args[0] as NextRequest | undefined;
    const method = req?.method || 'UNKNOWN';
    const pathname = req ? new URL(req.url).pathname : 'unknown';

    // Run the actual handler
    const response = await handler(...args);

    // Only track mutations
    if (TRACKED_METHODS.has(method)) {
      const durationMs = Date.now() - startTime;
      const action = pathToAction(method, pathname);
      const status = response.status;

      // Fire-and-forget PostHog event
      const distinctId = req ? await getAdminDistinctId(req) : 'admin_unknown';
      captureServerEvent('admin_action', distinctId, {
        method,
        path: pathname,
        action,
        status,
        duration_ms: durationMs,
        success: status < 400,
      });
      // Ensure event is flushed before the serverless function terminates
      void flushServerEvents();
    }

    return response;
  });
}
