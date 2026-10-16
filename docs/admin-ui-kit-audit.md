# Admin UI kit audit (2026-10-16)

Scope: 100 pages under `app/admin`, plus `components/admin` and the shared shell.

## How the kit is applied
- Shell: `components/AppShell.tsx` (`data-admin-shell`, lavender canvas, light header) and `components/admin/AdminSidebar.tsx` (white sidebar, RNN logo tile, lavender active pills). Every admin route renders through `app/admin/layout.tsx`, so shell coverage is 100%.
- Page content: `<main data-admin-ui="true">` is styled by the "Admin UI kit skin" blocks in `app/globals.css` (cards, tables, fields, titles, tabs, buttons, focus, row hover). Rules are attribute-scoped, so public pages, signing links (`/admin/billing/sign/*`) and print layouts are unaffected.

## Findings
| Area | Status | Notes |
| --- | --- | --- |
| Shell, sidebar, header, quick links | Covered | Single source |
| Page titles (h1) | Covered | 14 h1s that bypass `PageTitle` (slate/gray classes) are caught by the global h1 rule |
| Serif section headings | Covered | 20 `font-serif` h2/h3 usages forced to Lato |
| Tables (48 files) | Covered | Header, dividers, hover, card wrapper via global rules |
| White bordered cards | Covered | Any `bg-white border` div/section |
| Gray-50 bordered panels (about 15) | Fixed in this sweep | Radius and hairline |
| Legacy small-radius buttons | Fixed in this sweep | rounded / rounded-md / rounded-lg |
| Orange focus rings and orange row hover (mailing, content shells) | Fixed in this sweep | Purple focus, lavender hover |
| Login, forgot and reset password | Partial | Get lavender canvas and Lato; layouts unchanged |
| Rich text editor body (`RichTextEditor.tsx`) | Intentionally unchanged | Georgia is the email/article body face |
| Report preview HTML (`ReportPreview`, `EventReportPreview`) | Intentionally unchanged | Emailed or exported HTML |
| Signature pad script font | Intentionally unchanged | Signature rendering |
| Orange accent CTAs | Unchanged | Kept as the RNN accent |

## Follow-ups worth a visual pass
Dense operational screens: mailing HUB (`MailingClient`), CRM (`CrmClient`), Hotspots editor, TREC 1-4 command center. They carry many local color classes that the global rules only partly reach.
