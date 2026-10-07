'use client';

import { useRef, useState } from 'react';

type Item = { name: string; state: 'busy' | 'done' | 'error'; message?: string };

export default function UploadDrop({ token }: { token: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [items, setItems] = useState<Item[]>([]);

  async function send(files: File[]) {
    for (const file of files) {
      setItems((list) => [...list, { name: file.name, state: 'busy' }]);
      const body = new FormData();
      body.set('file', file); body.set('docId', 'other');
      let next: Omit<Item, 'name'> = { state: 'done' };
      try {
        const res = await fetch(`/api/deal-portal/${token}/upload`, { method: 'POST', body });
        if (!res.ok) next = { state: 'error', message: (await res.json()).error ?? 'Upload failed.' };
      } catch { next = { state: 'error', message: 'Upload failed. Try again.' }; }
      setItems((list) => list.map((item) => (item.name === file.name && item.state === 'busy' ? { ...item, ...next } : item)));
    }
  }
  const pick = (list: FileList | null) => { if (list?.length) void send(Array.from(list)); };

  return (
    <section className="rounded-[10px] border border-[#d4d8dd] bg-white">
      <h2 className="border-b border-[#d4d8dd] px-4 py-4 text-[14px] font-semibold text-[#292a2d]">Upload Documents</h2>
      <div className="p-4">
        <div
          role="button" tabIndex={0} aria-label="Upload documents"
          onClick={() => input.current?.click()}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.current?.click(); } }}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files); }}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-[10px] border border-dashed px-4 py-8 text-center transition ${over ? 'border-[#005a8f] bg-[#daeeff]' : 'border-[#d4d8dd] bg-[#f5f6f9] hover:border-[#005a8f]'}`}
        >
          <span className="text-[14px] font-medium text-[#292a2d]">Drop Files Here Or Click To Choose</span>
          <span className="mt-1 text-[12px] font-medium text-[#51555b]">PDF or photo, up to 4 MB each. Your agent is notified.</span>
          <input ref={input} type="file" multiple accept="application/pdf,image/*" className="sr-only" onChange={(e) => { pick(e.target.files); e.target.value = ''; }} />
        </div>
        {items.length > 0 && (
          <ul className="mt-3">
            {items.map((item, i) => (
              <li key={`${item.name}-${i}`} className="flex items-center justify-between gap-3 border-b border-[#d4d8dd] py-2 text-[14px] last:border-0">
                <span className="min-w-0 truncate font-medium text-[#292a2d]">{item.name}</span>
                <span className="shrink-0 text-[12px] font-medium" style={{ color: item.state === 'error' ? '#661102' : '#005a8f' }}>
                  {item.state === 'busy' ? 'Uploading' : item.state === 'done' ? 'Sent To Your Agent' : item.message}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
