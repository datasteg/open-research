import Link from 'next/link';
import { Pager, Panel, Title } from '@/components/ui';
import { TileMap, type Metric, type TileT } from '@/components/TileMap';
import { lookup, mapData, meta, tiles as tileData } from '@/lib/db';
import { num } from '@/lib/format';
import { label, t } from '@/lib/i18n';
import type { Lang, NodeLite } from '@/lib/types';

export const metadata = { title: 'Map' };

type SP = { layer?: string; tab?: string; q?: string; type?: string; at?: string; page?: string; metric?: string; win?: string; zone?: string; c?: string };
const TYPES = ['central_bank', 'international', 'research', 'university', 'government', 'private', 'other'];
const REGION_KO: Record<string, string> = { Africa: '아프리카', Americas: '아메리카', Asia: '아시아', Europe: '유럽', Oceania: '오세아니아' };
const PER = 40;

/**
 * Who writes, who is studied: a tile grid map of economies (one square each, near its real place), coloured by one
 * metric at a time: documents that study the economy, documents its own organisations wrote, or the outside view
 * (the share of documents about it written by foreign or international organisations). A click opens the country
 * panel. Groupings (euro area, EU) and the organisations without a location stay beside it; a searchable list of
 * organisations (with their headquarters) and economies sits below.
 */
export default async function MapPage({ params, searchParams }: { params: Promise<{ lang: string }>; searchParams: Promise<SP> }) {
  const lang = (await params).lang as Lang;
  const sp = await searchParams;
  const L = t(lang);
  const ko = lang === 'ko';
  const md = mapData();
  const names = lookup([...md.clusters.flatMap((c) => c.orgs.map((o) => o[0])), ...md.places.map((p) => p.id), ...md.unplaced.map((u) => u[0])]);
  const where = (c: { city: string | null; cen: string; cko: string | null }) => (c.city ? `${c.city}, ${ko ? c.cko || c.cen : c.cen}` : ko ? c.cko || c.cen : c.cen);
  const placesAll = md.places.map((p) => ({ ...p, node: names.get(p.id) })).filter((p): p is typeof p & { node: NodeLite } => !!p.node);
  const groupings = placesAll.filter((p) => p.group).sort((a, b) => b.n - a.n);

  const tab = sp.tab === 'place' ? 'place' : 'org';
  const q = (sp.q ?? '').trim().slice(0, 60);
  const ql = q.toLowerCase();
  const type = TYPES.includes(sp.type ?? '') ? sp.type! : '';
  const at = sp.at ?? '';
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);
  const base = `/${lang}/m`;
  const qs = (o: Record<string, string>) => { const u = new URLSearchParams({ tab, ...(q ? { q } : {}), ...(type ? { type } : {}), ...(at ? { at } : {}), ...o }); for (const [k, v] of [...u]) if (!v) u.delete(k); return `${base}?${u}`; };

  // The list: every organisation with its location (or none), or every economy and grouping
  type ORow = { id: number; n: number; type: string; where: string | null; at: string | null };
  const orgRows: ORow[] = [
    ...md.clusters.flatMap((c) => c.orgs.map(([id, n, ty]) => ({ id, n, type: ty, where: where(c), at: `${c.iso}|${c.city ?? ''}` }))),
    ...md.unplaced.map(([id, n]) => ({ id, n, type: names.get(id)?.sub ?? 'other', where: null, at: null })),
  ];
  const orgFiltered = orgRows.filter((r) => (!type || r.type === type) && (!at || (at === 'none' ? r.at === null : r.at === at)) && (!ql || label(names.get(r.id), lang).toLowerCase().includes(ql) || names.get(r.id)?.en.toLowerCase().includes(ql) || (r.where ?? '').toLowerCase().includes(ql))).sort((a, b) => b.n - a.n);
  const placeFiltered = placesAll.filter((p) => !ql || label(p.node, lang).toLowerCase().includes(ql) || p.node.en.toLowerCase().includes(ql)).sort((a, b) => b.n - a.n);
  const total = tab === 'org' ? orgFiltered.length : placeFiltered.length;
  const slice = <T,>(xs: T[]) => xs.slice((page - 1) * PER, page * PER);
  const atC = at ? md.clusters.find((c) => `${c.iso}|${c.city ?? ''}` === at) : undefined;
  const atLabel = at ? (atC ? where(atC) : at.replace('|', ' ')) : '';
  const tl: TileT[] = tileData().map((x) => ({ iso: x.iso, c: x.c, r: x.r, slug: x.slug, name: ko ? x.ko || x.en : x.en, z: x.z, m: x.m }));
  const metric: Metric = sp.metric === 'studied' || sp.metric === 'outside' ? sp.metric : 'written';
  const win = ['1', '2'].includes(sp.win ?? '') ? Number(sp.win) : 0;
  const zone = ['europe', 'americas', 'asiapac', 'africa', 'mideast'].includes(sp.zone ?? '') ? sp.zone! : 'world';
  const csel = sp.c && tl.some((x) => x.iso === sp.c) ? sp.c : null;

  return (
    <div className="or-wrap or-page or-page--tight">
      <Title lang={lang} text={ko ? '누가 쓰고, 누가 연구되나' : 'Who writes, who is studied'}
        info={<>
          <p>{ko
            ? '경제마다 같은 크기의 칸 하나를 대략의 위치에 놓았습니다. 색은 한 번에 지표 하나만 표시합니다. 저술은 그 나라에 본부를 둔 기관이 쓴 문서 수, 연구됨은 그 경제를 다룬 문서 수, 바깥의 시선은 그 경제를 다룬 문서 가운데 다른 나라 기관이나 국제기구가 쓴 비율입니다. 지도는 태평양을 가운데에 두었습니다. 문서 수의 색 구간은 고른 지표와 기간의 자료에서 정합니다. 바깥의 시선은 50%를 가운데에 둔 눈금입니다.'
            : 'One equal square per economy, at its rough place. Colour shows one metric at a time. Written: documents by organisations headquartered there. Studied: documents about the economy. Outside view: the share of the documents about it written by foreign or international organisations. The map is centred on the Pacific. Count classes are set from the data for the chosen metric and period; the outside view uses a scale centred on 50%.'}</p>
          <p>{ko
            ? '쓴 기관은 발행 기관, 저자의 소속, 연사의 기관입니다. NBER, SUERF, CEPR 같은 네트워크 시리즈는 쓴 기관으로 치지 않고 저자의 소속을 따릅니다. IMF, BIS, 세계은행, ECB, EU 기구는 어느 나라의 것도 아닌 국제기구로 집계합니다. 쓴 기관의 위치를 모르는 문서는 비율에서 제외합니다. 기간은 발행일 기준이며 최근 수집일에서 거꾸로 셉니다.'
            : 'Writers are the publisher, the authors’ affiliations and the speaker’s institution. Network series (NBER, SUERF, CEPR) are not writers; their authors’ affiliations are. The IMF, BIS, World Bank, ECB and EU bodies count as international, not as their host country. Documents whose writers have no known location are left out of the share. Periods are by date published, counted back from the latest received date.'}</p>
          <p>{ko
            ? `기관은 본부가 있는 도시에 배치했습니다. 위치를 아는 기관은 ${num(md.placed, lang)}곳, 모르는 ${num(md.unplaced.length, lang)}곳은 추측하지 않고 따로 두었습니다.`
            : `Organisations sit at their headquarters: ${num(md.placed, lang)} have a known location; the ${num(md.unplaced.length, lang)} without one are listed apart rather than guessed.`} {L.release} {meta().surface.release}.</p>
        </>} />
      <div className="or-mapwrap">
        <TileMap tiles={tl} lang={lang} init={{ metric, win, zone, sel: csel }}
          labels={ko ? {
            metrics: { written: '저술', studied: '연구됨', outside: '바깥의 시선' },
            metricHint: { written: '그 나라에 본부를 둔 기관이 쓴 문서 수', studied: '해당 경제를 다룬 문서 수', outside: '그 경제를 다룬 문서 중 다른 나라 기관이나 국제기구가 쓴 비율' },
            wins: ['전체 기간', '최근 5년', '최근 24개월'],
            zones: { world: '세계', europe: '유럽', americas: '아메리카', asiapac: '아시아·태평양', africa: '아프리카', mideast: '중동' },
            studied: '연구됨', written: '저술', outside: '바깥의 시선', docs: L.docs, tooFew: '쓴 기관을 아는 문서 5건 미만', none: '자료가 없습니다.', close: '닫기',
            mapLabel: '경제별 칸 지도', tileHelp: '화살표로 나라 사이를 옮기고 Enter로 연다.',
            tags: { dom: '국내', for: '해외', intl: '국제기구', unk: '위치 모름' }, topWriters: '그 경제를 다룬 문서를 쓴 기관', topTopics: '많이 다룬 주제(세계 평균 대비)',
            topAuthors: '최근 24개월의 저자와 연사', perYear: '연도별 문서 수', vsWorld: '×1.0은 전 세계 문서에서 그 주제가 차지하는 비중과 같습니다. 이 값보다 크면 이 나라에서 그 주제를 더 자주 다룹니다.',
            allAbout: '이 경제를 다룬 문서 {n}건 모두', orgsIn: '이 나라의 기관', domestic: '국내', foreign: '해외', intl: '국제기구', unknown: '위치 모름', loading: '불러오는 중…', legend: '지표',
            top10: '상위 10곳', top10Outside: '그 기간에 가장 많이 연구된 {n}개 경제 가운데 바깥의 시선 비율이 높은 순서입니다.', zero: '0건',
            breaks: { q: '순위로 나눈 구간이며, 위로 갈수록 좁습니다', l: '로그 눈금으로 나눴습니다' }, outsideLow: '자국 기관이 주로 씀', outsideHigh: '바깥에서 주로 씀',
          } : {
            metrics: { written: 'Written', studied: 'Studied', outside: 'Outside view' },
            metricHint: { written: 'Documents by organisations headquartered there', studied: 'Documents about the economy', outside: 'Share of the documents about the economy written by foreign or international organisations' },
            wins: ['All years', 'Last 5 years', 'Last 24 months'],
            zones: { world: 'World', europe: 'Europe', americas: 'Americas', asiapac: 'Asia-Pacific', africa: 'Africa', mideast: 'Middle East' },
            studied: 'Studied', written: 'Written', outside: 'Outside view', docs: L.docs, tooFew: 'fewer than 5 with known writers', none: 'No documents.', close: 'Close',
            mapLabel: 'Tile map of economies', tileHelp: 'Arrow keys move between countries, Enter opens one.',
            tags: { dom: 'domestic', for: 'foreign', intl: 'international', unk: 'location unknown' }, topWriters: 'Who writes about it', topTopics: 'Top topics against the world',
            topAuthors: 'Authors and speakers, last 24 months', perYear: 'Documents a year', vsWorld: '×1.0 = the topic’s share of all documents worldwide; above it, the topic is studied more often here.',
            allAbout: 'All {n} documents about it', orgsIn: 'Organisations based here', domestic: 'Domestic', foreign: 'Foreign', intl: 'International', unknown: 'Unknown', loading: 'Loading…', legend: 'Metric',
            top10: 'Top 10', top10Outside: 'Highest outside share among the {n} economies most studied in the period.', zero: 'none',
            breaks: { q: 'classes by rank, narrower towards the top', l: 'classes on a log scale' }, outsideLow: 'mostly written at home', outsideHigh: 'mostly written abroad',
          }} />
        <aside className="or-mapside">
          <Panel title={ko ? '지역 묶음' : 'Groupings'} quiet>
            <ul className="or-chips">
              {groupings.map((g) => <li key={g.id}><Link className="or-chip" href={`/${lang}/c/${g.node.slug}`}>{label(g.node, lang)}<span className="or-chip__n">{num(g.n, lang)}</span></Link></li>)}
            </ul>
            <p className="or-source">{ko ? '여러 나라를 묶은 지역은 지도의 점이 아니라 여기에 둡니다.' : 'Groupings of economies are listed here, not drawn as points.'}</p>
          </Panel>
          <Panel title={ko ? '위치를 모르는 기관' : 'Organisations without a location'} meta={num(md.unplaced.length, lang)} quiet>
            <details className="or-unplaced">
              <summary>{ko ? `문서가 많은 ${Math.min(30, md.unplaced.length)}곳 보기` : `Show the ${Math.min(30, md.unplaced.length)} largest`}</summary>
              <ul className="or-list or-list--one">
                {md.unplaced.slice(0, 30).map(([id, n]) => { const o = names.get(id); return o ? <li key={id}><Link className="lab" href={`/${lang}/o/${o.slug}`} title={label(o, lang)}>{label(o, lang)}</Link><span className="n">{num(n, lang)}</span></li> : null; })}
              </ul>
              <Link href={`${base}?tab=org&at=none#list`} className="or-jel__all">{ko ? '모두 목록에서 보기' : 'All of them in the list'} →</Link>
            </details>
            <p className="or-source">{ko ? '대부분 "연구부"처럼 이름만으로 속한 기관을 알 수 없는 부서, 학술지, 회의체입니다.' : 'Mostly departments whose parent the name does not say (“Research Department”), journals and committees.'}</p>
          </Panel>
        </aside>
      </div>

      <section id="list" className="or-section">
        <div className="or-tabs" role="tablist">
          <Link role="tab" aria-selected={tab === 'org'} className="or-chip" aria-current={tab === 'org' ? 'true' : undefined} href={`${base}?tab=org#list`}>{L.orgs}<span className="or-chip__n">{num(orgRows.length, lang)}</span></Link>
          <Link role="tab" aria-selected={tab === 'place'} className="or-chip" aria-current={tab === 'place' ? 'true' : undefined} href={`${base}?tab=place#list`}>{L.places}<span className="or-chip__n">{num(placesAll.length, lang)}</span></Link>
        </div>
        <form className="or-searchform" action={`${base}#list`} role="search">
          <input type="hidden" name="tab" value={tab} />
          {at ? <input type="hidden" name="at" value={at} /> : null}
          <label className="or-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input name="q" type="search" defaultValue={q} placeholder={tab === 'org' ? (ko ? '기관 이름이나 도시' : 'Organisation or city') : (ko ? '나라나 지역 이름' : 'Economy or region')} aria-label={L.searchBtn} />
          </label>
          {tab === 'org' ? (
            <select name="type" defaultValue={type} className="or-select" aria-label={ko ? '기관 유형' : 'Type'}>
              <option value="">{ko ? '모든 유형' : 'All types'}</option>
              {TYPES.map((k) => <option key={k} value={k}>{L.orgType[k]}</option>)}
            </select>
          ) : null}
          <button className="or-btn" type="submit">{L.searchBtn}</button>
        </form>
        {at ? <p className="or-muted">{at === 'none' ? (ko ? '위치를 모르는 기관' : 'Organisations without a location') : atLabel} · <Link href={qs({ at: '', page: '' })}>{ko ? '지역 조건 지우기' : 'clear location'}</Link></p> : null}
        <Panel title={tab === 'org' ? L.orgs : L.places} meta={`${num(total, lang)} · ${ko ? '문서 수 순' : 'by documents'}`}>
          {tab === 'org' ? (
            <ul className="or-maplist">
              {slice(orgFiltered).map((r) => { const o = names.get(r.id); return o ? (
                <li key={r.id}>
                  <Link className="lab" href={`/${lang}/o/${o.slug}`} title={label(o, lang)}><i className={`dot t-${r.type}`} />{label(o, lang)}</Link>
                  <span className="where">{L.orgType[r.type] ?? r.type} · {r.where ?? (ko ? '위치 모름' : 'location unknown')}</span>
                  <span className="n">{num(r.n, lang)}</span>
                </li>) : null; })}
            </ul>
          ) : (
            <ul className="or-maplist">
              {slice(placeFiltered).map((p) => (
                <li key={p.id}>
                  <Link className="lab" href={`/${lang}/c/${p.node.slug}`} title={label(p.node, lang)}><i className={`dot ${p.group ? 'dot--group' : 'dot--place'}`} />{label(p.node, lang)}</Link>
                  <span className="where">{p.group ? (ko ? '지역 묶음' : 'Grouping') : ko ? REGION_KO[p.node.sub ?? ''] ?? p.node.sub : p.node.sub}</span>
                  <span className="n">{num(p.n, lang)}</span>
                </li>
              ))}
            </ul>
          )}
          <Pager ranked base={base} page={page} total={total} per={PER} lang={lang} extra={`&tab=${tab}${q ? `&q=${encodeURIComponent(q)}` : ''}${type ? `&type=${type}` : ''}${at ? `&at=${encodeURIComponent(at)}` : ''}`} />
        </Panel>
      </section>
    </div>
  );
}
