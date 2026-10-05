// Cross-document autofill for an Agent Desk deal.
//
// Values entered on the Contract page (and values pulled from an uploaded contract) flow into the
// matching blanks on the other forms in the same deal. Rules:
//   - A blank target is filled whenever the source has a value.
//   - A target that still equals the source's previous value follows the source when it changes.
//   - A target someone typed over is never touched.
//
// Matching is deliberately narrow. Only fields whose printed label was checked against the form
// are listed. Add a form here after confirming each blank on the PDF, not by guessing from names.
import type { AgentDeal } from '@/lib/agent-command-center-workspace';
import type { TrecFormVersion } from '@/lib/trec-form-versions';

export type AutofillConcept = 'propertyAddress' | 'sellers' | 'buyers' | 'lot' | 'block' | 'addition' | 'county';

const SOURCE_FIELD: Record<Exclude<AutofillConcept, 'propertyAddress'>, string> = {
  sellers: 'p01_f001', buyers: 'p01_f002', lot: 'p01_f003', block: 'p01_f004', addition: 'p01_f005', county: 'p01_f007',
};

const CONCEPTS: AutofillConcept[] = ['propertyAddress', 'sellers', 'buyers', 'lot', 'block', 'addition', 'county'];

export function autofillValue(deal: AgentDeal, concept: AutofillConcept): string {
  const ff = deal.formFields ?? {};
  if (concept === 'propertyAddress') return (ff.p01_f008 ?? deal.propertyAddress ?? '').trim();
  return (ff[SOURCE_FIELD[concept]] ?? '').trim();
}

// Blanks whose printed label is the property address, on every form that has one.
const ADDRESS_LABEL = /^(Street Address and City|Address of Property|Contract Concerning)(_\d+)?$/;

// Per-form blanks verified against the printed form (pdfFieldName on that form).
const VERIFIED: Array<{ family: string; concept: AutofillConcept; names: string[] }> = [
  // 1-4 Family contract (20-19): page headers repeat the property address.
  // Resale 9-18 Unimproved Property: parties, lot, block, addition, county, "known as" address.
  { family: '9', concept: 'sellers', names: ['auto_p01_text_001'] },
  { family: '9', concept: 'buyers', names: ['auto_p01_text_002'] },
  { family: '9', concept: 'lot', names: ['auto_p01_text_003'] },
  { family: '9', concept: 'block', names: ['auto_p01_text_004'] },
  { family: '9', concept: 'addition', names: ['auto_p01_text_005'] },
  { family: '9', concept: 'county', names: ['auto_p01_text_007'] },
  { family: '9', concept: 'propertyAddress', names: ['auto_p01_text_008'] },
  // New Home Contract (Completed Construction) 24-20.
  { family: '24', concept: 'sellers', names: ['auto_p01_text_002'] },
  { family: '24', concept: 'buyers', names: ['auto_p01_text_003'] },
  { family: '24', concept: 'lot', names: ['auto_p01_text_004'] },
  { family: '24', concept: 'block', names: ['auto_p01_text_005'] },
  { family: '24', concept: 'addition', names: ['auto_p01_text_006'] },
  { family: '24', concept: 'county', names: ['auto_p01_text_008'] },
  { family: '24', concept: 'propertyAddress', names: ['auto_p01_text_009'] },
];

export type AutofillIndex = Record<AutofillConcept, string[]>;

export function buildAutofillIndex(versions: TrecFormVersion[]): AutofillIndex {
  const index = Object.fromEntries(CONCEPTS.map((c) => [c, [] as string[]])) as AutofillIndex;
  for (const version of versions) {
    for (const field of version.fields) {
      if (field.type !== 'text') continue;
      const name = field.pdfFieldName ?? field.label;
      if (ADDRESS_LABEL.test(name) && field.id !== 'p01_f008') index.propertyAddress.push(field.id);
    }
    for (const rule of VERIFIED) {
      if (rule.family !== version.formFamily) continue;
      for (const field of version.fields) {
        if (field.type === 'text' && rule.names.includes(field.pdfFieldName ?? field.label)) index[rule.concept].push(field.id);
      }
    }
  }
  for (const c of CONCEPTS) index[c] = [...new Set(index[c])];
  return index;
}

export function autofillDeal(prev: AgentDeal | undefined, next: AgentDeal, index: AutofillIndex): AgentDeal {
  const patch: Record<string, string> = {};
  for (const concept of CONCEPTS) {
    const nv = autofillValue(next, concept);
    const pv = prev ? autofillValue(prev, concept) : '';
    for (const id of index[concept]) {
      const cur = (next.formFields[id] ?? '').trim();
      if (nv && cur === '') patch[id] = nv;
      else if (pv && cur === pv && nv !== pv) patch[id] = nv;
    }
  }
  return Object.keys(patch).length ? { ...next, formFields: { ...next.formFields, ...patch } } : next;
}
