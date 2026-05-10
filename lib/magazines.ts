// Magazine types and client-side fetch helper.

export interface Magazine {
  id: number;
  publication: 'austin' | 'san_antonio';
  year: number;
  month: number;
  issue_label: string;
  cover_url: string;
  reader_url: string;
  page_urls: string[];
  page_count: number;
  sort_date: string;
}

export async function fetchMagazines(publication: string): Promise<Magazine[]> {
  const res = await fetch(`/api/magazines?publication=${encodeURIComponent(publication)}`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch magazines: ${res.status}`);
  }
  return res.json();
}
