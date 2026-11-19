'use client';
import Link from 'next/link';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** One economy on the grid (build.py tiles_blob): position, name, and per window [studied, written, outside share]. */
export type TileT = { iso: string; c: number; r: number; slug: string | null; name: string; z: string[]; m: [number, number, number | null][] };
export type Metric = 'studied' | 'written' | 'outside';
type Org = { slug: string; label: string; n: number; tag: 'dom' | 'for' | 'intl' | 'unk' };
type Panel = {
  years: Record<string, [number, number]>; ref: string;
  auth: { slug: string; label: string; n: number }[];
  win: { s: number; w: number; dom: number; for: number; intl: number; unk: number; out: number | null; orgs: Org[]; topics: { slug: string; label: string; n: number; r: number | null }[] }[];
};
export type TileLabels = {
  metrics: Record<Metric, string>; metricHint: Record<Metric, string>; wins: string[]; zones: Record<string, string>;
  studied: string; written: string; outside: string; docs: string; tooFew: string; none: string; close: string; mapLabel: string;
  tags: Record<Org['tag'], string>; topWriters: string; topTopics: string; topAuthors: string; perYear: string; vsWorld: string;
  allAbout: string; orgsIn: string; domestic: string; foreign: string; intl: string; unknown: string; loading: string; legend: string; tileHelp: string;
  top10: string; top10Outside: string; breaks: { q: string; l: string }; zero: string; outsideLow: string; outsideHigh: string;
};

const CELL = 10, GAP = 1;
const ZONES = ['world', 'europe', 'americas', 'asiapac', 'africa', 'mideast'];
const METRICS: Metric[] = ['written', 'studied', 'outside'];
/** The outside view (a share) on a diverging scale centred on 50%: seven classes, d3 = 45–55%. */
const OUT_BREAKS = [0.1, 0.3, 0.45, 0.55, 0.7, 0.9];
const OUT_LABELS = ['<10%', '10–30%', '30–45%', '45–55%', '55–70%', '70–90%', '≥90%'];
/** The outside-view Top 10 ranks the shares among the economies most studied in the window (else tiny samples at 100% fill it). */
const OUT_POOL = 40;

/** Rank quantiles for the count classes: narrower at the top so the leaders stand apart. */
const Q_LEVELS = [0.35, 0.6, 0.78, 0.9, 0.96];

/** Round a break to a readable number (1, 1.5, 2, 2.5, 3, 4, 5, 6, 8 × 10^k). */
const nice = (x: number) => {
  if (x <= 1) return 1;
  const p = 10 ** Math.floor(Math.log10(x));
  const f = x / p;
  const m = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].reduce((a, b) => (Math.abs(b - f) < Math.abs(a - f) ? b : a));
  return Math.round(m * p);
};

/**
 * Class breaks from the data for the active metric and window: five breaks (six classes above zero), as rank
 * quantiles or on a log scale between the smallest and largest count, whichever spreads the tiles more evenly (higher
 * entropy of the class sizes). The quantiles narrow towards the top (35, 60, 78, 90, 96%) so the darkest class holds
 * only the few leading economies; equal sixths put some thirty economies, the US with Austria, in one colour. Breaks
 * are rounded to readable numbers and deduplicated.
 */
export function countBreaks(vals: number[]): { br: number[]; kind: 'q' | 'l'; lo: number } {
  const pos = vals.filter((v) => v > 0).sort((a, b) => a - b);
  if (pos.length < 2) return { br: [], kind: 'l', lo: pos[0] ?? 1 };
  const lo = pos[0], hi = pos[pos.length - 1];
  const clean = (xs: number[]) => {
    const out: number[] = [];
    for (const x of xs.map(nice)) if (x > lo && x <= hi && (!out.length || x > out[out.length - 1])) out.push(x);
    return out;
  };
  const log = clean(Array.from({ length: 5 }, (_, i) => lo * (hi / lo) ** ((i + 1) / 6)));
  const q = clean(Q_LEVELS.map((f) => pos[Math.min(pos.length - 1, Math.floor(pos.length * f))]));
  const H = (br: number[]) => {
    const c = new Array(br.length + 1).fill(0);
    for (const v of pos) c[br.filter((b) => v >= b).length]++;
    return c.reduce((h, n) => (n ? h - (n / pos.length) * Math.log(n / pos.length) : h), 0);
  };
  return H(q) >= H(log) ? { br: q, kind: 'q', lo } : { br: log, kind: 'l', lo };
}

/** The ramp step (s1–s6) of a count, spreading fewer classes over the whole ramp; z = none; the outside view in d0–d6. */
const klass = (metric: Metric, v: number | null, br: number[]) => {
  if (metric === 'outside') return v == null ? 'na' : `d${OUT_BREAKS.filter((t) => v >= t).length}`;
  if (!v) return 'z';
  const i = br.filter((b) => v >= b).length;
  return `s${br.length ? Math.round((i * 5) / br.length) + 1 : 6}`;
};

/**
 * A tile grid map: one equal square per economy near its real position (config/tile_grid.csv), coloured by one metric
 * at a time. Region chips and a click on a country zoom; the click also opens the country panel. Keyboard: Tab to
 * the map, arrows move between countries, Enter opens, Escape closes. The tooltip is instant (no SVG <title>).
 */
export function TileMap({ tiles, lang, labels, init }: { tiles: TileT[]; lang: string; labels: TileLabels; init: { metric: Metric; win: number; zone: string; sel: string | null } }) {
  const [metric, setMetric] = useState<Metric>(init.metric);
  const [win, setWin] = useState(init.win);
  const [zone, setZone] = useState(init.zone);
  const [sel, setSel] = useState<string | null>(init.sel);
  const [focus, setFocus] = useState<string>(init.sel ?? 'USA');
  const [tip, setTip] = useState<{ iso: string; touch?: boolean } | null>(null);
  const [panel, setPanel] = useState<{ iso: string; data: Panel | null } | null>(null);
  const [px, setPx] = useState(3);
  const stage = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const fmt = useMemo(() => new Intl.NumberFormat(lang === 'ko' ? 'ko-KR' : 'en-GB'), [lang]);
  const pct = (x: number | null) => (x == null ? '–' : `${Math.round(x * 100)}%`);
  const byIso = useMemo(() => new Map(tiles.map((t) => [t.iso, t])), [tiles]);
  const cols = Math.max(...tiles.map((t) => t.c)) + 1, rows = Math.max(...tiles.map((t) => t.r)) + 1;
  const W = cols * CELL, H = rows * CELL;

  // the view: the whole grid, a region's tiles, or the neighbourhood of the selected country, at the grid's aspect
  const view = useMemo(() => {
    const fit = (xs: TileT[], pad: number) => {
      let x0 = Math.min(...xs.map((t) => t.c)) - pad, x1 = Math.max(...xs.map((t) => t.c)) + 1 + pad;
      let y0 = Math.min(...xs.map((t) => t.r)) - pad, y1 = Math.max(...xs.map((t) => t.r)) + 1 + pad;
      let w = x1 - x0, h = y1 - y0;
      if (w / h < cols / rows) { const nw = h * (cols / rows); x0 -= (nw - w) / 2; w = nw; } else { const nh = w / (cols / rows); y0 -= (nh - h) / 2; h = nh; }
      x0 = Math.max(0, Math.min(cols - w, x0)); y0 = Math.max(0, Math.min(rows - h, y0));
      return { k: cols / w, x: x0 * CELL, y: y0 * CELL };
    };
    if (sel && byIso.has(sel)) {
      const t = byIso.get(sel)!;
      const near = tiles.filter((u) => Math.abs(u.c - t.c) <= 6 && Math.abs(u.r - t.r) <= 4);
      return fit(near, 0.5);
    }
    const zs = zone === 'world' ? [] : tiles.filter((t) => t.z.includes(zone));
    return zs.length ? fit(zs, 0.5) : { k: 1, x: 0, y: 0 };
  }, [zone, sel, tiles, byIso, cols, rows]);

  // the size of one grid unit on screen: labels show only when a tile is big enough to read them
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setPx(e.contentRect.width / W));
    ro.observe(el);
    return () => ro.disconnect();
  }, [W]);
  const cellPx = px * CELL * view.k;

  // URL: ?metric=&win=&zone=&c= (replace, no history entry per click)
  useEffect(() => {
    const u = new URL(window.location.href);
    const set = (k: string, v: string | null, dflt: string) => (v && v !== dflt ? u.searchParams.set(k, v) : u.searchParams.delete(k));
    set('metric', metric, 'written'); set('win', String(win), '0'); set('zone', zone, 'world'); set('c', sel, '');
    window.history.replaceState(window.history.state, '', u);
  }, [metric, win, zone, sel]);

  useEffect(() => {
    if (!sel) { setPanel(null); return; }
    let live = true;
    setPanel((p) => (p?.iso === sel ? p : { iso: sel, data: null }));
    fetch(`/${lang}/m/e/${sel}`).then((r) => (r.ok ? r.json() : null)).then((d: Panel | null) => { if (live) setPanel({ iso: sel, data: d }); }).catch(() => {});
    return () => { live = false; };
  }, [sel, lang]);

  const open = useCallback((iso: string) => { setSel(iso); setFocus(iso); setTip(null); }, []);
  const close = useCallback(() => { setSel(null); setTip(null); }, []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setTip(null); setSel(null); } };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, []);

  // arrows: the nearest tile in that direction (rows weigh more than columns for left/right and the reverse)
  const move = (iso: string, dx: number, dy: number) => {
    const t = byIso.get(iso);
    if (!t) return;
    let best: TileT | null = null, bd = Infinity;
    for (const u of tiles) {
      const ex = u.c - t.c, ey = u.r - t.r;
      if ((dx && Math.sign(ex) !== dx) || (dy && Math.sign(ey) !== dy) || (dx && !ex) || (dy && !ey)) continue;
      const d = dx ? Math.abs(ex) + 2.5 * Math.abs(ey) : Math.abs(ey) + 2.5 * Math.abs(ex);
      if (d < bd) { bd = d; best = u; }
    }
    if (best) {
      setFocus(best.iso);
      setTip({ iso: best.iso });
      svg.current?.querySelector<SVGGElement>(`[data-iso="${best.iso}"]`)?.focus();
    }
  };
  const val = (t: TileT) => (metric === 'outside' ? t.m[win][2] : t.m[win][metric === 'studied' ? 0 : 1]);
  const show = (t: TileT) => (metric === 'outside' ? pct(t.m[win][2]) : fmt.format(val(t) ?? 0));
  const aria = (t: TileT) => `${t.name}: ${labels.written} ${fmt.format(t.m[win][1])}, ${labels.studied} ${fmt.format(t.m[win][0])}, ${labels.outside} ${pct(t.m[win][2])}`;
  const compact = useMemo(() => new Intl.NumberFormat(lang === 'ko' ? 'ko-KR' : 'en-GB', { notation: 'compact', maximumSignificantDigits: 3 }), [lang]);
  const scale = useMemo(() => countBreaks(metric === 'outside' ? [] : tiles.map((t) => t.m[win][metric === 'studied' ? 0 : 1])), [tiles, metric, win]);
  const top = useMemo(() => {
    if (metric === 'outside') {
      const pool = [...tiles].sort((a, b) => b.m[win][0] - a.m[win][0]).slice(0, OUT_POOL).filter((t) => t.m[win][2] != null);
      return pool.sort((a, b) => (b.m[win][2] ?? 0) - (a.m[win][2] ?? 0) || b.m[win][0] - a.m[win][0]).slice(0, 10);
    }
    const k = metric === 'studied' ? 0 : 1;
    return tiles.filter((t) => t.m[win][k] > 0).sort((a, b) => b.m[win][k] - a.m[win][k]).slice(0, 10);
  }, [tiles, metric, win]);
  const topSet = useMemo(() => new Set(top.map((t) => t.iso)), [top]);
  const topMax = Math.max(1e-9, ...top.map((t) => val(t) ?? 0));
  const tipT = tip ? byIso.get(tip.iso) : null;
  const tipEl = tipT ? svg.current?.querySelector(`[data-iso="${tipT.iso}"] rect`) ?? null : null;

  const range = (from: number, to: number | null) => (to == null ? `${fmt.format(from)}+` : from >= to ? fmt.format(from) : `${fmt.format(from)}–${fmt.format(to)}`);
  const legend: [string, string][] = metric === 'outside'
    ? [...OUT_LABELS.map((l, i) => [`d${i}`, l] as [string, string]), ['na', labels.tooFew]]
    : [['z', labels.zero], ...Array.from({ length: scale.br.length + 1 }, (_, i) => [klass(metric, i ? scale.br[i - 1] : scale.lo, scale.br), range(i ? scale.br[i - 1] : scale.lo, i === scale.br.length ? null : scale.br[i] - 1)] as [string, string])];
  const p = panel?.data;
  const pw = p?.win[win];
  const selT = sel ? byIso.get(sel) : null;
  const yearsRow = p ? Object.entries(p.years).map(([y, v]) => [Number(y), v[0], v[1]] as [number, number, number]) : [];

  return (
    <div className={`or-tmap${sel ? ' has-panel' : ''}`}>
      <div className="or-tmap__ctl">
        <div className="or-seg" role="radiogroup" aria-label={labels.legend}>
          {METRICS.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={metric === m} className="or-chip" title={labels.metricHint[m]} onClick={() => setMetric(m)}>{labels.metrics[m]}</button>
          ))}
        </div>
        <div className="or-seg" role="radiogroup" aria-label="Years">
          {labels.wins.map((w, i) => <button key={w} type="button" role="radio" aria-checked={win === i} className="or-chip or-chip--quiet" onClick={() => setWin(i)}>{w}</button>)}
        </div>
        <div className="or-seg or-seg--zones" role="group" aria-label="Zoom">
          {ZONES.map((z) => <button key={z} type="button" className="or-chip or-chip--quiet" aria-pressed={zone === z && !sel} onClick={() => { setZone(z); setSel(null); }}>{labels.zones[z]}</button>)}
        </div>
      </div>
      <p className="or-tmap__hint">{labels.metricHint[metric]}</p>
      <div className="or-tmap__body">
        {/* never taller than about 70% of the window: the legend and controls stay on a laptop screen */}
        <div className="or-tmap__stage" ref={stage} style={{ maxWidth: `calc(68vh * ${(W / H).toFixed(3)})` }} onPointerLeave={() => setTip(null)}>
          <svg ref={svg} viewBox={`0 0 ${W} ${H}`} role="group" aria-label={`${labels.mapLabel}. ${labels.tileHelp}`} className={cellPx >= 24 ? 'labels' : undefined}
            onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
            <g className="or-tmap__grid" style={{ transform: `scale(${view.k}) translate(${-view.x}px, ${-view.y}px)` }}>
              {tiles.map((t) => {
                const v = val(t);
                const on = sel === t.iso;
                return (
                  <g key={t.iso} data-iso={t.iso} className={`tile ${klass(metric, v, scale.br)}${on ? ' sel' : ''}${tip?.iso === t.iso ? ' hot' : ''}${topSet.has(t.iso) ? ' top' : ''}`} transform={`translate(${t.c * CELL} ${t.r * CELL})`}
                    role="button" tabIndex={focus === t.iso ? 0 : -1} aria-label={aria(t)} aria-pressed={on}
                    onPointerEnter={(e) => { if (e.pointerType !== 'touch') setTip({ iso: t.iso }); }}
                    onClick={() => open(t.iso)}
                    onFocus={() => { setFocus(t.iso); setTip({ iso: t.iso }); }}
                    onKeyDown={(e) => {
                      const d: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
                      if (d[e.key]) { e.preventDefault(); move(t.iso, ...d[e.key]); }
                      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(t.iso); }
                    }}>
                    <rect x={GAP / 2} y={GAP / 2} width={CELL - GAP} height={CELL - GAP} rx="0.8" />
                    {topSet.has(t.iso) ? (<>
                      <text x={CELL / 2} y={CELL / 2 - 0.4} textAnchor="middle">{t.iso}</text>
                      <text className="cnt" x={CELL / 2} y={CELL / 2 + 2.9} textAnchor="middle">{metric === 'outside' ? pct(v) : compact.format(v ?? 0)}</text>
                    </>) : <text x={CELL / 2} y={CELL / 2 + 1.1} textAnchor="middle">{t.iso}</text>}
                  </g>
                );
              })}
            </g>
          </svg>
          {tipT && tipEl ? (
            <FloatTip anchor={tipEl} k={`${tipT.iso}|${metric}|${win}|${view.k}`}>
              <b>{tipT.name}</b>
              <span><em>{labels.metrics[metric]}</em> {show(tipT)}</span>
              <span>{labels.written} {fmt.format(tipT.m[win][1])} · {labels.studied} {fmt.format(tipT.m[win][0])} · {labels.outside} {pct(tipT.m[win][2])}</span>
            </FloatTip>
          ) : null}
        </div>
        {!(sel && selT) ? (
          <aside className="or-top10" aria-labelledby="or-top10-h">
            <h2 id="or-top10-h">{labels.top10} <span>· {labels.metrics[metric]} · {labels.wins[win]}</span></h2>
            <ol>
              {top.map((t, i) => {
                const v = val(t) ?? 0;
                return (
                  <li key={t.iso} className={tip?.iso === t.iso ? 'hot' : undefined}
                    onPointerEnter={() => setTip({ iso: t.iso })} onPointerLeave={() => setTip(null)}>
                    <button type="button" onClick={() => open(t.iso)} onFocus={() => setTip({ iso: t.iso })} onBlur={() => setTip(null)}>
                      <span className="rk">{i + 1}</span>
                      <span className="nm" title={t.name}>{t.name}</span>
                      <span className="n">{metric === 'outside' ? pct(v) : fmt.format(v)}</span>
                      <span className="bar" aria-hidden="true"><i className={klass(metric, v, scale.br)} style={{ width: `${Math.max(2, (v / topMax) * 100).toFixed(1)}%` }} /></span>
                    </button>
                  </li>
                );
              })}
            </ol>
            {metric === 'outside' ? <p className="or-source">{labels.top10Outside.replace('{n}', String(OUT_POOL))}</p> : null}
          </aside>
        ) : null}
        {sel && selT ? (
          <aside className="or-cpanel" aria-label={selT.name}>
            <div className="or-cpanel__head">
              <h2>{selT.name} <span className="or-code">{selT.iso}</span></h2>
              <button type="button" className="or-btn or-btn--sm" onClick={close} aria-label={labels.close}>×</button>
            </div>
            <p className="or-cpanel__win">{labels.wins[win]}</p>
            {!p || !pw ? <p className="or-muted">{panel?.data === null && panel?.iso === sel ? labels.loading : labels.none}</p> : (
              <>
                <dl className="or-cpanel__stats">
                  <div><dt>{labels.studied}</dt><dd>{fmt.format(pw.s)}</dd></div>
                  <div><dt>{labels.written}</dt><dd>{fmt.format(pw.w)}</dd></div>
                  <div><dt>{labels.outside}</dt><dd>{pct(pw.out)}</dd></div>
                </dl>
                {pw.s ? (
                  <div className="or-split3" role="img" aria-label={`${labels.domestic} ${pw.dom}, ${labels.foreign} ${pw.for}, ${labels.intl} ${pw.intl}, ${labels.unknown} ${pw.unk}`}>
                    {(['dom', 'for', 'intl', 'unk'] as const).map((k) => (pw[k] ? <span key={k} className={`s-${k}`} style={{ flexGrow: pw[k] }} /> : null))}
                  </div>
                ) : null}
                {pw.s ? (
                  <ul className="or-split3__key">
                    <li><i className="s-dom" />{labels.domestic} {fmt.format(pw.dom)}</li><li><i className="s-for" />{labels.foreign} {fmt.format(pw.for)}</li>
                    <li><i className="s-intl" />{labels.intl} {fmt.format(pw.intl)}</li><li><i className="s-unk" />{labels.unknown} {fmt.format(pw.unk)}</li>
                  </ul>
                ) : null}
                <h3>{labels.perYear}</h3>
                <CountryYears rows={yearsRow} lang={lang} labels={labels} />
                {pw.orgs.length ? (<>
                  <h3>{labels.topWriters}</h3>
                  <ol className="or-cpanel__list">
                    {pw.orgs.map((o) => <li key={o.slug}><Link href={`/${lang}/o/${o.slug}`} className="lab" title={o.label}>{o.label}</Link><span className={`or-tag or-tag--${o.tag}`}>{labels.tags[o.tag]}</span><span className="n">{fmt.format(o.n)}</span></li>)}
                  </ol>
                </>) : null}
                {pw.topics.length ? (<>
                  <h3>{labels.topTopics}</h3>
                  <ol className="or-cpanel__list">
                    {pw.topics.map((t) => (
                      <li key={t.slug}><Link href={`/${lang}/t/${t.slug}`} className="lab" title={t.label}>{t.label}</Link>
                        <span className={`or-ratio ${t.r != null && t.r >= 1.2 ? 'up' : t.r != null && t.r <= 0.83 ? 'down' : ''}`} title={labels.vsWorld}>{t.r == null ? '–' : `×${t.r.toFixed(1)}`}</span>
                        <span className="n">{fmt.format(t.n)}</span></li>
                    ))}
                  </ol>
                  <p className="or-source">{labels.vsWorld}</p>
                </>) : null}
                {p.auth.length ? (<>
                  <h3>{labels.topAuthors}</h3>
                  <ol className="or-cpanel__list">
                    {p.auth.map((a) => <li key={a.slug}><Link href={`/${lang}/a/${a.slug}`} className="lab">{a.label}</Link><span /><span className="n">{fmt.format(a.n)}</span></li>)}
                  </ol>
                </>) : null}
                <p className="or-cpanel__links">
                  {selT.slug ? <Link href={`/${lang}/c/${selT.slug}`}>{labels.allAbout.replace('{n}', fmt.format(selT.m[0][0]))} →</Link> : null}
                  <Link href={`/${lang}/m?tab=org&q=${encodeURIComponent(selT.name)}#list`}>{labels.orgsIn} →</Link>
                </p>
              </>
            )}
          </aside>
        ) : null}
      </div>
      <ul className="or-tmap__legend" aria-label={labels.legend}>
        <li className="cap">{labels.metrics[metric]} · {labels.wins[win]}</li>
        {metric === 'outside' ? <li className="end">{labels.outsideLow}</li> : null}
        {legend.map(([k, v]) => <li key={k}><i className={`sw ${k}`} />{v}</li>)}
        {metric === 'outside' ? <li className="end">{labels.outsideHigh}</li> : <li className="note">{labels.breaks[scale.kind]}</li>}
      </ul>
    </div>
  );
}

/** Documents a year that study the country (bars) and that its own organisations wrote (line), 2006 on. */
function CountryYears({ rows, lang, labels }: { rows: [number, number, number][]; lang: string; labels: TileLabels }) {
  if (!rows.length) return <p className="or-muted">–</p>;
  const y0 = 2006, y1 = Math.max(...rows.map((r) => r[0]), 2025);
  const n = y1 - y0 + 1;
  const Wd = 320, Hd = 96, L = 30, R = 4, T = 6, B = 16;
  const bw = (Wd - L - R) / n;
  const max = Math.max(1, ...rows.map((r) => Math.max(r[1], r[2])));
  const nice = (() => { const p = Math.pow(10, Math.floor(Math.log10(max))); const f = max / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; })();
  const ys = (v: number) => T + (Hd - T - B) * (1 - v / nice);
  const by = new Map(rows.map((r) => [r[0], r]));
  const pts = Array.from({ length: n }, (_, i) => { const r = by.get(y0 + i); return `${(L + (i + 0.5) * bw).toFixed(1)},${ys(r ? r[2] : 0).toFixed(1)}`; }).join(' ');
  const fmt = new Intl.NumberFormat(lang === 'ko' ? 'ko-KR' : 'en-GB');
  return (
    <figure className="or-figure or-cyears">
      <svg className="or-chart" viewBox={`0 0 ${Wd} ${Hd}`} role="img" aria-label={labels.perYear}>
        {[0, nice].map((v) => <g key={v}><line className={v ? 'grid' : 'axis'} x1={L} x2={Wd - R} y1={ys(v)} y2={ys(v)} /><text x={L - 4} y={ys(v) + 3.5} textAnchor="end">{fmt.format(v)}</text></g>)}
        {Array.from({ length: n }, (_, i) => { const r = by.get(y0 + i); return r && r[1] ? <rect key={i} className="s-cb" x={L + i * bw + 0.5} y={ys(r[1])} width={Math.max(1, bw - 1)} height={ys(0) - ys(r[1])} /> : null; })}
        <polyline className="wline" points={pts} />
        {[y0, 2015, y1].map((y) => <text key={y} x={L + (y - y0 + 0.5) * bw} y={Hd - 4} textAnchor="middle">{y}</text>)}
      </svg>
      <figcaption><i className="k-bar" />{labels.studied} <i className="k-line" />{labels.written}</figcaption>
    </figure>
  );
}

/**
 * A tooltip in a portal at <body> level, fixed to the viewport: above its anchor, flipped below when there is no room,
 * and shifted sideways so it stays 8px inside the visible viewport (never clipped by the map's overflow).
 */
function FloatTip({ anchor, k, children }: { anchor: Element; k: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; below: boolean } | null>(null);
  useLayoutEffect(() => {
    const place = () => {
      const el = ref.current;
      if (!el || !anchor.isConnected) return;
      const a = anchor.getBoundingClientRect();
      const vv = window.visualViewport;
      const vx = vv?.offsetLeft ?? 0, vy = vv?.offsetTop ?? 0, vw = vv?.width ?? window.innerWidth, vh = vv?.height ?? window.innerHeight;
      const w = el.offsetWidth, h = el.offsetHeight, m = 8, gap = 8;
      let top = a.top - h - gap, below = false;
      if (top < vy + m) { top = a.bottom + gap; below = true; }
      if (top + h > vy + vh - m) top = Math.max(vy + m, vy + vh - m - h);
      const left = Math.min(Math.max(vx + m, a.left + a.width / 2 - w / 2), vx + vw - m - w);
      setPos({ left: Math.round(left), top: Math.round(top), below });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => { window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place); };
  }, [anchor, k]);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div ref={ref} className={`or-tiptip${pos?.below ? ' below' : ''}`} role="status" style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: 'hidden' }}>{children}</div>,
    document.body,
  );
}
