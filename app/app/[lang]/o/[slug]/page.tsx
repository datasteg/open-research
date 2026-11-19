import type { Metadata } from 'next';
import { NodeView, ancestry, loadNode } from '@/components/NodeView';
import { Chips, Panel } from '@/components/ui';
import { lookup, node } from '@/lib/db';
import { label, t } from '@/lib/i18n';
import type { Lang } from '@/lib/types';

type P = { params: Promise<{ lang: string; slug: string }>; searchParams: Promise<{ page?: string; kind?: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang, slug } = await params;
  return { title: label(loadNode('org', slug, lang as Lang), lang as Lang) };
}

export default async function OrgPage({ params, searchParams }: P) {
  const { lang: l, slug } = await params;
  const lang = l as Lang;
  const L = t(lang);
  const ko = lang === 'ko';
  const n = loadNode('org', slug, lang);
  const p = n.page;
  const kids = p.children as [number, number][];
  const names = lookup(kids.map((x) => x[0]));
  const country = p.data.country ? node('place', p.data.country) : null;
  const top = (
    <Panel title={ko ? '기관 정보' : 'About this organisation'}>
      <dl className="or-kv">
        <dt>{ko ? '유형' : 'Type'}</dt><dd>{L.orgType[p.data.type] ?? p.data.type}</dd>
        {country ? <><dt>{ko ? '소재지' : 'Country'}</dt><dd><Chips items={[{ n: country }]} lang={lang} /></dd></> : null}
        {kids.length ? <><dt>{ko ? '하위 기관' : 'Parts'}</dt><dd><Chips items={kids.map(([id, v]) => ({ n: names.get(id), v }))} lang={lang} /></dd></> : null}
      </dl>
      <p className="or-source">{p.data.seed
        ? (ko ? '소유자가 정한 기관 목록(orgs.yaml)에 있는 기관입니다. 이름의 여러 표기를 규칙으로 모았습니다.' : 'An organisation from the owner’s list (orgs.yaml); its spellings are gathered by rule.')
        : (ko ? '다섯 건 이상의 문서에 같은 이름으로 나와 기관이 되었습니다. 유형과 소재지는 이름에서 규칙으로 읽었습니다.' : 'Named the same way in five or more documents; its type and country are read from the name by rule.')}</p>
    </Panel>
  );
  const anc = ancestry(n);
  return (
    <NodeView n={n} lang={lang} sp={await searchParams} base={`/${lang}/o/${slug}`} kicker={`${L.orgType[p.data.type] ?? ''}`}
      crumbs={[{ href: `/${lang}/m?layer=org`, text: L.nav.map }, { href: `/${lang}/m?tab=org#list`, text: L.nav.orgs }, ...anc.map((a) => ({ href: `/${lang}/o/${a.slug}`, text: label(a, lang) })), { text: label(n, lang) }]}
      top={top} />
  );
}
