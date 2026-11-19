import Link from 'next/link';
import type { Metadata } from 'next';
import { NodeView, loadNode } from '@/components/NodeView';
import { Chips, Panel } from '@/components/ui';
import { lookup, meta } from '@/lib/db';
import { label, t } from '@/lib/i18n';
import type { Lang } from '@/lib/types';

type P = { params: Promise<{ lang: string; slug: string }>; searchParams: Promise<{ page?: string; kind?: string }> };
const KIND: Record<string, [string, string]> = { topic: ['topic', '주제어'], method: ['method', '분석 방법'], data: ['data source', '데이터 출처'], instrument: ['instrument', '정책 수단·상품'] };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang, slug } = await params;
  return { title: loadNode('concept', slug, lang as Lang).en };
}

export default async function ConceptPage({ params, searchParams }: P) {
  const { lang: l, slug } = await params;
  const lang = l as Lang;
  const L = t(lang);
  const ko = lang === 'ko';
  const n = loadNode('concept', slug, lang);
  const p = n.page;
  const topics = p.topics ?? [];
  const relC = (p.rel.concept ?? []).slice(0, 24);
  const names = lookup([...topics.map((x) => x[0]), p.broader, ...(p.children as [number, number][]).map((x) => x[0]), ...relC.map((x) => x[0])]);
  const first = topics[0] ? names.get(topics[0][0]) : undefined;
  const grove = first ? meta().groves.find((g) => g.topics.some((x) => x[0] === first.id)) : undefined;
  const broader = p.broader ? names.get(p.broader) : undefined;
  const kind = KIND[p.data.kind] ?? [p.data.kind, p.data.kind];
  const top = (
    <Panel title={ko ? '지도 안의 위치' : 'Where it sits'}>
      <dl className="or-kv">
        <dt>{ko ? '종류' : 'Kind'}</dt><dd><span className="or-tag or-tag--neutral">{ko ? kind[1] : kind[0]}</span></dd>
        <dt>{L.topics}</dt><dd>{topics.length ? <Chips items={topics.map(([id]) => ({ n: names.get(id) }))} lang={lang} /> : <span className="or-muted">{ko ? '아직 어느 주제에도 속하지 않았습니다' : 'not placed in a topic yet'}</span>}</dd>
        {broader ? <><dt>{ko ? '상위 개념' : 'Broader'}</dt><dd><Link href={`/${lang}/k/${broader.slug}`} lang="en">{broader.en}</Link></dd></> : null}
        {(p.children as [number, number][]).length ? <><dt>{ko ? '하위 개념' : 'Narrower'}</dt><dd><Chips items={(p.children as [number, number][]).slice(0, 20).map(([id, v]) => ({ n: names.get(id), v }))} lang={lang} /></dd></> : null}
        <dt>{ko ? '함께 나오는 개념' : 'Appears with'}</dt><dd><Chips items={relC.map(([id, v]) => ({ n: names.get(id), v }))} lang={lang} /></dd>
      </dl>
      <p className="or-source">{ko ? '상위·하위 개념은 낱말 구조로 정했습니다("비전통적 통화정책" → "통화정책"). 함께 나오는 개념의 숫자는 이 개념의 문서 가운데 그 개념도 핵심어로 가진 문서 수입니다.' : 'Broader and narrower follow the words ("unconventional monetary policy" → "monetary policy"). The number beside a concept it appears with counts this concept’s documents that also list it.'}</p>
    </Panel>
  );
  return (
    <NodeView n={n} lang={lang} sp={await searchParams} base={`/${lang}/k/${slug}`} kicker={`${L.concept} · ${ko ? kind[1] : kind[0]}`}
      crumbs={[{ href: `/${lang}`, text: L.nav.grove }, ...(grove ? [{ href: `/${lang}/g/${grove.slug}`, text: ko ? grove.ko : grove.en }] : []),
        ...(first ? [{ href: `/${lang}/t/${first.slug}`, text: label(first, lang) }] : []), ...(broader ? [{ href: `/${lang}/k/${broader.slug}`, text: broader.en }] : []), { text: n.en }]}
      top={top} />
  );
}
