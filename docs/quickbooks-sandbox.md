# QuickBooks Online Sandbox Setup

The Realty News Now integration is outbound-only in its first phase. An admin
connects one QuickBooks Online sandbox company, verifies the connection, and
manually syncs eligible invoices from **Admin → Sales → QuickBooks**.

## Intuit developer configuration

Create or select an app in the Intuit Developer dashboard and enable the
QuickBooks Online Accounting scope.

Register this redirect URI exactly:

```text
https://realtynewsnow.app/api/admin/integrations/quickbooks/callback
```

Register this webhook endpoint for the sandbox app:

```text
https://realtynewsnow.app/api/quickbooks/webhook
```

Sandbox and production webhook settings are separate in Intuit. Do not add the
production connection until the sandbox reconciliation has been approved.

## Vercel environment variables

All values below are server-only. Do not prefix any secret with `NEXT_PUBLIC_`.

| Variable | Purpose |
| --- | --- |
| `QUICKBOOKS_ENVIRONMENT` | Set to `sandbox`. |
| `QUICKBOOKS_CLIENT_ID` | Development client ID from the Intuit app. |
| `QUICKBOOKS_CLIENT_SECRET` | Development client secret from the Intuit app. |
| `QUICKBOOKS_REDIRECT_URI` | Exact registered callback URL above. |
| `QUICKBOOKS_TOKEN_ENCRYPTION_KEY` | Random secret used to encrypt OAuth tokens with AES-256-GCM. Use at least 32 random bytes. |
| `QUICKBOOKS_DEFAULT_ITEM_ID` | QuickBooks ID of the service item used for Realty News Now invoice lines. |
| `QUICKBOOKS_STRIPE_CLEARING_ACCOUNT_ID` | QuickBooks account ID for the Stripe clearing account. |
| `QUICKBOOKS_WEBHOOK_VERIFIER` | Sandbox webhook verifier token from the Intuit app. |

Generate the token-encryption secret locally:

```bash
openssl rand -base64 48
```

## Sandbox chart of accounts

Create or identify:

- A service item such as `Realty News Now Advertising`.
- An income account assigned to that service item.
- A bank-type clearing account such as `Stripe Clearing`.

Copy the service item ID into `QUICKBOOKS_DEFAULT_ITEM_ID` and the clearing
account ID into `QUICKBOOKS_STRIPE_CLEARING_ACCOUNT_ID`.

## Sync behavior

- A Realty News Now partner becomes a QuickBooks Customer on first sync.
- A sent or overdue Realty News Now invoice becomes a QuickBooks Invoice.
- A paid Realty News Now invoice also creates a QuickBooks Payment linked to
  that invoice and deposited into the Stripe clearing account.
- Local-to-QuickBooks IDs are retained to make repeat sync requests idempotent.
- Draft and void invoices are rejected.
- Financial writes are code-locked to `QUICKBOOKS_ENVIRONMENT=sandbox`.
- Incoming QuickBooks webhooks are signature-verified and acknowledged, but
  do not modify local billing records in phase one.

## Sandbox acceptance check

1. Open **Admin → Sales → QuickBooks**.
2. Confirm the page shows `Sandbox only` and all configuration checks are ready.
3. Select **Connect QuickBooks** and authorize the sandbox company.
4. Select **Test connection** and confirm the company name.
5. Sync one sent invoice and confirm the Customer and Invoice in QuickBooks.
6. Sync one paid invoice and confirm its linked Payment posts to Stripe Clearing.
7. Compare the local and QuickBooks invoice totals.
8. Repeat both syncs and confirm no duplicate Customer, Invoice, or Payment is created.

