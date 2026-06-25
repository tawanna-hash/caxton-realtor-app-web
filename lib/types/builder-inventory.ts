// lib/types/builder-inventory.ts
//
// Single Source of Truth for builder-inventory listing status. Re-exported
// by lib/builder-inventory.ts for backwards compatibility.

export const BUILDER_INVENTORY_STATUSES = [
  'pending',
  'active',
  'rejected',
  'expired',
] as const;
export type BuilderInventoryStatus = (typeof BUILDER_INVENTORY_STATUSES)[number];
