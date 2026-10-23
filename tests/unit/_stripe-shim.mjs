// Test double for the Stripe SDK: in-memory customers, Checkout setup sessions and SetupIntents.
// No network. Tests drive the "hosted page" step with the helpers on globalThis.__fakeStripe.
let n = 0;
const id = (p) => `${p}_${String(++n).padStart(4, '0')}`;
export const state = (globalThis.__fakeStripe = {
  customers: new Map(), sessions: new Map(), intents: new Map(), methods: new Map(), calls: [],
  reset() { this.customers.clear(); this.sessions.clear(); this.intents.clear(); this.methods.clear(); this.calls.length = 0; },
  /** Client finishes a card on Stripe's page. */
  completeCard(sessionId, { last4 = '4242', brand = 'visa', exp_month = 12, exp_year = 2030 } = {}) {
    const s = this.sessions.get(sessionId); const si = this.intents.get(s.setup_intent);
    const pm = { id: id('pm'), type: 'card', card: { brand, last4, exp_month, exp_year }, billing_details: { name: 'Pat Payer', address: null } };
    this.methods.set(pm.id, pm); si.payment_method = pm.id; si.status = 'succeeded'; s.status = 'complete'; return si;
  },
  /** Client connects a bank account. instant=false means Stripe needs micro-deposit verification. */
  completeBank(sessionId, { instant = true, last4 = '6789', bank_name = 'STRIPE TEST BANK' } = {}) {
    const s = this.sessions.get(sessionId); const si = this.intents.get(s.setup_intent);
    const pm = { id: id('pm'), type: 'us_bank_account', us_bank_account: { last4, bank_name }, billing_details: { name: 'Pat Payer' } };
    this.methods.set(pm.id, pm); si.payment_method = pm.id; s.status = 'complete';
    if (instant) si.status = 'succeeded';
    else { si.status = 'requires_action'; si.next_action = { type: 'verify_with_microdeposits', verify_with_microdeposits: { hosted_verification_url: `https://payments.stripe.test/microdeposit/${si.id}` } }; }
    return si;
  },
  verifyMicrodeposits(siId) { const si = this.intents.get(siId); si.status = 'succeeded'; si.next_action = null; return si; },
  failSetup(siId, message = 'Bank account could not be verified.') { const si = this.intents.get(siId); si.status = 'requires_payment_method'; si.last_setup_error = { message }; return si; },
  event(type, object) { return { id: id('evt'), type, data: { object } }; },
});
const hydrate = (si) => ({ ...si, payment_method: si.payment_method ? state.methods.get(si.payment_method) : null });
class FakeStripe {
  constructor() {
    this.customers = {
      create: async (p) => { const c = { id: id('cus'), object: 'customer', ...p }; state.customers.set(c.id, c); state.calls.push(['customers.create', p]); return c; },
      retrieve: async (cid) => { const c = state.customers.get(cid); if (!c) throw new Error('No such customer'); return c; },
      search: async ({ query }) => {
        const m = query.match(/metadata\['(\w+)'\]:'([^']*)'/); state.calls.push(['customers.search', query]);
        return { data: [...state.customers.values()].filter((c) => m && c.metadata?.[m[1]] === m[2]) };
      },
    };
    this.checkout = { sessions: {
      create: async (p) => {
        const si = { id: id('seti'), object: 'setup_intent', status: 'requires_payment_method', customer: p.customer, metadata: p.setup_intent_data?.metadata ?? {}, payment_method_types: p.payment_method_types, payment_method: null, next_action: null };
        state.intents.set(si.id, si);
        const s = { id: `cs_test_${String(++n).padStart(4, '0')}`, object: 'checkout.session', mode: p.mode, metadata: p.metadata, customer: p.customer, setup_intent: si.id, payment_method_types: p.payment_method_types, success_url: p.success_url, cancel_url: p.cancel_url, status: 'open' };
        s.url = `https://checkout.stripe.test/c/${s.id}`; state.sessions.set(s.id, s); state.calls.push(['sessions.create', p]); return s;
      },
      retrieve: async (sid) => { const s = state.sessions.get(sid); if (!s) throw new Error('No such session'); return { ...s, setup_intent: hydrate(state.intents.get(s.setup_intent)) }; },
    } };
    this.setupIntents = { retrieve: async (sid) => hydrate(state.intents.get(sid)) };
    this.paymentMethods = { retrieve: async (pid) => state.methods.get(pid) };
    this.webhooks = { constructEvent: (raw, sig) => { if (sig !== 'test-signature') throw new Error('No signatures found matching the expected signature for payload'); return JSON.parse(raw); } };
  }
}
export default FakeStripe;
