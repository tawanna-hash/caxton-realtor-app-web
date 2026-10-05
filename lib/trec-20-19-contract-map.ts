// Plain-language map of every meaningful field on the TREC 20-19 One to Four Family Residential Contract.
// Initials boxes, page headers and signature boxes are intentionally left out.
// Each entry: [fieldId, label, kind]  kind: t = text, m = money, d = days, c = check box
export type ContractFieldKind = 't' | 'm' | 'd' | 'c';
export type ContractMapField = { id: string; label: string; kind: ContractFieldKind };
export type ContractMapSection = { id: string; title: string; fields: ContractMapField[] };

const f = (id: string, label: string, kind: ContractFieldKind = 't'): ContractMapField => ({ id, label, kind });

export const CONTRACT_MAP_SECTIONS: ContractMapSection[] = [
  { id: 'parties', title: '1. Parties', fields: [
    f('p01_f001', 'Seller'), f('p01_f002', 'Buyer'),
  ] },
  { id: 'property', title: '2. Property', fields: [
    f('p01_f003', 'Lot'), f('p01_f004', 'Block'), f('p01_f005', 'Addition'), f('p01_f006', 'City'), f('p01_f007', 'County'),
    f('p01_f008', 'Address And ZIP Code'), f('p01_f009', 'Exclusions'), f('p01_f010', 'Exclusions (Continued)'),
  ] },
  { id: 'price', title: '3. Sales Price', fields: [
    f('p01_f011', 'Cash Portion Payable By Buyer At Closing', 'm'),
    f('p01_f012', 'Third Party Financing Addendum', 'c'), f('p01_f013', 'Loan Assumption Addendum', 'c'), f('p01_f014', 'Seller Financing Addendum', 'c'),
    f('p01_f015', 'Sum Of All Financing', 'm'), f('p01_f016', 'Sales Price', 'm'),
  ] },
  { id: 'leases', title: '4. Leases', fields: [
    f('p01_f017', 'Residential Leases', 'c'), f('p01_f018', 'Fixture Leases', 'c'), f('p01_f019', 'Natural Resource Leases', 'c'),
    f('p01_f020', 'Seller Delivered Natural Resource Leases', 'c'), f('p01_f021', 'Seller Has Not Delivered Natural Resource Leases', 'c'),
    f('p01_f022', 'Days To Terminate After Receiving Leases', 'd'),
  ] },
  { id: 'earnest', title: '5. Earnest Money And Termination Option', fields: [
    f('p02_f028', 'Escrow Agent'), f('p02_f029', 'Escrow Agent Address'), f('p02_f030', 'Escrow Agent Address (Continued)'),
    f('p02_f031', 'Earnest Money', 'm'), f('p02_f032', 'Option Fee', 'm'),
    f('p02_f033', 'Additional Earnest Money', 'm'), f('p02_f034', 'Additional Earnest Money Due (Days After Effective Date)', 'd'),
    f('p02_f035', 'Option Period (Days)', 'd'),
  ] },
  { id: 'title', title: '6A. Title Policy', fields: [
    f('p02_f036', 'Title Policy At Seller’s Expense', 'c'), f('p02_f037', 'Title Policy At Buyer’s Expense', 'c'), f('p02_f038', 'Title Company'),
    f('p02_f039', 'Area Exception Will Not Be Amended', 'c'), f('p02_f040', 'Area Exception Will Be Amended', 'c'),
    f('p02_f041', 'Amendment At Buyer’s Expense', 'c'), f('p02_f042', 'Amendment At Seller’s Expense', 'c'),
  ] },
  { id: 'survey', title: '6C. Survey', fields: [
    f('p03_f048', 'Seller Furnishes Existing Survey', 'c'), f('p03_f049', 'Days To Furnish Existing Survey', 'd'),
    f('p03_f050', 'New Survey At Seller’s Expense', 'c'), f('p03_f051', 'New Survey At Buyer’s Expense', 'c'),
    f('p03_f052', 'Buyer Obtains New Survey', 'c'), f('p03_f053', 'Days For Buyer To Obtain Survey', 'd'),
    f('p03_f054', 'Seller Furnishes New Survey', 'c'), f('p03_f055', 'Days For Seller To Furnish New Survey', 'd'),
  ] },
  { id: 'objections', title: '6D. Title Objections', fields: [
    f('p03_f056', 'Prohibited Use Or Activity'), f('p03_f057', 'Days To Object After Commitment', 'd'),
  ] },
  { id: 'poa', title: '6E. Property Owners Association', fields: [
    f('p03_f058', 'Property Is Subject To Mandatory Membership', 'c'), f('p03_f059', 'Property Is Not Subject To Mandatory Membership', 'c'),
  ] },
  { id: 'condition', title: '7. Property Condition', fields: [
    f('p04_f065', 'Buyer Received Seller’s Disclosure Notice', 'c'), f('p04_f066', 'Buyer Has Not Received Seller’s Disclosure Notice', 'c'),
    f('p04_f067', 'Days For Seller To Deliver Disclosure Notice', 'd'), f('p04_f068', 'Seller Not Required To Furnish Disclosure Notice', 'c'),
    f('p05_f074', 'Buyer Accepts Property As Is', 'c'), f('p05_f075', 'Buyer Accepts As Is With Seller Repairs', 'c'),
    f('p05_f076', 'Specific Repairs And Treatments'), f('p05_f077', 'Specific Repairs And Treatments (Continued)'),
    f('p05_f078', 'Residential Service Contract Limit', 'm'),
    f('p05_f079', 'Buyer Received Seller’s Water Disclosure', 'c'), f('p05_f080', 'Buyer Has Not Received Seller’s Water Disclosure', 'c'),
    f('p05_f081', 'Days For Seller To Deliver Water Disclosure', 'd'), f('p05_f082', 'Seller Not Required To Deliver Water Disclosure', 'c'),
    f('p05_f083', 'Water Supplier'), f('p05_f084', 'Water Supplier (Continued)'),
  ] },
  { id: 'broker-disclosure', title: '8. Broker Or Sales Agent Disclosure', fields: [
    f('p06_f090', 'Disclosure'), f('p06_f091', 'Disclosure (Continued)'), f('p06_f092', 'Disclosure (Line 3)'),
  ] },
  { id: 'closing', title: '9. Closing And 10. Possession', fields: [
    f('p06_f093', 'Closing Date (Month And Day)'), f('p06_f094', 'Closing Year (20__)', 'd'),
    f('p06_f095', 'Possession Upon Closing And Funding', 'c'), f('p06_f096', 'Possession According To Temporary Lease', 'c'),
  ] },
  { id: 'special', title: '11. Special Provisions', fields: [
    f('p06_f097', 'Special Provisions'), f('p06_f098', 'Special Provisions (Continued)'), f('p06_f099', 'Special Provisions (Line 3)'),
  ] },
  { id: 'settlement', title: '12. Settlement And Other Expenses', fields: [
    f('p06_f100', 'Seller’s Contribution To Buyer’s Expenses (Not To Exceed)', 'm'),
    f('p07_f106', 'Seller Pays Buyer’s Broker', 'c'), f('p07_f107', 'Seller Pays Flat Amount', 'c'), f('p07_f108', 'Seller Flat Amount', 'm'),
    f('p07_f109', 'Seller Pays Percentage', 'c'), f('p07_f110', 'Seller Percentage Of Sales Price', 'd'),
    f('p07_f111', 'Buyer Pays Seller’s Broker', 'c'), f('p07_f112', 'Buyer Pays Flat Amount', 'c'), f('p07_f113', 'Buyer Flat Amount', 'm'),
    f('p07_f114', 'Buyer Pays Percentage', 'c'), f('p07_f115', 'Buyer Percentage Of Sales Price', 'd'),
  ] },
  { id: 'notices', title: '21. Notices', fields: [
    f('p08_f121', 'Buyer Address'), f('p08_f122', 'Buyer Address (Continued)'), f('p08_f123', 'Buyer Phone'), f('p08_f124', 'Buyer Phone (Second)'),
    f('p08_f125', 'Buyer Email'), f('p08_f126', 'Buyer Email (Second)'),
    f('p08_f127', 'Seller Address'), f('p08_f128', 'Seller Address (Continued)'), f('p08_f129', 'Seller Phone'), f('p08_f130', 'Seller Phone (Second)'),
    f('p08_f131', 'Seller Email'), f('p08_f132', 'Seller Email (Second)'),
    f('p08_f133', 'Buyer’s Agent Address'), f('p08_f134', 'Buyer’s Agent Address (Continued)'), f('p08_f135', 'Buyer’s Agent Phone'), f('p08_f136', 'Buyer’s Agent Email'),
    f('p08_f137', 'Seller’s Agent Address'), f('p08_f138', 'Seller’s Agent Address (Continued)'), f('p08_f139', 'Seller’s Agent Phone'), f('p08_f140', 'Seller’s Agent Email'),
  ] },
  { id: 'addenda', title: '22. Agreement Of Parties: Addenda', fields: [
    f('p09_f146', 'Third Party Financing Addendum', 'c'), f('p09_f147', 'Addendum For Sale Of Other Property By Buyer', 'c'),
    f('p09_f148', 'Addendum Concerning Right To Terminate Due To Lender’s Appraisal', 'c'), f('p09_f149', 'Seller Financing Addendum', 'c'),
    f('p09_f150', 'Addendum For Section 1031 Exchange', 'c'), f('p09_f151', 'Short Sale Addendum', 'c'), f('p09_f152', 'Loan Assumption Addendum', 'c'),
    f('p09_f153', 'Addendum For Release Of Liability On Assumed Loan', 'c'), f('p09_f154', 'Addendum Regarding Residential Leases', 'c'),
    f('p09_f155', 'Addendum Regarding Fixture Leases', 'c'), f('p09_f156', 'Buyer’s Temporary Residential Lease', 'c'), f('p09_f157', 'Seller’s Temporary Residential Lease', 'c'),
    f('p09_f158', 'Addendum For Authorizing Hydrostatic Testing', 'c'), f('p09_f159', 'Environmental Assessment, Threatened Or Endangered Species, And Wetlands Addendum', 'c'),
    f('p09_f160', 'Addendum For Lead-Based Paint Disclosure', 'c'), f('p09_f161', 'Addendum For Property In A Propane Gas System Service Area', 'c'),
    f('p09_f162', 'Addendum For Property Seaward Of The Gulf Intracoastal Waterway', 'c'), f('p09_f163', 'Addendum For Coastal Area Property', 'c'),
    f('p09_f164', 'Utility, Water, Drainage, Public Improvement And Other District Notices', 'c'), f('p09_f165', 'District Notices (List)'), f('p09_f166', 'District Notices (Continued)'),
    f('p09_f167', 'Addendum For Property Subject To Mandatory Membership In A Property Owners Association', 'c'), f('p09_f168', 'Non-Realty Items Addendum', 'c'),
    f('p09_f169', 'Addendum For Back-Up Contract', 'c'), f('p09_f170', 'Addendum For Reservation Of Oil, Gas, And Other Minerals', 'c'),
    f('p09_f171', 'Other Addendum', 'c'), f('p09_f172', 'Other Addendum (Description)'), f('p09_f173', 'Other Addendum (Continued)'),
  ] },
  { id: 'attorneys', title: '23. Attorneys', fields: [
    f('p09_f174', 'Buyer’s Attorney'), f('p09_f175', 'Buyer’s Attorney Address'), f('p09_f176', 'Buyer’s Attorney Phone Area Code'), f('p09_f177', 'Buyer’s Attorney Phone'),
    f('p09_f178', 'Buyer’s Attorney Fax Area Code'), f('p09_f179', 'Buyer’s Attorney Fax'), f('p09_f180', 'Buyer’s Attorney Email'),
    f('p09_f181', 'Seller’s Attorney'), f('p09_f182', 'Seller’s Attorney Address'), f('p09_f183', 'Seller’s Attorney Phone Area Code'), f('p09_f184', 'Seller’s Attorney Phone'),
    f('p09_f185', 'Seller’s Attorney Fax Area Code'), f('p09_f186', 'Seller’s Attorney Fax'), f('p09_f187', 'Seller’s Attorney Email'),
  ] },
  { id: 'executed', title: 'Executed (Effective Date)', fields: [
    f('p10_f193', 'Day'), f('p10_f194', 'Month'), f('p10_f195', 'Year (20__)', 'd'),
  ] },
  { id: 'seller-broker', title: 'Broker Contact: Seller’s Agent', fields: brokerBlock('p11', 201, 'Seller’s') },
  { id: 'buyer-broker', title: 'Broker Contact: Buyer’s Agent', fields: brokerBlock('p11', 212, 'Buyer’s') },
  { id: 'inter-seller', title: 'Broker Contact: Intermediary (For Seller)', fields: [
    f('p11_f223', 'Broker Firm'), f('p11_f224', 'Address'), f('p11_f225', 'Broker Firm License No.'),
    f('p11_f226', 'Associate Name (For Seller)'), f('p11_f227', 'Team Name'), f('p11_f228', 'Associate Email'), f('p11_f229', 'Associate Phone'), f('p11_f230', 'Associate License No.'),
    f('p11_f231', 'Licensed Supervisor'), f('p11_f232', 'Supervisor Phone'), f('p11_f233', 'Supervisor License No.'),
  ] },
  { id: 'inter-buyer', title: 'Broker Contact: Intermediary (For Buyer)', fields: [
    f('p11_f234', 'Associate Name (For Buyer)'), f('p11_f235', 'Team Name'), f('p11_f236', 'Associate Email'), f('p11_f237', 'Associate Phone'), f('p11_f238', 'Associate License No.'),
    f('p11_f239', 'Licensed Supervisor'), f('p11_f240', 'Supervisor Phone'), f('p11_f241', 'Supervisor License No.'),
  ] },
  { id: 'receipt-option', title: 'Option Fee Receipt', fields: [
    f('p12_f243', 'Option Fee Amount', 'm'), f('p12_f244', 'Form Of Payment'), f('p12_f245', 'Received By (Seller Or Listing Broker)'), f('p12_f246', 'Date'),
  ] },
  { id: 'receipt-earnest', title: 'Earnest Money Receipt', fields: receiptBlock(247, 'Earnest Money') },
  { id: 'receipt-contract', title: 'Contract Receipt', fields: [
    f('p12_f259', 'Escrow Agent'), f('p12_f260', 'Received By'), f('p12_f261', 'Email'), f('p12_f262', 'Date'),
    f('p12_f263', 'Address'), f('p12_f264', 'Phone'), f('p12_f265', 'City'), f('p12_f266', 'State'), f('p12_f267', 'ZIP'), f('p12_f268', 'Fax'),
  ] },
  { id: 'receipt-additional', title: 'Additional Earnest Money Receipt', fields: receiptBlock(269, 'Additional Earnest Money') },
];

function brokerBlock(page: string, start: number, side: string): ContractMapField[] {
  const id = (n: number) => `${page}_f${String(start + n).padStart(3, '0')}`;
  return [
    f(id(0), `${side} Broker Firm`), f(id(1), 'Address'), f(id(2), 'Broker Firm License No.'), f(id(3), 'Associate Name'), f(id(4), 'Team Name'),
    f(id(5), 'Associate Email'), f(id(6), 'Associate Phone'), f(id(7), 'Associate License No.'),
    f(id(8), 'Licensed Supervisor'), f(id(9), 'Supervisor Phone'), f(id(10), 'Supervisor License No.'),
  ];
}

function receiptBlock(start: number, name: string): ContractMapField[] {
  const id = (n: number) => `p12_f${String(start + n).padStart(3, '0')}`;
  return [
    f(id(0), `${name} Amount`, 'm'), f(id(1), 'Form Of Payment'), f(id(2), 'Escrow Agent'), f(id(3), 'Received By'), f(id(4), 'Email'), f(id(5), 'Date And Time'),
    f(id(6), 'Address'), f(id(7), 'Phone'), f(id(8), 'City'), f(id(9), 'State'), f(id(10), 'ZIP'), f(id(11), 'Fax'),
  ];
}
