'use client';

import type { TrecFormVersion } from '@/lib/trec-form-versions';

type Props = {
  version: TrecFormVersion | undefined;
  values: Record<string, string>;
  onEdit: (page: number) => void;
};

function titleCase(text: string): string {
  return text
    .toLowerCase()
    .replace(/(^|[\s·(])([a-z])/g, (_m, lead: string, ch: string) => `${lead}${ch.toUpperCase()}`);
}

export default function ContractScope({ version, values, onEdit }: Props) {
  if (!version) return null;
  const pages = Array.from({ length: version.pageCount }, (_, i) => i + 1);
  const groups = pages
    .map((page) => {
      const items = version.fields
        .filter((field) => field.page === page)
        .map((field) => {
          const raw = (values[field.id] ?? '').trim();
          if (!raw) return null;
          const isToggle = field.type === 'checkbox' || field.type === 'radio';
          if (isToggle && raw !== 'true') return null;
          return { id: field.id, label: field.label, value: isToggle ? 'Selected' : raw };
        })
        .filter((item): item is { id: string; label: string; value: string } => item !== null);
      return { page, title: version.pageSections[page] ?? `Page ${page}`, items };
    })
    .filter((group) => group.items.length > 0);
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <section className="mt-7 rounded-2xl border border-[#E6E5EC] bg-white" aria-label="Contract Scope" data-testid="contract-scope">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E6E5EC] px-5 py-4">
        <div>
          <p className="text-base font-semibold text-slate-900">Contract Scope</p>
          <p className="mt-0.5 text-xs text-slate-500">Everything Entered On The {version.formNumber} {version.title}</p>
        </div>
        <span className="text-xs text-slate-500">{total} Fields Filled</span>
      </div>
      {groups.length === 0 ? (
        <p className="px-5 py-5 text-sm text-slate-500">Upload The 1-4 Residential Contract Or Fill The Form To See The Full Scope Here.</p>
      ) : (
        groups.map((group) => (
          <div key={group.page} className="border-b border-[#F1F0F5] px-5 py-4 last:border-b-0">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">{titleCase(group.title)}</p>
              <button type="button" onClick={() => onEdit(group.page)}>Edit Page {group.page}</button>
            </div>
            <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.items.map((item) => (
                <div key={item.id} className="min-w-0">
                  <dt className="truncate text-xs text-slate-500" title={item.label}>{item.label}</dt>
                  <dd className="mt-0.5 break-words text-sm font-medium text-slate-900">{item.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))
      )}
    </section>
  );
}
