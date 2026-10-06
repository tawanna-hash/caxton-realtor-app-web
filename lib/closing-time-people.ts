import type { AgentDeal } from '@/lib/agent-command-center-workspace';

export type DealPerson = { name: string; role: string; email: string; phone: string; kind: 'client' | 'other-side' | 'pro' };

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
  for (const p of principals(deal, 'buyer')) add({ ...p, role: 'Buyer', kind: listing ? 'other-side' : 'client' });
  for (const p of principals(deal, 'seller')) add({ ...p, role: 'Seller', kind: listing ? 'client' : 'other-side' });
  for (const s of deal.serviceProviders ?? []) add({ name: s.name, role: s.category || 'Provider', email: s.email ?? '', phone: s.phone ?? '', kind: 'pro' });
  return out;
}

/** People the agent may message on this deal. */
export const messagingPeople = (deal: AgentDeal): DealPerson[] => dealPeople(deal).filter((p) => p.kind !== 'other-side');
