// lib/wave-direct.ts
//
// Direct integration with Wave Accounting's GraphQL API.
// Replaces the Zapier middleman in lib/wave-webhook.ts.
//
// Flow (3 sequential GraphQL calls):
//   1. customerCreate — always create a fresh customer record (Wave allows
//      duplicate emails; manual dedupe in Wave UI if it ever gets noisy).
//   2. invoiceCreate — SAVED status, single line item mapped to a Wave product
//      via PRODUCT_MAP (frequency|ad_size).
//   3. invoicePaymentCreateManual — CREDIT_CARD payment into the Stripe MIT
//      account so the invoice immediately shows as paid.
//
// Env vars consumed:
//   WAVE_API_TOKEN          — full-access token from developer.waveapps.com
//   WAVE_BUSINESS_ID        — Wave business GraphQL ID
//   WAVE_PAYMENT_ACCOUNT_ID — Stripe (Money in Transit) account GraphQL ID
//
// If any of these are missing, the function silently no-ops so dev/test envs
// don't error — same behavior as the old Zapier-based implementation.

const ENDPOINT = 'https://gql.waveapps.com/graphql/public';

// ---- Wave product catalog (frequency|ad_size -> productId) ----
// Source: Caxton Publications products. Patched 2026-06-01 to media-kit rates
// from lib/pressbook-constants.ts (AD_RATE_TABLE).
const PRODUCT_MAP: Record<string, string> = {
  '1x|1/4 page':   'QnVzaW5lc3M6NWU0YThmMWYtMzIxZC00MTYwLWE5OWEtNGVjZjA1OWMyNTYyO1Byb2R1Y3Q6MzQyMDIzMDU=',
  '1x|1/2 page':   'QnVzaW5lc3M6NWU0YThmMWYtMzIxZC00MTYwLWE5OWEtNGVjZjA1OWMyNTYyO1Byb2R1Y3Q6MzQyMDIzNDg=',
  '1x|Full-page':  'QnVzaW5lc3M6NWU0YThmMWYtMzIxZC00MTYwLWE5OWEtNGVjZjA1OWMyNTYyO1Byb2R1Y3Q6NzMyNDc1NzQ=',
  '3x|1/4 page':   'QnVzaW5lc3M6NWU0YThmMWYtMzIxZC00MTYwLWE5OWEtNGVjZjA1OWMyNTYyO1Byb2R1Y3Q6NDg2NjQ3MDk=',
  '3x|1/2 page':   'QnVzaW5lc3M6NWU0YThmMWYtMzIxZC00MTYwLWE5OWEtNGVjZjA1OWMyNTYyO1Byb2R1Y3Q6ODI4MDA1NDA=',
  '3x|Full-page':  'QnVzaW5lc3M6NWU0YThmMWYtMzIxZC00MTYwLWE5OWEtNGVjZjA1OWMyNTYyO1Byb2R1Y3Q6MTM0ODUxMTc0',
  '6x|1/4 page':   'QnVzaW5lc3M6NWU0YThmMWYtMzIxZC00MTYwLWE5OWEtNGVjZjA1OWMyNTYyO1Byb2R1Y3Q6NDMyNzM2ODc=',
  '6x|1/2 page':   'QnVzaW5lc3M6NWU0YThmMWYtMzIxZC00MTYwLWE5OWEtNGVjZjA1OWMyNTYyO1Byb2R1Y3Q6MzQyMDI0OTk=',
  '6x|Full-page':  'QnVzaW5lc3M6NWU0YThmMWYtMzIxZC00MTYwLWE5OWEtNGVjZjA1OWMyNTYyO1Byb2R1Y3Q6MzQyMDI1NTc=',
  '12x|1/4 page':  'QnVzaW5lc3M6NWU0YThmMWYtMzIxZC00MTYwLWE5OWEtNGVjZjA1OWMyNTYyO1Byb2R1Y3Q6MzQyMDI0Nzg=',
  '12x|1/2 page':  'QnVzaW5lc3M6NWU0YThmMWYtMzIxZC00MTYwLWE5OWEtNGVjZjA1OWMyNTYyO1Byb2R1Y3Q6MzQyMDI0Mjc=',
  '12x|Full-page': 'QnVzaW5lc3M6NWU0YThmMWYtMzIxZC00MTYwLWE5OWEtNGVjZjA1OWMyNTYyO1Byb2R1Y3Q6MzQyMDI0NTc=',
};

// Fallback product if ad_size/frequency don't match — neutral default
// (description and unitPrice are overridden per-line).
const GENERIC_PRODUCT =
  'QnVzaW5lc3M6NWU0YThmMWYtMzIxZC00MTYwLWE5OWEtNGVjZjA1OWMyNTYyO1Byb2R1Y3Q6MzQyMDIzMDU=';

export interface WaveDirectInput {
  companyName: string;
  advertiserEmail: string | null;
  repName: string | null;
  adSize: string | null;
  frequency: string | null;
  issueMonth?: string | null;
  totalCents: number;
  stripePaymentIntentId: string | null;
  paidAtIso?: string;
  notes?: string;
}

export interface WaveDirectResult {
  ok: boolean;
  customerId?: string;
  invoiceId?: string;
  invoiceNumber?: string;
  amount?: string;
  paymentRecordId?: string;
  productKey?: string;
  productMatchedExact?: boolean;
  error?: string;
}

interface GqlResponse<T> {
  data?: T;
  errors?: Array<{ message: string; path?: string[] }>;
}

async function gql<T>(token: string, query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json()) as GqlResponse<T>;
  if (json.errors && json.errors.length > 0) {
    throw new Error(`GraphQL error: ${JSON.stringify(json.errors)}`);
  }
  if (!json.data) {
    throw new Error('GraphQL response missing data');
  }
  return json.data;
}

const dollars = (cents: number): string => (cents / 100).toFixed(2);

export async function createWaveInvoiceDirect(
  input: WaveDirectInput
): Promise<WaveDirectResult> {
  const token = process.env.WAVE_API_TOKEN;
  const businessId = process.env.WAVE_BUSINESS_ID;
  const paymentAccountId = process.env.WAVE_PAYMENT_ACCOUNT_ID;

  if (!token || !businessId || !paymentAccountId) {
    // Not configured — silent skip. Caller stays unblocked.
    return { ok: true };
  }

  if (!Number.isFinite(input.totalCents) || input.totalCents <= 0) {
    return { ok: false, error: `totalCents missing or non-positive: ${input.totalCents}` };
  }

  const adSize = (input.adSize ?? '').trim();
  const frequency = (input.frequency ?? '').trim();
  const issueMonth = (input.issueMonth ?? '').trim();
  const companyName = (input.companyName ?? '').trim() || 'Unknown Advertiser';
  const email = (input.advertiserEmail ?? '').trim();
  const repName = (input.repName ?? '').trim();
  const paidDate = (input.paidAtIso || new Date().toISOString()).slice(0, 10);

  const primaryKey = `${frequency}|${adSize}`;
  const productId = PRODUCT_MAP[primaryKey] ?? GENERIC_PRODUCT;
  const matchedExact = Boolean(PRODUCT_MAP[primaryKey]);

  const description =
    (matchedExact
      ? issueMonth
        ? `${adSize} \u2014 ${frequency} \u2014 ${issueMonth} Issue`
        : `${adSize} \u2014 ${frequency}`
      : `${adSize || 'Display Ad'}${frequency ? ` \u2014 ${frequency} commitment` : ''}${
          issueMonth ? ` \u2014 ${issueMonth} Issue` : ''
        }`) + ' \u2014 RealtyLine Newsline';

  try {
    // ---- Step 1: create customer ---------------------------------
    type CustomerCreateResp = {
      customerCreate: {
        didSucceed: boolean;
        inputErrors: Array<{ path: string[]; message: string; code: string }> | null;
        customer: { id: string } | null;
      };
    };
    const custData = await gql<CustomerCreateResp>(
      token,
      `mutation C($i: CustomerCreateInput!){
        customerCreate(input:$i){
          didSucceed
          inputErrors{ path message code }
          customer{ id }
        }
      }`,
      {
        i: {
          businessId,
          name: companyName,
          email: email || null,
          currency: 'USD',
        },
      }
    );
    if (!custData.customerCreate.didSucceed || !custData.customerCreate.customer) {
      return {
        ok: false,
        error: `customerCreate failed: ${JSON.stringify(custData.customerCreate.inputErrors)}`,
      };
    }
    const customerId = custData.customerCreate.customer.id;

    // ---- Step 2: create invoice (SAVED) --------------------------
    type InvoiceCreateResp = {
      invoiceCreate: {
        didSucceed: boolean;
        inputErrors: Array<{ path: string[]; message: string; code: string }> | null;
        invoice: { id: string; invoiceNumber: string } | null;
      };
    };
    const invData = await gql<InvoiceCreateResp>(
      token,
      `mutation I($i: InvoiceCreateInput!){
        invoiceCreate(input:$i){
          didSucceed
          inputErrors{ path message code }
          invoice{ id invoiceNumber }
        }
      }`,
      {
        i: {
          businessId,
          customerId,
          status: 'SAVED',
          currency: 'USD',
          invoiceDate: paidDate,
          memo:
            input.notes ||
            `Auto-created from signed agreement. Stripe PI: ${input.stripePaymentIntentId ?? 'n/a'}`,
          footer: repName ? `Rep: ${repName}` : undefined,
          items: [
            {
              productId,
              description,
              quantity: '1',
              unitPrice: dollars(input.totalCents),
            },
          ],
        },
      }
    );
    if (!invData.invoiceCreate.didSucceed || !invData.invoiceCreate.invoice) {
      return {
        ok: false,
        error: `invoiceCreate failed: ${JSON.stringify(invData.invoiceCreate.inputErrors)}`,
      };
    }
    const invoice = invData.invoiceCreate.invoice;

    // ---- Step 3: apply manual payment (CREDIT_CARD into Stripe MIT) ----
    type PaymentResp = {
      invoicePaymentCreateManual: {
        didSucceed: boolean;
        inputErrors: Array<{ path: string[]; message: string; code: string }> | null;
        invoicePayment: { id: string } | null;
      };
    };
    const payData = await gql<PaymentResp>(
      token,
      `mutation P($i: InvoicePaymentCreateManualInput!){
        invoicePaymentCreateManual(input:$i){
          didSucceed
          inputErrors{ path message code }
          invoicePayment{ id }
        }
      }`,
      {
        i: {
          invoiceId: invoice.id,
          paymentAccountId,
          amount: dollars(input.totalCents),
          paymentDate: paidDate,
          paymentMethod: 'CREDIT_CARD',
          exchangeRate: '1',
          memo: `Stripe ${input.stripePaymentIntentId ?? ''}`.trim(),
        },
      }
    );
    if (
      !payData.invoicePaymentCreateManual.didSucceed ||
      !payData.invoicePaymentCreateManual.invoicePayment
    ) {
      return {
        ok: false,
        error: `invoicePaymentCreateManual failed: ${JSON.stringify(
          payData.invoicePaymentCreateManual.inputErrors
        )}`,
      };
    }

    return {
      ok: true,
      customerId,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      amount: dollars(input.totalCents),
      paymentRecordId: payData.invoicePaymentCreateManual.invoicePayment.id,
      productKey: primaryKey,
      productMatchedExact: matchedExact,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return { ok: false, error: msg };
  }
}
