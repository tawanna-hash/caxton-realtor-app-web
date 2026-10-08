// Deal File: every detail on a deal, gathered from all pages into one document that can be read, downloaded as a PDF and printed.
import type { AgentDeal } from '@/lib/agent-command-center-workspace';

export type DealFileSection = { title: string; headers?: string[]; rows: string[][] };
type DeadlineLike = { id: string; label: string; date: string; rule?: string };

const dash = (v: unknown) => { const t = String(v ?? '').trim(); return t || '—'; };
const nice = (text: string) => text.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[^A-Za-z0-9]+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase());
const day = (iso: string) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const stamp = (iso: string) => (iso ? new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const money = (v: string | undefined) => { const t = (v ?? '').trim(); return t ? (t.startsWith('$') ? t : `$${t}`) : '—'; };

export function buildDealFile(deal: AgentDeal, deadlines: readonly DeadlineLike[], healthLabel: string, stageName: string): { title: string; subtitle: string; sections: DealFileSection[] } {
  const cd = deal.contractDetails;
  const sections: DealFileSection[] = [];

  sections.push({ title: 'Deal Summary', rows: [
    ['Property', dash(deal.propertyAddress || deal.title)],
    ['Deal Type', nice(deal.dealType)], ['Agent Side', deal.agentSide ? nice(deal.agentSide) : '—'],
    ['Stage', stageName], ['Health', healthLabel],
    ['Buyer(s)', dash([deal.buyerNames, deal.buyer2Name].filter(Boolean).join(', '))],
    ['Seller(s)', dash([deal.sellerNames, deal.seller2Name].filter(Boolean).join(', '))],
    ['Sales Price', money(cd?.salesPrice)], ['Owner', dash(deal.owner)],
    ['Lender', dash(deal.lender)], ['Other Agent', dash(deal.otherAgent)],
    ['Next Action', dash(deal.nextAction)], ['Notes', dash(deal.notes)],
    ['Deal Opened', stamp(deal.createdAt)], ['Last Updated', stamp(deal.updatedAt)],
    ...(deal.auditLocked ? [['Record Status', 'Closed and locked for audit retention']] : []),
    ...(deal.closeoutOutcome ? [['Closeout', `${deal.closeoutOutcome}${deal.closeoutDate ? ` on ${day(deal.closeoutDate)}` : ''}${deal.closeoutNote ? ` — ${deal.closeoutNote}` : ''}`]] : []),
  ] });

  const dl = deadlines.slice().sort((a, b) => a.date.localeCompare(b.date)).map((d) => [d.label, day(d.date), deal.documentChecks[`dl:${d.id}`] ? 'Done' : 'Open', d.rule ? d.rule : '']);
  sections.push({ title: 'Key Dates And Deadlines', headers: ['Deadline', 'Date', 'Status', 'Rule'], rows: [
    ['Effective Date', day(deal.effectiveDate), '', ''],
    ['Earnest Money Delivered', day(deal.earnestMoneyDeliveredDate), '', ''],
    ['Option Fee Delivered', day(deal.optionFeeDeliveredDate), '', ''],
    ['Closing Date', day(deal.closingDate), '', ''],
    ...dl,
  ] });

  const detailRows = Object.entries(cd ?? {}).filter(([, v]) => String(v ?? '').trim()).map(([k, v]) => [nice(k), String(v)]);
  sections.push({ title: 'Contract Details', rows: detailRows.length ? detailRows : [['Contract Details', 'None entered']] });
  if (deal.keyTerms.length) sections.push({ title: 'Key Terms', headers: ['Term', 'Ref', 'Value', 'Note'], rows: deal.keyTerms.map((t) => [t.term, dash(t.ref), dash(t.value), dash(t.note)]) });
  const custom = deal.contractCustomFields.filter((f) => f.value.trim());
  if (custom.length) sections.push({ title: 'Custom Contract Fields', rows: custom.map((f) => [`${f.label} (${nice(f.section)})`, f.value]) });
  const addr = Object.entries(deal.contractAddresses).filter(([, v]) => v.trim());
  if (addr.length) sections.push({ title: 'Contract Addresses', rows: addr.map(([k, v]) => [nice(k), v]) });

  if (deal.cashLines.length) sections.push({ title: 'Cash To Close', headers: ['Line', 'Amount', 'Note'], rows: deal.cashLines.map((c) => [c.label, `${c.sign}${money(c.amount)}`, dash(c.note)]) });

  const people: string[][] = [
    ...deal.clientContacts.map((p) => [p.name, dash(p.role || 'Client'), dash(p.email), dash(p.phone)]),
    ...deal.serviceProviders.map((p) => [p.name, nice(p.category), dash(p.email), dash(p.phone)]),
  ];
  sections.push({ title: 'People And Service Providers', headers: ['Name', 'Role', 'Email', 'Phone'], rows: people.length ? people : [['No people added', '', '', '']] });

  const pref = Object.entries(deal.preferences ?? {}).filter(([, v]) => String(v ?? '').trim());
  if (pref.length) sections.push({ title: 'Client Preferences', rows: pref.map(([k, v]) => [nice(k), String(v)]) });
  if (deal.offersShowings.length) sections.push({ title: 'Offers And Showings', headers: ['Type', 'Date', 'Detail', 'Amount', 'Status'], rows: deal.offersShowings.map((o) => [nice(o.kind), day(o.date), o.label, dash(o.amount), dash(o.status)]) });

  if (deal.documents.length) sections.push({ title: 'Document Requests', headers: ['Document', 'Status', 'Requested', 'File', 'Uploaded'], rows: deal.documents.map((d) => [d.label, nice(d.status), stamp(d.requestedAt), dash(d.fileName), d.fileUploadedAt ? stamp(d.fileUploadedAt) : '—']) });
  const checks = Object.entries(deal.documentChecks).filter(([k]) => !k.startsWith('dl:') && !k.startsWith('add:'));
  const done = checks.filter(([, v]) => v).length;
  sections.push({ title: 'Readiness Checklist', headers: ['Item', 'Status'], rows: checks.length ? [[`Complete: ${done} of ${checks.length}`, ''], ...checks.map(([k, v]) => [nice(k), v ? 'Done' : 'Open'])] : [['No checklist items checked yet', '']] });
  const addenda = Object.entries(deal.addenda).filter(([, v]) => v).map(([k]) => nice(k));
  if (addenda.length) sections.push({ title: 'Addenda Included', rows: addenda.map((a) => [a, 'Included']) });
  const fam = Object.entries(deal.selectedFormFamilies).filter(([, v]) => v).map(([k]) => k);
  if (fam.length) sections.push({ title: 'Forms Selected', rows: [['Form Families', fam.join(', ')]] });

  sections.push({ title: 'Tasks', headers: ['Task', 'Due', 'Priority', 'Status', 'Note'], rows: deal.tasks.length ? deal.tasks.map((t) => [t.title.replace(/(^|[\s/(\-])([a-z])/g, (_m, a: string, b: string) => a + b.toUpperCase()), day(t.dueDate), nice(t.priority), t.complete ? 'Done' : nice(t.status), dash(t.note)]) : [['No tasks', '', '', '', '']] });
  if (deal.reminders.length) sections.push({ title: 'Reminders', headers: ['Reminder', 'Date', 'Note'], rows: deal.reminders.map((r) => [r.label, day(r.reminderDate), dash(r.note)]) });

  sections.push({ title: 'Audit Trail', headers: ['When', 'Event'], rows: deal.activity.length ? [...deal.activity].reverse().map((a) => [stamp(a.createdAt), a.message]) : [['No activity recorded', '']] });
  sections.push({ title: 'Not Included', rows: [['Messages, scheduling and client portal activity', 'These are stored separately and are not part of this file yet.']] });
  return { title: dash(deal.propertyAddress || deal.title), subtitle: `Deal File · Generated ${new Date().toLocaleString('en-US')}`, sections };
}

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

export function dealFileHtml(file: ReturnType<typeof buildDealFile>): string {
  const body = file.sections.map((s) => `<h2>${esc(s.title)}</h2><table>${s.headers ? `<thead><tr>${s.headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>` : ''}<tbody>${s.rows.map((r) => `<tr>${r.map((c, i) => `<${!s.headers && i === 0 ? 'th class="k"' : 'td'}>${esc(c)}</${!s.headers && i === 0 ? 'th' : 'td'}>`).join('')}</tr>`).join('')}</tbody></table>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(file.title)} Deal File</title><style>
  body{font-family:Inter,Arial,sans-serif;color:#1B1726;margin:32px;font-size:12px}h1{font-size:22px;margin:0;color:#301D5D}.sub{color:#4A4757;margin:4px 0 18px}
  h2{font-size:14px;margin:20px 0 6px;color:#301D5D;border-bottom:2px solid #301D5D;padding-bottom:3px;break-after:avoid}
  table{width:100%;border-collapse:collapse}th,td{border:1px solid #E6E5EC;padding:5px 8px;text-align:left;vertical-align:top}thead th{background:#EFEAF8}th.k{width:30%;background:#F6F3FB;font-weight:600}tr{break-inside:avoid}
  @page{margin:0.6in}</style></head><body><h1>${esc(file.title)}</h1><p class="sub">${esc(file.subtitle)}</p>${body}</body></html>`;
}

export function printDealFile(file: ReturnType<typeof buildDealFile>) {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(frame);
  const w = frame.contentWindow; if (!w) return;
  w.document.open(); w.document.write(dealFileHtml(file)); w.document.close();
  setTimeout(() => { w.focus(); w.print(); setTimeout(() => frame.remove(), 2000); }, 300);
}

export async function downloadDealFilePdf(file: ReturnType<typeof buildDealFile>): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const margin = 44; const width = doc.internal.pageSize.getWidth();
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(48, 29, 93); doc.text(file.title, margin, 54);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(74, 71, 87); doc.text(file.subtitle, margin, 70);
  let y = 90;
  for (const s of file.sections) {
    if (y > 700) { doc.addPage(); y = 54; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(48, 29, 93); doc.text(s.title, margin, y);
    doc.setDrawColor(48, 29, 93); doc.setLineWidth(1); doc.line(margin, y + 4, width - margin, y + 4);
    autoTable(doc, {
      startY: y + 10, margin: { left: margin, right: margin }, theme: 'grid',
      styles: { fontSize: 8.5, textColor: [27, 23, 38], cellPadding: 4, lineColor: [230, 229, 236] },
      headStyles: { fillColor: [239, 234, 248], textColor: [48, 29, 93] },
      columnStyles: s.headers ? undefined : { 0: { fontStyle: 'bold', fillColor: [246, 243, 251], cellWidth: 150 } },
      head: s.headers ? [s.headers] : undefined, body: s.rows,
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 22;
  }
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(107, 104, 120); doc.text(`${file.title} · Page ${i} of ${pages}`, margin, doc.internal.pageSize.getHeight() - 24); }
  doc.save(`Deal-File-${file.title.replace(/[^A-Za-z0-9]+/g, '-').slice(0, 60)}.pdf`);
}
