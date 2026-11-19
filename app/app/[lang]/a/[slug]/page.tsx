import Link from 'next/link';
import type { Metadata } from 'next';
import { NodeView, loadNode } from '@/components/NodeView';
import { Panel } from '@/components/ui';
import { lookup } from '@/lib/db';
import { label, t } from '@/lib/i18n';
import type { AffRun, Lang } from '@/lib/types';

type P = { params: Promise<{ lang: string; slug: string }>; searchParams: Promise<{ page?: string; kind?: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang, slug } = await params;
  return { title: loadNode('person', slug, lang as Lang).en };
}

const TIER: Record<string, [string, string, string]> = {
  stated: ['stated by the publisher', '발행 기관이 밝힘', 'found'],
  found: ['named in the text', '본문에서 찾음', 'found'],
  series: ['from the staff series they write in', '작성 기관 내부 시리즈 기준', 'model'],
  coauthored: ['from co-authored papers', '공저 논문 기준', 'model'],
};

export default async function PersonPage({ params, searchParams }: P) {
  const { lang: l, slug } = await params;
  const lang = l as Lang;
  const L = t(lang);
  const ko = lang === 'ko';
  const n = loadNode('person', slug, lang);
  const aff = n.page.aff;
  const orgs = lookup(aff ? aff.timeline.map((r) => r.org) : []);
  const name = (r: AffRun) => {
    const o = r.org != null ? orgs.get(r.org) : undefined;
    return o ? <Link href={`/${lang}/o/${o.slug}`}>{label(o, lang)}</Link> : <span>{r.name}</span>;
  };
  const years = (r: AffRun) => (r.y0 === r.y1 ? `${r.y0}` : `${r.y0}–${r.y1}`);
  const lede = aff ? (
    <span className="or-aff">
      <span>{ko ? '최근 소속' : 'Latest affiliation'}:</span><b>{name(aff.latest)}</b><span className="or-mono">{aff.latest.year}</span>
      <span className={`or-tag or-mark--${TIER[aff.tier][2]}`}>{ko ? TIER[aff.tier][1] : TIER[aff.tier][0]}</span>
    </span>
  ) : <span className="or-aff">{ko ? '소속을 알 수 없습니다' : 'Affiliation unknown'}</span>;
  const top = aff && aff.timeline.length > 1 ? (
    <Panel title={ko ? '소속의 변화' : 'Affiliations over time'} quiet>
      <ol className="or-timeline">
        {aff.timeline.map((r, i) => <li key={i} className={r.tier === 'coauthored' ? 'weak' : undefined} title={ko ? TIER[r.tier][1] : TIER[r.tier][0]}>{name(r)} <span className="y">{years(r)}</span></li>)}
      </ol>
      <p className="or-source">{ko ? '각 소속이 붙은 문서의 첫 해와 마지막 해입니다. 다른 소속이 두 번 이상 나오면 한 번만 나온 소속은 제외했습니다. 흐린 글씨는 공저 논문에서 추린 소속이며, 더 강한 근거가 시작되기 전의 해만 채웁니다.' : 'First and last year of the documents carrying each affiliation. One-off entries are left out when another affiliation appears at least twice. Lighter entries come from co-authored papers and fill only the years before the stronger evidence starts.'}</p>
    </Panel>
  ) : undefined;
  const side = (
    <Panel quiet>
      <p className="or-source">{ko
        ? '발행 기관이 밝힌 저자 목록과 연설자 이름으로 모은 문서입니다. 오른쪽 기관 목록은 이 사람의 문서에 이름이 나온 기관이며 소속을 뜻하지 않습니다. 소속은 이름 아래에 따로 적었습니다. 정정이나 삭제 요청은 소개 페이지에 적은 방법으로 받습니다.'
        : 'Documents gathered from the publishers’ author lists and speaker names. The organisations listed here are those named on this person’s documents, not their affiliation, which is given under the name. Corrections and removals: see About.'}</p>
    </Panel>
  );
  return (
    <NodeView n={n} lang={lang} sp={await searchParams} base={`/${lang}/a/${slug}`} kicker={L.nav.people}
      crumbs={[{ href: `/${lang}/a`, text: L.nav.people }, { text: n.en }]} lede={lede} top={top} side={side} />
  );
}
