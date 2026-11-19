import Link from 'next/link';
import type { ReactNode } from 'react';
import { notFound, permanentRedirect } from 'next/navigation';
import { Bars, Crumbs, Head, KindChips, Pager, Panel, PaperList, Tiles, YearBars, href, yearStats } from './ui';
import { docsOf, kindsOf, lookup, node, redirect } from '@/lib/db';
import { day, num } from '@/lib/format';
import { label, t } from '@/lib/i18n';
import type { Lang, NodeLite, NodePage } from '@/lib/types';

export const PER = 30;

/** A node by its slug; a merged or retired slug redirects permanently (rule O5); else 404. */
export function loadNode(kind: string, slug: string, lang: Lang): NodePage {
  const s = decodeURIComponent(slug);
  const n = node(kind, s);
  if (n) return n;
  const r = redirect(kind, s);
  if (r) permanentRedirect(href(lang, r));
  notFound();
}

export function ancestry(n: NodePage): NodeLite[] {
  const out: NodeLite[] = [];
  let p = n.parent;
  for (let i = 0; i < 6 && p; i++) {
    const m = lookup([p]).get(p);
    if (!m) break;
    out.unshift(m);
    p = m.parent;
  }
  return out;
}

type SP = { page?: string; kind?: string };

/** Everything a node page shares: head, tiles, documents a year, the documents (paged, by kind) and the side lists. */
export function NodeView({ n, lang, sp, base, kicker, crumbs, lede, top, side, primary, extraTiles }: {
  n: NodePage; lang: Lang; sp: SP; base: string; kicker: ReactNode; crumbs?: { href?: string; text: ReactNode; code?: string }[];
  lede?: ReactNode; top?: ReactNode; side?: ReactNode; primary?: boolean; extraTiles?: { label: ReactNode; value: ReactNode; sub?: ReactNode }[];
}) {
  const L = t(lang);
  const ko = lang === 'ko';
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);
  const kind = sp.kind && /^[a-z-]+$/.test(sp.kind) ? sp.kind : undefined;
  const { rows, total } = docsOf(n.id, { limit: PER, offset: (page - 1) * PER, kind, primary });
  const kinds = kindsOf(n.id);
  const p = n.page;
  const ys = yearStats(p.years);
  const rel = p.rel ?? {};
  const ids = [...rows.flatMap((r) => r.tp), ...Object.values(rel).flatMap((xs) => (xs ?? []).map((x) => x[0]))];
  const names = lookup(ids);
  const bars = (k: keyof typeof rel, nmax = 10) => (rel[k] ?? []).slice(0, nmax).map(([id, v]) => ({ n: names.get(id), v }));
  const share = (v: number) => (n.n ? `${num(v, lang)} · ${Math.round((v / n.n) * 100)}%` : num(v, lang));
  const sideLists: [string, keyof typeof rel][] = [[L.topics, 'topic'], [L.orgs, 'org'], [L.people, 'person'], [L.places, 'place']];
  return (
    <div className="or-wrap or-page">
      <Head crumbs={crumbs ? <Crumbs items={crumbs} /> : undefined} kicker={kicker} title={label(n, lang)} lede={lede} />
      <Tiles items={[
        { label: L.papers, value: num(n.n, lang), sub: Object.entries(kinds).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, v]) => `${L.kinds[k] ?? k} ${num(v, lang)}`).join(' · '), big: true },
        { label: ko ? '처음 나온 해' : 'First year', value: ys.first ?? '–' },
        { label: ko ? '가장 많았던 해' : 'Peak year', value: ys.peak ?? '–', sub: ys.peak ? `${num(ys.peakN, lang)} ${L.docs}` : undefined },
        { label: ko ? '2025년 문서' : 'In 2025', value: num(ys.last2025, lang), sub: ko ? '가장 최근의 완결 연도' : 'the last complete year' },
        ...(extraTiles ?? []),
      ]} />
      <Panel title={L.perYear} quiet>
        <YearBars years={p.years} lang={lang} fit caption={ko ? '발행 연도와 발행 기관 묶음별 문서 수입니다. 2026년은 수집 중입니다.' : 'Documents by year published and publisher family. 2026 is still being collected.'} />
      </Panel>
      <div className="or-split">
        <div>
          {top}
          <Panel title={L.papers} meta={`${num(total, lang)} · ${L.newest}`}>
            <KindChips base={base} kinds={kinds} current={kind} lang={lang} />
            <PaperList rows={rows} lang={lang} topicNames={names} />
            <Pager base={base} page={page} total={total} per={PER} lang={lang} extra={kind ? `&kind=${kind}` : ''} />
          </Panel>
        </div>
        <div>
          {side}
          {sideLists.map(([title, k]) => (rel[k]?.length ? (
            <Panel key={k} title={title} quiet>
              <Bars items={bars(k).map((x) => ({ ...x, text: share(x.v) }))} lang={lang} />
            </Panel>
          ) : null))}
        </div>
      </div>
    </div>
  );
}

export function Kicker({ lang, what, n }: { lang: Lang; what: string; n?: NodePage }) {
  return <>{what}{n ? ` · ${t(lang).release} ` : ''}{n ? <span className="or-mono">{n.slug}</span> : null}</>;
}

export const releaseNote = (lang: Lang, date: string | null) => (lang === 'ko' ? `${day(date, lang)} 기준` : `as of ${day(date, lang)}`);
export { Link };
