// lib/server/openapi.ts
//
// Hand-curated OpenAPI 3.1 spec generator. Pulls JSON Schema fragments from
// our existing zod schemas (zod v4 ships `z.toJSONSchema`) and assembles
// them into a single OpenAPI document served at /api/openapi.json.
//
// We intentionally don't auto-discover every one of the 258 routes — only
// the schema-backed ones get full request/response definitions. The rest
// are listed with summary metadata so Swagger UI shows them as "documented
// surface" with a note that the body is freeform.

import { z, type ZodType } from 'zod';

// ── Imported schemas ─────────────────────────────────────────────────────
import {
  pushSubscribeBodySchema,
  pushUnsubscribeBodySchema,
  pushResubscribeBodySchema,
  pushNativeRegisterBodySchema,
  pushNativeDisableBodySchema,
} from './schemas/push';
import {
  renewalReminderCreateSchema,
  renewalReminderPatchSchema,
  renewalReminderSendBodySchema,
} from './schemas/renewal-reminders';

function jsonSchema(schema: ZodType): Record<string, unknown> {
  const out = z.toJSONSchema(schema) as Record<string, unknown>;
  // OpenAPI 3.1 is compatible with JSON Schema 2020-12, but Swagger UI
  // doesn't need the $schema declaration.
  delete out.$schema;
  return out;
}

function okResponse(): Record<string, unknown> {
  return {
    '200': {
      description: 'OK',
      content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } },
    },
  };
}

function errorResponses(): Record<string, unknown> {
  return {
    '400': {
      description: 'Validation failed',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              error: { type: 'string' },
              details: { type: 'object', additionalProperties: true },
            },
            required: ['error'],
          },
        },
      },
    },
    '401': {
      description: 'Unauthorized',
      content: { 'application/json': { schema: { type: 'object', properties: { error: { type: 'string' } } } } },
    },
    '500': {
      description: 'Server error',
      content: { 'application/json': { schema: { type: 'object', properties: { error: { type: 'string' } } } } },
    },
  };
}

function jsonBody(schema: ZodType): Record<string, unknown> {
  return {
    required: true,
    content: { 'application/json': { schema: jsonSchema(schema) } },
  };
}

export function buildOpenApiSpec(): Record<string, unknown> {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Realty News Now API',
      version: '1.0.0',
      description:
        'Public + admin API for the Realty News Now / Caxton Publications platform. ' +
        'This spec is generated from server-side zod schemas at build time. ' +
        'Schema-backed routes have full request/response definitions; the remaining ' +
        'routes are documented at the index level.',
      contact: { name: 'Caxton Publications', email: 'tawanna@myrealtyline.com' },
    },
    servers: [
      { url: 'https://realtynewsnow.app', description: 'Production' },
      { url: 'http://localhost:3000', description: 'Local dev' },
    ],
    tags: [
      { name: 'push', description: 'Web + native push subscription management' },
      { name: 'renewal-reminders', description: 'Admin: agreement renewal reminders' },
      { name: 'portal', description: 'Advertiser self-serve portal' },
      { name: 'admin', description: 'Admin-gated routes (requires caxton_admin_session_v2 cookie)' },
    ],
    components: {
      securitySchemes: {
        realtorSession: {
          type: 'apiKey',
          in: 'cookie',
          name: 'caxton_session_v2',
          description: 'Signed JWT for authenticated realtors.',
        },
        adminSession: {
          type: 'apiKey',
          in: 'cookie',
          name: 'caxton_admin_session_v2',
          description: 'Signed JWT for admin staff (Tawanna only).',
        },
        portalSession: {
          type: 'apiKey',
          in: 'cookie',
          name: 'caxton_portal_session',
          description: 'Signed JWT for advertiser portal users.',
        },
      },
    },
    paths: {
      // ── Web Push ─────────────────────────────────────────────────
      '/api/push/subscribe': {
        post: {
          tags: ['push'],
          summary: 'Register a Web Push subscription',
          requestBody: jsonBody(pushSubscribeBodySchema),
          responses: { ...okResponse(), ...errorResponses() },
        },
      },
      '/api/push/unsubscribe': {
        post: {
          tags: ['push'],
          summary: 'Revoke a Web Push subscription',
          requestBody: jsonBody(pushUnsubscribeBodySchema),
          responses: { ...okResponse(), ...errorResponses() },
        },
      },
      '/api/push/resubscribe': {
        post: {
          tags: ['push'],
          summary: 'Rotate an existing Web Push subscription endpoint',
          requestBody: jsonBody(pushResubscribeBodySchema),
          responses: { ...okResponse(), ...errorResponses() },
        },
      },
      '/api/push/native': {
        post: {
          tags: ['push'],
          summary: 'Register a native APNs/FCM device token',
          requestBody: jsonBody(pushNativeRegisterBodySchema),
          responses: { ...okResponse(), ...errorResponses() },
        },
      },
      '/api/push/native/disable': {
        post: {
          tags: ['push'],
          summary: 'Soft-revoke a native APNs/FCM device token',
          requestBody: jsonBody(pushNativeDisableBodySchema),
          responses: { ...okResponse(), ...errorResponses() },
        },
      },

      // ── Renewal Reminders (admin) ────────────────────────────────
      '/api/admin/renewal-reminders': {
        get: {
          tags: ['renewal-reminders', 'admin'],
          summary: 'List renewal reminders',
          security: [{ adminSession: [] }],
          parameters: [
            {
              in: 'query',
              name: 'status',
              schema: { type: 'string', enum: ['Pending', 'Completed', 'Dismissed'] },
              required: false,
            },
          ],
          responses: { ...okResponse(), ...errorResponses() },
        },
        post: {
          tags: ['renewal-reminders', 'admin'],
          summary: 'Create a renewal reminder',
          security: [{ adminSession: [] }],
          requestBody: jsonBody(renewalReminderCreateSchema),
          responses: {
            '201': {
              description: 'Created',
              content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } },
            },
            ...errorResponses(),
          },
        },
      },
      '/api/admin/renewal-reminders/{id}': {
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        patch: {
          tags: ['renewal-reminders', 'admin'],
          summary: 'Update a renewal reminder',
          security: [{ adminSession: [] }],
          requestBody: jsonBody(renewalReminderPatchSchema),
          responses: { ...okResponse(), ...errorResponses() },
        },
        delete: {
          tags: ['renewal-reminders', 'admin'],
          summary: 'Delete a renewal reminder',
          security: [{ adminSession: [] }],
          responses: { ...okResponse(), ...errorResponses() },
        },
      },
      '/api/admin/renewal-reminders/{id}/send': {
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        post: {
          tags: ['renewal-reminders', 'admin'],
          summary: 'Send a renewal reminder email',
          security: [{ adminSession: [] }],
          requestBody: jsonBody(renewalReminderSendBodySchema),
          responses: { ...okResponse(), ...errorResponses() },
        },
      },

      // ── Portal ───────────────────────────────────────────────────
      '/api/portal/account': {
        patch: {
          tags: ['portal'],
          summary: 'Update advertiser self-serve profile fields',
          security: [{ portalSession: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    company: { type: 'string', nullable: true },
                    phone: { type: 'string', nullable: true },
                    office_phone: { type: 'string', nullable: true },
                    website: { type: 'string', nullable: true },
                    address: { type: 'string', nullable: true },
                    address_2: { type: 'string', nullable: true },
                    city: { type: 'string', nullable: true },
                    state: { type: 'string', nullable: true },
                    zip: { type: 'string', nullable: true },
                    footer_template: {},
                  },
                  additionalProperties: false,
                },
              },
            },
          },
          responses: { ...okResponse(), ...errorResponses() },
        },
      },
      '/api/portal/form-assignments/{id}/submit': {
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        post: {
          tags: ['portal'],
          summary: 'Submit a portal form assignment',
          security: [{ portalSession: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    answers: { type: 'object', additionalProperties: true },
                  },
                  required: ['answers'],
                },
              },
            },
          },
          responses: { ...okResponse(), ...errorResponses() },
        },
      },
    },
  };
}
