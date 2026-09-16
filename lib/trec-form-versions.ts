import {
  TREC_20_19_FIELDS,
  TREC_FORM_EFFECTIVE_DATE,
  TREC_FORM_ID,
  type TrecFormFieldDefinition,
} from './trec-20-19-fields';

export type TrecFormVersion = {
  id: string;
  formNumber: string;
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
  formNumber: TREC_FORM_ID,
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
