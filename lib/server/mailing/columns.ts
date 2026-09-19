// lib/server/mailing/columns.ts
//
// Column id catalog + sort-validity helpers.

// ============================================================

export type MailingColumnId =
  | 'first_name'
  | 'last_name'
  | 'email'
  | 'phone'
  | 'company'
  | 'title'
  | 'license_number'
  | 'address'
  | 'city'
  | 'state'
  | 'zip'
  | 'website'
  | 'notes'
  | 'addr_status'
  | 'created_at';

const MAILING_COLUMNS: {
  id: MailingColumnId;
  label: string;
  sortable: boolean;
  defaultVisible: boolean;
}[] = [
  { id: 'first_name',     label: 'First Name', sortable: true,  defaultVisible: true  },
  { id: 'last_name',      label: 'Last Name',  sortable: true,  defaultVisible: true  },
  { id: 'email',          label: 'Email',      sortable: true,  defaultVisible: true  },
  { id: 'phone',          label: 'Phone',      sortable: false, defaultVisible: true  },
  { id: 'company',        label: 'Company',    sortable: true,  defaultVisible: true  },
  { id: 'title',          label: 'Title',      sortable: false, defaultVisible: false },
  { id: 'license_number', label: 'License #',  sortable: false, defaultVisible: false },
  { id: 'address',        label: 'Address',    sortable: false, defaultVisible: false },
  { id: 'city',           label: 'City',       sortable: true,  defaultVisible: true  },
  { id: 'state',          label: 'State',      sortable: true,  defaultVisible: true  },
  { id: 'zip',            label: 'ZIP',        sortable: false, defaultVisible: false },
  { id: 'website',        label: 'Website',    sortable: false, defaultVisible: false },
  { id: 'notes',          label: 'Notes',      sortable: false, defaultVisible: false },
  { id: 'addr_status',    label: 'USPS',       sortable: false, defaultVisible: true  },
  { id: 'created_at',     label: 'Added',      sortable: true,  defaultVisible: true  },
];
const SORTABLE_COLUMNS = new Set<MailingColumnId>(
  MAILING_COLUMNS.filter((c) => c.sortable).map((c) => c.id),
);

export function isSortableColumn(v: unknown): v is MailingColumnId {
  return typeof v === 'string' && SORTABLE_COLUMNS.has(v as MailingColumnId);
}
