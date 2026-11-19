import Link from 'next/link';
import type { Metadata } from 'next';
import { NodeView, loadNode } from '@/components/NodeView';
import { Chips, Panel, PaperList } from '@/components/ui';
import { docsOf, lookup, meta } from '@/lib/db';
import { num } from '@/lib/format';
import { label, t } from '@/lib/i18n';
import type { Lang, NodeLite } from '@/lib/types';

type P = { params: Promise<{ lang: string; slug: string }>; searchParams: Promise<{ page?: string; kind?: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang, slug } = await params;
  const n = loadNode('topic', slug, lang as Lang);
  return { title: label(n, lang as Lang), description: (lang === 'ko' ? n.page.data.desc_ko : n.page.data.desc_en) ?? undefined };
}

export default async function TopicPage({ params, searchParams }: P) {
  const { lang: l, slug } = await params;
  const lang = l as Lang;
  const L = t(lang);
  const ko = lang === 'ko';
  const n = loadNode('topic', slug, lang);
  const p = n.page;
  const grove = meta().groves.find((g) => g.id === p.grove);
  const concepts = (p.concepts ?? []).filter((c) => c[3] === 'topic' || c[3] === 'instrument');
  const inTopic = new Set(concepts.map((c) => c[0]));
  // the branch: concepts whose broader concept is in the same topic hang under it
  const kids = new Map<number, typeof concepts>();
  const roots: typeof concepts = [];
  for (const c of concepts) {
    if (c[4] != null && inTopic.has(c[4])) kids.set(c[4], [...(kids.get(c[4]) ?? []), c]);
    else roots.push(c);
  }
  const relC = p.rel.concept ?? [];
  const names = lookup([...concepts.map((c) => c[0]), ...relC.map((x) => x[0]), ...(p.cotopics ?? []).map((x) => x[0])]);
  const methods = relC.filter(([id]) => names.get(id)?.sub === 'method').slice(0, 10);
  const datas = relC.filter(([id]) => names.get(id)?.sub === 'data').slice(0, 8);
  const max = Math.max(1, ...concepts.map((c) => c[1]));
  const row = (c: (typeof concepts)[number], child = false) => {
    const nn = names.get(c[0]) as NodeLite | undefined;
    if (!nn) return null;
    const sub = kids.get(c[0]) ?? [];
    return (
      <li key={c[0]}>
        <div className={`or-tree__row${child ? '' : ' or-tree__row--focus'}`}>
          <span className="or-tree__label"><span className="or-tree__leafdot" /><Link href={`/${lang}/k/${nn.slug}`} lang="en">{nn.en}</Link></span>
          <span className="or-tree__n">{num(c[1], lang)}</span>
          <span className="or-tree__bar"><span style={{ width: `${(c[1] / max) * 100}%` }} /></span>
          <span className="or-tree__spark or-code">{c[2] < 1 ? `${Math.round(c[2] * 100)}%` : ko ? '씨앗' : 'seed'}</span>
        </div>
        {sub.length ? <ul>{sub.slice(0, 12).map((s) => row(s, true))}</ul> : null}
      </li>
    );
  };
  const speeches = docsOf(n.id, { kind: 'speech', limit: 3, primary: true }).rows;
  const top = (
    <>
      <Panel title={L.concepts} meta={ko ? `${concepts.length}개 · 문서 수는 전체 자료 기준` : `${concepts.length} · counts in the archive`}>
        <ul className="or-tree">
          <li className="or-tree__head"><span>{L.concept}</span><span className="num">{L.docs}</span><span className="bar" /><span className="spark">{ko ? '소속 근거' : 'membership'}</span></li>
          {roots.slice(0, 60).map((c) => row(c))}
        </ul>
        <p className="or-source">{ko
          ? '개념은 핵심어를 정규화해 묶은 것입니다. 씨앗 개념은 소유자가 정했고, 나머지는 그 개념이 나온 문서들이 이 주제에 표를 준 비율로 배치했습니다(규칙 배치, 모델 판정 아님).'
          : 'Concepts are normalised keywords. Seed concepts are set by the owner; the others sit here by the share of their documents whose top topic is this one (a rule placement, not a model’s judgement).'}</p>
      </Panel>
      {speeches.length ? (
        <Panel title={L.readFirst} meta={ko ? '중앙은행 연설' : 'central bankers’ speeches'} fam="cb">
          <PaperList rows={speeches} lang={lang} />
        </Panel>
      ) : null}
    </>
  );
  const side = (
    <>
      {(p.cotopics ?? []).length ? (
        <Panel title={L.related} meta={L.lift}>
          <ol className="or-cotopics">
            {(p.cotopics ?? []).map(([id, k, lift]) => { const x = lookup([id]).get(id); return x ? <li key={id}><Link href={`/${lang}/t/${x.slug}`}>{label(x, lang)}</Link><span className="n">{num(k, lang)}</span><span className="lift">{lift}×</span></li> : null; })}
          </ol>
          <p className="or-source">{ko ? '배율은 이 주제 문서 중 해당 주제에 속하는 문서의 비율을 전체 문서 중 해당 주제의 비율로 나눈 값입니다.' : 'Lift = the share of this topic’s documents that also sit in that topic ÷ that topic’s share of all documents.'}</p>
        </Panel>
      ) : null}
      {methods.length ? <Panel title={L.methods} meta={L.inTopic} quiet><Chips items={methods.map(([id, v]) => ({ n: names.get(id), v }))} lang={lang} /></Panel> : null}
      {datas.length ? <Panel title={L.data} meta={L.inTopic} quiet><Chips items={datas.map(([id, v]) => ({ n: names.get(id), v }))} lang={lang} /></Panel> : null}
      <Panel title={L.jel} quiet><p className="or-code">{(p.data.jel as string[]).map((c) => <Link key={c} href={`/${lang}/jel/${c}`} style={{ marginRight: 10 }}>{c}</Link>)}</p>
        <p className="or-source">{ko ? '이 주제를 붙잡는 JEL 기준 코드.' : 'The JEL codes that anchor this topic.'}</p></Panel>
    </>
  );
  return (
    <NodeView n={n} lang={lang} sp={await searchParams} base={`/${lang}/t/${slug}`} kicker={`${L.topic} · ${L.release} ${meta().surface.release}`}
      crumbs={[{ href: `/${lang}`, text: L.nav.grove }, ...(grove ? [{ href: `/${lang}/g/${grove.slug}`, text: ko ? grove.ko : grove.en }] : []), { text: label(n, lang), code: (p.data.jel as string[]).join(' ') }]}
      lede={ko ? p.data.desc_ko : p.data.desc_en} top={top} side={side} />
  );
}
