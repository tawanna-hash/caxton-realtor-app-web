// Agent Desk deal template. Captured from the 5100 Diamante Drive, Spicewood, TX 78669 deal:
// its Contract page layout (custom fields, field order, hidden fields, field names) is applied to every new deal.
// Values are intentionally empty; deal-specific data is never copied.
export const AGENT_DESK_TEMPLATE = {
  "contractCustomFields": [
    {
      "id": "cf-muv32pvdgn7p",
      "section": "buyer-broker",
      "label": "brokerage address",
      "value": ""
    },
    {
      "id": "cf-muv3u10vdih2",
      "section": "buyer-broker",
      "label": "Broker email",
      "value": ""
    },
    {
      "id": "cf-muv3vekml64k",
      "section": "buyer-broker",
      "label": "Broker Phone",
      "value": ""
    },
    {
      "id": "cf-muv3w11xi9sg",
      "section": "buyer-broker",
      "label": "Broker Name",
      "value": ""
    },
    {
      "id": "cf-muv3z7pycw3t",
      "section": "buyer-broker",
      "label": "Brokerage License No.",
      "value": ""
    },
    {
      "id": "cf-muv491gabsd9",
      "section": "seller-broker",
      "label": "Brokerage",
      "value": ""
    },
    {
      "id": "cf-muv4h38rm2qw",
      "section": "seller-broker",
      "label": "Broker Phone",
      "value": ""
    },
    {
      "id": "cf-muv4jk7l6bdb",
      "section": "buyer-broker",
      "label": "Broker License No.",
      "value": ""
    },
    {
      "id": "cf-muv4mhirmya6",
      "section": "seller-broker",
      "label": "Broker email",
      "value": ""
    },
    {
      "id": "cf-muv4mt3eki8d",
      "section": "lender",
      "label": "Loan Officer",
      "value": ""
    }
  ],
  "contractFieldOrder": {
    "lender": [
      "cf:cf-muv4mt3eki8d",
      "app:lender.address",
      "gap:g62azm",
      "gap:ulvhyp",
      "gap:ujf6f6",
      "app:lender.city",
      "gap:n0gojg",
      "gap:0v7ser",
      "gap:n2cyfy",
      "app:lender.state",
      "gap:4e6dzi",
      "gap:nuir1m",
      "gap:nr9kwf",
      "app:lender.zip"
    ],
    "property": [
      "p01_f004",
      "p01_f003",
      "p01_f005",
      "p01_f007"
    ],
    "buyer-broker": [
      "p11_f215",
      "p11_f212",
      "cf:cf-muv3w11xi9sg",
      "cf:cf-muv32pvdgn7p",
      "p11_f219",
      "cf:cf-muv3z7pycw3t",
      "cf:cf-muv4jk7l6bdb",
      "p08_f133",
      "p11_f218",
      "gap:veqxyi",
      "cf:cf-muv3vekml64k",
      "p08_f134",
      "p11_f217",
      "gap:cif5of",
      "cf:cf-muv3u10vdih2",
      "app:buyer-broker.zip"
    ],
    "seller-broker": [
      "p11_f201",
      "cf:cf-muv491gabsd9",
      "p11_f209",
      "p11_f202",
      "p11_f211",
      "p11_f203",
      "p11_f208",
      "p08_f137",
      "p11_f210",
      "gap:l9snxl",
      "cf:cf-muv4h38rm2qw",
      "p08_f138",
      "p11_f207",
      "gap:7ghpu6",
      "cf:cf-muv4mhirmya6",
      "app:seller-broker.zip"
    ]
  },
  "contractHiddenFields": [
    "p11_f216",
    "p11_f213",
    "p11_f221",
    "p11_f220",
    "p11_f222",
    "p11_f214",
    "p11_f206",
    "p11_f205",
    "p11_f204"
  ],
  "contractFieldLabels": {
    "p11_f201": "Agent Name",
    "p11_f203": "Brokerage License No.",
    "p11_f207": "Agent Email",
    "p11_f208": "broker License No.",
    "p11_f209": "Broker name",
    "p11_f210": "Agent Phone",
    "p11_f211": "Agent License No.",
    "p11_f212": "Brokerage",
    "p11_f215": "Agent Name",
    "p11_f217": "Agent Email",
    "p11_f218": "Agent Phone",
    "p11_f219": "Agent License No."
  }
} as const;

/** Task checklists seeded on a new deal, by deal type and agent side (ids match TASK_TEMPLATES in DealSubpage). */
export function templateTaskIdsFor(dealType?: string, agentSide?: string): string[] {
  if (dealType === 'listing_sale' || dealType === 'listing_lease' || agentSide === 'listing') return ['listing', 'tc-seller'];
  return ['tc-buyer'];
}
