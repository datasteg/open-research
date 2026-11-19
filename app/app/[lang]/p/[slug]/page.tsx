import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Crumbs, FamTag, Head, Panel, href } from '@/components/ui';
import { card, lookup, meta } from '@/lib/db';
import { day, num } from '@/lib/format';
import { label, t, UNIT } from '@/lib/i18n';
import type { Card, Lang, NodeLite } from '@/lib/types';

type P = { params: Promise<{ lang: string; slug: string }> };

function load(slug: string): Card {
  const c = card(decodeURIComponent(slug));
  if (!c) notFound();
  return c;
}

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { slug } = await params;
  return { title: load(slug).title };
}

const SAL = ['core', 'major', 'minor'];

export default async function PaperPage({ params }: P) {
  const { lang: l, slug } = await params;
  const lang = l as Lang;
  const L = t(lang);
  const ko = lang === 'ko';
  const c = load(slug);
  const names = lookup([...c.topics.map((x) => x[0]), ...c.jel_stated, ...c.jel_inferred.map((x) => x[0]), ...c.authors.map((a) => a.p), c.speaker?.p,
    ...c.orgs.map((o) => o[0]), c.publisher, ...c.places, ...c.keywords.map((k) => k.c)]);
  const N = (id: number | null | undefined) => (id ? names.get(id) : undefined);
  const link = (n: NodeLite | undefined, text?: string) => (n ? <Link href={href(lang, n)}>{text ?? label(n, lang)}</Link> : null);
  const grove = (tid: number) => meta().groves.find((g) => g.topics.some((x) => x[0] === tid));
  const located = c.keywords.filter((k) => k.located).length;
  // A speech lists its speaker as the author too: one name, once (the speaker role wins).
  const people = [...(c.speaker ? [{ ...c.speaker, role: 'speaker' }] : []), ...c.authors.filter((a) => a.name !== c.speaker?.name).map((a) => ({ ...a, role: 'author' }))];
  const stated = new Set(c.jel_stated);
  const mark = (k: 'intext' | 'found' | 'model') => <span className={`or-tag or-mark--${k}`}>{L.marks[k]}</span>;
  const roleKo: Record<string, string> = { author: '저자', speaker: '연사', affiliation: '소속', publisher: '발행', mentioned: '언급', other: '기타' };
  return (
    <div className="or-wrap or-page">
      <Head
        crumbs={<Crumbs items={[{ href: `/${lang}`, text: L.nav.grove }, ...(c.topics[0] && N(c.topics[0][0]) ? [{ href: href(lang, N(c.topics[0][0])!), text: label(N(c.topics[0][0]), lang) }] : []), { text: `${UNIT[c.unit] ?? c.unit}` }]} />}
        kicker={<><FamTag f={c.family} lang={lang} /> <span className="or-tag or-tag--neutral">{L.kind[c.kind] ?? c.kind}</span> · {UNIT[c.unit] ?? c.unit}{c.number && !['cb_reshub', 'bis_cbspeeches'].includes(c.unit) ? ` ${c.number.replace(/^(publ|publications|review|events)_/, '')}` : ''} · {day(c.date, lang)}</>}
        title={<span lang="en">{c.title}</span>}
        lede={<>{people.map((p, i) => <span key={i}>{i ? ', ' : ''}{p.p && N(p.p) ? link(N(p.p), p.name) : p.name}</span>)}{c.publisher && N(c.publisher) ? <> · {link(N(c.publisher))}</> : c.institution ? ` · ${c.institution}` : ''}</>}
        right={<span style={{ display: 'flex', gap: 8 }}>{c.url ? <a className="or-btn or-btn--primary" href={c.url} rel="noopener">{L.open} ↗</a> : null}{c.pdf_url ? <a className="or-btn" href={c.pdf_url} rel="noopener">{L.pdf} ↗</a> : null}</span>}
      />
      <div className="or-split">
        <div>
          <Panel title={L.where} fam={c.family}>
            <dl className="or-kv">
              <dt>{L.topics}</dt>
              <dd>{c.topics.length ? c.topics.map(([id, s], i) => { const g = grove(id); return <div key={id}>{g ? <span className="or-muted">{ko ? g.ko : g.en} › </span> : null}{link(N(id))} <span className="or-code">{s}</span>{i === 0 ? <span className="or-muted"> · {ko ? '주된 주제' : 'primary'}</span> : null}</div>; }) : <span className="or-muted">{ko ? '아직 어느 주제에도 속하지 않았습니다' : 'not placed in a topic yet'}</span>}</dd>
              <dt>{L.jel}</dt>
              <dd>
                {c.jel_stated.length ? <div>{c.jel_stated.map((j) => <span key={j} style={{ marginRight: 10 }}>{link(N(j), N(j)?.slug)}</span>)} <span className="or-muted">· {L.stated}</span></div> : null}
                {c.jel_inferred.length ? <div>{c.jel_inferred.map(([j, conf]) => <span key={j} style={{ marginRight: 10 }}>{link(N(j), N(j)?.slug)}<span className="or-code"> {conf?.toFixed(2)}</span></span>)} {mark('model')}{c.jel_stated.length && c.jel_agree != null ? <span className="or-muted"> · {ko ? `${c.jel_inferred.filter(([j]) => stated.has(j)).length}개 일치` : `${c.jel_agree} agree with the stated codes`}</span> : null}</div> : null}
              </dd>
            </dl>
            <p className="or-source">{ko ? '주제 옆 숫자는 배치 점수입니다. 배치 점수는 핵심어의 주제 소속과 JEL 기준 코드로 계산한 규칙 점수입니다.' : 'The number beside a topic is its placement score (a rule score from the keywords’ topics and the JEL anchors).'}</p>
          </Panel>
          {c.summary ? (
            <Panel title={<>{L.summary} {mark('model')}</>} quiet>
              <p className="or-summary" lang="en">{c.summary}</p>
              <p className="or-source">{ko ? '언어 모델이 본문을 읽고 쓴 한 문장입니다. 인용하지 말고 원문을 확인합니다.' : 'One sentence written by a language model from the text. Do not quote it; check the document.'}</p>
            </Panel>
          ) : null}
          <Panel title={L.keywords} meta={ko ? `${c.keywords.length}개 중 ${located}개 본문 확인` : `${located} of ${c.keywords.length} located in the text`}>
            {SAL.map((s) => {
              const ks = c.keywords.filter((k) => k.sal === s);
              return ks.length ? (
                <div key={s} className="or-kw">
                  <span className="or-kw__sal">{L.sal[s]}</span>
                  <span className="or-kw__list" lang="en">
                    {ks.map((k, i) => (
                      <span key={i} className={`or-kw__item${k.located ? '' : ' or-kw__item--miss'}`}>
                        {k.c && N(k.c) ? link(N(k.c), k.label) : k.label}
                        {k.n ? <span className="or-mono">×{k.n}</span> : null}
                        {k.kind !== 'topic' ? <span className="or-code">{k.kind}</span> : null}
                        {!k.located ? <span className="or-code">({L.marks.notLocated})</span> : null}
                      </span>
                    ))}
                  </span>
                </div>
              ) : null;
            })}
            <p className="or-source">{ko ? '×n은 본문에 나온 횟수입니다. 연결된 핵심어는 지도의 개념 페이지로 갑니다. 문장 없음은 본문에서 그 핵심어가 든 문장을 찾지 못했다는 뜻입니다.' : '×n is how often it occurs in the text. Linked keywords open their concept in the atlas. “No sentence” means no sentence carrying it was found in the text.'}</p>
          </Panel>
        </div>
        <div>
          <Panel title={ko ? '사람과 기관' : 'People and organisations'} quiet>
            <dl className="or-kv">
              {people.length ? <><dt>{ko ? '저자·연사' : 'Authors, speaker'}</dt><dd>{people.map((p, i) => <div key={i}>{p.p && N(p.p) ? link(N(p.p), p.name) : p.name} <span className="or-muted">· {ko ? roleKo[p.role] : p.role}</span> {mark('found')}</div>)}</dd></> : null}
              {c.org_names.length ? <><dt>{L.orgs}</dt><dd>{c.org_names.map(([name, role, found], i) => { const o = c.orgs.find((x) => x[1] === role && N(x[0]) && (N(x[0])!.en === name)); return <div key={i}>{o ? link(N(o[0])) : name} <span className="or-muted">· {ko ? roleKo[role] ?? role : role}</span> {found ? mark('found') : mark('model')}</div>; })}</dd></> : null}
              {c.people.length ? <><dt>{ko ? '언급된 사람' : 'Also named'}</dt><dd>{c.people.map((p, i) => <div key={i}>{p.name} <span className="or-muted">· {ko ? roleKo[p.role] ?? p.role : p.role}</span> {p.found ? mark('found') : mark('model')}</div>)}</dd></> : null}
            </dl>
          </Panel>
          <Panel title={ko ? '지역과 기간' : 'Places and period'} quiet>
            <dl className="or-kv">
              {c.places.length ? <><dt>{L.places}</dt><dd>{c.places.map((p) => <span key={p} style={{ marginRight: 10 }}>{link(N(p))}</span>)}</dd></> : null}
              {c.period?.from ? <><dt>{ko ? '다룬 기간' : 'Period studied'}</dt><dd className="or-mono">{c.period.from}{c.period.to && c.period.to !== c.period.from ? `–${c.period.to}` : ''}</dd></> : null}
            </dl>
          </Panel>
          <Panel title={L.provenance} quiet>
            <p className="or-prov">
              {ko ? `언어 모델이 쓴 프로필 카드 · 읽은 본문: ${c.prov.text_source === 'text layer' ? 'PDF 텍스트' : c.prov.text_source ?? '–'}` : `Profile card written by a language model · text read from: ${c.prov.text_source === 'text layer' ? 'the PDF text layer' : c.prov.text_source ?? '–'}`}<br />
              {L.published} {day(c.date, lang)} · {L.received} {day(c.received, lang)} · {L.release} {meta().surface.release}
            </p>
            <p className="or-source">{ko ? <>표시: {mark('intext')} 본문에서 문장을 찾음 · {mark('found')} 이름이나 숫자가 본문·메타데이터에 있음 · {mark('model')} 모델이 씀, 인용 금지.</> : <>Marks: {mark('intext')} a sentence found in the text · {mark('found')} the name or number occurs in the text or metadata · {mark('model')} written by the model, never quote it.</>}</p>
          </Panel>
        </div>
      </div>
      <p className="or-source or-mono">{c.slug}</p>
    </div>
  );
}
