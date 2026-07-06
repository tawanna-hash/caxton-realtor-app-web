import { NextResponse, type NextRequest } from "next/server";
import { handlers, INTERNAL_TRUSTED_PROVIDER_ID } from "@/lib/server/auth/authjs";

export const runtime = "nodejs";

export const POST = handlers.POST;

// Auth.js has no built-in way to hide a provider from the
// /api/auth/providers listing (@auth/core/lib/pages/index.js's providers()
// unconditionally maps every registered provider), so the internal-trusted
// provider (see lib/server/auth/authjs.ts) is stripped here instead. This
// is defense-in-depth / discoverability only — the real security boundary
// is that provider's authorize() requiring a valid signed token, not this
// filter.
export async function GET(req: NextRequest) {
  const res = await handlers.GET(req);

  const url = new URL(req.url);
  if (!url.pathname.endsWith("/providers")) return res;

  const body = await res.json();
  delete body[INTERNAL_TRUSTED_PROVIDER_ID];
  return NextResponse.json(body, { status: res.status, headers: res.headers });
}
