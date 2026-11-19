import { Panel, Title, YearBars } from '@/components/ui';
import { meta } from '@/lib/db';
import { day, num } from '@/lib/format';
import { t, UNIT } from '@/lib/i18n';
import type { Lang } from '@/lib/types';

export const metadata = { title: 'About' };

const KIND: Record<string, [string, string]> = { grove: ['groves', '숲'], topic: ['topics', '주제'], concept: ['concepts', '개념'], jel: ['JEL codes', 'JEL 코드'], org: ['organisations', '기관'], person: ['people', '사람'], place: ['places', '지역'] };

const STEPS: [string, string][] = [
  ['Public documents are collected daily from the publishers’ own sites: the BIS, FSB, IMF, World Bank, OECD, NBER, SUERF and about 105 central banks.', '발행 기관의 사이트(BIS, FSB, IMF, 세계은행, OECD, NBER, SUERF와 약 105개 중앙은행)에서 공개 문서를 매일 모읍니다.'],
  ['A language model reads each document and writes its profile card: a one-sentence summary, keywords, people, places and JEL codes.', '언어 모델이 문서를 읽고 프로필 카드를 작성합니다. 카드에는 한 문장 요약, 핵심어, 인물, 지역, JEL 코드가 들어갑니다.'],
  ['The names of people, organisations and places are normalised, and the spellings of one name are merged.', '사람과 기관, 지역의 이름을 정규화하고 같은 이름의 여러 표기를 하나로 합칩니다.'],
  ['Rules place each document on the topic tree and in the JEL index.', '규칙에 따라 각 문서를 주제의 나무와 JEL 분류에 배치합니다.'],
  ['New documents are added every night; the tree itself is re-released once a month.', '새 문서는 매일 밤 더해지고, 나무 자체는 한 달에 한 번 새로 냅니다.'],
];

const RULES: [string, string, string][] = [
  ['O1', 'Collect nothing here. The site reads a nightly export of the archive’s atlas; collecting documents, running the model and keeping the registries all happen upstream, never in this site.', '이 사이트는 아무것도 수집하지 않습니다. 아카이브가 매일 밤 내보내는 지도 자료만 읽습니다. 문서 수집, 모델 실행, 등록부 관리는 모두 그 앞 단계에서 합니다.'],
  ['O2', 'Metadata and links, never the text: no full text, no PDFs, no figures, no abstracts, no quoted sentences. The title links to the publisher’s page.', '메타데이터와 링크만 싣습니다. 본문, PDF, 그림, 초록, 인용 문장은 싣지 않습니다. 제목은 발행처 페이지로 연결됩니다.'],
  ['O3', 'Every model-written item carries the “model only” mark: summaries, inferred JEL codes, roles and model placements.', '모델이 쓴 항목에는 모두 "모델 작성" 표시를 붙입니다. 요약, 추정 JEL 코드, 역할, 배치가 이에 해당합니다.'],
  ['O4', 'Every count names its atlas release and build date; a page never mixes two releases.', '모든 숫자는 지도 릴리스와 빌드 날짜를 밝힙니다. 한 페이지에 두 릴리스를 섞지 않습니다.'],
  ['O5', 'Ids are stable and never reused. A merged or renamed node redirects permanently.', '식별자는 바뀌지 않고 다시 쓰지 않습니다. 합쳐지거나 이름이 바뀐 노드는 영구 이동합니다.'],
  ['O6', 'A placement says why: the concepts and JEL codes that put a document on a node.', '배치에는 근거가 붙습니다. 문서를 그 자리에 놓은 개념과 JEL 코드를 표시합니다.'],
  ['O7', 'People as published: name, affiliation and role in the document. No contact details, no photos, no rankings of people.', '사람은 문서에 나온 그대로만 싣습니다. 이름, 소속, 문서 안의 역할입니다. 연락처, 사진, 사람 순위는 없습니다.'],
  ['O8', 'No commercial data. A dataset a paper names appears only as a name.', '상업 데이터는 싣지 않습니다. 논문이 언급한 데이터셋은 이름으로만 나옵니다.'],
  ['O9', 'A document counts once per node. Papers, speeches, reports and policy notes are counted and filtered apart.', '문서는 노드마다 한 번만 집계합니다. 논문, 연설, 보고서, 정책 노트는 따로 집계하고 따로 거릅니다.'],
  ['O10', 'Stated and inferred JEL codes are never added together.', '발행처가 밝힌 JEL 코드와 추정 코드는 더하지 않습니다.'],
  ['O11', 'Korean labels are reviewed for the groves, topics and JEL letters; other labels stay in English.', '한국어 이름은 숲, 주제, JEL 대분류에만 붙였습니다. 나머지는 영어로 둡니다.'],
  ['O12', '“New” means received by the archive, not published.', '"새 자료"는 아카이브가 수집한 날 기준입니다. 발행일 기준이 아닙니다.'],
];

export default async function About({ params }: { params: Promise<{ lang: string }> }) {
  const lang = (await params).lang as Lang;
  const L = t(lang);
  const ko = lang === 'ko';
  const m = meta();
  const units = Object.entries(m.units).sort((a, b) => b[1] - a[1]);
  return (
    <div className="or-wrap or-page or-page--tight">
      <Title lang={lang} text={ko ? '지도 제작 방법' : 'How the atlas is built'} />
      <p className="or-desc">{ko ? '문서마다 만든 프로필 카드를 하나의 나무로 엮었습니다. 카드는 언어 모델이 쓰고, 나무는 규칙으로 엮습니다.' : 'One tree woven from a profile card per document. A language model writes the cards; rules build the tree.'} {L.release} {m.surface.release}.</p>
      <section className="or-section" aria-labelledby="how">
        <h2 id="how">{ko ? '만드는 과정' : 'How it is made'}</h2>
        <ol className="or-steps">
          {STEPS.map(([en, k], i) => <li key={i}><span className="or-steps__n">{i + 1}</span><span>{ko ? k : en}</span></li>)}
        </ol>
      </section>
      <div className="or-split">
        <div className="or-prose">
          <h2>{ko ? '두 개의 색인' : 'Two indexes'}</h2>
          <p>{ko
            ? `지금 ${num(m.docs, lang)}건에 프로필 카드가 있습니다. 두 개의 색인이 같은 문서에 도달합니다. 읽는 사람을 위한 숲(11개 숲, 61개 주제, 개념)과 경제학자를 위한 JEL 분류입니다. 개념은 정규화한 핵심어이며, 20건 이상의 문서에 나오면 페이지가 됩니다. 문서 하나는 주제 세 개까지 들어갑니다.`
            : `${num(m.docs, lang)} documents have a profile card. Two indexes reach the same documents: the grove for readers (11 groves, 61 topics, concepts) and the JEL classification for economists. Concepts are normalised keywords; one becomes a page from 20 documents. A document can sit in up to three topics.`}</p>
          <h2>{ko ? '표시' : 'Marks'}</h2>
          <p><span className="or-tag or-mark--intext">{L.marks.intext}</span> {ko ? '핵심어가 든 문장을 본문에서 찾았습니다.' : 'a sentence carrying the keyword was found in the text.'} <span className="or-tag or-mark--found">{L.marks.found}</span> {ko ? '이름이나 숫자가 본문이나 메타데이터에 있습니다.' : 'the name or number occurs in the text or metadata.'} <span className="or-tag or-mark--model">{L.marks.model}</span> {ko ? '모델이 작성했고 문자열로 확인할 수 없습니다. 인용하지 않습니다.' : 'written by the model and not checkable by string; never quote it.'}</p>
          <h2 id="rules">{ko ? '규칙 O1–O12' : 'Rules O1–O12'}</h2>
          <ol>{RULES.map(([id, e, k]) => <li key={id}><b className="or-mono">{id}</b> {ko ? k : e}</li>)}</ol>
          <h2 id="corrections">{ko ? '정정과 삭제' : 'Corrections and removals'}</h2>
          <p>{ko
            ? '이름이 잘못 묶였거나 문서가 잘못 놓였다면, 또는 사람 페이지를 내려 달라면 datasteg에 알려 주세요. 다음 릴리스에서 고칩니다. 사람 페이지 삭제 요청은 바로 처리합니다.'
            : 'If two people are merged wrongly, a document is misplaced, or you want a person page taken down, tell datasteg. Fixes land in the next release; removal requests are handled at once.'}</p>
        </div>
        <div>
          <Panel title={ko ? '출처와 문서 수' : 'Sources and documents'} quiet>
            <div className="or-scroll"><table className="or-table"><tbody>
              {units.map(([u, n]) => <tr key={u}><td>{UNIT[u] ?? u}</td><td className="num">{num(n, lang)}</td></tr>)}
            </tbody></table></div>
            <p className="or-source">{ko ? '각 문서는 발행 기관의 페이지로 연결됩니다. 저작권은 발행 기관과 저자에게 있습니다.' : 'Every document links to its publisher’s page; copyright stays with the publishers and authors.'}</p>
          </Panel>
          <Panel title={L.perYear} meta={ko ? '발행 연도 기준' : 'by year published'} quiet>
            <YearBars years={m.years} lang={lang} caption={ko ? '네 묶음의 발행 기관별로 쌓았습니다. 2026년은 수집 중입니다.' : 'Stacked by publisher family. 2026 is still being collected.'} />
          </Panel>
          <Panel title={ko ? '이 빌드' : 'This build'} quiet>
            <dl className="or-kv">
              <dt>{ko ? '지도 릴리스' : 'Atlas release'}</dt><dd className="or-mono">{m.surface.release} ({m.surface.release_accepted ? day(m.surface.release_accepted.slice(0, 10), lang) : '–'})</dd>
              <dt>{ko ? '빌드' : 'Built'}</dt><dd className="or-mono">{day(m.built.slice(0, 10), lang)}</dd>
              <dt>{ko ? '항목' : 'Pages'}</dt><dd className="or-mono">{Object.entries(m.nodes).map(([k, v]) => `${KIND[k]?.[ko ? 1 : 0] ?? k} ${num(v, lang)}`).join(' · ')}</dd>
              <dt>{ko ? '미배치' : 'Unplaced'}</dt><dd className="or-mono">{num(m.unplaced, lang)}</dd>
            </dl>
          </Panel>
        </div>
      </div>
    </div>
  );
}
