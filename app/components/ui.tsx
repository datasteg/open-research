import Link from 'next/link';
import type { ReactNode } from 'react';
import { day, num } from '@/lib/format';
import { label, t, UNIT } from '@/lib/i18n';
import type { Fam, Lang, NodeLite, Row } from '@/lib/types';

export const FAMS: Fam[] = ['cb', 'bis', 'io', 'acad'];
const KIND_PATH: Record<string, string> = { grove: 'g', topic: 't', concept: 'k', jel: 'jel', org: 'o', person: 'a', place: 'c' };

/** The URL of a node's page. */
export const href = (l: Lang, n: Pick<NodeLite, 'kind' | 'slug'>) => `/${l}/${KIND_PATH[n.kind] ?? 'k'}/${encodeURIComponent(n.slug)}`;

export function NodeLink({ n, lang, children }: { n: NodeLite | undefined; lang: Lang; children?: ReactNode }) {
  if (!n) return null;
  return <Link href={href(lang, n)}>{children ?? label(n, lang)}</Link>;
}

export function Head({ kicker, title, lede, crumbs, right }: { kicker?: ReactNode; title: ReactNode; lede?: ReactNode; crumbs?: ReactNode; right?: ReactNode }) {
  return (
    <div className="or-head">
      {crumbs}
      {kicker ? <p className="or-kicker">{kicker}</p> : null}
      <div className="or-head__row"><h1>{title}</h1>{right}</div>
      {lede ? <p className="or-lede">{lede}</p> : null}
    </div>
  );
}

/**
 * The head of an index page: one short, data-led line, and the method notes folded into "How to read this" beside
 * it (they matter for trust, so they stay one click away rather than in the reader's path).
 */
export function Title({ text, info, lang, right }: { text: ReactNode; info?: ReactNode; lang: Lang; right?: ReactNode }) {
  return (
    <div className="or-title">
      <h1>{text}</h1>
      {info ? (
        <details className="or-howto">
          <summary><span aria-hidden="true">ⓘ</span> {lang === 'ko' ? '읽는 법' : 'How to read this'}</summary>
          <div className="or-howto__body">{info}</div>
        </details>
      ) : null}
      {right}
    </div>
  );
}

export function Crumbs({ items }: { items: { href?: string; text: ReactNode; code?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="or-crumbs">
        {items.map((it, i) => (
          <li key={i}>
            {it.href && i < items.length - 1 ? <Link href={it.href}>{it.text}</Link> : <span aria-current={i === items.length - 1 ? 'page' : undefined}>{it.text}</span>}
            {it.code ? <span className="or-code">{it.code}</span> : null}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function Panel({ title, meta, fam, quiet, children, id }: { title?: ReactNode; meta?: ReactNode; fam?: Fam; quiet?: boolean; children: ReactNode; id?: string }) {
  return (
    <section className={`or-panel${fam ? ` or-fam--${fam}` : ''}${quiet ? ' or-panel--quiet' : ''}`} id={id}>
      {title || meta ? <div className="or-panel__head">{title ? <h2>{title}</h2> : <span />}{meta ? <span className="or-panel__meta">{meta}</span> : null}</div> : null}
      {children}
    </section>
  );
}

export function Tiles({ items }: { items: { label: ReactNode; value: ReactNode; sub?: ReactNode; big?: boolean }[] }) {
  return (
    <div className="or-tiles">
      {items.map((x, i) => (
        <div key={i} className={`or-tile${x.big ? ' or-tile--big' : ''}`}>
          <span className="or-tile__label">{x.label}</span>
          <span className="or-tile__value">{x.value}</span>
          {x.sub ? <span className="or-tile__sub">{x.sub}</span> : null}
        </div>
      ))}
    </div>
  );
}

export function FamTag({ f, lang, text }: { f: Fam; lang: Lang; text?: string }) {
  return <span className={`or-tag or-fam or-fam--${f}`}>{text ?? t(lang).famShort[f]}</span>;
}

export function Legend({ lang }: { lang: Lang }) {
  return (
    <ul className="or-legend">
      {FAMS.map((f) => <li key={f} className={`or-fam or-fam--${f}`}><i />{t(lang).fam[f]}</li>)}
    </ul>
  );
}

/** Documents a year, stacked by publisher family; years without documents are gaps, never zeros drawn as bars. */
export function YearBars({ years, lang, from = 1975, sel, caption, fit }: { years: Record<string, number[]>; lang: Lang; from?: number; sel?: number; caption?: ReactNode; fit?: boolean }) {
  const ys = Object.keys(years).map(Number).filter((y) => y >= from && y <= 2026);
  const y1 = 2026;
  // fit: the axis starts at the first year with documents (at least ten years shown), not at 1975
  const y0 = fit && ys.length ? Math.min(Math.min(...ys), y1 - 9) : Math.min(from, ...ys.length ? ys : [from]);
  const W = 720, H = 150, L = 40, R = 8, T = 8, B = 22;
  const n = y1 - y0 + 1;
  const bw = (W - L - R) / n;
  const max = Math.max(1, ...ys.map((y) => years[String(y)].reduce((a, b) => a + b, 0)));
  const nice = (m: number) => { const p = Math.pow(10, Math.floor(Math.log10(m))); const f = m / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; };
  const top = nice(max);
  const yScale = (v: number) => T + (H - T - B) * (1 - v / top);
  const ticks = [0, top / 2, top];
  const sum = ys.reduce((a, y) => a + years[String(y)].reduce((s, v) => s + v, 0), 0);
  return (
    <figure className="or-figure">
      <svg className="or-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${t(lang).perYear}, ${y0}–${y1}: ${num(sum, lang)}`}>
        {ticks.map((v) => (
          <g key={v}><line className={v === 0 ? 'axis' : 'grid'} x1={L} x2={W - R} y1={yScale(v)} y2={yScale(v)} /><text x={L - 6} y={yScale(v) + 4} textAnchor="end">{num(v, lang)}</text></g>
        ))}
        {sel != null && sel >= y0 ? <rect className="band" x={L + (sel - y0) * bw} y={T} width={bw} height={H - T - B} /> : null}
        {ys.map((y) => {
          let acc = 0;
          const v = years[String(y)];
          return (
            <g key={y}>
              {FAMS.map((f, i) => {
                if (!v[i]) return null;
                const y_ = yScale(acc + v[i]);
                const h = yScale(acc) - y_;
                acc += v[i];
                return <rect key={f} className={`s-${f}`} x={L + (y - y0) * bw + 0.5} y={y_} width={Math.max(bw - 1, 1)} height={h} />;
              })}
            </g>
          );
        })}
        {Array.from({ length: n }, (_, i) => y0 + i).filter((y) => (n <= 24 ? y % 5 === 0 || y === y0 : y % 10 === 0) || y === y1).filter((y, i, a) => y === y1 || a[i + 1] == null || a[i + 1] - y >= (n <= 24 ? 2 : 4)).map((y) => (
          <text key={y} x={L + (y - y0 + 0.5) * bw} y={H - 6} textAnchor="middle">{y}</text>
        ))}
      </svg>
      <figcaption>{caption}</figcaption>
      <Legend lang={lang} />
    </figure>
  );
}

/** A 20-year trend line (2006–2025, complete years only) of a node's documents a year. */
export function Spark({ years }: { years: Record<string, number[] | number> }) {
  const vals = Array.from({ length: 20 }, (_, i) => { const v = years[String(2006 + i)]; return Array.isArray(v) ? v.reduce((a, b) => a + b, 0) : v ?? 0; });
  const max = Math.max(1, ...vals);
  const pts = vals.map((v, i) => `${(i / 19) * 116 + 2},${16 - (v / max) * 14}`).join(' ');
  return (
    <svg className="or-spark" viewBox="0 0 120 18" preserveAspectRatio="none" aria-hidden="true">
      <polyline className="line" points={pts} />
    </svg>
  );
}

export function Bars({ items, lang, tone }: { items: { n: NodeLite | undefined; v: number; text?: string }[]; lang: Lang; tone?: Fam }) {
  const max = Math.max(1, ...items.map((x) => x.v));
  return (
    <ul className={`or-bars${tone ? ` or-fam or-fam--${tone}` : ''}`}>
      {items.filter((x) => x.n).map((x) => (
        <li key={x.n!.id}>
          <span className="lab"><NodeLink n={x.n} lang={lang} /></span>
          <span className="bar"><span style={{ width: `${(x.v / max) * 100}%` }} /></span>
          <span className="txt">{x.text ?? num(x.v, lang)}</span>
        </li>
      ))}
    </ul>
  );
}

export function PaperList({ rows, lang, topicNames }: { rows: Row[]; lang: Lang; topicNames?: Map<number, NodeLite> }) {
  const L = t(lang);
  return (
    <ol className="or-papers">
      {rows.map((r) => (
        <li key={r.s} className="or-paper">
          <div className="or-paper__top">
            <FamTag f={r.f} lang={lang} />
            <span className="or-tag or-tag--neutral">{L.kind[r.k] ?? r.k}</span>
            {r.tp?.[0] && topicNames?.get(r.tp[0]) ? <span className="or-muted" style={{ fontSize: 12.5 }}>{label(topicNames.get(r.tp[0]), lang)}</span> : null}
          </div>
          <Link className="or-paper__title" href={`/${lang}/p/${encodeURIComponent(r.s)}`} lang="en">{r.t}</Link>
          {r.a.length ? <span className="or-paper__authors">{r.a.join(', ')}{r.an > r.a.length ? (lang === 'ko' ? ` 외 ${r.an - r.a.length}명` : ` and ${r.an - r.a.length} more`) : ''}</span> : null}
          <span className="or-paper__meta">
            <span>{UNIT[r.u] ?? r.u}{r.no && r.u !== 'cb_reshub' && r.u !== 'bis_cbspeeches' ? <span className="or-mono"> {r.no.replace(/^(publ|publications|review|events)_/, '').slice(0, 24)}</span> : null}</span>
            <span>{day(r.d, lang)}</span>
            {r.kw[1] ? <span>{lang === 'ko' ? `핵심어 ${r.kw[1]}개 중 ${r.kw[0]}개 본문 확인` : `${r.kw[0]} of ${r.kw[1]} keywords in text`}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Page links. `ranked` lists (by count, A–Z) say Previous/Next; dated lists say Newer/Older. */
export function Pager({ base, page, total, per, lang, extra = '', ranked }: { base: string; page: number; total: number; per: number; lang: Lang; extra?: string; ranked?: boolean }) {
  const last = Math.max(1, Math.ceil(total / per));
  if (last <= 1) return null;
  const L = { ...t(lang), ...(ranked ? (lang === 'ko' ? { prev: '이전', next: '다음' } : { prev: 'Previous', next: 'Next' }) : {}) };
  const q = (p: number) => `${base}?page=${p}${extra}`;
  return (
    <nav className="or-pager" aria-label="Pages">
      {page > 1 ? <Link className="or-btn or-btn--sm" href={q(page - 1)}>← {L.prev}</Link> : <span />}
      <span className="or-muted or-mono">{num(page, lang)} {L.of} {num(last, lang)}</span>
      {page < last ? <Link className="or-btn or-btn--sm" href={q(page + 1)}>{L.next} →</Link> : <span />}
    </nav>
  );
}

export function KindChips({ base, kinds, current, lang }: { base: string; kinds: Record<string, number>; current?: string; lang: Lang }) {
  const L = t(lang);
  const total = Object.values(kinds).reduce((a, b) => a + b, 0);
  const ks = Object.entries(kinds).sort((a, b) => b[1] - a[1]);
  if (ks.length < 2) return null;
  return (
    <ul className="or-chips">
      <li><Link className="or-chip" href={base} aria-current={!current ? 'true' : undefined}>{L.all}<span className="or-chip__n">{num(total, lang)}</span></Link></li>
      {ks.map(([k, v]) => (
        <li key={k}><Link className="or-chip" href={`${base}?kind=${k}`} aria-current={current === k ? 'true' : undefined}>{L.kinds[k] ?? k}<span className="or-chip__n">{num(v, lang)}</span></Link></li>
      ))}
    </ul>
  );
}

export function Chips({ items, lang }: { items: { n: NodeLite | undefined; v?: number }[]; lang: Lang }) {
  return (
    <ul className="or-chips">
      {items.filter((x) => x.n).map((x) => (
        <li key={x.n!.id}><Link className="or-chip" href={href(lang, x.n!)}>{label(x.n, lang)}{x.v != null ? <span className="or-chip__n">{num(x.v, lang)}</span> : null}</Link></li>
      ))}
    </ul>
  );
}

/** One row of a compact list: the label truncates with an ellipsis (full text in the tooltip), the count stays right. */
export function Item({ href: to, text, n, lang, code, en, wrap }: { href?: string; text: string; n?: number; lang: Lang; code?: string; en?: boolean; wrap?: boolean }) {
  const inner = <>{code ? <span className="or-code">{code}</span> : null}{text}</>;
  return (
    <li className={wrap ? 'wrap' : undefined}>
      {to ? <Link className="lab" href={to} title={code ? `${code} ${text}` : text} lang={en ? 'en' : undefined}>{inner}</Link> : <span className="lab" title={text}>{inner}</span>}
      {n != null ? <span className="n">{num(n, lang)}</span> : null}
    </li>
  );
}

export function Source({ children }: { children: ReactNode }) {
  return <p className="or-source">{children}</p>;
}

/** Peak year and the documents of the last full year, from a page's years. */
export function yearStats(years: Record<string, number[]>) {
  const tot = Object.entries(years).map(([y, v]) => [Number(y), v.reduce((a, b) => a + b, 0)] as [number, number]);
  const peak = tot.reduce((a, b) => (b[1] > a[1] ? b : a), [0, 0] as [number, number]);
  const first = tot.length ? Math.min(...tot.map((x) => x[0])) : null;
  const last = tot.find((x) => x[0] === 2025)?.[1] ?? 0;
  return { peak: peak[0] || null, peakN: peak[1], first, last2025: last };
}
