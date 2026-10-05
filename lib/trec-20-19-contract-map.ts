// Plain-language map of every meaningful field on the TREC 20-19 One to Four Family Residential Contract.
// Initials boxes, page headers and signature boxes are intentionally left out.
// Each entry: [fieldId, label, kind]  kind: t = text, m = money, d = days, c = check box
export type ContractFieldKind = 't' | 'm' | 'd' | 'c';
export type ContractMapField = { id: string; label: string; kind: ContractFieldKind; span?: number; pos?: [number, number] };
export type ContractMapSection = { id: string; title: string; fields: ContractMapField[] };

const f = (id: string, label: string, kind: ContractFieldKind = 't', span?: number, pos?: [number, number]): ContractMapField => ({ id, label, kind, ...(span ? { span } : {}), ...(pos ? { pos } : {}) });

export const CONTRACT_MAP_SECTIONS: ContractMapSection[] = [
  { id: 'property', title: 'Property Description', fields: [
    f('p01_f003', 'Lot'), f('p01_f004', 'Block'), f('p01_f005', 'Addition'), f('p01_f007', 'County'),
  ] },
  { id: 'buyer', title: 'Buyer', fields: [
    f('p08_f123', 'Buyer 1 Phone'), f('p08_f125', 'Buyer 1 Email'),
    f('p08_f124', 'Buyer 2 Phone'), f('p08_f126', 'Buyer 2 Email'),
    f('app:buyer.address', 'Address'), f('app:buyer.city', 'City'), f('app:buyer.state', 'State'), f('app:buyer.zip', 'ZIP'),
  ] },
  { id: 'seller', title: 'Seller', fields: [
    f('p08_f129', 'Seller 1 Phone'), f('p08_f131', 'Seller 1 Email'),
    f('p08_f130', 'Seller 2 Phone'), f('p08_f132', 'Seller 2 Email'),
    f('p08_f127', 'Address'), f('app:seller.city', 'City'), f('app:seller.state', 'State'), f('app:seller.zip', 'ZIP'),
  ] },
  { id: 'buyer-broker', title: "Buyer's Agent", fields: [
    f('p11_f212', 'Brokerage Name', 't', undefined, [1, 1]), f('p11_f214', 'Broker Firm License No.', 't', undefined, [1, 2]),
    f('p11_f220', 'Licensed Supervisor', 't', undefined, [1, 3]), f('p11_f222', 'Supervisor License No.', 't', undefined, [1, 4]),
    f('p11_f221', 'Supervisor Phone', 't', undefined, [1, 5]),
    f('p11_f215', 'Associate Name', 't', undefined, [2, 1]), f('p11_f216', 'Team Name', 't', undefined, [2, 2]),
    f('p11_f217', 'Associate Email', 't', undefined, [2, 3]), f('p11_f218', 'Associate Phone', 't', undefined, [2, 4]),
    f('p11_f219', 'Associate License No.', 't', undefined, [2, 5]),
    f('p11_f213', 'Brokerage Address', 't', undefined, [1, 6]), f('p08_f133', 'City', 't', undefined, [2, 6]),
    f('p08_f134', 'State', 't', undefined, [3, 6]), f('app:buyer-broker.zip', 'ZIP', 't', undefined, [4, 6]),
  ] },
  { id: 'seller-broker', title: "Seller's Agent", fields: [
    f('p11_f201', 'Seller’s Broker Firm'), f('p11_f204', 'Associate Name'), f('p11_f205', 'Team Name'), f('p11_f209', 'Licensed Supervisor'),
    f('p11_f202', 'Address'), f('p08_f137', 'City'), f('p08_f138', 'State'), f('app:seller-broker.zip', 'ZIP'),
    f('p11_f207', 'Associate Phone'), f('p11_f206', 'Associate Email', 't', 2), f('p11_f210', 'Supervisor Phone'),
    f('p11_f203', 'Broker Firm License No.'), f('p11_f208', 'Associate License No.'), f('p11_f211', 'Supervisor License No.'),
  ] },
  { id: 'lender', title: 'Lender', fields: [
    f('app:lender.address', 'Address'), f('app:lender.city', 'City'), f('app:lender.state', 'State'), f('app:lender.zip', 'ZIP'),
  ] },
  { id: 'title-company', title: 'Title Company', fields: [
    f('p02_f038', 'Title Company', 't', 2), f('p02_f028', 'Escrow Agent', 't', 2),
    f('p02_f029', 'Address'), f('p12_f265', 'City'), f('p12_f266', 'State'), f('p12_f267', 'ZIP'),
    f('p02_f030', 'Address (Continued)'), f('p12_f264', 'Phone'), f('p12_f268', 'Fax'), f('p12_f261', 'Email'),
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
