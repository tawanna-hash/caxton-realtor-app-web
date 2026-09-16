export type TrecFormLibraryCategory = 'Contracts' | 'Contract Addenda' | 'Other Forms';

export type TrecFormLibraryItem = {
  formFamily: string;
  formNumber: string;
  title: string;
  effectiveDate: string;
  category: TrecFormLibraryCategory;
  pdfUrl: string;
  local: boolean;
};

export const TREC_FORM_LIBRARY: TrecFormLibraryItem[] = [
  { formFamily: '39', formNumber: '39-11', title: 'Amendment to Contract', effectiveDate: '2026-07-01', category: 'Contracts', pdfUrl: '/forms/trec-library/trec-39-11.pdf', local: true },
  { formFamily: '25', formNumber: '25-17', title: 'Farm and Ranch Contract', effectiveDate: '2026-07-01', category: 'Contracts', pdfUrl: '/forms/trec-library/trec-25-17.pdf', local: true },
  { formFamily: '24', formNumber: '24-20', title: 'New Home Contract (Completed Construction)', effectiveDate: '2026-07-01', category: 'Contracts', pdfUrl: '/forms/trec-library/trec-24-20.pdf', local: true },
  { formFamily: '23', formNumber: '23-20', title: 'New Home Contract (Incomplete Construction)', effectiveDate: '2026-07-01', category: 'Contracts', pdfUrl: '/forms/trec-library/trec-23-20.pdf', local: true },
  { formFamily: '20', formNumber: '20-19', title: 'One to Four Family Residential Contract (Resale)', effectiveDate: '2026-07-01', category: 'Contracts', pdfUrl: '/forms/trec-20-19.pdf', local: true },
  { formFamily: '30', formNumber: '30-18', title: 'Residential Condominium Contract (Resale)', effectiveDate: '2026-07-01', category: 'Contracts', pdfUrl: '/forms/trec-library/trec-30-18.pdf', local: true },
  { formFamily: '9', formNumber: '9-18', title: 'Unimproved Property Contract', effectiveDate: '2026-07-01', category: 'Contracts', pdfUrl: '/forms/trec-library/trec-9-18.pdf', local: true },

  { formFamily: '49', formNumber: '49-1', title: "Addendum Concerning Right to Terminate Due to Lender's Appraisal", effectiveDate: '2019-03-01', category: 'Contract Addenda', pdfUrl: '/forms/trec-49-1.pdf', local: true },
  { formFamily: '53', formNumber: '53-0', title: 'Addendum Containing Notice of Obligation to Pay Improvement District Assessment', effectiveDate: '2021-09-01', category: 'Contract Addenda', pdfUrl: '/forms/trec-library/trec-53-0.pdf', local: true },
  { formFamily: '11', formNumber: '11-9', title: 'Addendum for "Back-Up" Contract', effectiveDate: '2026-07-01', category: 'Contract Addenda', pdfUrl: '/forms/trec-library/trec-11-9.pdf', local: true },
  { formFamily: '48', formNumber: '48-1', title: 'Addendum for Authorizing Hydrostatic Testing', effectiveDate: '2020-03-01', category: 'Contract Addenda', pdfUrl: '/forms/trec-library/trec-48-1.pdf', local: true },
  { formFamily: '33', formNumber: '33-2', title: 'Addendum for Coastal Area Property', effectiveDate: '2011-12-05', category: 'Contract Addenda', pdfUrl: '/forms/trec-library/trec-33-2.pdf', local: true },
  { formFamily: '47', formNumber: '47-0', title: 'Addendum for Property in a Propane Gas System Service Area', effectiveDate: '2014-02-01', category: 'Contract Addenda', pdfUrl: '/forms/trec-library/trec-47-0.pdf', local: true },
  { formFamily: '34', formNumber: '34-4', title: 'Addendum for Property Located Seaward of the Gulf Intracoastal Waterway', effectiveDate: '2011-12-05', category: 'Contract Addenda', pdfUrl: '/forms/trec-library/trec-34-4.pdf', local: true },
  { formFamily: '36', formNumber: '36-11', title: 'Addendum for Property Subject to Mandatory Membership in a Property Owners Association', effectiveDate: '2026-07-01', category: 'Contract Addenda', pdfUrl: '/forms/trec-library/trec-36-11.pdf', local: true },
  { formFamily: '12', formNumber: '12-3', title: "Addendum for Release of Liability on Assumed Loan and/or Restoration of Seller's VA Entitlement", effectiveDate: '2011-12-05', category: 'Contract Addenda', pdfUrl: '/forms/trec-library/trec-12-3.pdf', local: true },
  { formFamily: '44', formNumber: '44-3', title: 'Addendum for Reservation of Oil, Gas, and Other Minerals', effectiveDate: '2023-02-01', category: 'Contract Addenda', pdfUrl: '/forms/trec-library/trec-44-3.pdf', local: true },
  { formFamily: '10', formNumber: '10-6', title: 'Addendum for Sale of Other Property by Buyer', effectiveDate: '2011-12-05', category: 'Contract Addenda', pdfUrl: '/forms/trec-library/trec-10-6.pdf', local: true },
  { formFamily: '60', formNumber: '60-0', title: 'Addendum for Section 1031 Exchange', effectiveDate: '2025-01-03', category: 'Contract Addenda', pdfUrl: '/forms/trec-library/trec-60-0.pdf', local: true },
  { formFamily: '56', formNumber: '56-0', title: "Addendum for Seller's Disclosure of Information on Lead-Based Paint and Lead-Based Paint Hazards as Required by Federal Law", effectiveDate: '2026-05-28', category: 'Contract Addenda', pdfUrl: '/forms/trec-library/trec-56-0.pdf', local: true },
  { formFamily: '52', formNumber: '52-1', title: 'Addendum Regarding Fixture Leases', effectiveDate: '2023-02-01', category: 'Contract Addenda', pdfUrl: '/forms/trec-library/trec-52-1.pdf', local: true },
  { formFamily: '51', formNumber: '51-1', title: 'Addendum Regarding Residential Leases', effectiveDate: '2023-02-01', category: 'Contract Addenda', pdfUrl: '/forms/trec-library/trec-51-1.pdf', local: true },
  { formFamily: '16', formNumber: '16-7', title: "Buyer's Temporary Residential Lease", effectiveDate: '2026-01-05', category: 'Contract Addenda', pdfUrl: '/forms/trec-library/trec-16-7.pdf', local: true },
  { formFamily: '28', formNumber: '28-2', title: 'Environmental Assessment, Threatened or Endangered Species, and Wetlands Addendum', effectiveDate: '2011-12-05', category: 'Contract Addenda', pdfUrl: '/forms/trec-library/trec-28-2.pdf', local: true },
  { formFamily: '41', formNumber: '41-3', title: 'Loan Assumption Addendum', effectiveDate: '2023-02-01', category: 'Contract Addenda', pdfUrl: '/forms/trec-library/trec-41-3.pdf', local: true },
  { formFamily: '57', formNumber: '57-0', title: 'Non-Realty Items Addendum', effectiveDate: '2025-09-03', category: 'Contract Addenda', pdfUrl: '/forms/trec-library/trec-57-0.pdf', local: true },
  { formFamily: '26', formNumber: '26-8', title: 'Seller Financing Addendum', effectiveDate: '2023-02-01', category: 'Contract Addenda', pdfUrl: '/forms/trec-library/trec-26-8.pdf', local: true },
  { formFamily: '15', formNumber: '15-7', title: "Seller's Temporary Residential Lease", effectiveDate: '2026-01-05', category: 'Contract Addenda', pdfUrl: '/forms/trec-library/trec-15-7.pdf', local: true },
  { formFamily: '45', formNumber: '45-2', title: 'Short Sale Addendum', effectiveDate: '2021-04-01', category: 'Contract Addenda', pdfUrl: '/forms/trec-library/trec-45-2.pdf', local: true },
  { formFamily: '40', formNumber: '40-11', title: 'Third Party Financing Addendum', effectiveDate: '2025-01-03', category: 'Contract Addenda', pdfUrl: '/forms/trec-40-11.pdf', local: true },

  { formFamily: '32', formNumber: '32-5', title: 'Condominium Resale Certificate', effectiveDate: '2024-11-25', category: 'Other Forms', pdfUrl: '/forms/trec-library/trec-32-5.pdf', local: true },
  { formFamily: 'RSC', formNumber: 'RSC-4', title: 'Disclosure of Relationship with Residential Service Company', effectiveDate: '2023-06-11', category: 'Other Forms', pdfUrl: '/forms/trec-library/trec-RSC-4.pdf', local: true },
  { formFamily: '54', formNumber: '54-1', title: "Landlord's Floodplain and Flood Notice", effectiveDate: '2025-11-26', category: 'Other Forms', pdfUrl: '/forms/trec-library/trec-54-1.pdf', local: true },
  { formFamily: '38', formNumber: '38-8', title: "Notice of Buyer's Termination of Contract", effectiveDate: '2025-04-01', category: 'Other Forms', pdfUrl: '/forms/trec-library/trec-38-8.pdf', local: true },
  { formFamily: '50', formNumber: '50-0', title: "Notice of Seller's Termination of Contract", effectiveDate: '2018-08-13', category: 'Other Forms', pdfUrl: '/forms/trec-library/trec-50-0.pdf', local: true },
  { formFamily: '58', formNumber: '58-0', title: 'Notice to Prospective Buyer', effectiveDate: '2025-09-03', category: 'Other Forms', pdfUrl: '/forms/trec-library/trec-58-0.pdf', local: true },
  { formFamily: '59', formNumber: '59-0', title: 'Notice to Purchaser of Special Taxing or Assessment District', effectiveDate: '2024-02-12', category: 'Other Forms', pdfUrl: '/forms/trec-library/trec-59-0.pdf', local: true },
  { formFamily: 'REI-7', formNumber: 'REI 7-6', title: 'Property Inspection Report', effectiveDate: '2022-02-01', category: 'Other Forms', pdfUrl: '/forms/trec-library/trec-REI-7-6.pdf', local: true },
  { formFamily: '61', formNumber: '61-0', title: "Seller's Disclosure about Groundwater and Surface Water Rights", effectiveDate: '2026-07-01', category: 'Other Forms', pdfUrl: '/forms/trec-library/trec-61-0.pdf', local: true },
  { formFamily: '55', formNumber: '55-1', title: "Seller's Disclosure Notice", effectiveDate: '2026-05-28', category: 'Other Forms', pdfUrl: '/forms/trec-library/trec-55-1.pdf', local: true },
  { formFamily: '62', formNumber: '62-0', title: 'Seller\'s Notice to Buyer of Removal of Contingency Under Addendum for "Back-Up" Contract', effectiveDate: '2026-05-28', category: 'Other Forms', pdfUrl: '/forms/trec-library/trec-62-0.pdf', local: true },
  { formFamily: '37', formNumber: '37-5', title: "Subdivision Information, Including Resale Certificate for Property Subject to Mandatory Membership in a Property Owners' Association", effectiveDate: '2014-02-10', category: 'Other Forms', pdfUrl: '/forms/trec-library/trec-37-5.pdf', local: true },
];

export const TREC_FORM_LIBRARY_CATEGORIES: Array<'All Forms' | TrecFormLibraryCategory> = [
  'All Forms',
  'Contracts',
  'Contract Addenda',
  'Other Forms',
];
