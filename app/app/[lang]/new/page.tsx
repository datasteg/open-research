import Link from 'next/link';
import { Title } from '@/components/ui';
import { NewBoard } from '@/components/NewBoard';
import { countReceivedSince, meta } from '@/lib/db';
import { newPayload, parseNew } from '@/lib/newboard';
import { day, num } from '@/lib/format';
import { t, UNIT } from '@/lib/i18n';
import type { Lang } from '@/lib/types';

export const metadata = { title: 'New' };

/** New: a chart of documents a day over a compact list, both filtered together (components/NewBoard.tsx). */
export default async function New({ params, searchParams }: { params: Promise<{ lang: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const lang = (await params).lang as Lang;
  const L = t(lang);
  const ko = lang === 'ko';
  const m = meta();
  const since = m.latest_received ? new Date(Date.parse(m.latest_received) - 29 * 864e5).toISOString().slice(0, 10) : '0000';
  const month = countReceivedSince(since);
  const init = newPayload(lang, parseNew(await searchParams));
  const releases = m.changes.filter((c) => c.kind === 'release');
  return (
    <div className="or-wrap or-page or-page--tight">
      <Title lang={lang} text={ko ? `최근 30일 수집 ${num(month, lang)}건` : `${num(month, lang)} received in 30 days`}
        info={<>
          <p>{ko
            ? '수집일은 아카이브가 문서를 받은 날, 발행일은 발행 기관이 낸 날입니다. 오래된 문서를 한꺼번에 모으면(백필) 수집일 막대가 치솟습니다. 발행일보다 90일 넘게 늦게 수집한 문서는 백필로 보고 기본값으로 숨깁니다.'
            : 'Received is the day the archive collected a document; published is the day its publisher put it out. Collecting old documents in bulk (backfill) makes the received bars spike, so documents received more than 90 days after publication count as backfill and are hidden by default.'}</p>
          <p>{ko
            ? '같은 번호의 번역본(세계은행 워킹페이퍼의 영어·프랑스어·스페인어·포르투갈어판 등)은 한 줄로 묶고 언어를 표시합니다. 새 문서는 매일 밤 지금의 지도에 놓이고, 지도 자체는 한 달에 한 번 바뀝니다.'
            : 'Language versions of one paper (a World Bank working paper in English, French, Spanish and Portuguese, say) are one row with language badges. New documents are placed on the current tree every night; the tree itself changes once a month.'}</p>
          <p className="or-muted">{ko ? '최근 수집' : 'Latest received'} {day(m.latest_received, lang)}</p>
        </>} />
      <NewBoard lang={lang} init={init} labels={{
        fam: L.fam, famShort: L.famShort, kinds: L.kinds, kind: L.kind, units: UNIT,
        received: ko ? '수집일' : 'Date received', published: ko ? '발행일' : 'Date published', pubShort: ko ? '발행' : 'published', recShort: ko ? '수집' : 'received', ranges: ko ? ['30일', '90일', '1년'] : ['30 days', '90 days', '1 year'],
        allSources: ko ? '모든 출처' : 'All sources', allKinds: ko ? '모든 유형' : 'All types', hideBackfill: ko ? '백필 숨기기' : 'Hide backfill',
        backfill: ko ? '백필' : 'backfill', backfillHint: ko ? '발행일보다 90일 넘게 늦게 수집한 문서' : 'Received more than 90 days after it was published',
        more: ko ? '더 보기' : 'Load more', none: ko ? '이 조건에 맞는 문서가 없습니다.' : 'No documents match these filters.', day: ko ? '날짜' : 'Day',
        clear: ko ? '모든 날짜' : 'all days', total: ko ? '합계' : 'Total', chartLabel: ko ? '하루 문서 수' : 'Documents a day', by: ko ? '날짜 기준' : 'Date',
        famLabel: ko ? '발행 기관 묶음' : 'Publisher family', loading: ko ? '불러오는 중…' : 'Loading…', hidden: ko ? '{n}건 숨김' : '{n} hidden',
      }} />
      <p className="or-slimfoot">
        {ko ? '지도 릴리스' : 'Atlas releases'}: {releases.length ? releases.map((c) => `${c.release} (${day(c.at.slice(0, 10), lang)})`).join(' · ') : m.surface.release}
        {' · '}<Link href="/feed">Atom feed</Link> {ko ? '(최근 수집 50건)' : '(the latest 50 received)'}
      </p>
    </div>
  );
}
