import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import {
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
} from 'pdf-lib';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import {
  activateTrecFormVersion,
  createTrecFormVersion,
  listTrecFormVersions,
} from '@/lib/server/trec-form-versions';
import type { TrecFormFieldDefinition, TrecFormFieldType } from '@/lib/trec-20-19-fields';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FILE_BYTES = 30 * 1024 * 1024;

function fieldType(field: unknown): TrecFormFieldType {
  if (field instanceof PDFCheckBox) return 'checkbox';
  if (field instanceof PDFRadioGroup) return 'radio';
  if (field instanceof PDFDropdown || field instanceof PDFOptionList) return 'choice';
  return 'text';
}

function safeSegment(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'trec-form';
}

function formFamilyFromNumber(formNumber: string): string {
  const normalized = formNumber.trim().toUpperCase().replace(/\s+/g, '-');
  const segments = normalized.split('-').filter(Boolean);
  if (segments.length < 2) return normalized;
  return segments.slice(0, -1).join('-');
}

async function extractFieldCatalog(buffer: Buffer, formFamily: string): Promise<{
  pageCount: number;
  fields: TrecFormFieldDefinition[];
}> {
  const document = await PDFDocument.load(buffer, { ignoreEncryption: false });
  const pages = document.getPages();
  const pageByReference = new Map(pages.map((page, index) => [page.ref.toString(), index + 1]));
  const fields = document.getForm().getFields().map((field, index) => {
    const widget = field.acroField.getWidgets()[0];
    const page = pageByReference.get(widget?.P()?.toString() ?? '') ?? 1;
    const pdfFieldName = field.getName();
    return {
      id: `trec_${safeSegment(formFamily).replace(/-/g, '_')}_p${String(page).padStart(2, '0')}_f${String(index + 1).padStart(3, '0')}`,
      page,
      index: index + 1,
      type: fieldType(field),
      label: pdfFieldName,
      pdfFieldName,
    };
  });
  if (!fields.length) throw new Error('The PDF does not contain fillable form controls.');
  return { pageCount: pages.length, fields };
}

export async function GET() {
  if (!(await getCurrentAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ versions: await listTrecFormVersions() });
}

export async function POST(request: NextRequest) {
  if (!(await getCurrentAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const formNumber = String(formData.get('formNumber') ?? '').trim();
    const title = String(formData.get('title') ?? '').trim() || `Official TREC ${formNumber}`;
    const effectiveDate = String(formData.get('effectiveDate') ?? '').trim();
    const activate = formData.get('activate') !== 'false';
    if (!(file instanceof File)) return NextResponse.json({ error: 'Choose the official fillable PDF.' }, { status: 400 });
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Only an official PDF can be uploaded.' }, { status: 400 });
    }
    if (!formNumber) return NextResponse.json({ error: 'Form number is required.' }, { status: 400 });
    const formFamily = formFamilyFromNumber(formNumber);
    if (!formFamily) return NextResponse.json({ error: 'Use a valid TREC form number, such as 20-20, 40-12, or 49-2.' }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
      return NextResponse.json({ error: 'Effective date is required.' }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: 'The PDF must be 30 MB or smaller.' }, { status: 413 });

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.subarray(0, 4).toString() !== '%PDF') {
      return NextResponse.json({ error: 'The selected file is not a valid PDF.' }, { status: 400 });
    }
    const catalog = await extractFieldCatalog(buffer, formFamily);
    const blob = await put(
      `official-forms/trec/${safeSegment(formNumber)}-${effectiveDate}-${Date.now()}.pdf`,
      buffer,
      { access: 'public', contentType: 'application/pdf' },
    );
    const version = await createTrecFormVersion({
      formFamily,
      formNumber,
      title,
      effectiveDate,
      pdfUrl: blob.url,
      pageCount: catalog.pageCount,
      fields: catalog.fields,
      activate,
    });
    return NextResponse.json({ version }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not upload the TREC form.';
    const status = message.includes('duplicate key') ? 409 : 500;
    return NextResponse.json({ error: status === 409 ? 'That form number and effective date already exist.' : message }, { status });
  }
}

export async function PATCH(request: NextRequest) {
  if (!(await getCurrentAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body: unknown = await request.json();
    const id = body && typeof body === 'object' && 'id' in body ? String((body as { id?: unknown }).id ?? '') : '';
    if (!id) return NextResponse.json({ error: 'Form version is required.' }, { status: 400 });
    const version = await activateTrecFormVersion(id);
    return NextResponse.json({ version });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not activate the TREC form.';
    return NextResponse.json({ error: message }, { status: message.includes('not found') ? 404 : 500 });
  }
}
