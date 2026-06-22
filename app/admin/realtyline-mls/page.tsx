// Legacy/short admin path. The RealtyLine MLS editor canonical home is at
// /admin/content/realtylinereport (grouped under the Content nav), but
// bookmarks and external links to /admin/realtyline-mls should keep landing
// on the FULL editor rather than a redirect to a different URL. So we
// just re-export the same client component here.

export { default } from '../content/realtylinereport/page';
