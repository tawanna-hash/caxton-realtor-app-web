import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sql = getSql();
  const results: string[] = [];

  try { await sql`ALTER TABLE magazines ADD COLUMN IF NOT EXISTS page_texts JSONB DEFAULT '[]'::jsonb`; results.push('page_texts: ok'); } catch (e: unknown) { results.push('page_texts: ' + (e instanceof Error ? e.message : String(e))); }
  try { await sql`ALTER TABLE magazines ADD COLUMN IF NOT EXISTS publication TEXT`; results.push('publication: ok'); } catch (e: unknown) { results.push('publication: ' + (e instanceof Error ? e.message : String(e))); }
  try { await sql`ALTER TABLE magazines ADD COLUMN IF NOT EXISTS sort_date DATE`; results.push('sort_date: ok'); } catch (e: unknown) { results.push('sort_date: ' + (e instanceof Error ? e.message : String(e))); }
  try { await sql`ALTER TABLE magazines ADD COLUMN IF NOT EXISTS reader_url TEXT`; results.push('reader_url: ok'); } catch (e: unknown) { results.push('reader_url: ' + (e instanceof Error ? e.message : String(e))); }
  try { await sql`ALTER TABLE magazines ADD COLUMN IF NOT EXISTS page_urls TEXT[] DEFAULT '{}'`; results.push('page_urls: ok'); } catch (e: unknown) { results.push('page_urls: ' + (e instanceof Error ? e.message : String(e))); }
  try { await sql`ALTER TABLE magazines ADD COLUMN IF NOT EXISTS page_count INT DEFAULT 0`; results.push('page_count: ok'); } catch (e: unknown) { results.push('page_count: ' + (e instanceof Error ? e.message : String(e))); }

  const cols = await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'magazines' ORDER BY ordinal_position`;

  return NextResponse.json({ results, columns: cols });
}
