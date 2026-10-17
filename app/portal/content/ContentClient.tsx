'use client';

import { useRef, useState } from 'react';
import { KIND_CONFIG, type KindConfig, type PortalResource, type ResourceFile } from '@/lib/portal-resources';

interface Draft {
  title: string;
  url: string;
  notes: string;
  fields: Record<string, string>;
  files: ResourceFile[];
}

const emptyDraft = (): Draft => ({ title: '', url: '', notes: '', fields: {}, files: [] });

function fmtSize(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

export default function ContentClient({ initialItems }: { initialItems: PortalResource[] }) {
  const [items, setItems] = useState(initialItems);
  return (
    <div className="space-y-8">
      {KIND_CONFIG.map((cfg) => (
        <Section
          key={cfg.kind}
          cfg={cfg}
          items={items.filter((i) => i.kind === cfg.kind)}
          onCreated={(item) => setItems((all) => [item, ...all])}
          onUpdated={(item) => setItems((all) => all.map((i) => (i.id === item.id ? item : i)))}
          onDeleted={(id) => setItems((all) => all.filter((i) => i.id !== id))}
        />
      ))}
    </div>
  );
}

function Section({ cfg, items, onCreated, onUpdated, onDeleted }: {
  cfg: KindConfig;
  items: PortalResource[];
  onCreated: (i: PortalResource) => void;
  onUpdated: (i: PortalResource) => void;
  onDeleted: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function save(draft: Draft, id: string | null): Promise<string | null> {
    const res = await fetch(id ? `/api/portal/resources/${id}` : '/api/portal/resources', {
      method: id ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: cfg.kind,
        title: draft.title,
        url: draft.url.trim() ? draft.url.trim() : null,
        notes: draft.notes.trim() ? draft.notes : null,
        fields: draft.fields,
        files: draft.files,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = data?.details ? Object.values(data.details as Record<string, string[]>).flat().join(' ') : '';
      return detail || data?.error || 'Could not save.';
    }
    const item = { ...data.item, fields: data.item.fields ?? {}, files: data.item.files ?? [] } as PortalResource;
    if (id) onUpdated(item); else onCreated(item);
    setAdding(false);
    setEditingId(null);
    return null;
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this item?')) return;
    const res = await fetch(`/api/portal/resources/${id}`, { method: 'DELETE' });
    if (res.ok) onDeleted(id);
  }

  return (
    <section className="rounded-md border border-gray-200 bg-white p-6">
      <div className="flex items-start justify-between gap-4 mb-1">
        <h2 className="font-serif text-xl text-gray-900">{cfg.heading}</h2>
        {!adding && (
          <button type="button" onClick={() => { setAdding(true); setEditingId(null); }}
            className="shrink-0 rounded-md bg-[#301D5D] text-white px-3 py-1.5 text-sm font-medium">
            {cfg.addLabel}
          </button>
        )}
      </div>
      <p className="text-sm text-gray-600 mb-4">{cfg.blurb}</p>

      {adding && (
        <ItemForm cfg={cfg} initial={emptyDraft()} onSave={(d) => save(d, null)} onCancel={() => setAdding(false)} />
      )}

      {items.length === 0 && !adding ? (
        <div className="rounded-md border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
          Nothing here yet.
        </div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {items.map((item) =>
            editingId === item.id ? (
              <li key={item.id} className="py-4">
                <ItemForm cfg={cfg}
                  initial={{ title: item.title, url: item.url ?? '', notes: item.notes ?? '', fields: item.fields ?? {}, files: item.files ?? [] }}
                  onSave={(d) => save(d, item.id)} onCancel={() => setEditingId(null)} />
              </li>
            ) : (
              <li key={item.id} className="py-3 flex items-start justify-between gap-4">
                <div className="min-w-0 text-sm">
                  <div className="font-medium text-gray-900">{item.title}</div>
                  {item.url && (
                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-[#42277C] hover:underline break-all">{item.url}</a>
                  )}
                  {cfg.extra.length > 0 && (
                    <div className="text-gray-600">
                      {cfg.kind === 'location'
                        ? [item.fields.address, item.fields.address_2, item.fields.city, [item.fields.state, item.fields.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')
                        : cfg.extra.map((e) => item.fields[e.key]).filter(Boolean).join(' - ')}
                      {cfg.kind === 'location' && item.fields.phone ? ` - ${item.fields.phone}` : ''}
                    </div>
                  )}
                  {item.notes && <div className="text-gray-600 whitespace-pre-line">{item.notes}</div>}
                  {item.files.length > 0 && (
                    <ul className="mt-1 flex flex-wrap gap-2">
                      {item.files.map((f) => (
                        <li key={f.url}>
                          <a href={f.url} target="_blank" rel="noopener noreferrer"
                            className="inline-block rounded-md border border-gray-200 px-2 py-1 text-xs text-[#42277C] hover:bg-gray-50">
                            {f.name} ({fmtSize(f.size)})
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="shrink-0 flex gap-3 text-sm">
                  <button type="button" onClick={() => { setEditingId(item.id); setAdding(false); }} className="text-[#42277C] hover:underline">Edit</button>
                  <button type="button" onClick={() => remove(item.id)} className="text-[#661102] hover:underline">Delete</button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}

function ItemForm({ cfg, initial, onSave, onCancel }: {
  cfg: KindConfig;
  initial: Draft;
  onSave: (d: Draft) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [d, setD] = useState<Draft>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function upload(list: FileList | File[]) {
    setError(null);
    for (const file of Array.from(list)) {
      setUploading((n) => n + 1);
      try {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/api/portal/resources/upload', { method: 'POST', body: fd });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { setError(`${file.name}: ${data?.error ?? 'upload failed'}`); continue; }
        setD((cur) => ({
          ...cur,
          title: cur.title || file.name.replace(/\.[^.]+$/, ''),
          files: [...cur.files, { url: data.url, name: data.name, size: data.size, mime: data.mime }],
        }));
      } catch {
        setError(`${file.name}: upload failed`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const err = await onSave(d);
    if (err) { setError(err); setBusy(false); }
  }

  const field = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm';
  const label = 'block text-sm font-medium text-gray-700 mb-1';
  const isLocation = cfg.kind === 'location';

  return (
    <form onSubmit={submit} className="rounded-md border border-gray-200 bg-gray-50 p-4 mb-4 space-y-3">
      <label className="block">
        <span className={label}>{cfg.titleLabel}</span>
        <input required value={d.title} placeholder={cfg.titlePlaceholder} onChange={(e) => setD({ ...d, title: e.target.value })} className={field} />
      </label>

      {cfg.showUrl && (
        <label className="block">
          <span className={label}>{cfg.urlLabel}</span>
          <input type="url" value={d.url} placeholder="https://" onChange={(e) => setD({ ...d, url: e.target.value })} className={field} />
        </label>
      )}

      {isLocation ? (
        <div className="grid gap-3 md:grid-cols-[2fr_1.2fr_1.2fr_0.6fr_0.8fr]">
          {cfg.extra.filter((x) => x.key !== 'phone').map((x) => (
            <label key={x.key} className="block">
              <span className={label}>{x.label}</span>
              <input value={d.fields[x.key] ?? ''} onChange={(e) => setD({ ...d, fields: { ...d.fields, [x.key]: e.target.value } })} className={field} />
            </label>
          ))}
        </div>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        {cfg.extra.filter((x) => !isLocation || x.key === 'phone').map((x) => (
          <label key={x.key} className="block">
            <span className={label}>{x.label}</span>
            <input value={d.fields[x.key] ?? ''} placeholder={x.placeholder} onChange={(e) => setD({ ...d, fields: { ...d.fields, [x.key]: e.target.value } })} className={field} />
          </label>
        ))}
      </div>

      {cfg.showNotes && (
        <label className="block">
          <span className={label}>Notes</span>
          <textarea rows={2} value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} className={field} />
        </label>
      )}

      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files.length) void upload(e.dataTransfer.files); }}
        onClick={() => input.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') input.current?.click(); }}
        className={`cursor-pointer rounded-md border-2 border-dashed px-4 py-6 text-center text-sm ${over ? 'border-[#301D5D] bg-white' : 'border-gray-300 bg-white'} text-gray-600`}
      >
        {uploading > 0 ? 'Uploading...' : <>{cfg.dropLabel}<div className="text-xs text-gray-500 mt-1">or click to browse - up to 4 MB per file</div></>}
        <input ref={input} type="file" multiple accept={cfg.accept} className="hidden"
          onChange={(e) => { if (e.target.files?.length) void upload(e.target.files); e.target.value = ''; }} />
      </div>

      {d.files.length > 0 && (
        <ul className="space-y-1">
          {d.files.map((f) => (
            <li key={f.url} className="flex items-center justify-between gap-3 text-sm bg-white rounded-md border border-gray-200 px-3 py-1.5">
              <a href={f.url} target="_blank" rel="noopener noreferrer" className="truncate text-[#42277C] hover:underline">{f.name} ({fmtSize(f.size)})</a>
              <button type="button" onClick={() => setD({ ...d, files: d.files.filter((x) => x.url !== f.url) })} className="text-[#661102] hover:underline">Remove</button>
            </li>
          ))}
        </ul>
      )}

      {error && <div className="rounded-md bg-[#FFEAE6] border border-[#FF2A04]/30 text-[#661102] px-3 py-2 text-sm">{error}</div>}
      <div className="flex gap-2">
        <button disabled={busy || uploading > 0} className="rounded-md bg-[#301D5D] text-white px-4 py-2 text-sm font-medium disabled:opacity-60">{busy ? 'Saving...' : 'Save'}</button>
        <button type="button" onClick={onCancel} className="rounded-md border border-gray-300 px-4 py-2 text-sm">Cancel</button>
      </div>
    </form>
  );
}
