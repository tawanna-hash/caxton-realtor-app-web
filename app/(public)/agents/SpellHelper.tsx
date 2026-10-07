'use client';

import { useEffect, useState } from 'react';
import nspell from 'nspell';

type Speller = ReturnType<typeof nspell>;
let loading: Promise<Speller> | null = null;
function loadSpeller(): Promise<Speller> {
  loading ??= Promise.all([fetch('/spell/en.aff').then((r) => r.text()), fetch('/spell/en.dic').then((r) => r.text())])
    .then(([aff, dic]) => nspell(aff, dic))
    .catch((e) => { loading = null; throw e; });
  return loading;
}

type Issue = { word: string; fixes: string[] };

/** Offline spelling helper. The text never leaves the browser. Names and the property address are not flagged. */
export default function SpellHelper({ text, onChange, ignore = [] }: { text: string; onChange: (next: string) => void; ignore?: string[] }) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [failed, setFailed] = useState(false);
  const ignoreKey = ignore.join('|').toLowerCase();

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      void loadSpeller().then((sp) => {
        if (!live) return;
        const skip = new Set(ignoreKey.split(/[^a-z']+/).filter(Boolean));
        const clean = text.replace(/https?:\/\/\S+/gi, ' ').replace(/\S+@\S+/g, ' ');
        const seen = new Set<string>();
        const found: Issue[] = [];
        for (const m of clean.matchAll(/[A-Za-z][A-Za-z'’]*/g)) {
          const raw = m[0].replace(/’/g, "'");
          const w = raw.replace(/^'+|'+$/g, '');
          const lower = w.toLowerCase();
          if (w.length < 2 || seen.has(lower) || skip.has(lower) || (w === w.toUpperCase() && w.length <= 6)) continue;
          seen.add(lower);
          if (sp.correct(w) || sp.correct(lower)) continue;
          found.push({ word: m[0], fixes: sp.suggest(w).slice(0, 4) });
          if (found.length >= 8) break;
        }
        setIssues(found);
        setFailed(false);
      }).catch(() => { if (live) setFailed(true); });
    }, 450);
    return () => { live = false; clearTimeout(t); };
  }, [text, ignoreKey]);

  if (failed) return <p className="text-[12px] font-medium text-[#7A7787]">Spell check could not load.</p>;
  if (!issues.length) return null;
  const fix = (word: string, to: string) => onChange(text.replace(new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), to));
  return (
    <div className="rounded-lg border border-[#E6E5EC] bg-[#F6F3FB] px-3 py-2">
      <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-[#7A7787]">Possible Spelling Mistakes</span>
      <ul className="mt-1 space-y-1">
        {issues.map((i) => (
          <li key={i.word} className="flex flex-wrap items-center gap-2 text-[13px] text-[#1B1726]">
            <span className="font-medium line-through decoration-[#7059A8]">{i.word}</span>
            {i.fixes.length === 0 && <span className="text-[12px] text-[#7A7787]">No suggestion</span>}
            {i.fixes.map((f) => (
              <button key={f} type="button" onClick={() => fix(i.word, f)} className="!rounded-full !border !border-[#E6E5EC] !bg-white !px-2 !py-0.5 !text-[11px] !font-medium !leading-4 !text-[#301D5D] hover:!bg-[#EFEAF8]">{f}</button>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
