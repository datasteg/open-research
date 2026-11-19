'use client';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

/** build.py people_index: [slug, name, affiliation index, documents, last 24 months, speeches, first year, documents a year]. */
type Row = [string, string, number, number, number, number, number, number[]];
type Index = { y1: number; affs: string[]; rows: Row[] };
type Hit = { r: Row; aff: string; how: 0 | 1 | 2 };
type Labels = { placeholder: string; loading: string; none: string; total: string; recent: string; sort: string; papers: string; speeches: string; matches: string; hint: string; years: string };

/** Lower case, no accents, no punctuation: "Òscar Jordá" → "oscar jorda", "Tabaković" → "tabakovic". */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/ø/g, 'o').replace(/ł/g, 'l').replace(/đ/g, 'd').replace(/ß/g, 'ss').replace(/æ/g, 'ae').replace(/œ/g, 'oe').replace(/ı/g, 'i')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

const PER = 50;

/**
 * People search: the whole index (about 22,700 people) is loaded once and searched in the browser, so results follow
 * every keystroke (150 ms debounce, two characters or more). A name matches when every word typed starts a word of the
 * name; an affiliation matches on the phrase ("bank of korea"). Names come first, then affiliations; within each, by
 * total documents or by the last 24 months. ↑ ↓ and Enter move and open.
 */
export function PeopleSearch({ lang, v, labels, children }: { lang: string; v: string; labels: Labels; children: ReactNode }) {
  const [idx, setIdx] = useState<Index | null>(null);
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [sort, setSort] = useState<'n' | 'n24'>('n');
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const fmt = useMemo(() => new Intl.NumberFormat(lang === 'ko' ? 'ko-KR' : 'en-GB'), [lang]);

  useEffect(() => {
    input.current?.focus();
    const u = new URL(window.location.href);
    const q0 = u.searchParams.get('q');
    if (q0) { setQ(q0); setDq(q0); }
    if (u.searchParams.get('sort') === 'n24') setSort('n24');
    fetch(`/${lang}/a/index?v=${encodeURIComponent(v)}`).then((r) => r.json()).then(setIdx).catch(() => {});
  }, [lang, v]);
  useEffect(() => { const id = setTimeout(() => setDq(q), 150); return () => clearTimeout(id); }, [q]);
  useEffect(() => {
    const u = new URL(window.location.href);
    if (dq.trim()) u.searchParams.set('q', dq.trim()); else u.searchParams.delete('q');
    if (sort === 'n24') u.searchParams.set('sort', 'n24'); else u.searchParams.delete('sort');
    window.history.replaceState(window.history.state, '', u);
  }, [dq, sort]);

  const folded = useMemo(() => (idx ? { names: idx.rows.map((r) => ` ${fold(r[1])} `), affs: idx.affs.map((a) => ` ${fold(a)} `) } : null), [idx]);
  const hits = useMemo<Hit[] | null>(() => {
    const f = fold(dq);
    if (!idx || !folded || f.length < 2) return null;
    const words = f.split(' ');
    const phrase = ` ${f}`;
    const out: Hit[] = [];
    idx.rows.forEach((r, i) => {
      const nm = folded.names[i];
      // whole words first ("jorda" → Jordá before Jordan), then word starts, then the affiliation
      if (words.every((w) => nm.includes(` ${w} `))) out.push({ r, aff: idx.affs[r[2]] ?? '', how: 0 });
      else if (words.every((w) => nm.includes(` ${w}`))) out.push({ r, aff: idx.affs[r[2]] ?? '', how: 1 });
      else if (r[2] >= 0 && folded.affs[r[2]].includes(phrase)) out.push({ r, aff: idx.affs[r[2]], how: 2 });
    });
    const k = sort === 'n' ? 3 : 4;
    out.sort((a, b) => a.how - b.how || b.r[k] - a.r[k] || b.r[3] - a.r[3]);
    return out;
  }, [dq, idx, folded, sort]);
  useEffect(() => setSel(0), [dq, sort]);

  const shown = hits?.slice(0, PER) ?? [];
  const go = (h: Hit) => router.push(`/${lang}/a/${encodeURIComponent(h.r[0])}`);
  return (
    <div className="or-psearch">
      <div className="or-psearch__bar">
        <label className="or-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input ref={input} type="search" value={q} autoComplete="off" spellCheck={false} placeholder={labels.placeholder} aria-label={labels.placeholder}
            role="combobox" aria-expanded={!!hits?.length} aria-controls="or-people-hits" aria-activedescendant={shown[sel] ? `or-ph-${sel}` : undefined}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, shown.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
              else if (e.key === 'Enter' && shown[sel]) { e.preventDefault(); go(shown[sel]); }
            }} />
        </label>
        <div className="or-seg" role="radiogroup" aria-label={labels.sort}>
          <span className="or-sorts__label">{labels.sort}</span>
          <button type="button" role="radio" aria-checked={sort === 'n'} className="or-chip" onClick={() => setSort('n')}>{labels.total}</button>
          <button type="button" role="radio" aria-checked={sort === 'n24'} className="or-chip" onClick={() => setSort('n24')}>{labels.recent}</button>
        </div>
      </div>
      {hits == null ? (
        <>
          <p className="or-psearch__hint">{q.trim().length >= 2 && !idx ? labels.loading : labels.hint}</p>
          {children}
        </>
      ) : (
        <section className="or-panel">
          <p className="or-panel__meta" aria-live="polite">{labels.matches.replace('{n}', fmt.format(hits.length))}</p>
          {hits.length ? (
            <ol className="or-phits" id="or-people-hits" role="listbox">
              <li className="or-phits__head" aria-hidden="true"><span /><span>{labels.total}</span><span>{labels.recent}</span><span>{labels.papers} · {labels.speeches}</span><span>{labels.years}</span></li>
              {shown.map((h, i) => (
                <li key={h.r[0]} id={`or-ph-${i}`} role="option" aria-selected={i === sel} onMouseEnter={() => setSel(i)}>
                  <a href={`/${lang}/a/${encodeURIComponent(h.r[0])}`} onClick={(e) => { e.preventDefault(); go(h); }}>
                    <span className="who"><b>{h.r[1]}</b>{h.aff ? <span className={h.how === 2 ? 'aff hit' : 'aff'}>{h.aff}</span> : null}</span>
                    <span className="n">{fmt.format(h.r[3])}</span>
                    <span className={`n${h.r[4] ? '' : ' zero'}`}>{fmt.format(h.r[4])}</span>
                    <span className="split">{fmt.format(h.r[3] - h.r[5])}<i> {labels.papers}</i> · {fmt.format(h.r[5])}<i> {labels.speeches}</i></span>
                    <Spark y0={h.r[6]} ys={h.r[7]} y1={idx!.y1} />
                  </a>
                </li>
              ))}
            </ol>
          ) : <p className="or-muted">{labels.none}</p>}
        </section>
      )}
    </div>
  );
}

/** Documents a year from the person's first year to now; the first and last years written at the ends. */
function Spark({ y0, ys, y1 }: { y0: number; ys: number[]; y1: number }) {
  const n = y1 - y0 + 1;
  const vals = Array.from({ length: n }, (_, i) => ys[i] ?? 0);
  const max = Math.max(1, ...vals);
  const bw = 96 / Math.max(n, 1);
  return (
    <span className="spark" title={`${y0}–${y1}`}>
      <svg viewBox="0 0 96 16" preserveAspectRatio="none" aria-hidden="true">
        {vals.map((v, i) => (v ? <rect key={i} x={i * bw + 0.15} y={16 - (v / max) * 15} width={Math.max(0.6, bw - 0.3)} height={(v / max) * 15} /> : null))}
      </svg>
      <span className="y">{y0}</span><span className="y">{y1}</span>
    </span>
  );
}
