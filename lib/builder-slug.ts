// lib/builder-slug.ts — pure slug utilities, safe for client imports.

export function builderNameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\/\\&]/g, '-')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}
