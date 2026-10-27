'use client';

/**
 * Typed-ID permanent-delete confirmation with a visible Copy button next to
 * the ID. Resolves with the typed value, or null when cancelled.
 */
export function promptDeleteWithCopy(message: string, id: string): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(15,15,30,.45);display:flex;align-items:flex-start;justify-content:center;padding-top:12vh;font-family:inherit';

    const box = document.createElement('div');
    box.style.cssText = 'width:min(440px,calc(100vw - 32px));background:#fff;border-radius:14px;box-shadow:0 20px 50px rgba(0,0,0,.25);padding:20px;color:#171717';

    const title = document.createElement('div');
    title.textContent = 'Permanently delete';
    title.style.cssText = 'font-size:16px;font-weight:600;margin-bottom:8px';

    const msg = document.createElement('p');
    msg.textContent = message;
    msg.style.cssText = 'font-size:14px;line-height:1.45;margin:0 0 10px';

    const idRow = document.createElement('div');
    idRow.style.cssText = 'display:flex;align-items:center;gap:8px;background:#f5f5f7;border:1px solid #e5e5ea;border-radius:10px;padding:8px 10px;margin-bottom:12px';
    const code = document.createElement('code');
    code.textContent = id;
    code.style.cssText = 'flex:1;min-width:0;font-size:12.5px;word-break:break-all;user-select:all';
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = 'Copy';
    copy.style.cssText = 'flex:none;border:1px solid #2d2a6e;color:#2d2a6e;background:#fff;border-radius:8px;padding:6px 12px;font-size:13px;font-weight:500;cursor:pointer';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Paste or type the ID';
    input.autocomplete = 'off';
    input.style.cssText = 'width:100%;box-sizing:border-box;border:1px solid #c7c7cc;border-radius:10px;padding:10px 12px;font-size:14px;margin-bottom:16px';

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;justify-content:flex-end;gap:8px';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    cancel.style.cssText = 'border:1px solid #d1d1d6;background:#fff;color:#171717;border-radius:10px;padding:8px 16px;font-size:14px;cursor:pointer';
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.textContent = 'Delete permanently';
    ok.disabled = true;
    ok.style.cssText = 'border:0;background:#b42318;color:#fff;border-radius:10px;padding:8px 16px;font-size:14px;font-weight:500;cursor:pointer;opacity:.5';

    const sync = () => {
      const match = input.value.trim() === id;
      ok.disabled = !match;
      ok.style.opacity = match ? '1' : '.5';
    };
    const done = (value: string | null) => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve(value);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); done(null); }
      if (e.key === 'Enter' && !ok.disabled) { e.preventDefault(); done(input.value.trim()); }
    };

    copy.onclick = async () => {
      let copied = false;
      try { await navigator.clipboard.writeText(id); copied = true; } catch {
        try {
          const ta = document.createElement('textarea');
          ta.value = id; ta.style.cssText = 'position:fixed;opacity:0';
          document.body.appendChild(ta); ta.select();
          copied = document.execCommand('copy'); ta.remove();
        } catch { copied = false; }
      }
      copy.textContent = copied ? 'Copied' : 'Copy failed';
      if (copied) { input.value = id; sync(); }
      input.focus();
      window.setTimeout(() => { copy.textContent = 'Copy'; }, 1600);
    };
    input.oninput = sync;
    cancel.onclick = () => done(null);
    ok.onclick = () => { if (!ok.disabled) done(input.value.trim()); };
    overlay.onmousedown = (e) => { if (e.target === overlay) done(null); };
    document.addEventListener('keydown', onKey, true);

    idRow.append(code, copy);
    actions.append(cancel, ok);
    box.append(title, msg, idRow, input, actions);
    overlay.append(box);
    document.body.append(overlay);
    input.focus();
  });
}
