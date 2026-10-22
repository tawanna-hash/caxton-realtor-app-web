'use client';

// Agreements (Beta) templates: agreement templates saved from the builder with
// Save as template. Use template opens the builder pre-filled.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { A, RowMenu, EmptyState, SearchBox } from '@/components/anchor/ui';
import SortTable from '@/components/anchor/SortTable';
import PaymentMethodTemplate from './PaymentMethodTemplate';
import { PAYMENT_METHOD_TEMPLATE_NAME } from '@/lib/agreements-v2/payment-method-template';

type BuilderTemplate = { id: string; name: string; updated_at: string };

export default function TemplatesPanel() {
  const [rows, setRows] = useState<BuilderTemplate[] | null>(null);
  const [q, setQ] = useState('');
  const [tick, setTick] = useState(0);
  const [pmOpen, setPmOpen] = useState(false);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    fetch('/api/admin/agreements-v2/builder', { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => { if (alive) setRows((j.templates ?? []) as BuilderTemplate[]); })
      .catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [tick]);

  async function remove(t: BuilderTemplate) {
    if (!window.confirm(`Delete the template "${t.name}"?`)) return;
    await fetch('/api/admin/agreements-v2/builder', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'delete', id: t.id }) });
    reload();
  }

  const list = useMemo(() => (rows ?? []).filter((t) => t.name.toLowerCase().includes(q.trim().toLowerCase())), [rows, q]);

  const showBuiltIn = PAYMENT_METHOD_TEMPLATE_NAME.toLowerCase().includes(q.trim().toLowerCase());

  return (
    <div className="space-y-4">
      <PaymentMethodTemplate open={pmOpen} onClose={() => setPmOpen(false)} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchBox value={q} onChange={setQ} label="Search templates" />
        <a href="/admin/agreements/renewals-v2/new" className={A.primary}>Create template</a>
      </div>
      <div className="overflow-x-auto">
        <SortTable rows={list} cols={[{ label: 'Template name', get: (r) => r.name }, { label: 'Last updated', get: (r) => r.updated_at }, { label: '' }]} className={`${A.table} min-w-[520px]`}>
          {(rws) => (<>
            {rows === null && <tr><td colSpan={3} className="text-center text-[color:var(--ds-body)]">Loading…</td></tr>}
            {showBuiltIn && (
              <tr>
                <td className="font-medium text-[color:var(--ds-ink)]">{PAYMENT_METHOD_TEMPLATE_NAME} <span className="ml-2 rounded-full border border-[color:var(--ds-line)] px-2 py-0.5 text-[11px] font-normal text-[color:var(--ds-body)]">Email · by market</span></td>
                <td className="whitespace-nowrap text-[color:var(--ds-body)]">Built-in</td>
                <td className="whitespace-nowrap text-right"><button type="button" className={A.small} onClick={() => setPmOpen(true)}>Use template</button></td>
              </tr>
            )}
            {rows !== null && list.length === 0 && !showBuiltIn && <tr><td colSpan={3}><EmptyState title="No templates" body="Open the builder and choose Save as template." /></td></tr>}
            {rws.map((t) => (
              <tr key={t.id}>
                <td className="font-medium text-[color:var(--ds-ink)]">{t.name}</td>
                <td className="whitespace-nowrap text-[color:var(--ds-body)]">{new Date(t.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                <td className="whitespace-nowrap text-right"><span className="inline-flex items-center gap-2">
                  <a href={`/admin/agreements/renewals-v2/new?template=${t.id}`} className={A.small}>Use template</a>
                  <RowMenu items={[{ label: 'Delete template', danger: true, onClick: () => remove(t) }]} />
                </span></td>
              </tr>
            ))}
          </>)}
        </SortTable>
      </div>
    </div>
  );
}
