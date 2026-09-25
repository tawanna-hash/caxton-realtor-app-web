import { getSql } from '@/lib/db';
import { ensureHotspotWorkspace } from './hotspot-workspace';
import { extractPdfLinkAnnotations, extractPdfTextContacts, extractQrCodes, insertExtracted, type AdvertiserLite, type ExtractedHotspot } from './hotspot-extractors';
import { extractVisualHotspots } from './hotspot-vision';
import { nearOcrDuplicate, overlapRatio } from '@/lib/hotspot-review';

export async function prepareHotspotScan(id: number) {
  await ensureHotspotWorkspace();
  const sql = getSql();
  const mags = await sql`SELECT id, reader_url, page_urls, page_count, publication FROM magazines WHERE id = ${id}`;
  if (!mags.length) throw new Error('Issue not found');
  const mag = mags[0];
  const pages = (Array.isArray(mag.page_urls) ? mag.page_urls : []) as string[];
  const pageCount = Number(mag.page_count);
  if (!pageCount) throw new Error('Upload magazine pages first');
  const advertisers = await sql`SELECT id, name, slug, website, avatar_url FROM advertisers
    WHERE publication = ${mag.publication} OR publication = 'both'` as unknown as AdvertiserLite[];
  const warnings: string[] = [];
  let links: ExtractedHotspot[] = [], text: ExtractedHotspot[] = [];
  if (mag.reader_url) {
    try {
      const response = await fetch(String(mag.reader_url), { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`PDF unavailable (${response.status})`);
      const buffer = await response.arrayBuffer();
      [links, text] = await Promise.all([
        extractPdfLinkAnnotations(buffer).catch(() => { warnings.push('Embedded PDF link scan failed'); return []; }),
        extractPdfTextContacts(buffer).catch(() => { warnings.push('PDF text scan failed; image recognition is still attempted'); return []; }),
      ]);
    } catch (err) { warnings.push(err instanceof Error ? err.message : 'PDF scan failed'); }
  }
  return { id, pages, pageCount, advertisers, warnings, links, text };
}

export async function scanHotspotPage(scan: Awaited<ReturnType<typeof prepareHotspotScan>>, pageIdx: number, adminEmail: string | null) {
  if (!Number.isInteger(pageIdx) || pageIdx < 0 || pageIdx >= scan.pageCount) throw new Error('Invalid page');
  const sql = getSql();
  const warnings = [...scan.warnings];
  const lease = await sql`INSERT INTO magazine_hotspot_scans (magazine_id, page_idx, status)
    VALUES (${scan.id}, ${pageIdx}, 'running')
    ON CONFLICT (magazine_id, page_idx) DO UPDATE SET status = 'running', updated_at = NOW()
    WHERE magazine_hotspot_scans.status != 'running' OR magazine_hotspot_scans.updated_at < NOW() - INTERVAL '5 minutes'
    RETURNING page_idx`;
  if (!lease.length) throw new Error('This page is already being scanned. Refresh after the current scan finishes.');
  try {
  const imageUrl = scan.pages[pageIdx];
  const qrUrls = Array.from({ length: pageIdx + 1 }, (_, i) => i === pageIdx ? imageUrl || '' : '');
  let qr: ExtractedHotspot[] = [], vision: ExtractedHotspot[] = [];
  if (imageUrl) {
    [qr, vision] = await Promise.all([
      extractQrCodes(qrUrls).catch(err => { warnings.push(`QR decode: ${err.message || 'failed'}`); return []; }),
      extractVisualHotspots(imageUrl, pageIdx, scan.advertisers).catch(err => { warnings.push(err.message || 'Image recognition failed'); return []; }),
    ]);
  } else warnings.push('Page image missing; QR and image text/logo scans could not run');
  // Do not add a needs-match visual QR over a successfully decoded QR.
  vision = vision.filter(v => !v.label.startsWith('QR Code') || !qr.some(q => overlapRatio(q, v) > 0.3));
  const pdfContacts = [...scan.links, ...scan.text].filter(r => r.page_idx === pageIdx);
  vision = vision.filter(v => !pdfContacts.some(p => nearOcrDuplicate(p, v)));
  const rows = [...scan.links.filter(r => r.page_idx === pageIdx), ...scan.text.filter(r => r.page_idx === pageIdx), ...qr, ...vision];
  const result = await insertExtracted(sql, rows, {
    magazineId: scan.id, adminEmail, advertisers: scan.advertisers, pageCount: scan.pageCount, wipeImports: false,
  });
  await sql`UPDATE magazine_hotspot_scans SET status = ${warnings.length ? 'partial' : 'complete'},
    warnings = ${JSON.stringify(warnings)}::jsonb, found = ${rows.length}, updated_at = NOW()
    WHERE magazine_id = ${scan.id} AND page_idx = ${pageIdx}`;
  return { page_idx: pageIdx, warnings, found: rows.length, ...result };
  } catch (err) {
    await sql`UPDATE magazine_hotspot_scans SET status = 'failed',
      warnings = ${JSON.stringify([err instanceof Error ? err.message : 'Scan failed'])}::jsonb, updated_at = NOW()
      WHERE magazine_id = ${scan.id} AND page_idx = ${pageIdx}`;
    throw err;
  }
}
