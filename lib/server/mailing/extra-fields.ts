// lib/server/mailing/extra-fields.ts
//
// Directory-detail columns on mailing_contacts (MetroTex / association
// directory data). Pure module — safe to import from client components.
//
// Every id here is a real `text` column on mailing_contacts (added in
// crm-schema.ts). The id list doubles as the SQL allow-list for sort,
// filter, PATCH and bulk patch-many, so never add an id that isn't a
// column.

export const EXTRA_FIELDS = [
  { id: 'license_type',       label: 'License Type' },
  { id: 'member_type',        label: 'Member Type' },
  { id: 'role_code',          label: 'Role Code' },
  { id: 'nrds_id',            label: 'NRDS ID' },
  { id: 'office_nrds_id',     label: 'Office NRDS ID' },
  { id: 'license_state',      label: 'License State' },
  { id: 'preferred_name',     label: 'Preferred Name' },
  { id: 'home_city',          label: 'Home City' },
  { id: 'office_phone',       label: 'Office Phone' },
  { id: 'fax_phone',          label: 'Fax' },
  { id: 'office_type',        label: 'Office Type' },
  { id: 'designated_realtor', label: 'Designated REALTOR' },
  { id: 'mail_address',       label: 'Office Mailing Address' },
  { id: 'mail_city',          label: 'Mailing City' },
  { id: 'mail_state',         label: 'Mailing State' },
  { id: 'mail_zip',           label: 'Mailing ZIP' },
  { id: 'county',             label: 'County' },
  { id: 'source_file',        label: 'Source File' },
] as const;

export type ExtraFieldId = (typeof EXTRA_FIELDS)[number]['id'];

export const EXTRA_FIELD_IDS: readonly ExtraFieldId[] = EXTRA_FIELDS.map((f) => f.id);

export function isExtraField(v: unknown): v is ExtraFieldId {
  return typeof v === 'string' && (EXTRA_FIELD_IDS as readonly string[]).includes(v);
}

/** Core text columns that can also be sorted / filtered generically. */
export const CORE_TEXT_FIELDS = [
  'first_name', 'last_name', 'email', 'phone', 'company', 'title', 'license_number',
  'address', 'address_2', 'city', 'state', 'zip', 'website', 'notes', 'source',
] as const;

/** Columns that accept an exact-match filter (`f_<col>=value` on the list API). */
export const FILTERABLE_FIELDS: readonly string[] = [
  'title', 'city', 'state', 'zip', 'company',
  ...EXTRA_FIELD_IDS,
];

export function isFilterableField(v: unknown): v is string {
  return typeof v === 'string' && FILTERABLE_FIELDS.includes(v);
}

/** Display label for MetroTex license types, e.g. Salesperson -> "Sales Person (SP)". */
const LICENSE_TYPE_LABELS: Record<string, string> = {
  Salesperson: 'Sales Person (SP)',
  Broker: 'Broker (BKR)',
  Appraiser: 'Appraiser (APR)',
  'Appraiser Trainee': 'Appraiser Trainee',
  Inspector: 'Inspector',
};
export function licenseTypeLabel(v: string | null | undefined): string {
  if (!v) return '';
  return LICENSE_TYPE_LABELS[v] ?? v;
}

/** MetroTex member-type codes. */
const MEMBER_TYPE_LABELS: Record<string, string> = {
  R: 'REALTOR (R)', L: 'Licensee / MLS Only (L)', N: 'Non-member (N)', S: 'Staff (S)',
  RA: 'REALTOR Associate (RA)', I: 'Institute Affiliate (I)', AFF: 'Affiliate (AFF)', CCO: 'CCO',
};
export function memberTypeLabel(v: string | null | undefined): string {
  if (!v) return '';
  return MEMBER_TYPE_LABELS[v] ?? v;
}
