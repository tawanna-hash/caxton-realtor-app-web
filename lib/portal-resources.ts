import { z } from 'zod';

// lib/portal-resources.ts
//
// Shared types/config for partner-managed portal content.

export const RESOURCE_KINDS = [
  'logo_file',
  'location',
  'staff',
] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

export interface ResourceFile {
  url: string;
  name: string;
  size: number;
  mime: string;
}

export interface PortalResource {
  id: string;
  kind: ResourceKind;
  title: string;
  url: string | null;
  notes: string | null;
  fields: Record<string, string>;
  files: ResourceFile[];
  updated_at: string;
}

export interface KindConfig {
  kind: ResourceKind;
  heading: string;
  blurb: string;
  addLabel: string;
  titleLabel: string;
  titlePlaceholder: string;
  showUrl: boolean;
  urlLabel: string;
  showNotes: boolean;
  extra: { key: string; label: string; placeholder?: string }[];
  dropLabel: string;
  accept: string;
}

export const KIND_SLUGS: Record<string, ResourceKind> = {
  logos: 'logo_file',
  locations: 'location',
  staff: 'staff',
};

export const KIND_CONFIG: KindConfig[] = [
  {
    kind: 'logo_file',
    heading: 'Partner logo files',
    blurb: 'Your approved logos for print and digital.',
    addLabel: 'Add logo set',
    titleLabel: 'Logo name',
    titlePlaceholder: 'Primary logo - full color',
    showUrl: false,
    urlLabel: '',
    showNotes: true,
    extra: [],
    dropLabel: 'Drop logo files here (PNG, SVG, EPS, AI, PDF)',
    accept: 'image/*,.svg,.eps,.ai,.pdf,.zip',
  },
  {
    kind: 'location',
    heading: 'Locations',
    blurb: 'Your offices and communities.',
    addLabel: 'Add location',
    titleLabel: 'Location name',
    titlePlaceholder: 'Austin office',
    showUrl: false,
    urlLabel: '',
    showNotes: false,
    extra: [
      { key: 'address', label: 'Address' },
      { key: 'address_2', label: 'Suite, Apt, Building' },
      { key: 'city', label: 'City' },
      { key: 'state', label: 'State' },
      { key: 'zip', label: 'Zip code' },
      { key: 'phone', label: 'Phone' },
    ],
    dropLabel: 'Drop a location photo here (optional)',
    accept: 'image/*',
  },
  {
    kind: 'staff',
    heading: 'Staff',
    blurb: 'The people we should know and feature.',
    addLabel: 'Add staff member',
    titleLabel: 'Name',
    titlePlaceholder: 'Jane Smith',
    showUrl: false,
    urlLabel: '',
    showNotes: false,
    extra: [
      { key: 'role', label: 'Title / role' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Phone' },
    ],
    dropLabel: 'Drop a headshot here (optional)',
    accept: 'image/*',
  },
];

const httpUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => /^https?:\/\//i.test(v), 'Enter a full link starting with http:// or https://');

export const resourceBodySchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(300),
  url: httpUrl.nullable().optional().or(z.literal('').transform(() => null)),
  notes: z.string().max(4000).nullable().optional(),
  fields: z.record(z.string(), z.string().max(500)).optional(),
  files: z
    .array(
      z.object({
        url: z.string().url().max(2000),
        name: z.string().max(300),
        size: z.number().nonnegative(),
        mime: z.string().max(200),
      }),
    )
    .max(100)
    .optional(),
});

