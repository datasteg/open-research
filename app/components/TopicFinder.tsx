'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Lang } from '@/lib/types';

type Hit = { href: string; label: string; kind: string; n: number };

/** One box over every grove, topic, concept, method and data source: type, pick, jump. Without JavaScript it submits to search. */
export function TopicFinder({ lang, labels }: { lang: Lang; labels: { placeholder: string; kinds: Record<string, string>; none: string; go: string } }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [sel, setSel] = useState(0);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const ctl = new AbortController();
    const id = setTimeout(() => {
      fetch(`/${lang}/find?q=${encodeURIComponent(q)}`, { signal: ctl.signal }).then((r) => r.json()).then((h: Hit[]) => { setHits(h); setSel(0); setOpen(true); }).catch(() => {});
    }, 140);
    return () => { clearTimeout(id); ctl.abort(); };
  }, [q, lang]);
  useEffect(() => {
    const off = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', off);
    return () => document.removeEventListener('mousedown', off);
  }, []);
  const num = new Intl.NumberFormat(lang === 'ko' ? 'ko-KR' : 'en-GB');
  return (
    <div className="or-finder" ref={box}>
      <form action={`/${lang}/search`} role="search" onSubmit={(e) => { if (hits[sel]) { e.preventDefault(); router.push(hits[sel].href); } }}>
        <label className="or-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input name="q" type="search" value={q} autoComplete="off" placeholder={labels.placeholder} aria-label={labels.placeholder}
            role="combobox" aria-expanded={open && hits.length > 0} aria-controls="or-finder-list" aria-activedescendant={hits[sel] ? `or-finder-${sel}` : undefined}
            onChange={(e) => setQ(e.target.value)} onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, hits.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
              else if (e.key === 'Escape') setOpen(false);
            }} />
        </label>
      </form>
      {open && q.trim().length >= 2 ? (
        <ul className="or-finder__list" id="or-finder-list" role="listbox">
          {hits.length ? hits.map((h, i) => (
            <li key={h.href} id={`or-finder-${i}`} role="option" aria-selected={i === sel} onMouseEnter={() => setSel(i)}>
              <a href={h.href} onClick={(e) => { e.preventDefault(); router.push(h.href); }}>
                <span className="lab">{h.label}</span><span className="or-tag or-tag--neutral">{labels.kinds[h.kind] ?? h.kind}</span><span className="n">{num.format(h.n)}</span>
              </a>
            </li>
          )) : <li className="or-finder__none">{labels.none}</li>}
        </ul>
      ) : null}
    </div>
  );
}
