import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Crumbs, Head, Pager, Panel, Title } from '@/components/ui';
import { GroveIcon } from '@/components/Icons';
import { TopicFinder } from '@/components/TopicFinder';
import { conceptHeads, dupCount, meta, nodeById, subCounts, variantsOf } from '@/lib/db';
import { num } from '@/lib/format';
import { t } from '@/lib/i18n';
import type { GroveSummary, Lang } from '@/lib/types';

export const metadata = { title: 'Topics' };

type SP = { g?: string; list?: string; q?: string; page?: string };
const LISTS = ['methods', 'data'] as const;
const PER = 60;

/**
 * Topics as a drill-down. Level 1: the eleven groves and the two concept lists as icon tiles. Level 2 (?g=<grove>):
 * that grove's topics. Level 3 is the topic page itself. ?list=methods|data pages through the method and data
 * concepts, near-duplicates grouped under the largest spelling. Every level has its own URL, so Back works.
 */
export default async function Topics({ params, searchParams }: { params: Promise<{ lang: string }>; searchParams: Promise<SP> }) {
  const lang = (await params).lang as Lang;
  const sp = await searchParams;
  const L = t(lang);
  const ko = lang === 'ko';
  const m = meta();
  const order = new Map(m.grove_order.map((k, i) => [k, i]));
  const groves = [...m.groves].sort((a, b) => (order.get(a.slug) ?? 0) - (order.get(b.slug) ?? 0));
  const sub = subCounts('concept');
  const finder = (
    <TopicFinder lang={lang} labels={{
      placeholder: ko ? '주제, 개념, 분석 방법, 데이터 찾기' : 'Find a topic, concept, method or data source',
      kinds: { grove: L.grove, topic: L.topic, concept: ko ? '개념' : 'concept', method: ko ? '방법' : 'method', data: ko ? '데이터' : 'data', instrument: ko ? '정책수단' : 'instrument' },
      none: ko ? '맞는 항목이 없습니다. 검색 페이지에서 문서를 찾아볼 수 있습니다(Enter).' : 'No topic or concept matches. Press Enter to search the documents.',
      go: L.searchBtn,
    }} />
  );
  const base = `/${lang}/t`;
  const kicker = `${L.nav.topics} · ${L.release} ${m.surface.release}`;

  // Level 2: one grove's topics
  if (sp.g) {
    const g = groves.find((x) => x.slug === sp.g);
    if (!g) notFound();
    return (
      <div className="or-wrap or-page or-page--tight">
        <Head crumbs={<Crumbs items={[{ href: base, text: L.nav.topics }, { text: ko ? g.ko : g.en }]} />} kicker={kicker}
          title={<span className="or-titleicon"><GroveIcon k={g.slug} size={34} />{ko ? g.ko : g.en}</span>}
          lede={ko ? g.desc_ko : g.desc_en} />
        {finder}
        <GroveTopics g={g} lang={lang} />
        <p><Link className="or-btn or-btn--sm" href={`/${lang}/g/${g.slug}`}>{ko ? `숲 페이지에서 문서 ${num(g.n, lang)}건 보기` : `All ${num(g.n, lang)} documents on the grove page`} →</Link></p>
      </div>
    );
  }

  // Level 2: methods or data sources, paged and searchable
  if (sp.list) {
    const which = LISTS.find((x) => x === sp.list);
    if (!which) notFound();
    const subKey = which === 'methods' ? 'method' : 'data';
    const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);
    const q = (sp.q ?? '').trim().slice(0, 60);
    const { rows, total } = conceptHeads(subKey, q, PER, (page - 1) * PER);
    const variants = variantsOf(rows.map((r) => r.id));
    const groups = dupCount()[subKey] ?? 0;
    const title = which === 'methods' ? L.methods : L.data;
    return (
      <div className="or-wrap or-page or-page--tight">
        <Head crumbs={<Crumbs items={[{ href: base, text: L.nav.topics }, { text: title }]} />} kicker={kicker}
          title={<span className="or-titleicon"><GroveIcon k={`list-${which}`} size={34} />{title}</span>}
          lede={which === 'methods'
            ? (ko ? `문서가 쓴 분석 방법 ${num(sub.method ?? 0, lang)}개. 이름이 거의 같은 항목은 가장 큰 이름 아래에 묶었습니다(${num(groups, lang)}묶음). 다음 릴리스에서 하나로 합칠 후보입니다. 숫자는 합치지 않았습니다.` : `${num(sub.method ?? 0, lang)} methods the documents use. Near-identical names are grouped under the largest (${num(groups, lang)} groups); they are flagged to be merged in the next release, and their counts are not added.`)
            : (ko ? `문서가 쓴 데이터 출처는 ${num(sub.data ?? 0, lang)}개입니다. 이름이 거의 같은 항목은 가장 큰 이름 아래에 묶었습니다(${num(groups, lang)}묶음). 다음 릴리스에서 하나로 합칠 후보입니다. 숫자는 합치지 않았습니다.` : `${num(sub.data ?? 0, lang)} data sources the documents use. Near-identical names are grouped under the largest (${num(groups, lang)} groups); they are flagged to be merged in the next release, and their counts are not added.`)} />
        <form className="or-searchform" action={base} role="search">
          <input type="hidden" name="list" value={which} />
          <label className="or-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input name="q" type="search" defaultValue={q} placeholder={ko ? `${title} 안에서 찾기` : `Filter ${title.toLowerCase()}`} aria-label={ko ? `${title} 안에서 찾기` : `Filter ${title.toLowerCase()}`} />
          </label>
          <button className="or-btn" type="submit">{L.searchBtn}</button>
        </form>
        <Panel title={q ? (ko ? `‘${q}’ ${num(total, lang)}개` : `${num(total, lang)} matching ‘${q}’`) : (ko ? `문서 수 순 · ${num(total, lang)}개` : `By documents · ${num(total, lang)}`)} meta={`${num(page, lang)} / ${num(Math.max(1, Math.ceil(total / PER)), lang)}`}>
          <ul className="or-list or-dups">
            {rows.map((r) => {
              const vs = variants.get(r.id) ?? [];
              return (
                <li key={r.id} className={vs.length ? 'has-vars' : undefined}>
                  <Link className="lab" href={`/${lang}/k/${r.slug}`} title={r.en} lang="en">{r.en}</Link>
                  <span className="n">{num(r.n, lang)}</span>
                  {vs.length ? (
                    <span className="vars" lang="en">
                      <span className="or-tag or-tag--warn">{ko ? '합칠 후보' : 'to merge'}</span>{' '}
                      {vs.map((v, i) => <span key={v.id}>{i ? ' · ' : ''}<Link href={`/${lang}/k/${v.slug}`}>{v.en}</Link> <span className="or-mono">{num(v.n, lang)}</span></span>)}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <Pager ranked base={base} page={page} total={total} per={PER} lang={lang} extra={`&list=${which}${q ? `&q=${encodeURIComponent(q)}` : ''}`} />
        </Panel>
      </div>
    );
  }

  // Level 1: the tiles
  return (
    <div className="or-wrap or-page or-page--tight">
      <Title lang={lang} text={ko ? '주제로 찾기' : 'Browse by topic'}
        info={<>
          <p>{ko ? '숲을 고르면 그 안의 주제가 나오고, 주제를 고르면 문서가 나옵니다. 상자에 이름을 치면 주제나 개념, 분석 방법, 데이터 출처로 바로 이동합니다.' : 'Pick a grove to see its topics, then a topic to see its documents; or type a name in the box to jump straight to a topic, concept, method or data source.'}</p>
          <p>{ko ? '숲의 문서 수는 그 숲 주제들의 문서를 한 번씩 센 값입니다. 문서 하나가 주제 세 개까지 들어가므로 숲의 합은 전체보다 큽니다.' : 'A grove counts each of its documents once. A document can sit in up to three topics, so the groves add up to more than the archive.'}</p>
          <p className="or-muted">{kicker}</p>
        </>} />
      {finder}
      <ul className="or-tiles-grid">
        {groves.map((g) => (
          <li key={g.id}>
            <Link className="or-gtile" href={`${base}?g=${g.slug}`}>
              <GroveIcon k={g.slug} />
              <span className="name">{ko ? g.ko : g.en}</span>
              <span className="meta"><span className="or-mono">{num(g.n, lang)}</span> {L.docs} · {ko ? `주제 ${g.topics.length}개` : `${g.topics.length} topics`}</span>
            </Link>
          </li>
        ))}
        {LISTS.map((k) => (
          <li key={k}>
            <Link className="or-gtile or-gtile--list" href={`${base}?list=${k}`}>
              <GroveIcon k={`list-${k}`} />
              <span className="name">{k === 'methods' ? L.methods : L.data}</span>
              <span className="meta">{ko ? `개념 ${num(sub[k === 'methods' ? 'method' : 'data'] ?? 0, lang)}개` : `${num(sub[k === 'methods' ? 'method' : 'data'] ?? 0, lang)} concepts`}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function GroveTopics({ g, lang }: { g: GroveSummary; lang: Lang }) {
  const ko = lang === 'ko';
  const L = t(lang);
  const max = Math.max(1, ...g.topics.map((x) => x[4]));
  return (
    <ul className="or-topic-rows">
      {g.topics.map(([id, slug, en, kol, n]) => {
        const page = nodeById(id)?.page;
        const desc = (ko ? page?.data?.desc_ko : page?.data?.desc_en) as string | undefined;
        return (
          <li key={id}>
            <Link href={`/${lang}/t/${slug}`} className="or-trow">
              <span className="name">{ko ? kol || en : en}</span>
              <span className="n">{num(n, lang)} <span className="or-muted">{L.docs}</span></span>
              <span className="bar" aria-hidden="true"><span style={{ width: `${(n / max) * 100}%` }} /></span>
              {desc ? <span className="desc">{desc}</span> : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
