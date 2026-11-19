'use client';
import Link from 'next/link';
import { useLayoutEffect, useRef, useState } from 'react';
import { GroveTip } from './GroveTip';
import type { GroveSummary, Lang } from '@/lib/types';

const fmt = (n: number, lang: Lang) => new Intl.NumberFormat(lang === 'ko' ? 'ko-KR' : 'en-GB').format(n);
import { SORTS, type Sort } from '@/lib/grove';

const W = 220, H = 200, GROUND = 186;

/** A small deterministic random sequence, so a tree looks the same on every render. */
function rand(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => ((s = (s * 48271) % 2147483647) / 2147483647);
}

/**
 * One olive tree per grove. The whole tree scales with the grove's documents, area ∝ documents (every length ×
 * √(n / largest)), so a grove with a tenth of the documents covers a tenth of the ground. Each topic is a branch
 * ending in a leaf cluster sized the same way. Hover or tap a cluster for the topic, anywhere else for the grove.
 */
function Tree({ g, lang, maxGrove, maxTopic, tip }: { g: GroveSummary; lang: Lang; maxGrove: number; maxTopic: number; tip: string }) {
  const ko = lang === 'ko';
  const s = Math.sqrt(g.n / maxGrove);
  const num = (n: number) => fmt(n, lang);
  const r = rand(g.id * 7919);
  // an olive: a short, thick, leaning trunk under a wide, low dome
  const trunkH = 58 * s;
  const tx = W / 2, ty = GROUND - trunkH;
  const tw = 11 * s;
  const cx = tx, cy = ty - 30 * s, rx = 92 * s, ry = 52 * s;
  // the largest topics at the crown's top, smaller ones down its sides, alternating left and right
  const tps = [...g.topics].sort((a, b) => b[4] - a[4]);
  const k = tps.length;
  const clusters = tps.map((tp, i) => {
    const side = i === 0 ? 0 : (i % 2 ? -1 : 1) * Math.ceil(i / 2);
    const half = Math.max(1, Math.ceil((k - 1) / 2));
    // up to seven topics on the outer arc of the dome, the rest on an inner, lower arc
    const outer = i < 7;
    const along = outer ? side / Math.min(half, 3) : (side - Math.sign(side) * 3) / Math.max(1, half - 3);
    const theta = Math.PI / 2 - Math.max(-1, Math.min(1, along)) * (k > 3 ? 1.2 : 0.95);
    const rel = Math.sqrt(tp[4] / maxTopic);
    const rc = Math.max(3, (14 + 24 * rel) * s);
    const inset = (outer ? 0.72 : 0.38) + 0.08 * r();
    let x = cx + Math.cos(theta) * rx * inset;
    let y = cy - Math.sin(theta) * ry * inset + (outer ? 0 : 8 * s);
    x = Math.max(rc + 2, Math.min(W - rc - 2, x));
    y = Math.max(rc + 2, y);
    return { tp, x, y, rc };
  });
  // two main limbs fork from the trunk; each branch grows from the limb on its side
  const limb = (x: number) => (Math.abs(x - tx) < 8 * s ? { x: tx, y: ty } : { x: tx + Math.sign(x - tx) * 16 * s, y: ty - 16 * s });
  const leaves = (c: (typeof clusters)[number], idx: number) => {
    const out = [];
    const nl = 12 + Math.round(c.rc / 2.2);
    for (let j = 0; j < nl; j++) {
      const ang = (j / nl) * Math.PI * 2 + r() * 0.6;
      const d = c.rc * (0.25 + 0.6 * r());
      const lx = c.x + Math.cos(ang) * d, ly = c.y + Math.sin(ang) * d * 0.85;
      const rot = (ang * 180) / Math.PI + 90 + (r() - 0.5) * 50;
      out.push(<ellipse key={j} cx={lx.toFixed(1)} cy={ly.toFixed(1)} rx={(c.rc * 0.15).toFixed(1)} ry={(c.rc * 0.38).toFixed(1)} transform={`rotate(${rot.toFixed(0)} ${lx.toFixed(1)} ${ly.toFixed(1)})`} className={(j + idx) % 3 === 0 ? 'leaf leaf--silver' : 'leaf'} />);
    }
    const olives = c.rc > 14 ? 2 : 1;
    for (let j = 0; j < olives; j++) out.push(<circle key={`o${j}`} cx={(c.x + (r() - 0.5) * c.rc).toFixed(1)} cy={(c.y + (r() - 0.2) * c.rc * 0.7).toFixed(1)} r={(1.6 + c.rc * 0.07).toFixed(1)} className="olive" />);
    return out;
  };
  const name = ko ? g.ko : g.en;
  const label = `${name} · ${num(g.n)}${ko ? '건' : ' documents'}`;
  // crop the empty sky above the tree: the viewBox keeps its width (so every tree keeps the same scale and area ∝
  // documents still holds) and the ground lines up across a row (trees sit at the bottom of their cell)
  const top = Math.max(0, Math.floor(Math.min(cy + 4 * s - ry * 0.66, ...clusters.map((c) => c.y - c.rc * 1.3)) - 6));
  const gr = growthText(g.growth, lang);
  return (
    <figure className="or-tree" data-id={g.id}>
      <svg viewBox={`0 ${top} ${W} ${H - top}`} role="group" aria-label={label}>
        <Link href={`/${lang}/g/${g.slug}`} data-tip={tip} tabIndex={-1} aria-hidden="true" className="hit"><rect x="0" y={top} width={W} height={H - top} /></Link>
        <line className="ground" x1="18" x2={W - 18} y1={GROUND + 0.5} y2={GROUND + 0.5} />
        <ellipse className="shade" cx={tx} cy={GROUND + 2} rx={60 * s} ry={5 * s} />
        <ellipse className="canopy" cx={cx} cy={cy + 4 * s} rx={rx * 0.8} ry={ry * 0.66} />
        <path className="branch" d={`M${tx - 2 * s} ${ty + 6} Q${tx - 8 * s} ${ty - 6 * s} ${tx - 16 * s} ${ty - 16 * s}`} strokeWidth={(5 * s).toFixed(1)} />
        <path className="branch" d={`M${tx + 2 * s} ${ty + 6} Q${tx + 9 * s} ${ty - 5 * s} ${tx + 16 * s} ${ty - 16 * s}`} strokeWidth={(5 * s).toFixed(1)} />
        {clusters.map((c, i) => {
          const o = limb(c.x);
          return <path key={`b${i}`} className="branch" d={`M${o.x.toFixed(1)} ${o.y.toFixed(1)} Q${(o.x + (c.x - o.x) * 0.3).toFixed(1)} ${(c.y + (o.y - c.y) * 0.25 - 4 * r()).toFixed(1)} ${c.x.toFixed(1)} ${(c.y + c.rc * 0.3).toFixed(1)}`} strokeWidth={(1.4 + 2.4 * s * (c.rc / 38)).toFixed(1)} />;
        })}
        <Link href={`/${lang}/g/${g.slug}`} data-tip={tip} aria-label={label}>
          <path className="trunk" d={`M${tx - tw * 1.6} ${GROUND} C${tx - tw * 0.4} ${GROUND - trunkH * 0.35} ${tx - tw * 1.3} ${GROUND - trunkH * 0.7} ${tx - tw * 0.5} ${ty} L${tx + tw * 0.6} ${ty} C${tx + tw * 1.4} ${GROUND - trunkH * 0.6} ${tx + tw * 0.2} ${GROUND - trunkH * 0.3} ${tx + tw * 1.7} ${GROUND} Z`} />
          <path className="knot" d={`M${tx - tw * 0.2} ${GROUND - trunkH * 0.42} q${tw * 0.5} ${-trunkH * 0.12} ${tw * 0.1} ${-trunkH * 0.26}`} />
        </Link>
        {clusters.map((c, i) => {
          const tn = ko ? c.tp[3] || c.tp[2] : c.tp[2];
          const tl = `${tn} · ${num(c.tp[4])}${ko ? '건' : ' documents'}`;
          return (
            <Link key={c.tp[0]} href={`/${lang}/t/${c.tp[1]}`} data-tip={tl} aria-label={tl} className="cluster">
              <circle className="crown" cx={c.x.toFixed(1)} cy={c.y.toFixed(1)} r={(c.rc * 1.02).toFixed(1)} />
              {leaves(c, i)}
            </Link>
          );
        })}
      </svg>
      <figcaption>
        <Link href={`/${lang}/g/${g.slug}`} className="name" data-tip={tip}>{name}</Link>
        <span className="stats">
          <span className="n">{num(g.n)}</span>
          {gr ? <span className={`or-growth or-growth--${(g.growth ?? 0) >= 0 ? 'up' : 'down'}`} title={ko ? '2023–2025년 문서 수, 2020–2022년 대비' : 'Documents 2023–2025 against 2020–2022'}>{gr}</span> : null}
        </span>
        <GroveSpark years={g.years} />
      </figcaption>
    </figure>
  );
}


/** "+18% 3y": documents published 2023–2025 against 2020–2022 (the last three complete years against the three before). */
export function growthText(x: number | null | undefined, lang: Lang) {
  if (x == null) return null;
  const p = Math.round(x * 100);
  return `${p > 0 ? '+' : p < 0 ? '−' : '±'}${Math.abs(p)}% ${lang === 'ko' ? '3년' : '3y'}`;
}

function GroveSpark({ years }: { years: Record<string, number> }) {
  const vals = Array.from({ length: 20 }, (_, i) => years[String(2006 + i)] ?? 0);
  const max = Math.max(1, ...vals);
  const pts = vals.map((v, i) => `${((i / 19) * 116 + 2).toFixed(1)},${(16 - (v / max) * 14).toFixed(1)}`).join(' ');
  return (
    <span className="or-gspark" aria-hidden="true">
      <span className="y">2006</span>
      <svg className="or-spark" viewBox="0 0 120 18" preserveAspectRatio="none"><polyline className="line" points={pts} /></svg>
      <span className="y">2025</span>
    </span>
  );
}

const sorter = (sort: Sort, lang: Lang) => (a: GroveSummary, b: GroveSummary) => {
  if (sort === 'growth') return (b.growth ?? -9) - (a.growth ?? -9) || b.n - a.n;
  if (sort === 'm12') return b.n12 - a.n12 || b.n - a.n;
  if (sort === 'az') return (lang === 'ko' ? a.ko : a.en).localeCompare(lang === 'ko' ? b.ko : b.en, lang);
  return b.n - a.n;
};

/**
 * The orchard: all eleven groves in one view, sortable (documents, growth, the last 12 months, A–Z). The order is kept
 * in the URL (?sort=growth) and reordering slides each tree to its new place (FLIP; instant with reduced motion).
 */
export function GroveTrees({ groves, lang, sort: initial }: { groves: GroveSummary[]; lang: Lang; sort: Sort }) {
  const ko = lang === 'ko';
  const [sort, setSort] = useState<Sort>(initial);
  const box = useRef<HTMLDivElement>(null);
  const before = useRef<Map<string, DOMRect> | null>(null);
  const maxGrove = Math.max(1, ...groves.map((g) => g.n));
  const maxTopic = Math.max(1, ...groves.flatMap((g) => g.topics.map((t) => t[4])));
  const list = [...groves].sort(sorter(sort, lang));
  const pick = (s: Sort) => {
    if (s === sort) return;
    before.current = new Map([...(box.current?.querySelectorAll<HTMLElement>('.or-tree') ?? [])].map((el) => [el.dataset.id!, el.getBoundingClientRect()]));
    setSort(s);
    const u = new URL(window.location.href);
    if (s === 'docs') u.searchParams.delete('sort'); else u.searchParams.set('sort', s);
    window.history.replaceState(window.history.state, '', u);
  };
  useLayoutEffect(() => {
    const prev = before.current;
    before.current = null;
    if (!prev || !box.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (const el of box.current.querySelectorAll<HTMLElement>('.or-tree')) {
      const a = prev.get(el.dataset.id!);
      if (!a) continue;
      const b = el.getBoundingClientRect();
      const dx = a.left - b.left, dy = a.top - b.top;
      if (!dx && !dy) continue;
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 380, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' });
    }
  }, [sort]);
  const labels: Record<Sort, string> = ko
    ? { docs: '문서 수', growth: '증가율', m12: '최근 12개월', az: '가나다' }
    : { docs: 'Documents', growth: 'Growth', m12: 'Last 12 months', az: 'A–Z' };
  const hint: Record<Sort, string> = ko
    ? { docs: '문서가 많은 숲부터', growth: '2023–2025년 문서 수를 2020–2022년과 비교', m12: '최근 12개월에 발행된 문서 수', az: '이름순' }
    : { docs: 'Largest first', growth: 'Documents 2023–2025 against 2020–2022', m12: 'Documents published in the last 12 months', az: 'By name' };
  const tip = (g: GroveSummary) => {
    const tops = g.topics.slice(0, 3).map((x) => (ko ? x[3] || x[2] : x[2])).join(', ');
    const share = `${(g.share24 * 100).toFixed(1)}%`;
    return ko
      ? `${g.ko}\n문서 ${fmt(g.n, lang)}건 · 주제 ${g.topics.length}개\n큰 주제: ${tops}\n최근 24개월 발행 ${share} · 12개월 ${fmt(g.n12, lang)}건`
      : `${g.en}\n${fmt(g.n, lang)} documents · ${g.topics.length} topics\nTop topics: ${tops}\n${share} from the last 24 months · ${fmt(g.n12, lang)} in the last 12`;
  };
  return (
    <div className="or-orchardwrap">
      <div className="or-sorts" role="group" aria-label={ko ? '숲 정렬' : 'Sort the groves'}>
        <span className="or-sorts__label">{ko ? '정렬' : 'Sort'}</span>
        {SORTS.map((s) => <button key={s} type="button" className="or-chip" aria-pressed={sort === s} title={hint[s]} onClick={() => pick(s)}>{labels[s]}</button>)}
        <span className="or-sorts__note">{ko ? '나무의 넓이 = 문서 수' : 'tree area = documents'}</span>
      </div>
      <GroveTip>
        <div className="or-orchard" ref={box}>
          {list.map((g) => <Tree key={g.id} g={g} lang={lang} maxGrove={maxGrove} maxTopic={maxTopic} tip={tip(g)} />)}
        </div>
      </GroveTip>
    </div>
  );
}
