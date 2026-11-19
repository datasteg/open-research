import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Crumbs, Item, Pager, Panel, Title } from '@/components/ui';
import { PeopleSearch } from '@/components/PeopleSearch';
import { affCounts, affGroups, countKind, lookup, meta, mostActive, node, nodesByLetter, nodesOfKind, peopleOfAff, topPeopleOfOrgs } from '@/lib/db';
import { num } from '@/lib/format';
import { label, t } from '@/lib/i18n';
import type { Lang } from '@/lib/types';

export const metadata = { title: 'People' };
const AZ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const GROUPS = 30;
const PER_GROUP = 8;
const PER = 120;

type SP = { l?: string; view?: string; g?: string; page?: string };

export default async function People({ params, searchParams }: { params: Promise<{ lang: string }>; searchParams: Promise<SP> }) {
  const lang = (await params).lang as Lang;
  const sp = await searchParams;
  const letter = (sp.l ?? '').toUpperCase();
  const L = t(lang);
  const ko = lang === 'ko';
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);
  const view = sp.view === 'aff' ? 'aff' : AZ.includes(letter) ? 'az' : 'top';
  const base = `/${lang}/a`;
  const ac = affCounts();
  const unknown = ac.people - ac.known;
  const tabs = (
    <ul className="or-letters or-letters--views">
      <li><Link href={base} aria-current={view === 'top' ? 'true' : undefined}>{ko ? '찾기' : 'Search'}</Link></li>
      <li><Link href={`${base}?l=A`} aria-current={view === 'az' ? 'true' : undefined}>A–Z</Link></li>
      <li><Link href={`${base}?view=aff`} aria-current={view === 'aff' ? 'true' : undefined}>{ko ? '최근 소속별' : 'By latest affiliation'}</Link></li>
    </ul>
  );
  const tiers = ac.tiers;
  const head = (crumbs?: { href?: string; text: string }[]) => (
    <>
      {crumbs ? <Crumbs items={crumbs} /> : null}
      <Title lang={lang} text={ko ? `저자와 연사 ${num(countKind('person'), lang)}명` : `${num(countKind('person'), lang)} authors and speakers`}
        info={<>
          <p>{ko ? '발행 기관의 저자 목록과 연설자 이름에서 가져왔습니다. 문서가 두 건 이상인 사람만 싣습니다. 성과 이름이 같으면 한 사람으로 묶고, 가운데 이니셜이 다르면 나눕니다. 확신이 없으면 두 사람으로 둡니다.' : 'From the publishers’ author lists and the names of speakers; people with two or more documents. The same surname and given name make one person; two different middle initials make two. When unsure, two people are kept apart.'}</p>
          <p>{ko
            ? `소속은 가장 최근 문서에 나온 것을 씁니다. 근거는 강한 것부터 셋입니다. 발행 기관이 밝힌 소속(연설은 연설한 기관, SUERF는 저자별 소속) ${num(tiers.stated ?? 0, lang)}명, 단독 저자 문서의 본문에서 찾은 소속 ${num(tiers.found ?? 0, lang)}명, 두 번 이상 쓴 기관 내부 연구 시리즈 ${num(tiers.series ?? 0, lang)}명입니다. 공저 논문에 여러 번 나오되 어느 공저자 한 명으로 설명되지 않는 소속은 더 강한 근거가 시작되기 전의 해만 채웁니다. 문서에 이름만 나온 기관은 쓰지 않습니다. ${num(unknown, lang)}명은 소속을 모릅니다.`
            : `The latest affiliation is the one on a person’s most recent document that has one. Evidence, strongest first: stated by the publisher (a speech’s institution, SUERF’s per-author affiliation) for ${num(tiers.stated ?? 0, lang)} people; found in the text of a single-author document for ${num(tiers.found ?? 0, lang)}; a staff series they wrote in at least twice for ${num(tiers.series ?? 0, lang)}. An affiliation listed on several co-authored papers that no single co-author explains fills only the years before the stronger evidence starts. Organisations a document merely names are never used. ${num(unknown, lang)} people have no known affiliation.`}</p>
          <p>{ko ? '최근 24개월은 발행일 기준으로, 가장 최근 수집일에서 거꾸로 집계합니다.' : '“Last 24 months” is by date published, counted back from the latest received date.'} {L.release} {meta().surface.release}.</p>
        </>} />
    </>
  );

  if (view === 'aff' && sp.g) {
    // one group: everyone whose latest affiliation is this organisation (or unknown)
    const isUnknown = sp.g === 'unknown';
    const org = isUnknown ? null : node('org', decodeURIComponent(sp.g));
    if (!isUnknown && !org) notFound();
    const { rows, total } = peopleOfAff(isUnknown ? { unknown: true } : { org: org!.id }, PER, (page - 1) * PER);
    const title = isUnknown ? (ko ? '소속을 모름' : 'Affiliation unknown') : label(org, lang);
    return (
      <div className="or-wrap or-page or-page--tight">
        {head([{ href: base, text: L.nav.people }, { href: `${base}?view=aff`, text: ko ? '최근 소속별' : 'By latest affiliation' }, { text: title }])}
        {tabs}
        <Panel title={title} meta={ko ? `${num(total, lang)}명` : `${num(total, lang)} people`}>
          {org ? <p className="or-source"><Link href={`/${lang}/o/${org.slug}`}>{ko ? '기관 페이지' : 'Organisation page'} →</Link></p> : null}
          <ul className="or-list">{rows.map((x) => <Item key={x.id} href={`${base}/${x.slug}`} text={x.en} n={x.n} lang={lang} />)}</ul>
          <Pager ranked base={base} page={page} total={total} per={PER} lang={lang} extra={`&view=aff&g=${encodeURIComponent(sp.g)}`} />
        </Panel>
      </div>
    );
  }

  if (view === 'aff') {
    const { rows, total } = affGroups(GROUPS, (page - 1) * GROUPS);
    const orgIds = rows.map((r) => r.org).filter((x): x is number => x != null);
    const orgs = lookup(orgIds);
    const tops = topPeopleOfOrgs(orgIds, PER_GROUP);
    const unk = page === 1 ? peopleOfAff({ unknown: true }, PER_GROUP) : null;
    return (
      <div className="or-wrap or-page or-page--tight">
        {head()}
        {tabs}
        <div className="or-affgrid">
          {rows.map((r) => {
            const o = r.org != null ? orgs.get(r.org) : undefined;
            if (!o) {
              // an affiliation the publisher states but the atlas has no organisation page for (yet)
              const ppl = peopleOfAff({ name: r.name ?? '' }, PER_GROUP).rows;
              return (
                <Panel key={`n:${r.name}`} title={r.name} meta={ko ? `${num(r.people, lang)}명` : `${num(r.people, lang)} people`}>
                  <ul className="or-list or-list--one">{ppl.map((x) => <Item key={x.id} href={`${base}/${x.slug}`} text={x.en} n={x.n} lang={lang} />)}</ul>
                </Panel>
              );
            }
            return (
              <Panel key={r.org} title={<Link href={`${base}?view=aff&g=${encodeURIComponent(o.slug)}`} className="or-plainlink">{label(o, lang)}</Link>} meta={ko ? `${num(r.people, lang)}명` : `${num(r.people, lang)} people`}>
                <ul className="or-list or-list--one">{(tops.get(r.org!) ?? []).map((x) => <Item key={x.id} href={`${base}/${x.slug}`} text={x.en} n={x.n} lang={lang} />)}</ul>
                {r.people > PER_GROUP ? <Link className="or-jel__all" href={`${base}?view=aff&g=${encodeURIComponent(o.slug)}`}>{ko ? `${num(r.people, lang)}명 모두` : `All ${num(r.people, lang)}`} →</Link> : null}
              </Panel>
            );
          })}
          {unk ? (
            <Panel title={<Link href={`${base}?view=aff&g=unknown`} className="or-plainlink">{ko ? '소속을 모름' : 'Affiliation unknown'}</Link>} meta={ko ? `${num(unknown, lang)}명` : `${num(unknown, lang)} people`} quiet>
              <ul className="or-list or-list--one">{unk.rows.map((x) => <Item key={x.id} href={`${base}/${x.slug}`} text={x.en} n={x.n} lang={lang} />)}</ul>
              <Link className="or-jel__all" href={`${base}?view=aff&g=unknown`}>{ko ? `${num(unknown, lang)}명 모두` : `All ${num(unknown, lang)}`} →</Link>
            </Panel>
          ) : null}
        </div>
        <Pager ranked base={base} page={page} total={total} per={GROUPS} lang={lang} extra="&view=aff" />
      </div>
    );
  }

  if (view === 'az') {
    const list = nodesByLetter('person', letter, 1500);
    return (
      <div className="or-wrap or-page or-page--tight">
        {head()}
        {tabs}
        <ul className="or-letters">
          {AZ.map((c) => <li key={c}><Link href={`${base}?l=${c}`} aria-current={letter === c ? 'true' : undefined}>{c}</Link></li>)}
        </ul>
        <Panel title={letter} meta={ko ? `${num(list.length, lang)}명` : `${num(list.length, lang)} people`} quiet>
          <ul className="or-list">{list.map((x) => <Item key={x.id} href={`${base}/${x.slug}`} text={x.en} n={x.n} lang={lang} />)}</ul>
        </Panel>
      </div>
    );
  }

  // Search first; with nothing typed, the canon (most documents) beside the current voices (the last 24 months)
  const top = nodesOfKind('person', 60);
  const active = mostActive(60);
  return (
    <div className="or-wrap or-page or-page--tight">
      {head()}
      <PeopleSearch lang={lang} v={meta().built} labels={ko ? {
        placeholder: '이름이나 소속 (예: shin, bank of korea)', loading: '색인을 불러오는 중…', none: '맞는 사람이 없습니다. 철자를 줄이거나 성만 입력해 보십시오.',
        total: '전체', recent: '최근 24개월', sort: '정렬', papers: '논문·보고서', speeches: '연설', matches: '{n}명', hint: '두 글자부터 찾습니다. 악센트는 무시합니다. 소속으로도 찾습니다.', years: '연도별',
      } : {
        placeholder: 'Name or affiliation (e.g. shin, bank of korea)', loading: 'Loading the index…', none: 'Nobody matches. Try fewer letters or the surname alone.',
        total: 'Total', recent: 'Last 24 months', sort: 'Sort', papers: 'papers, reports', speeches: 'speeches', matches: '{n} people', hint: 'Two letters or more; accents optional; names and affiliations both match.', years: 'Documents a year',
      }}>
        {tabs}
        <div className="or-split or-split--even">
          <Panel title={ko ? '문서가 많은 사람' : 'Most documents'} meta={ko ? '전체 기간' : 'all years'} quiet>
            <ul className="or-list or-list--one">{top.map((x) => <Item key={x.id} href={`${base}/${x.slug}`} text={x.en} n={x.n} lang={lang} />)}</ul>
          </Panel>
          <Panel title={ko ? '최근 24개월에 활발한 사람' : 'Most active, last 24 months'} meta={ko ? '최근 24개월 문서 수' : 'documents in the last 24 months'} quiet>
            <ul className="or-list or-list--one">{active.map((x) => <Item key={x.id} href={`${base}/${x.slug}`} text={x.en} n={x.n24} lang={lang} />)}</ul>
          </Panel>
        </div>
      </PeopleSearch>
    </div>
  );
}
