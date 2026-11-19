'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { NewItem, NewPayload } from '@/lib/newboard';
import type { NewQuery } from '@/lib/db';
import type { Fam } from '@/lib/types';

const FAMS: Fam[] = ['cb', 'bis', 'io', 'acad'];
type Labels = {
  fam: Record<Fam, string>; famShort: Record<Fam, string>; kinds: Record<string, string>; kind: Record<string, string>; units: Record<string, string>;
  received: string; published: string; pubShort: string; recShort: string; ranges: string[]; allSources: string; allKinds: string; hideBackfill: string; backfill: string; backfillHint: string;
  more: string; none: string; day: string; clear: string; total: string; chartLabel: string; by: string; famLabel: string; loading: string; hidden: string;
};

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayText = (iso: string, lang: string, withYear = true) => {
  const [y, m, d] = iso.split('-').map(Number);
  if (!m) return iso;
  return lang === 'ko' ? `${withYear ? `${y}년 ` : ''}${m}월 ${d}일` : `${d} ${MONTHS_EN[m - 1]}${withYear ? ` ${y}` : ''}`;
};
const qs = (q: NewQuery) => {
  const u = new URLSearchParams();
  if (q.by !== 'received') u.set('by', q.by);
  if (q.range !== 30) u.set('range', String(q.range));
  if (q.fam.length) u.set('fam', q.fam.join(','));
  if (q.unit) u.set('unit', q.unit);
  if (q.kind) u.set('kind', q.kind);
  if (q.backfill) u.set('backfill', '1');
  if (q.day) u.set('day', q.day);
  return u;
};

/**
 * New: the documents a day as a stacked bar chart (by publisher family) over the list, both driven by the same
 * filters. Hover a bar for its counts (and the day lights up in the list); click it to show only that day. Backfill
 * (published more than 90 days before it was received) is hidden by default; a paper's language versions are one row.
 */
export function NewBoard({ lang, init, labels }: { lang: string; init: NewPayload; labels: Labels }) {
  const [q, setQ] = useState<NewQuery>(init.q);
  const [data, setData] = useState<NewPayload>(init);
  const [items, setItems] = useState<NewItem[]>(init.items);
  const [next, setNext] = useState<string | null>(init.next);
  const [busy, setBusy] = useState(false);
  const [hot, setHot] = useState<string | null>(null);
  // a phone gets a taller chart (the same 1000-unit width shrinks to ~360 px)
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 679px)');
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const first = useRef(true);
  const fmt = useMemo(() => new Intl.NumberFormat(lang === 'ko' ? 'ko-KR' : 'en-GB'), [lang]);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const ctl = new AbortController();
    setBusy(true);
    const u = qs(q);
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${u.size ? `?${u}` : ''}`);
    fetch(`/${lang}/new/data?${u}`, { signal: ctl.signal }).then((r) => r.json()).then((d: NewPayload) => {
      setData(d); setItems(d.items); setNext(d.next); setBusy(false);
    }).catch(() => {});
    return () => ctl.abort();
  }, [q, lang]);

  const loadMore = () => {
    if (!next || busy) return;
    setBusy(true);
    const u = qs(q);
    u.set('before', next);
    fetch(`/${lang}/new/data?${u}`).then((r) => r.json()).then((d: NewPayload) => {
      setItems((xs) => {
        // a translation that arrived on another day folds into the row already shown
        const byG = new Map(xs.map((x) => [x.g, x]));
        const out = [...xs];
        for (const it of d.items) {
          const had = byG.get(it.g);
          if (had) { for (const l of it.langs) if (!had.langs.includes(l)) had.langs.push(l); continue; }
          out.push(it);
        }
        return out;
      });
      setNext(d.next); setBusy(false);
    }).catch(() => setBusy(false));
  };

  const set = (patch: Partial<NewQuery>) => setQ((x) => ({ ...x, day: '', ...patch }));
  const toggleFam = (f: Fam) => set({ fam: q.fam.includes(f) ? q.fam.filter((x) => x !== f) : [...q.fam, f] });

  // the chart: every day of the window, zero days included, families stacked in a fixed order
  const end = data.end;
  const n = q.range;
  const allDays = useMemo(() => Array.from({ length: n }, (_, i) => new Date(Date.parse(end) - (n - 1 - i) * 864e5).toISOString().slice(0, 10)), [end, n]);
  const byDay = useMemo(() => new Map(data.days.map((d) => [d[0], d])), [data.days]);
  const shownFams = q.fam.length ? FAMS.filter((f) => q.fam.includes(f)) : FAMS;
  const total = data.days.reduce((a, d) => a + d[1] + d[2] + d[3] + d[4], 0);
  const max = Math.max(1, ...data.days.map((d) => d[1] + d[2] + d[3] + d[4]));
  const nice = (() => { const p = Math.pow(10, Math.floor(Math.log10(max))); const f = max / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; })();
  const Wc = 1000, Hc = narrow ? 460 : 170, L = narrow ? 96 : 44, R = 6, T = 8, B = narrow ? 52 : 22;
  const bw = (Wc - L - R) / n;
  const ys = (v: number) => T + (Hc - T - B) * (1 - v / nice);
  const ticks = n <= 30 ? allDays.filter((_, i) => i % 7 === (n - 1) % 7) : allDays.filter((d) => d.endsWith('-01'));
  const hotRow = hot ? byDay.get(hot) : null;
  const hotX = hot ? allDays.indexOf(hot) : -1;

  // the list in day groups
  const groups = useMemo(() => {
    const out: [string, NewItem[]][] = [];
    for (const it of items) {
      if (!out.length || out[out.length - 1][0] !== it.day) out.push([it.day, []]);
      out[out.length - 1][1].push(it);
    }
    return out;
  }, [items]);

  return (
    <div className={`or-newb${busy ? ' is-busy' : ''}`}>
      <div className="or-newb__ctl">
        <div className="or-seg" role="radiogroup" aria-label={labels.by}>
          <button type="button" role="radio" aria-checked={q.by === 'received'} className="or-chip" onClick={() => set({ by: 'received' })}>{labels.received}</button>
          <button type="button" role="radio" aria-checked={q.by === 'published'} className="or-chip" onClick={() => set({ by: 'published' })}>{labels.published}</button>
        </div>
        <div className="or-seg" role="radiogroup" aria-label="Range">
          {[30, 90, 365].map((r, i) => <button key={r} type="button" role="radio" aria-checked={q.range === r} className="or-chip or-chip--quiet" onClick={() => set({ range: r })}>{labels.ranges[i]}</button>)}
        </div>
        <label className="or-check" title={labels.backfillHint}>
          <input type="checkbox" checked={!q.backfill} onChange={(e) => set({ backfill: !e.target.checked })} />{labels.hideBackfill}
          {!q.backfill && data.backfill ? <span className="or-muted"> ({labels.hidden.replace('{n}', fmt.format(data.backfill))})</span> : null}
        </label>
      </div>
      <div className="or-newb__ctl">
        <div className="or-seg" role="group" aria-label={labels.famLabel}>
          {FAMS.map((f) => <button key={f} type="button" className={`or-chip or-fam or-fam--${f} or-chip--fam`} aria-pressed={q.fam.includes(f)} onClick={() => toggleFam(f)}><i className={`sw s-${f}`} />{labels.fam[f]}</button>)}
        </div>
        <select className="or-select" value={q.unit} onChange={(e) => set({ unit: e.target.value })} aria-label={labels.allSources}>
          <option value="">{labels.allSources}</option>
          {q.unit && !data.units.some((u) => u[0] === q.unit) ? <option value={q.unit}>{labels.units[q.unit] ?? q.unit}</option> : null}
          {data.units.map(([u, c]) => <option key={u} value={u}>{labels.units[u] ?? u} ({fmt.format(c)})</option>)}
        </select>
        <select className="or-select" value={q.kind} onChange={(e) => set({ kind: e.target.value })} aria-label={labels.allKinds}>
          <option value="">{labels.allKinds}</option>
          {data.kinds.map(([k, c]) => <option key={k} value={k}>{labels.kinds[k] ?? k} ({fmt.format(c)})</option>)}
        </select>
      </div>

      <figure className="or-figure or-newchart" onPointerLeave={() => setHot(null)}>
        <svg className="or-chart" viewBox={`0 0 ${Wc} ${Hc}`} role="img" aria-label={`${labels.chartLabel}: ${fmt.format(total)}`}>
          {[0, nice / 2, nice].map((v) => <g key={v}><line className={v ? 'grid' : 'axis'} x1={L} x2={Wc - R} y1={ys(v)} y2={ys(v)} /><text x={L - 6} y={ys(v) + (narrow ? 10 : 4)} textAnchor="end">{fmt.format(v)}</text></g>)}
          {allDays.map((d, i) => {
            const row = byDay.get(d);
            let acc = 0;
            return (
              <g key={d} className={`day${hot === d ? ' hot' : ''}${q.day === d ? ' on' : ''}${q.day && q.day !== d ? ' dim' : ''}`}
                onPointerEnter={() => setHot(d)} onClick={() => setQ((x) => ({ ...x, day: x.day === d ? '' : d }))}>
                <rect className="hit" x={L + i * bw} y={T} width={bw} height={Hc - T - B} />
                {row ? FAMS.map((f, k) => {
                  const v = row[k + 1] as number;
                  if (!v) return null;
                  const y1 = ys(acc + v), h = ys(acc) - y1;
                  acc += v;
                  return <rect key={f} className={`bar s-${f}`} x={L + i * bw + Math.min(1, bw * 0.15)} y={y1} width={Math.max(0.8, bw - Math.min(2, bw * 0.3))} height={h} />;
                }) : null}
              </g>
            );
          })}
          {ticks.map((d) => <text key={d} x={L + (allDays.indexOf(d) + 0.5) * bw} y={Hc - (narrow ? 12 : 6)} textAnchor="middle">{dayText(d, lang, false)}</text>)}
        </svg>
        {hot && hotX >= 0 ? (
          <div className="or-newchart__tip" style={{ left: `${((L + (hotX + 0.5) * bw) / Wc) * 100}%` }} role="status">
            <b>{dayText(hot, lang)}</b>
            <span>{labels.total} {fmt.format(hotRow ? hotRow[1] + hotRow[2] + hotRow[3] + hotRow[4] : 0)}</span>
            {shownFams.map((f) => <span key={f}><i className={`sw s-${f}`} />{labels.famShort[f]} {fmt.format(hotRow ? (hotRow[FAMS.indexOf(f) + 1] as number) : 0)}</span>)}
          </div>
        ) : null}
        <figcaption>
          {q.by === 'received' ? labels.received : labels.published} · {fmt.format(total)}
          {q.day ? <> · <b>{dayText(q.day, lang)}</b> <button type="button" className="or-linkbtn" onClick={() => set({ day: '' })}>{labels.clear}</button></> : null}
        </figcaption>
      </figure>

      {groups.length ? groups.map(([d, xs]) => (
        <section key={d} className={`or-dayg${hot === d ? ' hot' : ''}`} data-day={d}>
          <h2 className="or-dayg__head"><span>{dayText(d, lang)}</span><span className="n">{fmt.format(xs.length)}</span></h2>
          <ol className="or-nrows">
            {xs.map((it) => (
              <li key={it.s} className={`or-fam or-fam--${it.f}`}>
                <div className="l1">
                  <i className={`sw s-${it.f}`} aria-hidden="true" />
                  <Link href={`/${lang}/p/${encodeURIComponent(it.s)}`} className="t" lang="en" title={it.t}>{it.t}</Link>
                  {it.langs.length > 1 ? <span className="langs">{it.langs.map((l) => <span key={l} className="or-tag or-tag--neutral">{l.toUpperCase()}</span>)}</span> : null}
                  {it.bf ? <span className="or-tag or-tag--warn" title={labels.backfillHint}>{labels.backfill}</span> : null}
                </div>
                <div className="l2">
                  {it.a.length ? <span>{it.a.join(', ')}{it.an > it.a.length ? (lang === 'ko' ? ` 외 ${it.an - it.a.length}명` : ` +${it.an - it.a.length}`) : ''}</span> : null}
                  <span>{labels.units[it.u] ?? it.u}{it.no && !['cb_reshub', 'bis_cbspeeches'].includes(it.u) ? ` ${it.no.replace(/^(publ|publications|review|events)_/, '').slice(0, 18)}` : ''}</span>
                  <span>{q.by === 'received' ? `${labels.pubShort} ${it.d ? dayText(it.d.slice(0, 10), lang) : '–'}` : `${labels.recShort} ${dayText(it.rc.slice(0, 10), lang)}`}</span>
                  {it.tp ? <span>{it.tp}</span> : null}
                  {it.k && it.k !== 'paper' ? <span>{labels.kind[it.k] ?? it.k}</span> : null}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )) : <p className="or-muted">{busy ? labels.loading : labels.none}</p>}
      {next ? <p><button type="button" className="or-btn" onClick={loadMore} disabled={busy}>{busy ? labels.loading : labels.more}</button></p> : null}
    </div>
  );
}
