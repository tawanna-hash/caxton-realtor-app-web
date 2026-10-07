export const metadata = {
  title: 'API Documentation | Closing Time',
  description: 'Read deals, subscribe to deal events and verify signed webhooks.',
};

const FIELDS: Array<[string, string]> = [
  ['id', 'Unique deal id. Use it to de-duplicate.'],
  ['property_address', 'Property street address.'],
  ['buyers, sellers', 'Names as text.'],
  ['deal_type', 'purchase, listing_sale, listing_lease, lease, real_estate_other or other.'],
  ['side', 'buyer, listing or empty.'],
  ['status', 'prep, active, closing or completed.'],
  ['workflow_status', 'Workflow stage inside Closing Time.'],
  ['effective_date, closing_date', 'YYYY-MM-DD or null.'],
  ['lender', 'Lender name or null.'],
  ['contacts', 'List of name, role, email and phone for the agent\'s clients.'],
  ['created_at, updated_at', 'ISO 8601 timestamps.'],
];

const EVENTS = ['deal.created', 'deal.status_changed', 'deal.closing_date_changed', 'deal.deleted'];

function Code({ children }: { children: string }) {
  return <pre className="mt-2 overflow-x-auto rounded-md border border-[#E6E5EC] bg-[#F6F3FB] p-3 text-[13px] text-[#1B1726]">{children}</pre>;
}

export default function DevelopersPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-[#1B1726]">
      <h1 className="font-serif text-3xl text-[#301D5D]">API Documentation</h1>
      <p className="mt-3 text-[15px] text-[#4A4757]">Read your deals, and get a message when a deal changes. Everything uses HTTPS and JSON. Documents and private notes are never included.</p>

      <h2 className="mt-8 text-[14px] font-semibold">Authentication</h2>
      <p className="mt-2 text-[14px] text-[#4A4757]">Create a key in Closing Time under Resources, Automations. Send it on every request.</p>
      <Code>{`Authorization: Bearer ct_live_...`}</Code>
      <p className="mt-2 text-[14px] text-[#4A4757]">A missing or revoked key returns 401.</p>

      <h2 className="mt-8 text-[14px] font-semibold">Check The Connection</h2>
      <Code>{`GET /api/closing-time/v1/me
200 { "id": "...", "name": "Jane Agent", "email": "jane@example.com" }`}</Code>

      <h2 className="mt-8 text-[14px] font-semibold">List Deals</h2>
      <Code>{`GET /api/closing-time/v1/deals
  ?sort=created        newest created first. Default is most recently updated first.
  &status=active       prep, active, closing or completed
  &updated_since=2026-10-01T00:00:00Z
  &limit=100           1 to 100`}</Code>
      <p className="mt-2 text-[14px] text-[#4A4757]">Returns <code>{'{ "data": [ deal ], "count": 1 }'}</code>. Each deal has these fields:</p>
      <dl className="mt-3 divide-y divide-[#E6E5EC] rounded-lg border border-[#E6E5EC]">
        {FIELDS.map(([k, v]) => (
          <div key={k} className="grid gap-1 px-4 py-2 sm:grid-cols-[220px_1fr]"><dt className="font-mono text-[13px]">{k}</dt><dd className="text-[14px] text-[#4A4757]">{v}</dd></div>
        ))}
      </dl>

      <h2 className="mt-8 text-[14px] font-semibold">Subscribe To Events (REST Hooks)</h2>
      <p className="mt-2 text-[14px] text-[#4A4757]">Events: {EVENTS.map((e) => <code key={e} className="mr-2">{e}</code>)}</p>
      <Code>{`POST /api/closing-time/v1/hooks
{ "target_url": "https://example.com/hook", "event": "deal.created" }
201 { "id": "4f0c...", "event": "deal.created" }

DELETE /api/closing-time/v1/hooks/{id}
200 { "ok": true }`}</Code>
      <p className="mt-2 text-[14px] text-[#4A4757]">Each message is a POST whose body is the deal object, in the same shape the deals list returns. The target must be a public https address. You can hold up to 25 subscriptions.</p>

      <h2 className="mt-8 text-[14px] font-semibold">Webhooks Added In The App</h2>
      <p className="mt-2 text-[14px] text-[#4A4757]">Webhooks created under Resources, Automations send an envelope:</p>
      <Code>{`{ "id": "uuid", "event": "deal.status_changed", "created_at": "...", "data": { deal } }`}</Code>
      <p className="mt-2 text-[14px] text-[#4A4757]">Every message carries <code>X-ClosingTime-Event</code>, <code>X-ClosingTime-Timestamp</code> and <code>X-ClosingTime-Signature: sha256=...</code>. The signature is the hex HMAC-SHA256, using your signing secret, of the timestamp, a period, and the raw body.</p>
      <Code>{`expected = HMAC_SHA256(secret, timestamp + "." + rawBody)  // hex
compare to the value after "sha256=" in constant time`}</Code>
      <p className="mt-2 text-[14px] text-[#4A4757]">Delivery is attempted once with a 5 second timeout. Respond with any 2xx status.</p>
    </main>
  );
}
