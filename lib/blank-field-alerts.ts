// Blank-field alerts for a deal. Anything left blank raises an alert so the agent can decide to
// review it or ignore it. Ignoring is stored on the deal (ignoredBlankAlerts) and can be undone.
import type { AgentDeal } from '@/lib/agent-command-center-workspace';
import { CONTRACT_MAP_SECTIONS } from '@/lib/trec-20-19-contract-map';

export type BlankAlert = { id: string; label: string; blank: number; total: number; view: string };

// Same links the Contract page uses between stored deal values and contract form fields.
const DETAIL_LINKS: Record<string, keyof AgentDeal['contractDetails']> = {
  p01_f016: 'salesPrice', p01_f011: 'cashPortion', p01_f015: 'loanAmount', p02_f031: 'earnestMoney', p02_f032: 'optionFee',
  p02_f033: 'additionalEarnestMoney', p02_f038: 'titleCompany', p01_f007: 'county', p01_f009: 'exclusions', p06_f097: 'specialProvisionsNotes',
};
const DEAL_FIELD_LINKS: Record<string, 'optionPeriodDays' | 'additionalEarnestMoneyDays' | 'titleObjectionDays' | 'propertyAddress'> = {
  p02_f035: 'optionPeriodDays', p02_f034: 'additionalEarnestMoneyDays', p03_f057: 'titleObjectionDays', p01_f008: 'propertyAddress',
};

function contractValue(deal: AgentDeal, id: string): string {
  if (id.startsWith('app:')) return ((deal.contractAddresses ?? {})[id.slice(4)] ?? '').trim();
  const direct = (deal.formFields[id] ?? '').trim();
  if (direct) return direct;
  const detail = DETAIL_LINKS[id];
  if (detail) return String(deal.contractDetails?.[detail] ?? '').trim();
  const link = DEAL_FIELD_LINKS[id];
  if (link) return String(deal[link] ?? '').trim();
  return '';
}

export type TrecFormStatus = { formFamily: string; formNumber: string; title: string; total: number; filled: number; selected: boolean };

export function blankFieldAlerts(deal: AgentDeal, forms: readonly TrecFormStatus[] = []): BlankAlert[] {
  const hidden = new Set(deal.contractHiddenFields ?? []);
  const alerts: BlankAlert[] = [];
  for (const section of CONTRACT_MAP_SECTIONS) {
    const fields = section.fields.filter((f) => f.kind !== 'c' && !hidden.has(f.id));
    const custom = (deal.contractCustomFields ?? []).filter((c) => c.section === section.id);
    const total = fields.length + custom.length;
    const blank = fields.filter((f) => contractValue(deal, f.id) === '').length + custom.filter((c) => (c.value ?? '').trim() === '').length;
    if (total > 0 && blank > 0) alerts.push({ id: `contract:${section.id}`, label: `Contract: ${section.title}`, blank, total, view: 'transaction' });
  }
  for (const form of forms) {
    if (!form.selected || form.formFamily === '20' || form.total === 0) continue;
    if (form.filled < form.total) alerts.push({ id: `form:${form.formFamily}`, label: `${form.formNumber} ${form.title}`, blank: form.total - form.filled, total: form.total, view: 'd-documents' });
  }
  return alerts;
}
