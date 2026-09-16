import {
  TREC_20_19_FIELDS,
  TREC_FORM_EFFECTIVE_DATE,
  TREC_FORM_ID,
  type TrecFormFieldDefinition,
} from './trec-20-19-fields';
import { TREC_40_11_FIELDS, TREC_49_1_FIELDS } from './trec-addenda-fields';
import { GENERATED_TREC_FORM_VERSIONS } from './trec-library-versions.generated';

export type TrecFormVersion = {
  id: string;
  formFamily: string;
  formNumber: string;
  title: string;
  effectiveDate: string;
  pdfUrl: string;
  pageCount: number;
  fields: TrecFormFieldDefinition[];
  pageSections: Record<number, string>;
  isActive: boolean;
  createdAt: string;
};

export const BUILT_IN_TREC_FORM_VERSION: TrecFormVersion = {
  id: 'built-in-trec-20-19',
  formFamily: '20',
  formNumber: TREC_FORM_ID,
  title: 'One to Four Family Residential Contract (Resale)',
  effectiveDate: TREC_FORM_EFFECTIVE_DATE,
  pdfUrl: '/forms/trec-20-19.pdf',
  pageCount: 12,
  fields: [...TREC_20_19_FIELDS],
  pageSections: {
    1: '1. PARTIES · 2. PROPERTY · 3. SALES PRICE · 4. LEASES',
    2: '5. EARNEST MONEY AND TERMINATION OPTION · 6. TITLE POLICY AND SURVEY',
    3: '6. TITLE POLICY AND SURVEY',
    4: '6. TITLE POLICY AND SURVEY · 7. PROPERTY CONDITION',
    5: '7. PROPERTY CONDITION · 8. BROKER OR SALES AGENT DISCLOSURE',
    6: '8. BROKER OR SALES AGENT DISCLOSURE · 9. CLOSING · 10. POSSESSION · 11. SPECIAL PROVISIONS · 12. SETTLEMENT AND OTHER EXPENSES',
    7: '12. SETTLEMENT AND OTHER EXPENSES · 13. PRORATIONS · 14. CASUALTY LOSS · 15. DEFAULT · 16. MEDIATION · 17. ATTORNEY’S FEES · 18. ESCROW',
    8: '18. ESCROW · 19. REPRESENTATIONS · 20. GOVERNMENTAL REQUIREMENTS · 21. NOTICES',
    9: '22. AGREEMENT OF PARTIES · 23. CONSULT AN ATTORNEY BEFORE SIGNING',
    10: 'EXECUTED',
    11: 'BROKER CONTACT INFORMATION',
    12: 'OPTION FEE RECEIPT · EARNEST MONEY RECEIPT · ADDITIONAL EARNEST MONEY RECEIPT',
  },
  isActive: true,
  createdAt: '2026-05-04T00:00:00.000Z',
};

export const BUILT_IN_TREC_40_11_VERSION: TrecFormVersion = {
  id: 'built-in-trec-40-11',
  formFamily: '40',
  formNumber: '40-11',
  title: 'Third Party Financing Addendum',
  effectiveDate: '2025-01-03',
  pdfUrl: '/forms/trec-40-11.pdf',
  pageCount: 2,
  fields: TREC_40_11_FIELDS,
  pageSections: {
    1: '1. TYPE OF FINANCING AND DUTY TO APPLY AND OBTAIN APPROVAL · 2. APPROVAL OF FINANCING',
    2: '2. APPROVAL OF FINANCING · 3. SECURITY · 4. FHA/VA REQUIRED PROVISION · 5. AUTHORIZATION TO RELEASE INFORMATION',
  },
  isActive: true,
  createdAt: '2025-01-03T00:00:00.000Z',
};

export const BUILT_IN_TREC_49_1_VERSION: TrecFormVersion = {
  id: 'built-in-trec-49-1',
  formFamily: '49',
  formNumber: '49-1',
  title: 'Addendum Concerning Right to Terminate Due to Lender’s Appraisal',
  effectiveDate: '2019-03-01',
  pdfUrl: '/forms/trec-49-1.pdf',
  pageCount: 1,
  fields: TREC_49_1_FIELDS,
  pageSections: {
    1: 'WAIVER · PARTIAL WAIVER · ADDITIONAL RIGHT TO TERMINATE',
  },
  isActive: true,
  createdAt: '2019-03-01T00:00:00.000Z',
};

export const BUILT_IN_TREC_FORM_VERSIONS: TrecFormVersion[] = [
  BUILT_IN_TREC_FORM_VERSION,
  BUILT_IN_TREC_40_11_VERSION,
  BUILT_IN_TREC_49_1_VERSION,
  ...GENERATED_TREC_FORM_VERSIONS,
];
