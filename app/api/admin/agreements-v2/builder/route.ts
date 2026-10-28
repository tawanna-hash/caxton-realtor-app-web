// app/api/admin/agreements-v2/builder/route.ts — single-page builder support.
//
//   GET            -> product catalog, saved drafts, saved templates, intro templates
//   GET ?id=<uuid> -> one draft or template
//   POST { action: 'save', id?, kind, name, doc }  -> upsert a draft or template
//   POST { action: 'delete', id }                  -> remove one
//   POST { action: 'timeline', doc }               -> billing timelines for the document

import { loadPaymentSettings } from '@/lib/server/payment-settings';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { getSql, ensureSchema } from '@/lib/db';
import { APP_AD_SLOTS, EBLASTS, PACKAGES, eblastPriceForPub, weeklyRateForMarkets } from '@/lib/media-kit';
import { deleteDraft, duplicateDraft, getDraft, listDrafts, saveDraft, setDraftKind } from '@/lib/agreements-v2/builder';
import { docDates, docTotalCents, type BuilderDoc, type Catalog } from '@/lib/agreements-v2/builder-doc';
import { getDefaults } from '@/lib/agreements-v2/settings';
import { cleanBilling, cleanPayment, invoiceRows, planServiceBilling, summarize, termMonths } from '@/lib/agreements-v2/service-billing';
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
  await loadPaymentSettings();
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
      // Autosaved builder drafts plus agreements that were created but never sent.
      drafts: [
        ...(await listDrafts('draft', sql)),
        ...((await sql`
          SELECT 'ag:' || ag.id::text AS id, 'draft' AS kind,
                 COALESCE(NULLIF(ag.company_name, ''), adv.name, 'Agreement') AS name,
                 COALESCE(ag.updated_at, ag.created_at) AS updated_at,
                 ag.advertiser_id
            FROM agreements ag
            LEFT JOIN advertisers adv ON adv.id = ag.advertiser_id
           WHERE ag.status = 'draft'
           ORDER BY COALESCE(ag.updated_at, ag.created_at) DESC
           LIMIT 100
        `) as unknown as Array<Record<string, unknown>>),
      ],
      templates: await listDrafts('template', sql),
      archived: await listDrafts('archived', sql),
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
    if ((body.action === 'archive' || body.action === 'restore') && typeof body.id === 'string') {
      await setDraftKind(body.id, body.action === 'archive' ? 'archived' : 'draft', sql);
      return NextResponse.json({ ok: true });
    }
    if (body.action === 'duplicate' && typeof body.id === 'string') {
      const id = await duplicateDraft(body.id, sql);
      return id ? NextResponse.json({ id }) : NextResponse.json({ error: 'not found' }, { status: 404 });
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
      const { start } = docDates(doc, sign);
      const defaults = await getDefaults(sql);
      const pay = cleanPayment(doc.payment);
      const dueDays = pay.due_days ?? defaults.due_days ?? 20;
      const billingDay = typeof defaults.billing_day === 'number' ? defaults.billing_day : Math.min(28, Math.max(1, Number(start.slice(8, 10)) || 1));
      const plans = doc.services.map((sv) =>
        planServiceBilling({ label: sv.name || 'Service', total_cents: sv.price_cents, billing: { ...cleanBilling(sv.billing), term_months: termMonths(sv) } }, { start, billing_day: billingDay, increase_pct: pay.annual_increase_pct }));
      const invoices = invoiceRows(plans, dueDays);
      const sum = summarize(plans, invoices);
      if (!sum.first_invoice) return NextResponse.json({ ok: false, reason: 'Every service is billed manually, so nothing is scheduled. Choose a start option on a service to see invoices.' });
      return NextResponse.json({
        ok: true,
        first_invoice: sum.first_invoice,
        recurring_annual_cents: sum.recurring_annual_cents,
        total_cents: sum.total_cents,
        invoices,
        services: plans.map((p) => ({ label: p.label, manual: p.manual, dates: p.dates })),
        manual_labels: sum.manual_labels,
        due_days: dueDays,
        card_today_cents: withSurcharge(total),
      });
    }
    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: 'failed', detail: err instanceof Error ? err.message : 'error' }, { status: 500 });
  }
});
