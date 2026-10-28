# Stripe Integration TODO

Existing Checkout Session calls were updated in place (Scenario A). No new files, routes or placeholders were added. The existing `mode`, `success_url`, `cancel_url` and `line_items` values are real and were kept.

## Values to Replace

None. Every `sample_only` parameter (`mode`, `success_url`, `cancel_url`, `line_items`) already has a real value in the code.

## Configured Parameters

Set on every Checkout Session call:

**Files:**
- [app/api/portal/invoices/[id]/checkout/route.ts](app/api/portal/invoices/[id]/checkout/route.ts)
- [lib/server/invoice-payment-link.ts](lib/server/invoice-payment-link.ts)
- [lib/server/partner-statement.ts](lib/server/partner-statement.ts) (two calls)
- [lib/server/payment-setup.ts](lib/server/payment-setup.ts) (setup mode)

| Parameter | Value |
|-----------|-------|
| ui_mode | hosted_page (stripe SDK 22.2.0, which is 21.0.0 or later) |
| billing_address_collection | auto |
| phone_number_collection | enabled: true |
| automatic_tax | enabled: false |
| allow_promotion_codes | false |
| submit_type | auto |
| consent_collection | terms_of_service: required |
| name_collection | individual and business enabled |
| saved_payment_method_options | payment_method_save: enabled (only on the invoice portal call, and only when a Stripe customer is attached) |
| integration_identifier | hosted_mobile_app_0001 |
| origin_context | mobile_app |
| branding_settings | background #ffffff, button #6205ad, font inter, rounded, logo file_1UVKNw91yhy0NZ59W2XMbWDC |

Notes:
- `payment_method_collection` is not set because every call uses `mode: 'payment'` or `'setup'`, not `'subscription'`.
- Stripe rejects `saved_payment_method_options` without a customer, so it is omitted on calls that only pass `customer_email`.
- The setup-mode call in `payment-setup.ts` omits `submit_type`, `allow_promotion_codes`, `automatic_tax`, `saved_payment_method_options` and `phone_number_collection`, which Stripe only accepts in payment mode.
- The invoice portal route still switches to `ui_mode: 'embedded_page'` when the embedded form is requested.
- Terms of service is required at checkout, so Stripe needs a Terms of service URL. It is set to https://realtynewsnow.app/advertising-terms in Settings > Business > Public details.
- Test-mode sessions for card, ACH, buy now pay later, setup and customer-attached payments were created successfully with these parameters. Confirm the logo file also exists in live mode with one live payment.

## Setup and Next Steps

- Environment: `STRIPE_SECRET_KEY` (server only) and `STRIPE_WEBHOOK_SECRET`; the app already reads these.
- Dependency: `stripe` ^22.2.0 (already installed).
- Flow: the client picks card, ACH or buy now pay later, the server creates a hosted Checkout Session with the matching fee line, Stripe redirects to `success_url`, and the webhook records the payment.
- Test with `4242 4242 4242 4242` (any future date, any CVC). ACH test bank: routing 110000000, account 000123456789, or the "Success" test institution.
- Next: run one test-mode payment per method and confirm the session is created without errors, then watch the first live payment.
- Resources: [Stripe support](https://support.stripe.com) and [Stripe MCP docs](https://docs.stripe.com/mcp)
