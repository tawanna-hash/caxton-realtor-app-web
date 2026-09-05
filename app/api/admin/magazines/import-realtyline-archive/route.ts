import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import archiveData from '@/data/imports/realtyline-issues-20260905.json';
import { getSql } from '@/lib/db';
import { requireAdmin } from '@/lib/server/auth/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type ArchiveIssue = {
  legacyId: string;
  publication: 'austin';
  year: number;
  month: number;
  issueLabel: string;
  sortDate: string;
  sourcePdfUrl: string | null;
  sourceCoverUrl: string;
  legacyViewerUrl: string;
  forceCover?: boolean;
};

const issues = (archiveData as ArchiveIssue[]).slice().sort(
  (a, b) => b.year - a.year || b.month - a.month,
);

function isBlobUrl(url: unknown): boolean {
  return typeof url === 'string' && url.includes('.public.blob.vercel-storage.com/');
}

function extensionFor(url: string, fallback: string): string {
  try {
    const match = new URL(url).pathname.match(/\.([a-z0-9]{2,5})$/i);
    return match?.[1]?.toLowerCase() || fallback;
  } catch {
    return fallback;
  }
}

async function migrateAsset(
  sourceUrl: string,
  pathname: string,
): Promise<{ url: string; warning?: string }> {
  if (isBlobUrl(sourceUrl)) return { url: sourceUrl };

  try {
    const response = await fetch(sourceUrl, {
      cache: 'no-store',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; RealtyNewsNowArchiveImporter/1.0; +https://realtynewsnow.app)',
      },
      signal: AbortSignal.timeout(240_000),
    });
    if (!response.ok || !response.body) {
      throw new Error(`source returned ${response.status}`);
    }

    const blob = await put(pathname, response.body, {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: response.headers.get('content-type') || undefined,
    });
    return { url: blob.url };
  } catch (error) {
    return {
      url: sourceUrl,
      warning: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { index?: number };
  const index = Math.max(0, Math.floor(Number(body.index) || 0));
  const issue = issues[index];
  if (!issue) {
    return NextResponse.json({ complete: true, total: issues.length });
  }

  const sql = getSql();
  const existingRows = await sql`
    SELECT id, cover_url, reader_url, page_urls, page_count
      FROM magazines
     WHERE publication = ${issue.publication}
       AND year = ${issue.year}
       AND month = ${issue.month}
     LIMIT 1
  `;
  const existing = existingRows[0];

  if (
    existing &&
    !issue.forceCover &&
    isBlobUrl(existing.cover_url) &&
    (isBlobUrl(existing.reader_url) || !issue.sourcePdfUrl) &&
    Number(existing.page_count) > 0
  ) {
    return NextResponse.json({
      ok: true,
      status: 'preserved',
      issue: issue.issueLabel,
      id: existing.id,
      index,
      nextIndex: index + 1,
      total: issues.length,
      complete: index + 1 >= issues.length,
      warnings: [],
    });
  }

  const archiveRoot = `magazines/austin/archive/${issue.year}-${String(issue.month).padStart(2, '0')}`;
  const warnings: string[] = [];

  let coverUrl = String(existing?.cover_url || '');
  if (issue.forceCover || !isBlobUrl(coverUrl)) {
    const coverExt = extensionFor(issue.sourceCoverUrl, 'jpg');
    const migratedCover = await migrateAsset(
      issue.sourceCoverUrl,
      `${archiveRoot}/cover.${coverExt}`,
    );
    coverUrl = migratedCover.url;
    if (migratedCover.warning) warnings.push(`cover: ${migratedCover.warning}`);
  }

  let readerUrl = String(existing?.reader_url || '');
  if (issue.sourcePdfUrl && !isBlobUrl(readerUrl)) {
    const migratedPdf = await migrateAsset(issue.sourcePdfUrl, `${archiveRoot}/issue.pdf`);
    readerUrl = migratedPdf.url;
    if (migratedPdf.warning) warnings.push(`PDF: ${migratedPdf.warning}`);
  } else if (!readerUrl) {
    readerUrl = issue.legacyViewerUrl;
  }

  let id: number;
  let status: 'inserted' | 'updated';
  if (existing) {
    const rows = await sql`
      UPDATE magazines
         SET issue_label = ${issue.issueLabel},
             sort_date = ${issue.sortDate},
             cover_url = ${coverUrl},
             reader_url = ${readerUrl},
             page_urls = CASE
               WHEN COALESCE(page_count, 0) > 0 THEN page_urls
               ELSE ARRAY[${coverUrl}]::text[]
             END,
             page_count = CASE
               WHEN COALESCE(page_count, 0) > 0 THEN page_count
               ELSE 1
             END
       WHERE id = ${existing.id}
       RETURNING id
    `;
    id = Number(rows[0].id);
    status = 'updated';
  } else {
    const rows = await sql`
      INSERT INTO magazines (
        publication, year, month, issue_label, sort_date,
        cover_url, reader_url, page_urls, page_count, page_texts
      ) VALUES (
        ${issue.publication}, ${issue.year}, ${issue.month}, ${issue.issueLabel}, ${issue.sortDate},
        ${coverUrl}, ${readerUrl}, ARRAY[${coverUrl}]::text[], 1, '[]'::jsonb
      )
      RETURNING id
    `;
    id = Number(rows[0].id);
    status = 'inserted';
  }

  return NextResponse.json({
    ok: true,
    status,
    issue: issue.issueLabel,
    id,
    index,
    nextIndex: index + 1,
    total: issues.length,
    complete: index + 1 >= issues.length,
    warnings,
  });
}
