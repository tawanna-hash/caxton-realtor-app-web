// lib/builder-clients.ts
// Builder/Developer client list. Safe to import from client components —
// no server-only dependencies (no neon, no env vars at module init).

export const BUILDER_CLIENTS = [
  { value: 'mi-homes', label: 'M/I Homes', type: 'builder' as const },
  { value: 'kb-home', label: 'KB Home', type: 'builder' as const },
  { value: 'david-weekley-homes', label: 'David Weekley Homes', type: 'builder' as const },
  { value: 'gidden-homes', label: 'Gidden Homes', type: 'builder' as const },
  { value: 'drees-homes', label: 'Drees Homes', type: 'builder' as const },
  { value: 'la-cima', label: 'La Cima', type: 'developer' as const },
  { value: 'santa-rita-ranch', label: 'Santa Rita Ranch', type: 'developer' as const },
  { value: 'the-hollows-at-lake-travis', label: 'The Hollows at Lake Travis', type: 'developer' as const },
  { value: 'other', label: 'Other (specify)', type: 'other' as const },
] as const;
