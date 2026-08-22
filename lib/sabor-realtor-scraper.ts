// caxton-mailing-v1
// SABOR (San Antonio Board of REALTORS) public member directory scraper.
//
// Historical: this file used to house the ASP.NET WebForms scraping loop
// (session bootstrap, pagination via __EVENTTARGET / __VIEWSTATE, detail
// GETs). That flow now lives entirely in the GitHub Actions workflow;
// the app only needs the record shape at ingest time.
//
// The exported `SaborMemberRecord` interface is what the ingest route
// (app/api/admin/mailing/sabor-realtors/ingest) expects in its POST body.

export interface SaborMemberRecord {
  external_id: string;
  external_source: 'ramco-sabor';
  first_name: string;
  last_name: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  company: string | null;
  title: string | null;
  license_number: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  office_phone: string | null;
  county: string | null;
  designations: string | null;
  specialties: string | null;
  languages: string | null;
  member_type: string | null;
  board: string | null;
  website: string | null;
}
