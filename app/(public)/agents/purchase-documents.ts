/**
 * Document folders for a Purchase transaction. "required" items must be
 * received before the purchase packet is complete; everything else is optional
 * or reference material.
 */
export type PurchaseDocKind = 'required' | 'optional' | 'reference';
export type PurchaseDoc = { id: string; label: string; kind: PurchaseDocKind; formFamily?: string };
export type PurchaseFolder = { id: string; label: string; docs: PurchaseDoc[] };

const d = (id: string, label: string, kind: PurchaseDocKind, formFamily?: string): PurchaseDoc => ({ id, label, kind, ...(formFamily ? { formFamily } : {}) });

/**
 * TREC promulgated forms are listed live from the Current Deal form library, so
 * their static checklist rows are not repeated here. Required receipt checks stay.
 */
const PROMULGATED_IN_LIBRARY = new Set([
  'pd-hoa-addendum', 'pd-lead-paint-addendum', 'pd-lead-paint-txr', 'pd-amendment', 'pd-amendment-1903',
  'pd-one-to-four-contract', 'pd-non-realty-items', 'pd-mandatory-poa', 'pd-backup-contract',
  'pd-sale-of-other-property', 'pd-buyer-temp-lease', 'pd-seller-temp-lease', 'pd-residential-service-company',
  'pd-environmental-assessment', 'pd-buyer-termination-notice', 'pd-short-sale-addendum',
  'pd-consumer-notice-hazards', 'pd-groundwater-disclosure-1', 'pd-groundwater-disclosure-2',
]);

const ALL_PURCHASE_FOLDERS: PurchaseFolder[] = [
  {
    id: 'resources', label: 'Transaction & Document Resources',
    docs: [
      d('pd-required-docs-checklist', 'Required Transaction Documents Checklist', 'reference'),
      d('pd-form-index', 'Form Index & Description (TXR)', 'reference'),
    ],
  },
  {
    id: 'buyer-rep', label: 'Buyer Representation Documents',
    docs: [
      d('pd-iabs', 'Buyer: Information About Brokerage Services', 'required', 'IABS'),
      d('pd-buyer-rep-agreement', 'Residential Buyer/Tenant Representation Agreement', 'required'),
      d('pd-wire-fraud-alert', 'Wire Fraud Alert For Buyers', 'required'),
      d('pd-sales-disclosure-tx', 'Sales Disclosure - TX', 'required'),
      d('pd-affiliated-business', 'Affiliated Business Arrangement Disclosure', 'required'),
      d('pd-nar-disclosure', 'NAR Seller/Buyers Disclosure', 'optional'),
      d('pd-general-info-notice', 'General Information and Notice to Buyers', 'optional'),
    ],
  },
  {
    id: 'buyer-contract', label: 'Buyer Under Contract Documents',
    docs: [
      d('pd-residential-contract', 'One to Four Family Residential Contract (Resale)', 'required', '20'),
      d('pd-commission-intake', 'Commission Intake Form', 'optional'),
      d('pd-compensation-agreement', 'Compensation Agreement Between Brokers', 'optional'),
      d('pd-executed-contract-receipt', 'Executed Contract Receipted By Title Co.', 'required'),
      d('pd-sellers-disclosure-notice', 'Sellers Disclosure Notice', 'required', '55'),
      d('pd-tax-record', 'Tax Record', 'required'),
      d('pd-cma', 'Comparative Market Analysis (CMA or Comps)', 'required'),
      d('pd-mls-printout', 'MLS Printout (Under Contract)', 'optional'),
      d('pd-third-party-financing', 'Third-Party Financing Addendum', 'optional'),
      d('pd-existing-survey-t47', 'Existing Survey & T-47', 'optional'),
      d('pd-notice-to-purchaser', 'Notice To Purchaser Document', 'optional'),
      d('pd-hoa-addendum', 'HOA Addendum', 'optional'),
      d('pd-lead-paint-addendum', 'Lead Based Paint Addendum', 'optional'),
      d('pd-amendment', 'Amendment To Contract', 'optional'),
      d('pd-intermediary-notice-1', 'Intermediary Relationship Notice (TXR 1409)', 'optional'),
      d('pd-groundwater-disclosure-1', "Seller's Disclosure About Groundwater and S…", 'optional'),
    ],
  },
  {
    id: 'buyer-closing', label: 'Buyer Closing Documents',
    docs: [
      d('pd-walkthrough', "Buyer's Walk-Through, Confirmation, and Acceptance", 'required'),
      d('pd-closing-statement', 'Closing/Settlement Statement', 'required'),
      d('pd-new-survey', 'New Survey', 'optional'),
      d('pd-communication-log', 'Communication Log', 'optional'),
    ],
  },
  {
    id: 'residential-purchase', label: 'Documents Used for 1-4 Residential Purchase',
    docs: [
      d('pd-intermediary-notice-2', 'Intermediary Relationship Notice (TXR 1409)', 'optional'),
      d('pd-one-to-four-contract', 'One to Four Family Residential Contract (Resale)', 'optional'),
      d('pd-third-party-financing-credit', 'Third Party Financing Addendum For Credit Approval', 'optional'),
      d('pd-amendment-1903', 'Amendment (TXR 1903 / TREC 39-9)', 'optional'),
      d('pd-lead-paint-txr', 'Addendum Regarding Lead-Based Paint', 'optional'),
      d('pd-non-realty-items', 'Non-Realty Items Addendum (TXR 1924)', 'optional'),
      d('pd-mandatory-poa', 'Addendum for Property Subject to Mandatory Membership in a Property Owners Association', 'optional'),
      d('pd-right-to-terminate', "Addendum Concerning Right to Terminate Due to Lender's Appraisal", 'optional'),
      d('pd-backup-contract', 'Addendum for "Back-Up" Contract', 'optional'),
      d('pd-sale-of-other-property', 'Addendum for Sale of Other Property by Buyer', 'optional'),
      d('pd-buyer-temp-lease', "Buyer's Temporary Residential Lease", 'optional'),
      d('pd-seller-temp-lease', "Seller's Temporary Residential Lease", 'optional'),
      d('pd-residential-service-company', 'Disclosure of Relationship with Residential Service Company', 'optional'),
      d('pd-environmental-assessment', 'Environmental Assessment, Threatened or Endangered Species, and Wetlands Addendum', 'optional'),
      d('pd-home-inspection-protection', 'For Your Protection: Get a Home Inspection', 'optional'),
      d('pd-buyer-termination-notice', "Notice of Buyer's Termination of Contract", 'optional'),
      d('pd-withdrawal-of-offer', 'Notice of Withdrawal of Offer (TXR 1945)', 'optional'),
      d('pd-release-earnest-money', 'Release of Earnest Money (TXR 1904)', 'optional'),
      d('pd-short-sale-addendum', 'Short Sale Addendum (TXR 1918 / TREC 45-2)', 'optional'),
      d('pd-consumer-notice-hazards', 'Texas Real Estate Consumer Notice Concerning Hazards or Deficiencies', 'optional'),
      d('pd-broker-credit-letter', 'Broker Credit Letter', 'optional'),
      d('pd-representation-disclosure', 'Representation Disclosure (TXR 1417)', 'optional'),
      d('pd-groundwater-disclosure-2', "Seller's Disclosure About Groundwater and S…", 'reference'),
    ],
  },
];

export const PURCHASE_FOLDERS: PurchaseFolder[] = ALL_PURCHASE_FOLDERS
  .map((folder) => ({ ...folder, docs: folder.docs.filter((doc) => !PROMULGATED_IN_LIBRARY.has(doc.id)) }))
  .filter((folder) => folder.docs.length > 0);

export const PURCHASE_REQUIRED_IDS = PURCHASE_FOLDERS.flatMap((f) => f.docs).filter((x) => x.kind === 'required').map((x) => x.id);

const ALL_BY_ID = new Map(ALL_PURCHASE_FOLDERS.flatMap((folder) => folder.docs).map((doc) => [doc.id, doc] as const));
const reuse = (id: string, kind: PurchaseDocKind, label?: string): PurchaseDoc => ({ ...(ALL_BY_ID.get(id) as PurchaseDoc), kind, ...(label ? { label } : {}) });

const ALL_LISTING_FOLDERS: PurchaseFolder[] = [
  {
    id: 'listing-rep', label: 'Listing Representation Documents',
    docs: [
      reuse('pd-iabs', 'required', 'Seller: Information About Brokerage Services'),
      d('ld-listing-agreement', 'Residential Real Estate Listing Agreement (TXR 1101 Or Attorney-Drafted)', 'required'),
      d('ld-consumer-protection-notice', 'Consumer Protection Notice Displayed (Office, Website, Social Profiles)', 'required'),
      d('ld-wire-fraud-alert', 'Wire Fraud Alert For Sellers', 'required'),
      reuse('pd-sellers-disclosure-notice', 'required', "Seller's Disclosure Notice (TREC 55-1 Or TXR 1406)"),
      d('ld-mls-input', 'MLS Listing Input Form', 'required'),
      reuse('pd-tax-record', 'required'),
      reuse('pd-cma', 'required', 'Comparative Market Analysis (Listing Price)'),
      d('ld-hoa-info', 'HOA Information And Resale Certificate', 'optional'),
      d('ld-net-sheet', "Seller's Net Sheet", 'optional'),
      reuse('pd-groundwater-disclosure-1', 'optional'),
    ],
  },
  {
    id: 'listing-contract', label: 'Listing Under Contract Documents',
    docs: [
      reuse('pd-residential-contract', 'required'),
      reuse('pd-executed-contract-receipt', 'required'),
      d('ld-buyer-agent-comp', 'Buyer Agent Compensation Agreement', 'optional'),
      reuse('pd-third-party-financing', 'optional'),
      reuse('pd-amendment', 'optional'),
      d('ld-repair-negotiation', 'Repair Request And Negotiation Documents', 'optional'),
      reuse('pd-hoa-addendum', 'optional'),
      reuse('pd-lead-paint-addendum', 'optional'),
      d('ld-seller-termination', "Notice of Seller's Termination of Contract", 'optional'),
    ],
  },
  {
    id: 'listing-closing', label: 'Listing Closing Documents',
    docs: [
      reuse('pd-closing-statement', 'required', "Seller's Closing/Settlement Statement"),
      d('ld-commission-disbursement', 'Commission Disbursement Authorization', 'required'),
      d('ld-final-walkthrough', "Seller's Final Walk-Through", 'optional'),
      d('ld-keybox', 'Keybox And Lockbox Removal', 'optional'),
      reuse('pd-communication-log', 'optional'),
    ],
  },
];

export const LISTING_FOLDERS: PurchaseFolder[] = ALL_LISTING_FOLDERS
  .map((folder) => ({ ...folder, docs: folder.docs.filter((doc) => !PROMULGATED_IN_LIBRARY.has(doc.id)) }))
  .filter((folder) => folder.docs.length > 0);

export const LISTING_REQUIRED_IDS = LISTING_FOLDERS.flatMap((f) => f.docs).filter((x) => x.kind === 'required').map((x) => x.id);

/** Required and optional documents follow which side of the purchase the agent represents. */
export const foldersForSide = (side?: string): PurchaseFolder[] => (side === 'listing' ? LISTING_FOLDERS : PURCHASE_FOLDERS);
export const requiredIdsForSide = (side?: string): string[] => (side === 'listing' ? LISTING_REQUIRED_IDS : PURCHASE_REQUIRED_IDS);

export const CONTRACT_FORM_OPTIONS = [
  { value: '20', label: 'One To Four Family Residential Contract (Resale)' },
  { value: '30', label: 'Residential Condominium Contract (Resale)' },
  { value: '9', label: 'Unimproved Property Contract' },
  { value: '25', label: 'Farm And Ranch Contract' },
  { value: '24', label: 'New Home Contract (Completed Construction)' },
  { value: '23', label: 'New Home Contract (Incomplete Construction)' },
] as const;

export const BUYER_REP_FORM_OPTIONS = [
  { value: '1501', label: 'Buyer/Tenant Representation Agreement, Long Form (TXR-1501)' },
  { value: '1507', label: 'Buyer/Tenant Representation Agreement, Short Form (TXR-1507)' },
  { value: '1508', label: 'Unrepresented Customer Showing Form (TXR-1508)' },
] as const;

type FolderDeal = { agentSide?: string; buyerRepForm?: string; contractForm?: string; yearBuilt?: string; hasHoa?: boolean; contractDetails?: { financingType?: string } } | null | undefined;

/** Folders for a deal: side-specific list, the chosen contract and representation forms, and addenda the deal triggers. */
export function dealFolders(deal: FolderDeal): PurchaseFolder[] {
  const base = foldersForSide(deal?.agentSide);
  const financing = (deal?.contractDetails?.financingType ?? '').trim().toLowerCase();
  const needsFinancing = Boolean(financing) && !/^cash\b/.test(financing);
  const year = Number.parseInt(deal?.yearBuilt ?? '', 10);
  const needsLead = Number.isFinite(year) && year > 0 && year < 1978;
  const rep = BUYER_REP_FORM_OPTIONS.find((o) => o.value === deal?.buyerRepForm);
  const contract = CONTRACT_FORM_OPTIONS.find((o) => o.value === (deal?.contractForm || '20'));
  const folders = base.map((folder) => ({
    ...folder,
    docs: folder.docs.map((doc): PurchaseDoc => {
      if (doc.id === 'pd-buyer-rep-agreement' && rep) return { ...doc, label: rep.label };
      if (doc.id === 'pd-residential-contract' && contract) return { ...doc, label: contract.label, formFamily: contract.value };
      if (doc.id === 'pd-third-party-financing') return { ...doc, formFamily: '40', kind: needsFinancing ? 'required' : doc.kind };
      return doc;
    }),
  }));
  const extra: PurchaseDoc[] = [];
  const has = (id: string) => folders.some((folder) => folder.docs.some((doc) => doc.id === id));
  if (deal?.hasHoa && !has('pd-hoa-addendum')) extra.push(d('pd-hoa-addendum', 'Addendum For Property Subject To Mandatory Membership In A Property Owners Association', 'required', '36'));
  if (needsLead && !has('pd-lead-paint-addendum')) extra.push(d('pd-lead-paint-addendum', 'Lead-Based Paint Addendum (Built Before 1978)', 'required', '56'));
  if (extra.length === 0) return folders;
  const idx = folders.findIndex((folder) => folder.id === (deal?.agentSide === 'listing' ? 'listing-contract' : 'buyer-contract'));
  const at = idx >= 0 ? idx : folders.length - 1;
  return folders.map((folder, i) => (i === at ? { ...folder, docs: [...folder.docs, ...extra] } : folder));
}
export const requiredIdsFor = (folders: PurchaseFolder[]): string[] => folders.flatMap((f) => f.docs).filter((x) => x.kind === 'required').map((x) => x.id);
