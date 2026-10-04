import {
  PDFCheckBox, PDFDocument, PDFDropdown, PDFOptionList, PDFRadioGroup, PDFTextField,
} from 'pdf-lib';
import { query } from '@/lib/server/db/neon';
import type { TrecFormVersion } from '@/lib/trec-form-versions';
import type { TrecFormFieldDefinition, TrecFormFieldType } from '@/lib/trec-20-19-fields';

export type CustomFormRow = {
  id: string; section: string; title: string; filename: string; url: string; size_bytes: number;
  created_at: string; page_count: number | null; field_catalog: TrecFormFieldDefinition[] | null;
};

let schemaReady: Promise<void> | undefined;

export function ensureCustomFormsTable(): Promise<void> {
  if (!schemaReady) schemaReady = (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS closing_time_custom_forms (
        id UUID PRIMARY KEY,
        owner_id UUID NOT NULL REFERENCES realtors(id) ON DELETE CASCADE,
        section TEXT NOT NULL,
        title TEXT NOT NULL,
        filename TEXT NOT NULL,
        url TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await query(`ALTER TABLE closing_time_custom_forms ADD COLUMN IF NOT EXISTS page_count INTEGER`);
    await query(`ALTER TABLE closing_time_custom_forms ADD COLUMN IF NOT EXISTS field_catalog JSONB`);
    await query(`CREATE INDEX IF NOT EXISTS closing_time_custom_forms_owner_idx ON closing_time_custom_forms (owner_id, section, created_at DESC)`);
  })().catch((error: unknown) => { schemaReady = undefined; throw error; });
  return schemaReady;
}

function fieldType(field: unknown): TrecFormFieldType | null {
  if (field instanceof PDFTextField) return 'text';
  if (field instanceof PDFCheckBox) return 'checkbox';
  if (field instanceof PDFRadioGroup) return 'radio';
  if (field instanceof PDFDropdown || field instanceof PDFOptionList) return 'choice';
  return null;
}

/** Reads the fillable (AcroForm) fields from a PDF in the same shape the TREC forms use. */
export async function extractPdfFields(bytes: Uint8Array, familyKey: string): Promise<{ pageCount: number; fields: TrecFormFieldDefinition[] }> {
  const document = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = document.getPages();
  const safe = familyKey.replace(/[^a-z0-9]/gi, '_');
  let fields: TrecFormFieldDefinition[] = [];
  try {
    fields = document.getForm().getFields().flatMap((field, index) => {
      const type = fieldType(field);
      if (!type) return [];
      const widget = field.acroField.getWidgets()[0];
      const page = widget ? pages.findIndex((candidate) => candidate.ref === widget.P()) + 1 : 1;
      return [{
        id: `custom_${safe}_p${String(Math.max(page, 1)).padStart(2, '0')}_f${String(index + 1).padStart(3, '0')}`,
        page: Math.max(page, 1), index: index + 1, type, label: field.getName(), pdfFieldName: field.getName(),
      }];
    });
  } catch { fields = []; }
  return { pageCount: document.getPageCount(), fields };
}

export const customFamily = (id: string) => `custom-${id}`;

/** Lists the owner's uploaded forms as fillable TREC-style form versions. */
export async function listCustomFormVersions(ownerId: string): Promise<TrecFormVersion[]> {
  await ensureCustomFormsTable();
  const rows = await query<CustomFormRow>(
    `SELECT id, section, title, filename, url, size_bytes, created_at, page_count, field_catalog
     FROM closing_time_custom_forms WHERE owner_id = $1 ORDER BY created_at DESC LIMIT 500`,
    [ownerId],
  );
  const versions: TrecFormVersion[] = [];
  for (const row of rows) {
    let { page_count: pageCount, field_catalog: fields } = row;
    if (pageCount === null || fields === null) {
      // Forms uploaded before field detection: read the PDF once and save the result.
      try {
        const res = await fetch(row.url);
        const parsed = await extractPdfFields(new Uint8Array(await res.arrayBuffer()), row.id.slice(0, 8));
        pageCount = parsed.pageCount; fields = parsed.fields;
        await query(`UPDATE closing_time_custom_forms SET page_count = $2, field_catalog = $3::jsonb WHERE id = $1`, [row.id, pageCount, JSON.stringify(fields)]);
      } catch { continue; }
    }
    if (!fields.length) continue; // flat PDFs cannot be filled in
    versions.push({
      id: `custom-${row.id}`,
      formFamily: customFamily(row.id),
      formNumber: row.section === 'brokerage' ? 'Brokerage' : 'Uploaded',
      title: row.title,
      effectiveDate: new Date(row.created_at).toISOString().slice(0, 10),
      pdfUrl: `/api/agent-command-center/forms-library?file=${row.id}`,
      pageCount: pageCount ?? 1,
      fields,
      pageSections: Object.fromEntries(Array.from({ length: pageCount ?? 1 }, (_, i) => [i + 1, `Page ${i + 1}`])),
      isActive: true,
      createdAt: new Date(row.created_at).toISOString(),
    });
  }
  return versions;
}
