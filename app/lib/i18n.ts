import type { Fam, Lang } from './types';

export const LANGS: Lang[] = ['en', 'ko'];
export const isLang = (x: string): x is Lang => x === 'en' || x === 'ko';

const en = {
  siteName: 'open-research',
  tagline: 'An open atlas of economic research',
  description: 'Papers, speeches and reports from central banks, the BIS, FSB, IMF, World Bank, OECD and NBER, as a tree you can walk: by topic, JEL code, organisation, person, place and year.',
  skip: 'Skip to content',
  nav: { grove: 'Grove', topics: 'Topics', jel: 'JEL', map: 'Map', orgs: 'Organisations', people: 'People', places: 'Places', new: 'New', about: 'About' },
  night: 'Switch to Dusk', day: 'Switch to Noon',
  draft: 'Draft for review: this site is not indexed by search engines yet.',
  search: 'Search titles, people, organisations and concepts', searchBtn: 'Search',
  docs: 'documents', papers: 'Documents', perYear: 'Documents a year', newest: 'Newest first',
  fam: { cb: 'Central banks', bis: 'BIS and FSB', io: 'IMF, World Bank, OECD', acad: 'NBER and SUERF' } as Record<Fam, string>,
  famShort: { cb: 'Central bank', bis: 'BIS · FSB', io: 'IMF · WB · OECD', acad: 'NBER · SUERF' } as Record<Fam, string>,
  kind: { paper: 'paper', speech: 'speech', report: 'report', 'policy-note': 'policy note' } as Record<string, string>,
  kinds: { paper: 'Papers', speech: 'Speeches', report: 'Reports', 'policy-note': 'Policy notes' } as Record<string, string>,
  all: 'All', more: 'More', prev: 'Newer', next: 'Older', page: 'page', of: 'of',
  topics: 'Topics', topic: 'Topic', grove: 'Grove', concepts: 'Concepts', concept: 'Concept', methods: 'Methods', data: 'Data sources',
  orgs: 'Organisations', people: 'People', places: 'Places', jel: 'JEL codes', related: 'Related topics', lift: 'lift',
  inArchive: 'in the archive', inTopic: 'in this topic', readFirst: 'Read first', research: 'Research',
  stated: 'stated by the publisher', inferred: 'inferred by the model', statedShort: 'stated', inferredShort: 'inferred',
  marks: { intext: 'in text', found: 'found', model: 'model only', notLocated: 'no sentence' },
  summary: 'Summary', keywords: 'Keywords', provenance: 'Provenance', where: 'Where it sits in the atlas',
  sal: { core: 'core', major: 'major', minor: 'minor' } as Record<string, string>,
  open: 'Publisher’s page', pdf: 'PDF', received: 'received', published: 'published',
  release: 'atlas', built: 'built',
  orgType: { central_bank: 'Central banks', international: 'International organisations', government: 'Government', university: 'Universities', research: 'Research institutes', private: 'Private sector', other: 'Other' } as Record<string, string>,
  noResults: 'Nothing matched. Try fewer or shorter words.',
  notFound: 'This page does not exist in the atlas.',
  backHome: 'Back to the grove',
};

type Strings = typeof en;

const ko: Strings = {
  siteName: 'open-research',
  tagline: '경제 연구의 열린 지도',
  description: '중앙은행, BIS, FSB, IMF, 세계은행, OECD, NBER의 논문과 연설, 보고서를 나무처럼 따라가며 읽습니다. 주제, JEL 분류, 기관, 사람, 지역, 연도로 찾을 수 있습니다.',
  skip: '본문 바로가기',
  nav: { grove: '숲', topics: '주제', jel: 'JEL 분류', map: '지도', orgs: '기관', people: '사람', places: '지역', new: '새 자료', about: '소개' },
  night: '저녁 모드로', day: '한낮 모드로',
  draft: '검토용 초안입니다. 아직 검색엔진에 노출되지 않습니다.',
  search: '제목, 사람, 기관, 개념 검색', searchBtn: '검색',
  docs: '건', papers: '문서', perYear: '연도별 문서 수', newest: '최신순',
  fam: { cb: '중앙은행', bis: 'BIS·FSB', io: 'IMF·세계은행·OECD', acad: 'NBER·SUERF' },
  famShort: { cb: '중앙은행', bis: 'BIS·FSB', io: 'IMF·WB·OECD', acad: 'NBER·SUERF' },
  kind: { paper: '논문', speech: '연설', report: '보고서', 'policy-note': '정책 노트' },
  kinds: { paper: '논문', speech: '연설', report: '보고서', 'policy-note': '정책 노트' },
  all: '전체', more: '더 보기', prev: '최신', next: '이전', page: '쪽', of: '/',
  topics: '주제', topic: '주제', grove: '숲', concepts: '개념', concept: '개념', methods: '분석 방법', data: '데이터 출처',
  orgs: '기관', people: '사람', places: '지역', jel: 'JEL 분류', related: '함께 다뤄지는 주제', lift: '배율',
  inArchive: '전체 자료 기준', inTopic: '이 주제 안', readFirst: '먼저 읽을 자료', research: '연구',
  stated: '발행 기관이 밝힌 분류', inferred: '모델이 추정한 분류', statedShort: '발행처', inferredShort: '추정',
  marks: { intext: '본문 확인', found: '문자열 확인', model: '모델 작성', notLocated: '문장 없음' },
  summary: '요약', keywords: '핵심어', provenance: '출처 정보', where: '지도 안의 위치',
  sal: { core: '핵심', major: '주요', minor: '보조' },
  open: '발행처 페이지', pdf: 'PDF', received: '수집', published: '발행',
  release: '지도 릴리스', built: '빌드',
  orgType: { central_bank: '중앙은행', international: '국제기구', government: '정부기관', university: '대학', research: '연구기관', private: '민간', other: '기타' },
  noResults: '맞는 결과가 없습니다. 단어를 줄이거나 더 짧게 입력해 주십시오.',
  notFound: '지도에 없는 페이지입니다.',
  backHome: '숲으로 돌아가기',
};

export const t = (l: Lang): Strings => (l === 'ko' ? ko : en);

/** A node's label in the page language; Korean falls back to English (most concepts and people have no Korean name). */
export const label = (n: { en: string; ko: string | null } | undefined | null, l: Lang): string => (n ? (l === 'ko' && n.ko ? n.ko : n.en) : '');

export const UNIT: Record<string, string> = {
  bis_aer: 'BIS Annual Economic Report', bis_bulletins: 'BIS Bulletin', bis_cbspeeches: 'Central bankers’ speeches (BIS)',
  bis_committee_research: 'BIS committee research', bis_fsi: 'FSI publications', bis_mgmtspeeches: 'BIS management speeches',
  bis_papers: 'BIS Papers', bis_quarterly: 'BIS Quarterly Review', bis_wpapers: 'BIS Working Papers', cb_reshub: 'BIS Research Hub',
  fsb_publications: 'FSB publications', fsb_speeches: 'FSB speeches', imf_wpapers: 'IMF Working Papers', nber_wpapers: 'NBER Working Papers',
  oecd_eco_wpapers: 'OECD Economics Department Working Papers', suerf_policy: 'SUERF Policy Notes', worldbank_prwp: 'World Bank Policy Research Working Papers',
};
