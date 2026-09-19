/**
 * Zod schemas for admin subscribers routes.
 */

import { z } from 'zod';
import { PUBLICATION_IDS } from '@/lib/publications';

const SUBSCRIBER_SORT_COLUMNS = [
  'created_at',
  'last_app_open_at',
  'last_login_at',
  'email',
  'first_name',
  'last_name',
  'market',
  'city',
] as const;
const VERIFIED_FILTER_OPTIONS = ['valid','invalid','risky','unknown','pending','unverified'] as const;
export const listSubscribersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
  market: z.enum(PUBLICATION_IDS).optional(),
  q: z.string().max(200).optional(),
  sort: z.enum(SUBSCRIBER_SORT_COLUMNS).default('created_at'),
  dir: z.enum(['asc', 'desc']).default('desc'),
  verified: z.enum(VERIFIED_FILTER_OPTIONS).optional(),
});

export const subscriberIdParamSchema = z.object({
  id: z.string().uuid('subscriber id must be a uuid'),
});

const editableTextNullable = z.string().nullable().optional();

export const patchSubscriberBodySchema = z
  .object({
    first_name: z.string().trim().min(1).optional(),
    last_name: z.string().trim().min(1).optional(),
    title: editableTextNullable,
    license_type: z.enum(['TREC', 'NMLS']).nullable().optional(),
    trec_license_number: editableTextNullable,
    nmls_license_number: editableTextNullable,
    brokerage_name: editableTextNullable,
    mobile: editableTextNullable,
    mailing_address: editableTextNullable,
    mailing_address_2: editableTextNullable,
    city: editableTextNullable,
    state: editableTextNullable,
    zip: editableTextNullable,
    fb_handle: editableTextNullable,
    ig_handle: editableTextNullable,
    li_handle: editableTextNullable,
    birthday_month: z.number().int().min(1).max(12).nullable().optional(),
    birthday_day: z.number().int().min(1).max(31).nullable().optional(),
    market: z.enum(PUBLICATION_IDS).optional(),
    subscriptions: z.array(z.string()).optional(),
    status: z.enum(['active', 'inactive']).optional(),
  })
  .strict();

export const EDITABLE_FIELDS = [
  'first_name',
  'last_name',
  'title',
  'license_type',
  'trec_license_number',
  'nmls_license_number',
  'brokerage_name',
  'mobile',
  'mailing_address',
  'mailing_address_2',
  'city',
  'state',
  'zip',
  'fb_handle',
  'ig_handle',
  'li_handle',
  'birthday_month',
  'birthday_day',
  'market',
  'subscriptions',
  'status',
] as const;
