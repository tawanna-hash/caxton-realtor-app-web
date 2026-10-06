import type { AgentDeal } from '@/lib/agent-command-center-workspace';
import { BUILT_IN_TREC_FORM_VERSIONS, type TrecFormVersion } from '@/lib/trec-form-versions';

/** The five required Texas forms clients may view (read-only): IABS, 1-4 Family contract, Seller's Disclosure, Financing and HOA addenda. */
export const PORTAL_FORM_FAMILIES = ['IABS', '20', '55', '40', '36'] as const;

/** A form shows on the client portal when it is selected on the deal or already has saved answers. */
export function portalForms(deal: AgentDeal): TrecFormVersion[] {
  return PORTAL_FORM_FAMILIES.flatMap((family) => {
    const version = BUILT_IN_TREC_FORM_VERSIONS.find((v) => v.isActive && v.formFamily === family);
    if (!version) return [];
    const filled = version.fields.some((field) => (deal.formFields?.[field.id] ?? '').trim() !== '');
    return deal.selectedFormFamilies?.[family] || filled ? [version] : [];
  });
}
