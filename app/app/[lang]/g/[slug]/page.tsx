import Link from 'next/link';
import type { Metadata } from 'next';
import { NodeView, loadNode } from '@/components/NodeView';
import { Panel, Spark } from '@/components/ui';
import { meta, nodeById } from '@/lib/db';
import { num } from '@/lib/format';
import { label, t } from '@/lib/i18n';
import type { Lang } from '@/lib/types';

type P = { params: Promise<{ lang: string; slug: string }>; searchParams: Promise<{ page?: string; kind?: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang, slug } = await params;
  const n = loadNode('grove', slug, lang as Lang);
  return { title: label(n, lang as Lang), alternates: { languages: { en: `/en/g/${slug}`, ko: `/ko/g/${slug}` } } };
}

export default async function GrovePage({ params, searchParams }: P) {
  const { lang: l, slug } = await params;
  const lang = l as Lang;
  const L = t(lang);
  const ko = lang === 'ko';
  const n = loadNode('grove', slug, lang);
  const topics = (n.page.children as [number, number][]).map(([id]) => nodeById(id)).filter((x) => x != null);
  const max = Math.max(1, ...topics.map((x) => x.n));
  const top = (
    <Panel title={ko ? `${topics.length}개 주제` : `${topics.length} topics`} meta={ko ? '문서 · 2006–2025 추이' : 'documents · 2006–2025'}>
      <ul className="or-tree">
        <li className="or-tree__head"><span>{L.topic}</span><span className="num">{L.docs}</span><span className="bar" /><span className="spark">2006–2025</span></li>
        {topics.map((x) => (
          <li key={x.id}>
            <div className="or-tree__row or-tree__row--focus">
              <span className="or-tree__label"><span className="or-tree__leafdot" /><Link href={`/${lang}/t/${x.slug}`}>{label(x, lang)}</Link></span>
              <span className="or-tree__n">{num(x.n, lang)}</span>
              <span className="or-tree__bar"><span style={{ width: `${(x.n / max) * 100}%` }} /></span>
              <span className="or-tree__spark"><Spark years={x.page.years} /></span>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
  return (
    <NodeView n={n} lang={lang} sp={await searchParams} base={`/${lang}/g/${slug}`} kicker={`${L.grove} · ${L.release} ${meta().surface.release}`}
      crumbs={[{ href: `/${lang}`, text: L.nav.grove }, { text: label(n, lang) }]}
      lede={ko ? n.page.data.desc_ko : n.page.data.desc_en} top={top} />
  );
}
