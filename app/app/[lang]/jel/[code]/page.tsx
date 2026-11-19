import Link from 'next/link';
import type { Metadata } from 'next';
import { NodeView, ancestry, loadNode } from '@/components/NodeView';
import { Panel } from '@/components/ui';
import { lookup } from '@/lib/db';
import { num } from '@/lib/format';
import { label, t } from '@/lib/i18n';
import type { Lang } from '@/lib/types';

type P = { params: Promise<{ lang: string; code: string }>; searchParams: Promise<{ page?: string; kind?: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang, code } = await params;
  const n = loadNode('jel', code, lang as Lang);
  return { title: `${n.slug} ${label(n, lang as Lang)}` };
}

export default async function JelCode({ params, searchParams }: P) {
  const { lang: l, code } = await params;
  const lang = l as Lang;
  const L = t(lang);
  const ko = lang === 'ko';
  const n = loadNode('jel', code, lang);
  const p = n.page;
  const kids = p.children as [number, number, number][];
  const names = lookup(kids.map((x) => x[0]));
  const top = (
    <Panel title={ko ? '분류 안의 숫자' : 'Counts in this code'}>
      <dl className="or-kv">
        <dt>{L.stated}</dt><dd className="or-mono">{num(p.stated_n ?? 0, lang)}</dd>
        <dt>{L.inferred}</dt><dd className="or-mono">{num(p.inferred_n ?? 0, lang)} <span className="or-tag or-mark--model">{L.marks.model}</span></dd>
      </dl>
      {kids.length ? (
        <div className="or-scroll"><table className="or-table">
          <thead><tr><th>{ko ? '코드' : 'Code'}</th><th>{ko ? '이름' : 'Name'}</th><th className="num">{L.statedShort}</th><th className="num">{L.inferredShort}</th></tr></thead>
          <tbody>{kids.map(([id, s, i]) => { const x = names.get(id); return x ? <tr key={id}><td className="or-mono"><Link href={`/${lang}/jel/${x.slug}`}>{x.slug}</Link></td><td lang="en">{x.en}</td><td className="num">{num(s, lang)}</td><td className="num">{num(i, lang)}</td></tr> : null; })}</tbody>
        </table></div>
      ) : null}
      <p className="or-source">{ko ? '발행 기관이 코드를 밝힌 문서는 19,050건뿐입니다. 추정 코드는 그 가운데 57%만 발행처 코드와 일치했으니 길잡이로만 읽습니다. 아래 목록에는 두 종류가 모두 있습니다.' : 'Only 19,050 documents state codes; where they do, 57% of their codes are also inferred, so read inferred codes as a guide. The list below holds both.'}</p>
    </Panel>
  );
  const anc = ancestry(n);
  return (
    <NodeView n={n} lang={lang} sp={await searchParams} base={`/${lang}/jel/${code}`} kicker={`JEL · ${n.slug}`}
      crumbs={[{ href: `/${lang}/jel`, text: 'JEL' }, ...anc.map((a) => ({ href: `/${lang}/jel/${a.slug}`, text: `${a.slug} ${label(a, lang)}` })), { text: n.slug }]}
      top={top} />
  );
}
