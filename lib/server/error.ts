/**
 * Centralized API error handling for Next.js route handlers. Replaces the
 * Express `errorHandler` middleware. Response shapes match what the existing
 * web-side `lib/api-client.ts` already parses (`error`, `message`, `details`).
 */

import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { logger } from './logger';

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function handleApiError(err: unknown): NextResponse {
  // Zod validation errors → 400 with field errors
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: 'Validation failed', details: err.flatten().fieldErrors },
      { status: 400 },
    );
  }

  // Our own ApiError → status + body
  if (err instanceof ApiError) {
    const body: Record<string, unknown> = { error: err.message };
    if (err.details !== undefined) body.details = err.details;
    return NextResponse.json(body, { status: err.statusCode });
  }

  // Anything else → 500, log details, expose only generic message in prod
  logger.error({ err }, 'Unhandled API error');
  const body: Record<string, unknown> = { error: 'Internal server error' };
  if (process.env.NODE_ENV !== 'production' && err instanceof Error) {
    body.message = err.message;
  }
  return NextResponse.json(body, { status: 500 });
}

/**
 * Wrap a route handler to convert thrown errors into JSON responses.
 *
 *   export const POST = withErrorHandling(async (req) => { ... });
 */
export function withErrorHandling<
  Args extends unknown[],
>(handler: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (err) {
      return handleApiError(err);
    }
  };
}
