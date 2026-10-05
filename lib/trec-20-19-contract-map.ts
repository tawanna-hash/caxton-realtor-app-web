// Plain-language map of every meaningful field on the TREC 20-19 One to Four Family Residential Contract.
// Initials boxes, page headers and signature boxes are intentionally left out.
// Each entry: [fieldId, label, kind]  kind: t = text, m = money, d = days, c = check box
export type ContractFieldKind = 't' | 'm' | 'd' | 'c';
export type ContractMapField = { id: string; label: string; kind: ContractFieldKind };
export type ContractMapSection = { id: string; title: string; fields: ContractMapField[] };

const f = (id: string, label: string, kind: ContractFieldKind = 't'): ContractMapField => ({ id, label, kind });

export const CONTRACT_MAP_SECTIONS: ContractMapSection[] = [
  { id: 'property', title: '2. Property', fields: [
    f('p01_f003', 'Lot'), f('p01_f004', 'Block'), f('p01_f005', 'Addition'), f('p01_f007', 'County'),
  ] },
  { id: 'notices', title: '21. Notices', fields: [ f('p08_f123', 'Buyer Phone'), f('p08_f124', 'Buyer Phone (Second)'),
    f('p08_f125', 'Buyer Email'), f('p08_f126', 'Buyer Email (Second)'),
    f('p08_f127', 'Seller Address'), f('p08_f128', 'Seller Address (Continued)'), f('p08_f129', 'Seller Phone'), f('p08_f130', 'Seller Phone (Second)'),
    f('p08_f131', 'Seller Email'), f('p08_f132', 'Seller Email (Second)'),
  ] },
  { id: 'seller-broker', title: "Seller's Agent", fields: [...brokerBlock('p11', 201, 'Seller’s'), f('p08_f137', 'Notice Address'), f('p08_f138', 'Notice Address (Continued)'), f('p08_f139', 'Notice Phone'), f('p08_f140', 'Notice Email')] },
  { id: 'buyer-broker', title: "Buyer's Agent", fields: [...brokerBlock('p11', 212, 'Buyer’s'), f('p08_f133', 'Notice Address'), f('p08_f134', 'Notice Address (Continued)'), f('p08_f135', 'Notice Phone'), f('p08_f136', 'Notice Email')] },
  { id: 'receipt-earnest', title: 'Earnest Money Receipt', fields: receiptBlock(247, 'Earnest Money') },
  { id: 'receipt-contract', title: 'Title Company', fields: [
    f('p12_f259', 'Escrow Agent'), f('p12_f260', 'Received By'), f('p12_f261', 'Email'), f('p12_f262', 'Date'),
    f('p12_f263', 'Address'), f('p12_f264', 'Phone'), f('p12_f265', 'City'), f('p12_f266', 'State'), f('p12_f267', 'ZIP'), f('p12_f268', 'Fax'),
  ] },
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
