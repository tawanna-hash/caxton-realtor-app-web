// app/api/admin/agreements-v2/builder/route.ts — single-page builder support.
//
//   GET            -> product catalog, saved drafts, saved templates, intro templates
//   GET ?id=<uuid> -> one draft or template
//   POST { action: 'save', id?, kind, name, doc }  -> upsert a draft or template
//   POST { action: 'delete', id }                  -> remove one
//   POST { action: 'timeline', doc }               -> billing timelines for the document

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { getSql, ensureSchema } from '@/lib/db';
import { APP_AD_SLOTS, EBLASTS, PACKAGES, eblastPriceForPub, weeklyRateForMarkets } from '@/lib/media-kit';
import { deleteDraft, getDraft, listDrafts, saveDraft } from '@/lib/agreements-v2/builder';
import { docDates, docTotalCents, type BuilderDoc, type Catalog } from '@/lib/agreements-v2/builder-doc';
import { getDefaults } from '@/lib/agreements-v2/settings';
import { planDraftSchedule } from '@/lib/agreements-v2/recurring-draft';
import { withSurcharge } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const eblastId = (name: string) => name.toLowerCase().replace(/\s+/g, '');

function buildCatalog(): Catalog {
  return {
    print: PACKAGES.filter((p) => p.sizes.length > 0).map((p) => ({ id: p.id, name: p.name, sizes: p.sizes.map((s) => ({ size: s.size, price: s.price })) })),
    email: EBLASTS.map((e) => ({
      id: eblastId(e.name),
      name: e.name,
      sends: e.sends,
      price: { austin: eblastPriceForPub(e, 'realtyline'), san_antonio: eblastPriceForPub(e, 'newsline'), both: eblastPriceForPub(e, 'both') },
    })),
    app: APP_AD_SLOTS.map((s) => ({
      slug: s.slug,
      name: s.name,
      weekly: { 1: weeklyRateForMarkets(s, 1), 2: weeklyRateForMarkets(s, 2), 3: weeklyRateForMarkets(s, 3), 4: weeklyRateForMarkets(s, 4) },
    })),
  };
}

export async function GET(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    await ensureSchema();
    const id = req.nextUrl.searchParams.get('id');
    if (id) {
      const d = await getDraft(id);
      return d ? NextResponse.json({ draft: d }) : NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    const sql = getSql();
    const defaults = await getDefaults(sql);
    return NextResponse.json({
      catalog: buildCatalog(),
      drafts: await listDrafts('draft', sql),
      templates: await listDrafts('template', sql),
      intros: { new_partner: defaults.intro_new, renewal: defaults.intro_renewal },
      expiry_days: defaults.proposal_expiry_days,
    });
  } catch (err) {
    return NextResponse.json({ error: 'load failed', detail: err instanceof Error ? err.message : 'error' }, { status: 500 });
  }
}

export const POST = withAdminTracking(async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }
  try {
    await ensureSchema();
    const sql = getSql();
    if (body.action === 'delete' && typeof body.id === 'string') {
      await deleteDraft(body.id, sql);
      return NextResponse.json({ ok: true });
    }
    if (body.action === 'save') {
      const doc = body.doc as BuilderDoc | undefined;
      if (!doc || typeof doc !== 'object') return NextResponse.json({ error: 'doc required' }, { status: 400 });
      const kind = body.kind === 'template' ? 'template' : 'draft';
      const name = typeof body.name === 'string' ? body.name : doc.name ?? '';
      if (kind === 'template' && !name.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 });
      const id = await saveDraft({ id: typeof body.id === 'string' ? body.id : null, kind, name, doc }, sql);
      return NextResponse.json({ id });
    }
    if (body.action === 'timeline') {
      const doc = body.doc as BuilderDoc | undefined;
      if (!doc || !Array.isArray(doc.services)) return NextResponse.json({ error: 'doc required' }, { status: 400 });
      const total = docTotalCents(doc);
      if (total <= 0) return NextResponse.json({ ok: false, reason: 'Add a priced service to see the billing timeline.' });
      const sign = typeof body.sign_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.sign_date) ? body.sign_date : new Date().toISOString().slice(0, 10);
      const { start, end } = docDates(doc, sign);
      const defaults = await getDefaults(sql);
      const pseudo = {
        company_name: doc.new_client?.name ?? 'Client', ad_rate_cents: null, amount_cents: total, lines_total: total, frequency: null, ad_size: null,
        start_date: start, end_date: end, billing_email: null, advertiser_email: null, billing_name: null, rep_name: null,
      } as never;
      const planned = planDraftSchedule(pseudo, defaults);
      if (!planned.ok) return NextResponse.json({ ok: false, reason: planned.reason });
      const p = planned.plan;
      const addMonths = (iso: string, n: number) => {
        const d = new Date(`${iso}T00:00:00Z`);
        const day = d.getUTCDate();
        d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n);
        d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()));
        return d.toISOString().slice(0, 10);
      };
      const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
      const invoices = Array.from({ length: p.occurrences }, (_, i) => {
        const date = addMonths(p.first_run_date, i);
        let left = p.amount_cents;
        const items = doc.services.map((sv, k) => {
          const cents = k === doc.services.length - 1 ? left : Math.round((p.amount_cents * sv.price_cents) / total);
          left -= cents;
          return { label: sv.name || 'Service', cents };
        });
        return { date, due: addDays(date, p.due_days), total: p.amount_cents, items };
      });
      return NextResponse.json({
        ok: true,
        first_invoice: { date: invoices[0].date, cents: p.amount_cents },
        recurring_annual_cents: p.amount_cents * 12,
        total_cents: p.amount_cents * p.occurrences,
        invoices,
        due_days: p.due_days,
        card_today_cents: withSurcharge(total),
      });
    }
    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: 'failed', detail: err instanceof Error ? err.message : 'error' }, { status: 500 });
  }
});
