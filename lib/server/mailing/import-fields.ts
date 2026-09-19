// lib/server/mailing/import-fields.ts
//
// CSV import field catalog + naive header guesser + name splitter.

// ============================================================

export type CanonicalImportField =
  | 'skip'
  | 'full_name'
  | 'first_name'
  | 'last_name'
  | 'email'
  | 'phone'
  | 'company'
  | 'title'
  | 'license_number'
  | 'address'
  | 'address_2'
  | 'city'
  | 'state'
  | 'zip'
  | 'website'
  | 'notes';
const GUESS_TABLE: Record<string, CanonicalImportField> = {
  'first name': 'first_name', 'firstname': 'first_name', 'fname': 'first_name', 'given name': 'first_name',
  'last name': 'last_name', 'lastname': 'last_name', 'lname': 'last_name', 'surname': 'last_name', 'family name': 'last_name',
  'full name': 'full_name', 'name': 'full_name',
  'email': 'email', 'email address': 'email', 'e mail': 'email',
  'phone': 'phone', 'phone number': 'phone', 'mobile': 'phone', 'cell': 'phone',
  'company': 'company', 'organization': 'company', 'business': 'company', 'employer': 'company',
  'title': 'title', 'job title': 'title', 'position': 'title', 'role': 'title',
  'license': 'license_number', 'license number': 'license_number', 'license no': 'license_number',
  'license #': 'license_number', 'lic': 'license_number', 'lic #': 'license_number', 'lic no': 'license_number',
  'address': 'address', 'street': 'address', 'street address': 'address', 'address 1': 'address', 'address1': 'address', 'mailing address': 'address',
  'address 2': 'address_2', 'address2': 'address_2', 'addr 2': 'address_2', 'addr2': 'address_2',
  'apt': 'address_2', 'apartment': 'address_2', 'suite': 'address_2', 'ste': 'address_2', 'unit': 'address_2',
  'mailing address 2': 'address_2', 'address line 2': 'address_2',
  'city': 'city',
  'state': 'state', 'province': 'state',
  'zip': 'zip', 'zipcode': 'zip', 'zip code': 'zip', 'postal code': 'zip', 'postcode': 'zip',
  'website': 'website', 'url': 'website', 'site': 'website',
  'notes': 'notes', 'note': 'notes', 'comment': 'notes',
};

export function guessField(header: string): CanonicalImportField {
  const h = header.trim().toLowerCase().replace(/[_\s-]+/g, ' ');
  return GUESS_TABLE[h] ?? 'skip';
}

export function splitFullName(full: string): { first_name: string; last_name: string } {
  const trimmed = full.trim().replace(/\s+/g, ' ');
  if (!trimmed) return { first_name: '', last_name: '' };
  const idx = trimmed.indexOf(' ');
  if (idx === -1) return { first_name: trimmed, last_name: '' };
  return { first_name: trimmed.slice(0, idx), last_name: trimmed.slice(idx + 1) };
}
