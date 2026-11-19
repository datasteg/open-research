import type { Metadata } from 'next';
import { NodeView, loadNode } from '@/components/NodeView';
import { Panel } from '@/components/ui';
import { label, t } from '@/lib/i18n';
import family from '@/lib/family.json';
import type { Lang } from '@/lib/types';

type P = { params: Promise<{ lang: string; code: string }>; searchParams: Promise<{ page?: string; kind?: string }> };
type Site = { id: string; host: string; name: string; links: Record<string, string> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang, code } = await params;
  return { title: label(loadNode('place', code, lang as Lang), lang as Lang) };
}

export default async function PlacePage({ params, searchParams }: P) {
  const { lang: l, code } = await params;
  const lang = l as Lang;
  const L = t(lang);
  const ko = lang === 'ko';
  const n = loadNode('place', code, lang);
  const name = label(n, lang);
  const sites = ((family as unknown as { sites: Site[] }).sites).filter((s) => s.id !== 'open-research' && s.links.economy && n.slug.length === 3);
  const side = sites.length ? (
    <Panel title={ko ? '다른 datasteg 사이트에서' : 'On the other datasteg sites'} quiet>
      <ul className="or-list" style={{ columns: 1 }}>
        {sites.map((s) => <li key={s.id}><a href={`${s.host}${s.links.economy.replace('{lang}', lang).replace('{iso3}', n.slug)}`}>{ko ? `${s.name}에서 ${name} 보기` : `${name} in ${s.name}`}</a></li>)}
      </ul>
    </Panel>
  ) : null;
  return (
    <NodeView n={n} lang={lang} sp={await searchParams} base={`/${lang}/c/${code}`} kicker={`${L.nav.places} · ${n.slug}`}
      crumbs={[{ href: `/${lang}/m?layer=place`, text: L.nav.map }, { href: `/${lang}/m?tab=place#list`, text: L.nav.places }, { text: name, code: n.slug }]}
      lede={ko ? `${name} 관련 문서입니다. 모델이 읽은 지명을 국가 코드로 바꿨습니다.` : `Documents that study ${name}. Place names read by the model, mapped to codes.`} side={side} />
  );
}
