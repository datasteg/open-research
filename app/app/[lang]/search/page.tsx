import type { Metadata } from 'next';
import { Chips, Head, Panel, PaperList } from '@/components/ui';
import { lookup, search } from '@/lib/db';
import { num } from '@/lib/format';
import { t } from '@/lib/i18n';
import type { Lang } from '@/lib/types';

export const metadata: Metadata = { title: 'Search' };
const KIND_KO: Record<string, string> = { grove: '숲', topic: '주제', concept: '개념', jel: 'JEL', org: '기관', person: '사람', place: '지역' };

export default async function Search({ params, searchParams }: { params: Promise<{ lang: string }>; searchParams: Promise<{ q?: string }> }) {
  const lang = (await params).lang as Lang;
  const q = ((await searchParams).q ?? '').slice(0, 200);
  const L = t(lang);
  const ko = lang === 'ko';
  const res = q ? search(q, 50) : { nodes: [], rows: [], total: 0 };
  const names = lookup(res.rows.flatMap((r) => r.tp));
  const kinds = [...new Set(res.nodes.map((n) => n.kind))];
  return (
    <div className="or-wrap or-page">
      <Head kicker={L.searchBtn} title={q ? (ko ? `“${q}” 검색 결과` : `Results for “${q}”`) : L.searchBtn} />
      <form className="or-searchform" action={`/${lang}/search`} role="search">
        <label className="or-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input id="q" name="q" type="search" defaultValue={q} placeholder={L.search} aria-label={L.search} />
        </label>
        <button className="or-btn or-btn--primary" type="submit">{L.searchBtn}</button>
      </form>
      {q && !res.nodes.length && !res.rows.length ? <p className="or-notice">{L.noResults}</p> : null}
      {kinds.map((k) => (
        <Panel key={k} title={ko ? KIND_KO[k] : k === 'org' ? L.orgs : k === 'person' ? L.people : k === 'place' ? L.places : k === 'jel' ? 'JEL' : k[0].toUpperCase() + k.slice(1) + 's'} quiet>
          <Chips items={res.nodes.filter((n) => n.kind === k).map((n) => ({ n, v: n.n }))} lang={lang} />
        </Panel>
      ))}
      {res.rows.length ? (
        <Panel title={L.papers} meta={ko ? `${num(res.total, lang)}건 중 관련도 상위 ${res.rows.length}건` : `top ${res.rows.length} of ${num(res.total, lang)} by relevance`}>
          <PaperList rows={res.rows} lang={lang} topicNames={names} />
        </Panel>
      ) : null}
    </div>
  );
}
