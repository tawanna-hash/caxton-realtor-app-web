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
