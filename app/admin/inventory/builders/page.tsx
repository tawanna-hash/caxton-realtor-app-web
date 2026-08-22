'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import PageTitle from '@/components/ui/PageTitle';

type BuilderVisibility = {
  builder_name: string;
  developer_name: string | null;
  total_count: number;
  active_count: number;
  public_enabled: boolean;
  is_developer: boolean;
};

export default function AdminBuilderPagesPage() {
  const [reloadKey, setReloadKey] = useState(0);
  const [builders, setBuilders] = useState<BuilderVisibility[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/inventory/builders', { cache: 'no-store' });
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);
        const data = (await res.json()) as { builders: BuilderVisibility[] };
        if (cancelled) return;
        setBuilders(data.builders);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setBuilders([]);
        setError(e instanceof Error ? e.message : 'Failed to load builders');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const toggle = useCallback(async (builderName: string, next: boolean) => {
    setPending(builderName);
    setError(null);
    try {
      const res = await fetch('/api/admin/inventory/builders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ builderName, publicEnabled: next }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Failed to update (${res.status}) ${txt}`);
      }
      setBuilders((prev) =>
        (prev ?? []).map((b) =>
          b.builder_name === builderName ? { ...b, public_enabled: next } : b,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update');
      setReloadKey((k) => k + 1);
    } finally {
      setPending(null);
    }
  }, []);

  const handleDelete = useCallback(async (builderName: string) => {
    if (!confirm(`Delete all rows for "${builderName}"?\nThis removes all inventory and community rows. This cannot be undone.`)) {
      return;
    }
    setDeleting(builderName);
    setError(null);
    try {
      const res = await fetch(`/api/admin/inventory/builders?builderName=${encodeURIComponent(builderName)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Failed to delete (${res.status}) ${txt}`);
      }
      setBuilders((prev) =>
        (prev ?? []).filter((b) => b.builder_name !== builderName),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
      setReloadKey((k) => k + 1);
    } finally {
      setDeleting(null);
    }
  }, []);

  const toggleCollapse = (name: string) =>
    setCollapsed((p) => ({ ...p, [name]: !p[name] }));

  // Group: developers, their children, and standalone builders
  const allBuilders = builders ?? [];
  const developers = allBuilders.filter((b) => b.is_developer);
  const standaloneBuilders = allBuilders.filter((b) => !b.is_developer && !b.developer_name);
  const childrenOf = (devName: string) =>
    allBuilders.filter((b) => !b.is_developer && b.developer_name === devName);

  const renderToggle = (b: BuilderVisibility) => {
    const busy = pending === b.builder_name;
    return b.public_enabled ? (
      <button
        type="button"
        onClick={() => toggle(b.builder_name, false)}
        disabled={busy}
        className="bg-green-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-green-700 rounded-md transition-colors disabled:opacity-60"
      >
        {busy ? '…' : 'Enabled · hide'}
      </button>
    ) : (
      <button
        type="button"
        onClick={() => toggle(b.builder_name, true)}
        disabled={busy}
        className="bg-red-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-red-700 rounded-md transition-colors disabled:opacity-60"
      >
        {busy ? '…' : 'Hidden · enable'}
      </button>
    );
  };

  const renderDelete = (b: BuilderVisibility) => {
    const isDeleting = deleting === b.builder_name;
    return (
      <button
        type="button"
        onClick={() => handleDelete(b.builder_name)}
        disabled={isDeleting}
        className="text-red-600 hover:text-red-700 disabled:opacity-40 transition-colors"
        title={`Delete ${b.builder_name}`}
      >
        {isDeleting ? '…' : <Trash2 size={16} />}
      </button>
    );
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="mb-6 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-1">
            Admin
          </p>
          <PageTitle size="md">Partner Pages</PageTitle>
          <p className="text-sm text-gray-600 font-light mt-2 max-w-2xl">
            Enable or disable individual builder (advertiser) public pages.
            Developers show their child builders as nested rows.
          </p>
        </div>
        <Link
          href="/admin/inventory"
          className="shrink-0 border border-brand-700 text-brand-700 px-4 py-2 text-sm font-medium hover:bg-brand-50 rounded-md transition-colors whitespace-nowrap self-start"
        >
          ← Back to Inventory
        </Link>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* mobile card list */}
      <div className="sm:hidden bg-white border border-gray-200 rounded-md overflow-hidden">
        {builders === null ? (
          <div className="px-4 py-10 text-center text-gray-500">Loading…</div>
        ) : builders.length === 0 ? (
          <div className="px-4 py-10 text-center text-gray-500">No builders found.</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {developers.map((dev) => {
              const kids = childrenOf(dev.builder_name);
              const isCollapsed = collapsed[dev.builder_name] ?? false;
              return (
                <li key={`m-${dev.builder_name}`}>
                  <div className="p-3">
                    <div className="flex items-start gap-2">
                      {kids.length > 0 && (
                        <button
                          type="button"
                          onClick={() => toggleCollapse(dev.builder_name)}
                          className="mt-0.5 text-gray-400 hover:text-gray-700 shrink-0"
                          aria-label={isCollapsed ? 'Expand' : 'Collapse'}
                        >
                          {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                        </button>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-gray-900 truncate">
                          {dev.builder_name}
                          <span className="ml-2 text-xs text-gray-400 font-normal">developer</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {dev.active_count} active · {dev.total_count} total
                        </div>
                        <div className="mt-2 flex items-center gap-3 text-xs">
                          <div>{renderToggle(dev)}</div>
                          <div>{renderDelete(dev)}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                  {!isCollapsed && kids.map((kid) => (
                    <div key={`m-kid-${kid.builder_name}`} className="p-3 pl-8 border-t border-gray-100 bg-gray-50/60">
                      <div className="text-sm text-gray-700 truncate">↳ {kid.builder_name}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {kid.active_count} active · {kid.total_count} total
                      </div>
                      <div className="mt-2 flex items-center gap-3 text-xs">
                        <div>{renderToggle(kid)}</div>
                        <div>{renderDelete(kid)}</div>
                      </div>
                    </div>
                  ))}
                </li>
              );
            })}
            {standaloneBuilders.map((b) => (
              <li key={`m-solo-${b.builder_name}`} className="p-3">
                <div className="font-medium text-gray-900 truncate">{b.builder_name}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {b.active_count} active · {b.total_count} total
                </div>
                <div className="mt-2 flex items-center gap-3 text-xs">
                  <div>{renderToggle(b)}</div>
                  <div>{renderDelete(b)}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="hidden sm:block bg-white border border-gray-200 rounded-md overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-3 font-medium">Builder / Partner</th>
              <th className="px-4 py-3 font-medium text-right">Active</th>
              <th className="px-4 py-3 font-medium text-right">Total</th>
              <th className="px-4 py-3 font-medium text-right">Public page</th>
              <th className="px-4 py-3 font-medium text-right w-12">Delete</th>
            </tr>
          </thead>
          <tbody>
            {builders === null ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-gray-500">
                  Loading…
                </td>
              </tr>
            ) : builders.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-gray-500">
                  No builders found.
                </td>
              </tr>
            ) : (
              <>
                {/* Developers with collapsible child builders */}
                {developers.map((dev) => {
                  const kids = childrenOf(dev.builder_name);
                  const isCollapsed = collapsed[dev.builder_name] ?? false;
                  return (
                    <RowsForKey key={dev.builder_name}>
                      <tr className="border-t border-gray-100">
                        <td className="px-4 py-3 font-semibold text-gray-900">
                          {kids.length > 0 && (
                            <button
                              type="button"
                              onClick={() => toggleCollapse(dev.builder_name)}
                              className="inline-flex items-center mr-1 text-gray-400 hover:text-gray-700"
                            >
                              {isCollapsed
                                ? <ChevronRight size={14} />
                                : <ChevronDown size={14} />}
                            </button>
                          )}
                          {dev.builder_name}
                          <span className="ml-2 text-xs text-gray-400 font-normal">
                            developer
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700">{dev.active_count}</td>
                        <td className="px-4 py-3 text-right text-gray-500">{dev.total_count}</td>
                        <td className="px-4 py-3 text-right">{renderToggle(dev)}</td>
                        <td className="px-4 py-3 text-right">{renderDelete(dev)}</td>
                      </tr>
                      {!isCollapsed && kids.map((kid) => (
                        <tr key={kid.builder_name} className="border-t border-gray-100 bg-gray-50/60">
                          <td className="px-4 py-3 pl-10 text-gray-700">
                            ↳ {kid.builder_name}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-700">{kid.active_count}</td>
                          <td className="px-4 py-3 text-right text-gray-500">{kid.total_count}</td>
                          <td className="px-4 py-3 text-right">{renderToggle(kid)}</td>
                          <td className="px-4 py-3 text-right">{renderDelete(kid)}</td>
                        </tr>
                      ))}
                    </RowsForKey>
                  );
                })}

                {/* Standalone builders */}
                {standaloneBuilders.map((b) => (
                  <RowsForKey key={b.builder_name}>
                    <tr className="border-t border-gray-100">
                      <td className="px-4 py-3 font-medium text-gray-900">{b.builder_name}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{b.active_count}</td>
                      <td className="px-4 py-3 text-right text-gray-500">{b.total_count}</td>
                      <td className="px-4 py-3 text-right">{renderToggle(b)}</td>
                      <td className="px-4 py-3 text-right">{renderDelete(b)}</td>
                    </tr>
                  </RowsForKey>
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Wrapper that renders its children directly (no extra DOM node) so React
// fragments with multiple <tr> elements work inside .map().
function RowsForKey({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
