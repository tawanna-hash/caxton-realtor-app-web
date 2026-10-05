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
  { id: 'buyer', title: 'Buyer', fields: [
    f('p08_f123', 'Phone'), f('p08_f124', 'Phone (Second)'), f('p08_f125', 'Email'), f('p08_f126', 'Email (Second)'),
  ] },
  { id: 'seller', title: 'Seller', fields: [
    f('p08_f127', 'Address'), f('p08_f128', 'Address (Continued)'), f('p08_f129', 'Phone'), f('p08_f130', 'Phone (Second)'),
    f('p08_f131', 'Email'), f('p08_f132', 'Email (Second)'),
  ] },
  { id: 'buyer-broker', title: "Buyer's Agent", fields: [...brokerBlock('p11', 212, 'Buyer’s'), f('p08_f133', 'Notice Address'), f('p08_f134', 'Notice Address (Continued)'), f('p08_f135', 'Notice Phone'), f('p08_f136', 'Notice Email')] },
  { id: 'seller-broker', title: "Seller's Agent", fields: [...brokerBlock('p11', 201, 'Seller’s'), f('p08_f137', 'Notice Address'), f('p08_f138', 'Notice Address (Continued)'), f('p08_f139', 'Notice Phone'), f('p08_f140', 'Notice Email')] },
  { id: 'title-company', title: 'Title Company', fields: [
    f('p02_f038', 'Title Company'),
    f('p02_f028', 'Escrow Agent'), f('p02_f029', 'Escrow Agent Address'), f('p02_f030', 'Escrow Agent Address (Continued)'),
    f('p12_f259', 'Contract Received By Escrow Agent'), f('p12_f260', 'Contract Received By'), f('p12_f261', 'Email'), f('p12_f262', 'Date Contract Received'),
    f('p12_f263', 'Address'), f('p12_f264', 'Phone'), f('p12_f265', 'City'), f('p12_f266', 'State'), f('p12_f267', 'ZIP'), f('p12_f268', 'Fax'),
    f('p12_f247', 'Earnest Money Receipt Amount', 'm'), f('p12_f248', 'Earnest Money Form Of Payment'), f('p12_f249', 'Earnest Money Receipt Escrow Agent'),
    f('p12_f250', 'Earnest Money Received By'), f('p12_f251', 'Earnest Money Receipt Email'), f('p12_f252', 'Earnest Money Date And Time'),
    f('p12_f253', 'Earnest Money Receipt Address'), f('p12_f254', 'Earnest Money Receipt Phone'), f('p12_f255', 'Earnest Money Receipt City'),
    f('p12_f256', 'Earnest Money Receipt State'), f('p12_f257', 'Earnest Money Receipt ZIP'), f('p12_f258', 'Earnest Money Receipt Fax'),
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
