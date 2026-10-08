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
      d('pd-form-index', 'Form Index & Description (TXR)', 'reference'),
    ],
  },
  {
    id: 'buyer-rep', label: 'Buyer Representation Documents',
    docs: [
      d('pd-iabs', 'TREC IABS 1-2 · Information About Brokerage Services', 'required', 'IABS'),
      d('pd-buyer-rep-agreement', 'TR 1501 · Residential Buyer/Tenant Representation Agreement', 'required'),
      d('pd-wire-fraud-alert', 'TR 2517 · Wire Fraud Alert Or Wire Fraud Notice', 'required'),
      d('pd-sales-disclosure-tx', 'Sales Disclosure - TX', 'required'),
      d('pd-affiliated-business', 'Affiliated Business Arrangement Disclosure', 'required'),
      d('pd-nar-disclosure', 'NAR Seller/Buyers Disclosure', 'optional'),
      d('pd-general-info-notice', 'TR 1506 · General Information and Notice to Buyers', 'optional'),
    ],
  },
  {
    id: 'buyer-contract', label: 'Buyer Under Contract Documents',
    docs: [
      d('pd-residential-contract', 'TREC 20-19 · One to Four Family Residential Contract (Resale)', 'required', '20'),
      d('pd-commission-intake', 'Commission Intake Form', 'required'),
      d('pd-compensation-agreement', 'Compensation Agreement Between Brokers', 'optional'),
      d('pd-executed-contract-receipt', 'Executed Contract Receipted By Title Co.', 'required'),
      d('pd-sellers-disclosure-notice', 'TREC 55-1 · Sellers Disclosure Notice', 'required', '55'),
      d('pd-tax-record', 'Tax Record', 'required'),
      d('pd-cma', 'Comparative Market Analysis (CMA or Comps)', 'required'),
      d('pd-mls-printout', 'MLS Printout (Option/Pending Status)', 'required'),
      d('pd-em-option-receipt', 'Earnest Money & Option Money Receipted Page (Both Receipted)', 'required'),
      d('pd-preapproval-pof', 'Pre-Approval Letter Or Proof Of Funds', 'required'),
      d('pd-third-party-financing', 'TREC 40-11 · Third-Party Financing Addendum', 'optional'),
      d('pd-existing-survey-t47', 'Survey & T-47 (Survey Not Required On Cash Deals; T-47 Not Needed With A New Survey)', 'required'),
      d('pd-notice-to-purchaser', 'TREC 59-0 · Notice To Purchaser Document', 'optional'),
      d('pd-hoa-addendum', 'HOA Addendum', 'optional'),
      d('pd-lead-paint-addendum', 'Lead Based Paint Addendum', 'optional'),
      d('pd-amendment', 'Amendment To Contract', 'optional'),
      d('pd-intermediary-notice-1', 'TR 1409 · Intermediary Relationship Notice', 'optional'),
      d('pd-groundwater-disclosure-1', 'TREC 61-0 · Seller\'s Disclosure About Groundwater and Surface Water Rights', 'optional'),
    ],
  },
  {
    id: 'buyer-closing', label: 'Buyer Closing Documents',
    docs: [
      d('pd-walkthrough', 'TR 1925 · Buyer\'s Walk-Through, Confirmation, and Acceptance', 'required'),
      d('pd-closing-statement', 'Closing/Settlement Statement', 'required'),
      d('pd-new-survey', 'New Survey', 'optional'),
      d('pd-communication-log', 'Communication Log', 'optional'),
    ],
  },
  {
    id: 'residential-purchase', label: 'Documents Used for 1-4 Residential Purchase',
    docs: [
      d('pd-intermediary-notice-2', 'TR 1409 · Intermediary Relationship Notice', 'optional'),
      d('pd-one-to-four-contract', 'One to Four Family Residential Contract (Resale)', 'optional'),
      d('pd-third-party-financing-credit', 'Third Party Financing Addendum For Credit Approval', 'optional'),
      d('pd-amendment-1903', 'Amendment (TXR 1903 / TREC 39-9)', 'optional'),
      d('pd-lead-paint-txr', 'Addendum Regarding Lead-Based Paint', 'optional'),
      d('pd-non-realty-items', 'TREC 57-0 · Non-Realty Items Addendum', 'optional'),
      d('pd-mandatory-poa', 'TREC 36-11 · Addendum for Property Subject to Mandatory Membership in a Property Owners Association', 'optional'),
      d('pd-right-to-terminate', 'TREC 49-1 · Addendum Concerning Right to Terminate Due to Lender\'s Appraisal', 'optional'),
      d('pd-backup-contract', 'TREC 11-9 · Addendum for "Back-Up" Contract', 'optional'),
      d('pd-sale-of-other-property', 'TREC 10-6 · Addendum for Sale of Other Property by Buyer', 'optional'),
      d('pd-buyer-temp-lease', 'TREC 16-7 · Buyer\'s Temporary Residential Lease', 'optional'),
      d('pd-seller-temp-lease', 'TREC 15-7 · Seller\'s Temporary Residential Lease', 'optional'),
      d('pd-residential-service-company', 'TREC RSC-4 · Disclosure of Relationship with Residential Service Company', 'optional'),
      d('pd-environmental-assessment', 'TREC 28-2 · Environmental Assessment, Threatened or Endangered Species, and Wetlands Addendum', 'optional'),
      d('pd-home-inspection-protection', 'For Your Protection: Get a Home Inspection', 'optional'),
      d('pd-buyer-termination-notice', 'TREC 38-8 · Notice of Buyer\'s Termination of Contract', 'optional'),
      d('pd-withdrawal-of-offer', 'TR 1945 · Notice of Withdrawal of Offer', 'optional'),
      d('pd-release-earnest-money', 'TR 1904 · Release of Earnest Money', 'optional'),
      d('pd-short-sale-addendum', 'TREC 45-2 · Short Sale Addendum', 'optional'),
      d('pd-consumer-notice-hazards', 'TREC OP-I · Texas Real Estate Consumer Notice Concerning Hazards or Deficiencies', 'optional'),
      d('pd-broker-credit-letter', 'Broker Credit Letter', 'optional'),
      d('pd-representation-disclosure', 'TR 1417 · Representation Disclosure', 'optional'),
      d('pd-groundwater-disclosure-2', 'TREC 61-0 · Seller\'s Disclosure About Groundwater and Surface Water Rights', 'reference'),
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
      d('ld-mls-active', 'MLS Printout Showing Status Active (Subagent Shows 0%)', 'required'),
      reuse('pd-iabs', 'required', 'Seller: Information About Brokerage Services'),
      d('ld-listing-agreement', 'TR 1101 · Residential Real Estate Listing Agreement', 'required', 'TXR1101'),
      d('ld-consumer-protection-notice', 'TREC CN 1-5 · Consumer Protection Notice Displayed (Office, Website, Social Profiles)', 'required'),
      d('ld-wire-fraud-alert', 'TR 2517 · Wire Fraud Alert Or Wire Fraud Notice', 'required'),
      reuse('pd-sellers-disclosure-notice', 'required', "Seller's Disclosure Notice (TREC 55-1 Or TXR 1406)"),
      reuse('pd-affiliated-business', 'required', 'Affiliated Business Arrangement Disclosure Statement (ABA) For Sellers'),
      reuse('pd-tax-record', 'required', 'Tax Information Sheet'),
      d('ld-survey', 'Survey (Not Required On Cash Deals)', 'required'),
      d('ld-t47', 'TR 1907 · T-47 Residential Real Property Affidavit (Notarized; Not Needed With A New Survey)', 'required'),
      reuse('pd-cma', 'required', 'Comparative Market Analysis (Listing Price)'),
      reuse('pd-sales-disclosure-tx', 'required'),
      reuse('pd-commission-intake', 'required'),
      d('ld-hoa-info', 'HOA Information And Resale Certificate', 'optional'),
      d('ld-net-sheet', 'TR 1935 · Seller\'s Net Sheet (Signed By Seller)', 'optional'),
      d('ld-septic-disclosure', 'TR 1407 · Information About On-Site Sewer Facility', 'optional'),
      d('ld-mud-disclosure', 'MUD Disclosure (If Applicable)', 'optional'),
      d('ld-listing-amendment', 'TR 1404 · Listing Amendment For Extensions And Price Changes', 'optional'),
      d('ld-listing-termination', 'TR 1410 · Listing Termination Agreement', 'optional'),
      reuse('pd-groundwater-disclosure-1', 'optional'),
    ],
  },
  {
    id: 'listing-contract', label: 'Listing Under Contract Documents',
    docs: [
      reuse('pd-residential-contract', 'required'),
      reuse('pd-executed-contract-receipt', 'required', 'Receipted Residential Contract'),
      d('ld-em-receipt', 'Earnest Money Receipt', 'required'),
      d('ld-mls-pending', 'MLS Printout Showing Pending Status', 'required'),
      d('ld-buyer-agent-comp', 'Buyer Agent Compensation Agreement', 'optional'),
      reuse('pd-third-party-financing', 'optional'),
      reuse('pd-amendment', 'optional'),
      d('ld-repair-negotiation', 'Repair Request And Negotiation Documents', 'optional'),
      reuse('pd-hoa-addendum', 'optional'),
      reuse('pd-lead-paint-addendum', 'optional'),
      d('ld-seller-termination', 'TREC 50-0 · Notice of Seller\'s Termination of Contract', 'optional'),
    ],
  },
  {
    id: 'listing-closing', label: 'Listing Closing Documents',
    docs: [
      reuse('pd-closing-statement', 'required', "Seller's Closing/Settlement Statement"),
      d('ld-commission-disbursement', 'Commission Disbursement Authorization', 'required'),
      d('ld-final-walkthrough', 'Seller\'s Final Walk-Through', 'optional'),
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

/** Listing deals work the seller side even though only purchases ask which side the agent is on. */
export const effectiveAgentSide = (deal: { agentSide?: string; dealType?: string } | null | undefined): string =>
  deal?.agentSide || (deal?.dealType === 'listing_sale' || deal?.dealType === 'listing_lease' ? 'listing' : '');

type FolderDeal = { dealType?: string; agentSide?: string; buyerRepForm?: string; contractForm?: string; yearBuilt?: string; hasHoa?: boolean; contractDetails?: { financingType?: string } } | null | undefined;

/** Folders for a deal: side-specific list, the chosen contract and representation forms, and addenda the deal triggers. */
export function dealFolders(deal: FolderDeal): PurchaseFolder[] {
  const side = effectiveAgentSide(deal);
  const base = foldersForSide(side);
  const financing = (deal?.contractDetails?.financingType ?? '').trim().toLowerCase();
  const needsFinancing = Boolean(financing) && !/^cash\b/.test(financing);
  const year = Number.parseInt(deal?.yearBuilt ?? '', 10);
  const isCash = /^cash\b/.test(financing);
  const form = deal?.contractForm || '20';
  const noDisclosure = ['24', '23', '9'].includes(form);
  const needsLead = Number.isFinite(year) && year > 0 && year < 1978;
  const rep = BUYER_REP_FORM_OPTIONS.find((o) => o.value === deal?.buyerRepForm);
  const contract = CONTRACT_FORM_OPTIONS.find((o) => o.value === (deal?.contractForm || '20'));
  const folders = base.map((folder) => ({
    ...folder,
    docs: folder.docs.map((doc): PurchaseDoc => {
      if (doc.id === 'pd-buyer-rep-agreement' && rep) return { ...doc, label: rep.label };
      if (doc.id === 'pd-residential-contract' && contract) return { ...doc, label: contract.label, formFamily: contract.value };
      if (doc.id === 'pd-third-party-financing') return { ...doc, formFamily: '40', kind: needsFinancing ? 'required' : doc.kind };
      if (isCash && (doc.id === 'ld-survey' || doc.id === 'pd-existing-survey-t47')) return { ...doc, kind: 'optional' };
      if (noDisclosure && doc.id === 'pd-sellers-disclosure-notice') return { ...doc, kind: 'optional' };
      if (form === '25' && doc.id === 'ld-septic-disclosure') return { ...doc, kind: 'required' };
      if (form === '25' && doc.id === 'ld-listing-agreement') return { ...doc, label: 'Farm And Ranch Real Estate Listing Agreement (TXR 1201)', formFamily: undefined };
      return doc;
    }),
  }));
  const extra: PurchaseDoc[] = [];
  const has = (id: string) => folders.some((folder) => folder.docs.some((doc) => doc.id === id));
  if (deal?.hasHoa && !has('pd-hoa-addendum')) extra.push(d('pd-hoa-addendum', 'Addendum For Property Subject To Mandatory Membership In A Property Owners Association', 'required', '36'));
  if (needsLead && !has('pd-lead-paint-addendum')) extra.push(d('pd-lead-paint-addendum', 'Lead-Based Paint Addendum (Built Before 1978)', 'required', '56'));
  if (extra.length === 0) return folders;
  const idx = folders.findIndex((folder) => folder.id === (side === 'listing' ? 'listing-contract' : 'buyer-contract'));
  const at = idx >= 0 ? idx : folders.length - 1;
  return folders.map((folder, i) => (i === at ? { ...folder, docs: [...folder.docs, ...extra] } : folder));
}
export const requiredIdsFor = (folders: PurchaseFolder[]): string[] => folders.flatMap((f) => f.docs).filter((x) => x.kind === 'required').map((x) => x.id);
