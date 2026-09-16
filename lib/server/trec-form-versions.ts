import { query, withNeonTransaction } from '@/lib/server/db/neon';
import {
  BUILT_IN_TREC_FORM_VERSIONS,
  BUILT_IN_TREC_FORM_VERSION,
  type TrecFormVersion,
} from '@/lib/trec-form-versions';
import type { TrecFormFieldDefinition, TrecFormFieldType } from '@/lib/trec-20-19-fields';

type TrecFormVersionRow = {
  id: string;
  form_family: string;
  form_number: string;
  title: string;
  effective_date: string | Date;
  pdf_url: string;
  page_count: number;
  field_catalog: unknown;
  page_sections: unknown;
  is_active: boolean;
  created_at: string | Date;
};

let schemaPromise: Promise<void> | null = null;

export function ensureTrecFormVersionsSchema(): Promise<void> {
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS trec_form_versions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        form_family TEXT NOT NULL,
        form_number TEXT NOT NULL,
        title TEXT NOT NULL,
        effective_date DATE NOT NULL,
        pdf_url TEXT NOT NULL,
        page_count INTEGER NOT NULL CHECK (page_count > 0),
        field_catalog JSONB NOT NULL DEFAULT '[]'::jsonb,
        page_sections JSONB NOT NULL DEFAULT '{}'::jsonb,
        is_active BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (form_number, effective_date)
      )
    `);
    await query(`
      ALTER TABLE trec_form_versions
      ADD COLUMN IF NOT EXISTS form_family TEXT,
      ADD COLUMN IF NOT EXISTS title TEXT
    `);
    await query(`
      UPDATE trec_form_versions
      SET form_family = COALESCE(NULLIF(form_family, ''), split_part(form_number, '-', 1)),
          title = COALESCE(NULLIF(title, ''), 'Official TREC ' || form_number)
      WHERE form_family IS NULL OR form_family = '' OR title IS NULL OR title = ''
    `);
    await query('ALTER TABLE trec_form_versions ALTER COLUMN form_family SET NOT NULL');
    await query('ALTER TABLE trec_form_versions ALTER COLUMN title SET NOT NULL');
    await query('DROP INDEX IF EXISTS trec_form_versions_one_active_idx');
    await query(`
      CREATE UNIQUE INDEX IF NOT EXISTS trec_form_versions_one_active_per_family_idx
      ON trec_form_versions (form_family)
      WHERE is_active = true
    `);
  })().catch((error) => {
    schemaPromise = null;
    throw error;
  });
  return schemaPromise;
}

function dateValue(value: string | Date): string {
  return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

function timestampValue(value: string | Date): string {
  return typeof value === 'string' ? value : value.toISOString();
}

function isFieldType(value: unknown): value is TrecFormFieldType {
  return value === 'text' || value === 'checkbox' || value === 'radio' || value === 'choice';
}

function parseFields(value: unknown): TrecFormFieldDefinition[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const field = entry as Record<string, unknown>;
    if (
      typeof field.id !== 'string'
      || typeof field.page !== 'number'
      || typeof field.index !== 'number'
      || !isFieldType(field.type)
      || typeof field.label !== 'string'
      || typeof field.pdfFieldName !== 'string'
    ) return [];
    return [field as TrecFormFieldDefinition];
  });
}

function parsePageSections(value: unknown): Record<number, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, section]) => typeof section === 'string')
      .map(([page, section]) => [Number(page), section]),
  );
}

function toVersion(row: TrecFormVersionRow): TrecFormVersion {
  return {
    id: row.id,
    formFamily: row.form_family,
    formNumber: row.form_number,
    title: row.title,
    effectiveDate: dateValue(row.effective_date),
    pdfUrl: row.pdf_url,
    pageCount: row.page_count,
    fields: parseFields(row.field_catalog),
    pageSections: parsePageSections(row.page_sections),
    isActive: row.is_active,
    createdAt: timestampValue(row.created_at),
  };
}

export async function listTrecFormVersions(): Promise<TrecFormVersion[]> {
  await ensureTrecFormVersionsSchema();
  const rows = await query<TrecFormVersionRow>(`
    SELECT id, form_family, form_number, title, effective_date, pdf_url, page_count, field_catalog,
           page_sections, is_active, created_at
    FROM trec_form_versions
    ORDER BY is_active DESC, effective_date DESC, created_at DESC
  `);
  const versions = rows.map(toVersion);
  const activeFamilies = new Set(versions.filter((version) => version.isActive).map((version) => version.formFamily));
  return [
    ...versions,
    ...BUILT_IN_TREC_FORM_VERSIONS.map((version) => ({
      ...version,
      isActive: !activeFamilies.has(version.formFamily),
    })),
  ];
}

export async function getActiveTrecFormVersion(formFamily = '20'): Promise<TrecFormVersion> {
  await ensureTrecFormVersionsSchema();
  const rows = await query<TrecFormVersionRow>(`
    SELECT id, form_family, form_number, title, effective_date, pdf_url, page_count, field_catalog,
           page_sections, is_active, created_at
    FROM trec_form_versions
    WHERE is_active = true AND form_family = $1
    LIMIT 1
  `, [formFamily]);
  return rows[0]
    ? toVersion(rows[0])
    : BUILT_IN_TREC_FORM_VERSIONS.find((version) => version.formFamily === formFamily) ?? BUILT_IN_TREC_FORM_VERSION;
}

export async function getTrecFormVersion(id: string): Promise<TrecFormVersion | null> {
  const builtIn = BUILT_IN_TREC_FORM_VERSIONS.find((version) => version.id === id);
  if (builtIn) return builtIn;
  await ensureTrecFormVersionsSchema();
  const rows = await query<TrecFormVersionRow>(
    `SELECT id, form_family, form_number, title, effective_date, pdf_url, page_count, field_catalog,
            page_sections, is_active, created_at
     FROM trec_form_versions
     WHERE id = $1
     LIMIT 1`,
    [id],
  );
  return rows[0] ? toVersion(rows[0]) : null;
}

export async function createTrecFormVersion(input: {
  formFamily: string;
  formNumber: string;
  title: string;
  effectiveDate: string;
  pdfUrl: string;
  pageCount: number;
  fields: TrecFormFieldDefinition[];
  activate: boolean;
}): Promise<TrecFormVersion> {
  await ensureTrecFormVersionsSchema();
  return withNeonTransaction(async (client) => {
    if (input.activate) {
      await client.query(
        'UPDATE trec_form_versions SET is_active = false, updated_at = NOW() WHERE is_active = true AND form_family = $1',
        [input.formFamily],
      );
    }
    const pageSections = Object.fromEntries(
      Array.from({ length: input.pageCount }, (_, index) => [index + 1, `Official TREC page ${index + 1}`]),
    );
    const result = await client.query<TrecFormVersionRow>(
      `INSERT INTO trec_form_versions
        (form_family, form_number, title, effective_date, pdf_url, page_count, field_catalog, page_sections, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9)
       RETURNING id, form_family, form_number, title, effective_date, pdf_url, page_count, field_catalog,
                 page_sections, is_active, created_at`,
      [
        input.formFamily,
        input.formNumber,
        input.title,
        input.effectiveDate,
        input.pdfUrl,
        input.pageCount,
        JSON.stringify(input.fields),
        JSON.stringify(pageSections),
        input.activate,
      ],
    );
    return toVersion(result.rows[0]);
  });
}

export async function activateTrecFormVersion(id: string): Promise<TrecFormVersion | null> {
  await ensureTrecFormVersionsSchema();
  const builtIn = BUILT_IN_TREC_FORM_VERSIONS.find((version) => version.id === id);
  if (builtIn) {
    await query(
      'UPDATE trec_form_versions SET is_active = false, updated_at = NOW() WHERE is_active = true AND form_family = $1',
      [builtIn.formFamily],
    );
    return builtIn;
  }
  return withNeonTransaction(async (client) => {
    const familyResult = await client.query<{ form_family: string }>(
      'SELECT form_family FROM trec_form_versions WHERE id = $1 LIMIT 1',
      [id],
    );
    if (!familyResult.rows[0]) throw new Error('TREC form version not found');
    await client.query(
      'UPDATE trec_form_versions SET is_active = false, updated_at = NOW() WHERE is_active = true AND form_family = $1',
      [familyResult.rows[0].form_family],
    );
    const result = await client.query<TrecFormVersionRow>(
      `UPDATE trec_form_versions
       SET is_active = true, updated_at = NOW()
       WHERE id = $1
       RETURNING id, form_family, form_number, title, effective_date, pdf_url, page_count, field_catalog,
                 page_sections, is_active, created_at`,
      [id],
    );
    if (!result.rows[0]) throw new Error('TREC form version not found');
    return toVersion(result.rows[0]);
  });
}
