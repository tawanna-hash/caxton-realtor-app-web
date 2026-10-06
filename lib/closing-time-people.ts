import type { AgentDeal } from '@/lib/agent-command-center-workspace';

export type DealPerson = { name: string; role: string; email: string; phone: string; kind: 'client' | 'other-side' | 'pro'; fromContract?: boolean; company?: string };

const split = (v: string) => (v || '').split(/\s*(?:&|,|\/|\band\b)\s*/i).map((n) => n.trim()).filter(Boolean);

/** Buyer 1/2 and Seller 1/2 as entered on the contract, with the email and phone typed there. */
function principals(deal: AgentDeal, side: 'buyer' | 'seller'): { name: string; email: string; phone: string }[] {
  const f = (id: string) => (deal.formFields?.[id] ?? '').trim();
  const names = split(side === 'buyer' ? deal.buyerNames : deal.sellerNames);
  const second = ((side === 'buyer' ? deal.buyer2Name : deal.seller2Name) ?? '').trim();
  if (second && !names.some((n) => n.toLowerCase() === second.toLowerCase())) names.push(second);
  const ids = side === 'buyer' ? [['p08_f125', 'p08_f123'], ['p08_f126', 'p08_f124']] : [['p08_f131', 'p08_f129'], ['p08_f132', 'p08_f130']];
  return names.map((name, i) => ({ name, email: ids[i] ? f(ids[i][0]) : '', phone: ids[i] ? f(ids[i][1]) : '' }));
}

/**
 * Everyone on a deal, labelled by who they are to the agent. A buyer's agent works with the buyers, not the sellers
 * (and a listing agent the reverse), so the other side's principals are marked 'other-side' and are never messaged.
 */
export function dealPeople(deal: AgentDeal): DealPerson[] {
  const listing = deal.agentSide === 'listing';
  const out: DealPerson[] = [];
  const add = (p: DealPerson) => {
    const k = p.name.trim().toLowerCase(); if (!k) return;
    const have = out.find((x) => x.name.trim().toLowerCase() === k);
    if (have) { have.email ||= p.email; have.phone ||= p.phone; return; }
    out.push({ ...p, name: p.name.trim() });
  };
  const otherRe = listing ? /buyer/i : /seller/i;
  for (const c of deal.clientContacts ?? []) add({ name: c.name, role: c.role || 'Client', email: c.email ?? '', phone: c.phone ?? '', kind: otherRe.test(c.role ?? '') ? 'other-side' : 'client' });
  for (const p of principals(deal, 'buyer')) add({ ...p, role: 'Buyer', kind: listing ? 'other-side' : 'client', fromContract: true });
  for (const p of principals(deal, 'seller')) add({ ...p, role: 'Seller', kind: listing ? 'client' : 'other-side', fromContract: true });
  // Everyone else named on the contract: the other side's agent, lender, and title or escrow.
  const f = (id: string) => (deal.formFields?.[id] ?? '').trim();
  const ca = (k: string) => (deal.contractAddresses?.[k] ?? '').trim();
  const other = listing
    ? { who: "Buyer's Agent", name: f('p11_f215'), email: f('p11_f217'), phone: f('p11_f218'), company: f('p11_f212') }
    : { who: "Seller's Agent", name: f('p11_f204'), email: f('p11_f206'), phone: f('p11_f207'), company: f('p11_f201') };
  if (other.name || other.company) add({ name: other.name || other.company, role: other.who, email: other.email, phone: other.phone, kind: 'pro', fromContract: true, company: other.company });
  else if ((deal.otherAgent ?? '').trim()) add({ name: deal.otherAgent!.trim(), role: other.who, email: '', phone: '', kind: 'pro', fromContract: true, company: (deal.otherBrokerage ?? '').trim() });
  const lenderName = (deal.lender ?? '').trim() || ca('lender.escrow');
  if (lenderName) add({ name: lenderName, role: 'Lender', email: ca('lender.email'), phone: ca('lender.phone'), kind: 'pro', fromContract: true });
  const titleName = f('p02_f028') || f('p02_f038');
  if (titleName) add({ name: titleName, role: 'Title And Escrow', email: f('p12_f261'), phone: f('p12_f264'), kind: 'pro', fromContract: true, company: f('p02_f038') });
  for (const s of deal.serviceProviders ?? []) add({ name: s.name, role: s.category || 'Provider', email: s.email ?? '', phone: s.phone ?? '', kind: 'pro' });
  return out;
}

/** People the agent may message on this deal. */
export const messagingPeople = (deal: AgentDeal): DealPerson[] => dealPeople(deal).filter((p) => p.kind !== 'other-side');
