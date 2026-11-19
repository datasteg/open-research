import Link from 'next/link';
import { Title } from '@/components/ui';
import { GroveTrees } from '@/components/GroveTrees';
import { SORTS, type Sort } from '@/lib/grove';
import { meta } from '@/lib/db';
import { day, num } from '@/lib/format';
import { t } from '@/lib/i18n';
import type { Lang } from '@/lib/types';

/**
 * The home page is only the grove dashboard: the title line, "How to read this", the sort chips and the
 * eleven trees filling the first screen, with the groves and topics as a list for screen readers and keyboards. Search
 * is global (the masthead's magnifier, Ctrl+K); new documents live on New, organisations on Map, archive statistics on About.
 */
export default async function Grove({ params, searchParams }: { params: Promise<{ lang: string }>; searchParams: Promise<{ sort?: string }> }) {
  const lang = (await params).lang as Lang;
  const sortQ = (await searchParams).sort;
  const sort: Sort = (SORTS as readonly string[]).includes(sortQ ?? '') ? (sortQ as Sort) : 'docs';
  const L = t(lang);
  const ko = lang === 'ko';
  const m = meta();
  const order = new Map(m.grove_order.map((k, i) => [k, i]));
  const groves = [...m.groves].sort((a, b) => (order.get(a.slug) ?? 0) - (order.get(b.slug) ?? 0));
  return (
    <div className="or-wrap or-page or-page--tight or-page--grove">
      <Title lang={lang} text={ko ? `문서 ${num(m.docs, lang)}건 · 숲 ${groves.length}개` : `${num(m.docs, lang)} documents · ${groves.length} groves`}
        info={<>
          <p>{L.description}</p>
          <p>{ko
            ? `나무 하나가 숲 하나입니다. 나무의 넓이는 문서 수에 비례하고, 가지 끝의 잎 뭉치가 주제입니다. 증가율은 2023–2025년 발행 문서를 2020–2022년과 비교한 값입니다. 선은 2006–2025년 연도별 문서 수입니다. 문서 하나가 주제 세 개까지 들어가므로 숲의 합계는 전체보다 큽니다. ${num(m.unplaced, lang)}건은 아직 어느 주제에도 놓이지 않았습니다.`
            : `One tree per grove. A tree’s area is proportional to its documents; each leaf cluster is a topic. Growth compares documents published 2023–2025 with 2020–2022. The line is documents a year, 2006–2025. A document can sit in up to three topics, so the groves add up to more than the archive; ${num(m.unplaced, lang)} documents are not placed in any topic yet.`}</p>
          <p className="or-muted">{L.release} {m.surface.release} · {ko ? '최근 수집' : 'latest received'} {day(m.latest_received, lang)}</p>
        </>} />
      <GroveTrees groves={groves} lang={lang} sort={sort} />
      <details className="or-grovelist">
        <summary>{ko ? '숲과 주제를 목록으로 보기' : 'The groves and topics as a list'}</summary>
        <dl>
          {groves.map((g) => (
            <div key={g.id} style={{ display: 'contents' }}>
              <dt><Link href={`/${lang}/g/${g.slug}`}>{ko ? g.ko : g.en}</Link> <span className="or-mono or-muted">{num(g.n, lang)}</span></dt>
              <dd>{g.topics.map((x, i) => <span key={x[0]}>{i ? ' · ' : ''}<Link href={`/${lang}/t/${x[1]}`}>{ko ? x[3] || x[2] : x[2]}</Link> <span className="or-mono">{num(x[4], lang)}</span></span>)}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}
