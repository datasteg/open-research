import Link from 'next/link';
import { Item, Title } from '@/components/ui';
import { meta, nodesOfKind } from '@/lib/db';
import { num } from '@/lib/format';
import { label, t } from '@/lib/i18n';
import type { Lang } from '@/lib/types';

export const metadata = { title: 'JEL' };

// Below 680px every letter starts closed (an A–Z accordion); wider screens show them all open, in balanced columns.
// Runs as the list is parsed, before the first paint, so a phone never flashes the open list.
const CLOSE_ON_PHONE = `(function(){try{if(window.matchMedia('(max-width: 679px)').matches){document.querySelectorAll('#jel details').forEach(function(d){d.open=false})}}catch(e){}})()`;

export default async function Jel({ params }: { params: Promise<{ lang: string }> }) {
  const lang = (await params).lang as Lang;
  const L = t(lang);
  const ko = lang === 'ko';
  const all = nodesOfKind('jel', 2000);
  const letters = all.filter((x) => x.slug.length === 1).sort((a, b) => a.slug.localeCompare(b.slug));
  const two = all.filter((x) => x.slug.length === 2);
  return (
    <div className="or-wrap or-page or-page--tight">
      <Title lang={lang} text={ko ? 'JEL 분류로 찾기' : 'Browse by JEL code'}
        info={<>
          <p>{ko ? '미국경제학회의 JEL 분류입니다. 발행 기관이 밝힌 코드와 모델이 추정한 코드(신뢰도 0.5 이상)를 따로 집계합니다. 두 숫자는 더하지 않습니다. 목록의 숫자는 그 코드가 붙은 문서 수입니다.' : 'The American Economic Association’s JEL classification. Codes stated by the publisher and codes inferred by the model (confidence 0.5 or more) are counted apart and never added; the number in the list is the documents carrying the code either way.'}</p>
          <p className="or-muted">{L.nav.jel} · {L.release} {meta().surface.release}</p>
        </>} />
      <div className="or-jel" id="jel">
        {letters.map((x) => {
          const subs = two.filter((y) => y.slug[0] === x.slug).sort((a, b) => a.slug.localeCompare(b.slug));
          return (
            <section key={x.id} className="or-panel or-jel__panel">
              <details open suppressHydrationWarning>
                <summary className="or-jel__head">
                  <span className="or-jel__code">{x.slug}</span>
                  <span className="or-jel__name">{label(x, lang)}</span>
                  <span className="or-jel__n">{num(x.n, lang)}</span>
                </summary>
                <ul className="or-list or-list--one">
                  {subs.map((y) => <Item key={y.id} href={`/${lang}/jel/${y.slug}`} code={y.slug} text={y.en} n={y.n} lang={lang} en wrap />)}
                </ul>
                <Link className="or-jel__all" href={`/${lang}/jel/${x.slug}`}>{ko ? `${x.slug} 전체 보기` : `All of ${x.slug}`} →</Link>
              </details>
            </section>
          );
        })}
      </div>
      <script dangerouslySetInnerHTML={{ __html: CLOSE_ON_PHONE }} />
    </div>
  );
}
