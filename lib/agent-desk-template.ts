// Agent Desk deal template. Captured from the 5100 Diamante Drive, Spicewood, TX 78669 deal:
// its Contract page layout (custom fields, field order, hidden fields, field names) is applied to every new deal.
// Values are intentionally empty; deal-specific data is never copied.
export const AGENT_DESK_TEMPLATE = {
  "contractCustomFields": [
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
    ]
  },
  "contractHiddenFields": [],
  "contractFieldLabels": {}
} as const;

/** Task checklists seeded on a new deal, by deal type and agent side (ids match TASK_TEMPLATES in DealSubpage). */
export function templateTaskIdsFor(dealType?: string, agentSide?: string): string[] {
  if (dealType === 'listing_sale' || dealType === 'listing_lease' || agentSide === 'listing') return ['listing', 'tc-seller'];
  return ['tc-buyer'];
}
