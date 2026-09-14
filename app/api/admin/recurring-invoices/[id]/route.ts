// app/api/admin/recurring-invoices/[id]/route.ts
//
// GET    — single schedule
// PATCH  — update allow-listed fields (pause/resume via status, edit template/cadence)
// DELETE — hard delete (only when status != 'active'; pause first)

import { NextRequest, NextResponse } from "next/server";
import { getSql, ensureSchema } from "@/lib/db";
import {
  RECURRING_SCHEDULE_PATCHABLE_FIELDS,
  RECURRING_SCHEDULE_STATUS_VALUES,
  RECURRING_FREQUENCY_VALUES,
  type RecurringScheduleWithAdvertiser,
} from "@/lib/recurring-invoices";
import { lineItemsTotal, type InvoiceLineItem } from "@/lib/invoices";
import { getCurrentAdmin } from "@/lib/server/auth/admin";
import { withAdminTracking } from "@/lib/server/admin-tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : "unknown error";
}
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id))
    return NextResponse.json({ error: "invalid id" }, { status: 400 });

  try {
    await ensureSchema();
    const sql = getSql();
    const rows = (await sql`
      SELECT s.*, adv.name AS advertiser_name
      FROM recurring_invoice_schedules s
      LEFT JOIN advertisers adv ON adv.id = s.advertiser_id
      WHERE s.id = ${id}
    `) as unknown as RecurringScheduleWithAdvertiser[];
    if (rows.length === 0)
      return NextResponse.json({ error: "not found" }, { status: 404 });

    const invoices = await sql`
      SELECT id, number, status, total_cents, issued_at, due_date, paid_at
      FROM invoices WHERE recurring_schedule_id = ${id}
      ORDER BY created_at DESC
    `;
    return NextResponse.json({
      schedule: rows[0],
      generated_invoices: invoices,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "get failed", detail: errMessage(err) },
      { status: 500 },
    );
  }
}

export const PATCH = withAdminTracking(async function PATCH(
  req: NextRequest,
  ctx: RouteCtx,
) {
  const admin = await getCurrentAdmin();
  if (!admin)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id))
    return NextResponse.json({ error: "invalid id" }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  try {
    await ensureSchema();
    const sql = getSql();
    const existing =
      (await sql`SELECT id FROM recurring_invoice_schedules WHERE id = ${id}`) as unknown as Array<{
        id: string;
      }>;
    if (existing.length === 0)
      return NextResponse.json({ error: "not found" }, { status: 404 });
    if ("line_items" in body && !Array.isArray(body.line_items)) {
      return NextResponse.json(
        { error: "line_items must be an array" },
        { status: 400 },
      );
    }
    for (const field of [
      "auto_send",
      "include_unbilled_charges",
      "print_later",
      "email_reminders",
    ]) {
      if (field in body && typeof body[field] !== "boolean") {
        return NextResponse.json(
          { error: `${field} must be a boolean` },
          { status: 400 },
        );
      }
    }
    if (Array.isArray(body.line_items)) {
      body.amount_cents = lineItemsTotal(body.line_items as InvoiceLineItem[]);
    }

    const updated: string[] = [];
    for (const field of RECURRING_SCHEDULE_PATCHABLE_FIELDS) {
      if (!(field in body)) continue;
      const raw = body[field as keyof typeof body];

      if (
        field === "status" &&
        (typeof raw !== "string" ||
          !RECURRING_SCHEDULE_STATUS_VALUES.has(raw as never))
      )
        return NextResponse.json({ error: "invalid status" }, { status: 400 });
      if (
        field === "frequency" &&
        (typeof raw !== "string" ||
          !RECURRING_FREQUENCY_VALUES.has(raw as never))
      )
        return NextResponse.json(
          { error: "invalid frequency" },
          { status: 400 },
        );
      if (
        [
          "auto_send",
          "include_unbilled_charges",
          "print_later",
          "email_reminders",
        ].includes(field) &&
        typeof raw !== "boolean"
      )
        return NextResponse.json(
          { error: `invalid ${field}` },
          { status: 400 },
        );
      if (field === "line_items" && !Array.isArray(raw))
        return NextResponse.json(
          { error: "line_items must be an array" },
          { status: 400 },
        );

      switch (field) {
        case "name":
          await sql`UPDATE recurring_invoice_schedules SET name = ${raw as string}                              WHERE id = ${id}`;
          break;
        case "status":
          await sql`UPDATE recurring_invoice_schedules SET status = ${raw as string}                            WHERE id = ${id}`;
          break;
        case "frequency":
          await sql`UPDATE recurring_invoice_schedules SET frequency = ${raw as string}                         WHERE id = ${id}`;
          break;
        case "interval_count":
          await sql`UPDATE recurring_invoice_schedules SET interval_count = ${raw as number}                    WHERE id = ${id}`;
          break;
        case "day_of_month":
          await sql`UPDATE recurring_invoice_schedules SET day_of_month = ${raw as number | null}                WHERE id = ${id}`;
          break;
        case "tax_cents":
          await sql`UPDATE recurring_invoice_schedules SET tax_cents = ${raw as number}                          WHERE id = ${id}`;
          break;
        case "line_items":
          await sql`UPDATE recurring_invoice_schedules SET line_items = ${JSON.stringify(raw)}::jsonb WHERE id = ${id}`;
          break;
        case "memo":
          await sql`UPDATE recurring_invoice_schedules SET memo = ${raw as string | null}                        WHERE id = ${id}`;
          break;
        case "bill_to_name":
          await sql`UPDATE recurring_invoice_schedules SET bill_to_name = ${raw as string | null}                WHERE id = ${id}`;
          break;
        case "bill_to_email":
          await sql`UPDATE recurring_invoice_schedules SET bill_to_email = ${raw as string | null}               WHERE id = ${id}`;
          break;
        case "bill_to_address":
          await sql`UPDATE recurring_invoice_schedules SET bill_to_address = ${raw as string | null}             WHERE id = ${id}`;
          break;
        case "auto_send":
          await sql`UPDATE recurring_invoice_schedules SET auto_send = ${raw as boolean}                         WHERE id = ${id}`;
          break;
        case "due_days":
          await sql`UPDATE recurring_invoice_schedules SET due_days = ${raw as number}                           WHERE id = ${id}`;
          break;
        case "create_days_in_advance":
          await sql`UPDATE recurring_invoice_schedules SET create_days_in_advance = ${raw as number}             WHERE id = ${id}`;
          break;
        case "template_mode":
          await sql`UPDATE recurring_invoice_schedules SET template_mode = ${raw as string}                     WHERE id = ${id}`;
          break;
        case "include_unbilled_charges":
          await sql`UPDATE recurring_invoice_schedules SET include_unbilled_charges = ${raw as boolean}        WHERE id = ${id}`;
          break;
        case "print_later":
          await sql`UPDATE recurring_invoice_schedules SET print_later = ${raw as boolean}                       WHERE id = ${id}`;
          break;
        case "email_reminders":
          await sql`UPDATE recurring_invoice_schedules SET email_reminders = ${raw as boolean}                   WHERE id = ${id}`;
          break;
        case "payment_instructions":
          await sql`UPDATE recurring_invoice_schedules SET payment_instructions = ${raw as string | null}        WHERE id = ${id}`;
          break;
        case "note_to_client":
          await sql`UPDATE recurring_invoice_schedules SET note_to_client = ${raw as string | null}              WHERE id = ${id}`;
          break;
        case "statement_memo":
          await sql`UPDATE recurring_invoice_schedules SET statement_memo = ${raw as string | null}              WHERE id = ${id}`;
          break;
        case "end_date":
          await sql`UPDATE recurring_invoice_schedules SET end_date = ${raw as string | null}                    WHERE id = ${id}`;
          break;
        case "max_occurrences":
          await sql`UPDATE recurring_invoice_schedules SET max_occurrences = ${raw as number | null}             WHERE id = ${id}`;
          break;
        case "next_run_at":
          await sql`UPDATE recurring_invoice_schedules SET next_run_at = ${raw as string}                        WHERE id = ${id}`;
          break;
      }
      updated.push(field);
    }

    if (updated.length === 0)
      return NextResponse.json(
        { error: "no patchable fields" },
        { status: 400 },
      );
    await sql`UPDATE recurring_invoice_schedules SET updated_at = NOW() WHERE id = ${id}`;
    const rows =
      await sql`SELECT * FROM recurring_invoice_schedules WHERE id = ${id}`;
    return NextResponse.json({ schedule: rows[0], updated_fields: updated });
  } catch (err) {
    console.error("[admin/recurring-invoices PATCH]", errMessage(err));
    return NextResponse.json(
      { error: "patch failed", detail: errMessage(err) },
      { status: 500 },
    );
  }
});

export const DELETE = withAdminTracking(async function DELETE(
  _req: NextRequest,
  ctx: RouteCtx,
) {
  const admin = await getCurrentAdmin();
  if (!admin)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id))
    return NextResponse.json({ error: "invalid id" }, { status: 400 });

  try {
    await ensureSchema();
    const sql = getSql();
    const rows =
      (await sql`SELECT status FROM recurring_invoice_schedules WHERE id = ${id}`) as unknown as Array<{
        status: string;
      }>;
    if (rows.length === 0)
      return NextResponse.json({ error: "not found" }, { status: 404 });
    if (rows[0].status === "active") {
      return NextResponse.json(
        { error: "pause the schedule before deleting it" },
        { status: 400 },
      );
    }
    await sql`DELETE FROM recurring_invoice_schedules WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: "delete failed", detail: errMessage(err) },
      { status: 500 },
    );
  }
});
