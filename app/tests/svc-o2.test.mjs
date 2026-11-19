// The O2 allow-list test for /svc/v1 (the datasteg API's service contract; open-research rules O2, O3, O7).
//   node --test tests/svc-o2.test.mjs                                   # the mapper, on a card stuffed with forbidden fields
//   SVC_BASE=http://127.0.0.1:3515 node --test tests/svc-o2.test.mjs    # plus every view of a running server
// Part 1 feeds lib/svcmap.ts a card that also carries an abstract, the text, quotes, figures and contact details, and
// asserts none of it comes out, and that the document card's fields are exactly the allow-list. Part 2 walks every key
// of every view's answer (documents, cards, nodes of each kind, tree, new, search, item, economy, economies) for
// forbidden keys, e-mail addresses and unmarked model output. Node 22.18+ strips the TypeScript types on import.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FORBIDDEN_KEYS, cardMarkdown, docBrief, docCard, docItem, isContact } from '../lib/svcmap.ts';

const SENTINEL = 'SENTINEL-NOT-FOR-SVC';
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const HANGUL = /[\u3131-\uD79D]/;
const FORBIDDEN = new Set(FORBIDDEN_KEYS);

/** The document card's fields, in full: adding one means adding it here, on purpose. */
const CARD_KEYS = ['slug', 'title', 'kind', 'date', 'received', 'family', 'series', 'number', 'institution', 'publisher', 'url', 'pdf_url',
  'people', 'organisations', 'also_named', 'places', 'period_studied', 'topics', 'jel_stated', 'jel_inferred', 'jel_agree', 'summary',
  'keywords', 'keywords_located', 'keywords_withheld', 'provenance', 'page'].sort();

/** Every [path, key] in a JSON value. */
function* keys(v, path = '') {
  if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) yield* keys(v[i], `${path}[${i}]`); return; }
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { yield [`${path}.${k}`, k]; yield* keys(x, `${path}.${k}`); }
}
function forbiddenIn(body, exempt = new Set()) {
  return [...keys(body)].filter(([p, k]) => FORBIDDEN.has(k.toLowerCase()) && !exempt.has(p)).map(([p]) => p);
}

// ---------------------------------------------------------------- part 1: the mapper
// Korean labels are placeholders: the fixture needs a non-empty `ko`, and no Korean is written by hand (the repository's rule).
const names = new Map([
  [20, { id: 20, kind: 'topic', slug: 'growth-forecasting', en: 'Forecasting', ko: 'ko-label-forecasting', parent: 1, n: 10, sub: null }],
  [850, { id: 850, kind: 'jel', slug: 'E52', en: 'Monetary Policy', ko: null, parent: null, n: 10, sub: null }],
  [341, { id: 341, kind: 'jel', slug: 'C53', en: 'Forecasting Models', ko: null, parent: null, n: 10, sub: null }],
  [7241, { id: 7241, kind: 'org', slug: 'imf', en: 'International Monetary Fund', ko: 'ko-label-imf', parent: null, n: 10, sub: 'international' }],
  [20323, { id: 20323, kind: 'person', slug: '20323-a-author', en: 'A. Author', ko: null, parent: null, n: 3, sub: null }],
  [32827, { id: 32827, kind: 'place', slug: 'AFG', en: 'Afghanistan', ko: 'ko-label-afghanistan', parent: null, n: 40, sub: 'Asia' }],
  [1480, { id: 1480, kind: 'concept', slug: '1480-machine-learning', en: 'machine learning', ko: null, parent: null, n: 400, sub: 'method' }],
]);
const ctx = (lang = 'en') => ({ lang, names, unit: (u) => (u === 'imf_wpapers' ? 'IMF Working Papers' : u), grove: () => ({ slug: 'growth', en: 'Growth', ko: 'ko-label-growth' }), release: '2026.11' });
const stuffed = () => ({
  slug: 'imf-2026-238', doc_id: 1, kind: 'paper', unit: 'imf_wpapers', family: 'io', title: 'Nowcasting Economic Activity', date: '2026-10-30', received: '2026-11-05',
  series: 'IMF Working Papers', number: '2026/238', institution: 'International Monetary Fund', publisher: 7241,
  url: 'https://www.elibrary.imf.org/view/x', pdf_url: 'https://www.elibrary.imf.org/downloadpdf/x.pdf',
  authors: [{ name: 'A. Author', p: 20323, email: `a@imf.org ${SENTINEL}` }, { name: 'B. Writer', p: null }, { name: 'c.writer@imf.org', p: null }],
  speaker: null, summary: 'The paper proposes a nowcasting framework.',
  keywords: [
    { label: 'machine learning', c: 1480, sal: 'core', kind: 'method', n: 6, located: true, quote: `${SENTINEL} quoted sentence`, sentence: SENTINEL },
    { label: 'Afghanistan Author’s E-Mail Address: h.someone@imf.org', c: null, sal: 'minor', kind: 'topic', n: 1, located: true },
    { label: 'Tel.: +1-202-452-2436', c: null, sal: 'minor', kind: 'topic', n: 1, located: true },
    { label: 'S&P Capital IQ', c: null, sal: 'minor', kind: 'data', n: 2, located: true },
  ],
  people: [{ name: 'D. Named', kind: 'person', role: 'mentioned', found: false, listed: false, phone: SENTINEL }],
  orgs: [[7241, 'publisher']], org_names: [['International Monetary Fund', 'publisher', true], ['A Ministry', 'mentioned', false]],
  places: [32827], place_names: [['Afghanistan', 'country', true]], period: { from: 2010, to: 2026 },
  jel_stated: [], jel_inferred: [[850, 0.8], [341, 0.7]], jel_agree: null, topics: [[20, 0.6]],
  prov: { model: 'some-model', engine: 'laptop', text_source: 'text layer', vocab: 'v0', profile_loaded: '2026-11-06', research_card: false, builder: 'pc-1', text: SENTINEL },
  // what a future card might gain: none of it may leave
  abstract: `${SENTINEL} abstract`, text: `${SENTINEL} full text`, body: SENTINEL, full_text: SENTINEL, content: SENTINEL, quotes: [SENTINEL],
  sentences: [SENTINEL], excerpt: SENTINEL, figures: [SENTINEL], html: SENTINEL, raw: SENTINEL, email: 'x@y.org',
});

test('docCard, docItem and docBrief pass only allow-listed fields (O2)', () => {
  for (const lang of ['en', 'ko']) {
    for (const out of [docCard(stuffed(), ctx(lang)), docItem(stuffed(), ctx(lang)), docBrief(stuffed(), ctx(lang))]) {
      const s = JSON.stringify(out);
      assert.ok(!s.includes(SENTINEL), `sentinel leaked: ${s.slice(s.indexOf(SENTINEL) - 80, s.indexOf(SENTINEL) + 40)}`);
      assert.deepEqual(forbiddenIn(out), [], 'forbidden keys');
      assert.ok(!EMAIL.test(s), `contact detail leaked: ${s.match(EMAIL)?.[0]}`);
      assert.ok(!s.includes('452-2436'), 'phone leaked');
    }
  }
  assert.deepEqual(Object.keys(docCard(stuffed(), ctx())).sort(), CARD_KEYS);
});

test('the card Markdown says no more than the card (O2)', () => {
  const md = cardMarkdown(docCard(stuffed(), ctx()));
  assert.ok(!md.includes(SENTINEL));
  assert.ok(!EMAIL.test(md));
  assert.ok(md.includes('Summary (model only)'));
  assert.ok(md.length <= 20000);
});

test('model-written items are marked model_only (O3); people are listed as published (O7)', () => {
  const c = docCard(stuffed(), ctx());
  assert.equal(c.summary.model_only, true);
  assert.ok(c.jel_inferred.length === 2 && c.jel_inferred.every((j) => j.model_only === true));
  assert.equal(docItem(stuffed(), ctx()).jel_inferred.model_only, true);
  assert.ok(c.organisations.find((o) => o.name === 'A Ministry').model_only);
  assert.ok(c.also_named.every((p) => p.model_only === true));
  assert.equal(c.keywords_withheld, 2);
  assert.deepEqual(c.people.map((p) => p.name), ['A. Author', 'B. Writer']);
  // a dataset a paper names appears as a name only (O8)
  assert.deepEqual(Object.keys(c.keywords.find((k) => k.label === 'S&P Capital IQ')).sort(), ['concept', 'kind', 'label', 'located', 'occurrences', 'salience']);
  assert.ok(isContact('x.y@bis.org') && isContact('fax: +41 61 2673367') && isContact('www.nbs.sk') && !isContact('monetary policy'));
});

// ---------------------------------------------------------------- part 2: every view of a running server
const BASE = process.env.SVC_BASE;

test('every /svc/v1 answer is free of text, abstracts, quotes and contact details', { skip: !BASE && 'set SVC_BASE to crawl a running server' }, async () => {
  const seen = { answers: 0, cards: 0, bytes: 0 };
  const problems = [];
  const get = async (path) => {
    const r = await fetch(`${BASE.replace(/\/$/, '')}/svc/v1${path}`);
    const txt = await r.text();
    seen.answers++; seen.bytes += txt.length;
    let body;
    try { body = JSON.parse(txt); } catch { problems.push(`${path}: not JSON`); return null; }
    if (r.status !== 200) { problems.push(`${path}: ${r.status} ${txt.slice(0, 120)}`); return null; }
    const exempt = new Set(body.view === 'item' ? ['.data.text'] : []);
    const bad = forbiddenIn(body, exempt);
    if (bad.length) problems.push(`${path}: forbidden keys ${bad.slice(0, 5).join(', ')}`);
    if (EMAIL.test(txt)) problems.push(`${path}: e-mail address ${txt.match(EMAIL)[0]}`);
    if (typeof body.summary === 'string' && HANGUL.test(body.summary)) problems.push(`${path}: summary not English`);
    return body;
  };
  const slugs = new Set(['imf-2026-238']);
  const nodes = [];
  const lists = ['/documents?q=inflation', '/documents?q=e%20mail%20address&limit=50', '/documents?q=author%20email&limit=50', '/documents?q=imf%20org&limit=50',
    '/documents?q=bis%20org&limit=50', '/documents?q=tel%20fax&limit=50', '/documents?place=KOR&limit=50', '/documents?org=bok&kind=speech&limit=50',
    '/documents?jel=E52&from=2020&to=2024&limit=50', '/documents?topic=climate&limit=50', '/documents?topic=grove:climate&limit=20', '/documents?person=10435-mario-draghi&limit=20',
    '/documents?limit=50', '/documents?q=capital%20iq&limit=50', '/documents?q=climate&lang=ko'];
  for (const p of lists) {
    let b = await get(p);
    for (const d of b?.data?.documents ?? []) slugs.add(d.slug);
    if (b?.cursor) { b = await get(`${p}&cursor=${b.cursor}`); for (const d of b?.data?.documents ?? []) slugs.add(d.slug); }
  }
  for (const kind of ['grove', 'topic', 'concept', 'jel', 'org', 'person', 'place']) {
    const b = await get(`/nodes?kind=${kind}&limit=100`);
    for (const n of (b?.data?.nodes ?? []).slice(0, 4)) nodes.push([kind, n.slug]);
  }
  await get('/nodes'); await get('/nodes?q=inflation'); await get('/nodes?kind=person&q=draghi'); await get('/nodes?kind=jel&id=E52');
  for (const [kind, slug] of nodes) {
    for (const lang of ['en', 'ko']) {
      const b = await get(`/nodes/${kind}/${encodeURIComponent(slug)}?lang=${lang}`);
      for (const d of b?.data?.newest ?? []) slugs.add(d.slug);
      if (kind === 'person' && b) {
        const ppl = b.data.related.people_named;
        if (ppl.some((p) => 'documents' in p)) problems.push(`/nodes/person/${slug}: people with counts (O7)`);
      }
    }
    await get(`/item?id=${encodeURIComponent(`node:${kind}/${slug}`)}`);
  }
  for (const p of ['/tree', '/tree?lang=ko', '/new', '/new?limit=50', '/economies', '/economies?lang=ko', '/economy/KOR', '/economy/USA?lang=ko', '/economy/ZZZ', '/manifest',
    '/search?q=korea', '/search?q=monetary%20policy&limit=20', '/search?q=e%20mail%20address&limit=20']) {
    const b = await get(p);
    for (const d of [b?.data?.documents, b?.data?.newest].filter(Array.isArray).flat()) slugs.add(d.slug);
  }
  for (const slug of [...slugs].slice(0, 400)) {
    const b = await get(`/documents/${encodeURIComponent(slug)}`);
    if (!b) continue;
    seen.cards++;
    const k = Object.keys(b.data).sort();
    const extra = k.filter((x) => !CARD_KEYS.includes(x));
    if (extra.length) problems.push(`/documents/${slug}: fields outside the allow-list ${extra.join(', ')}`);
    if (b.data.summary && b.data.summary.model_only !== true) problems.push(`/documents/${slug}: summary not model_only`);
    if (b.data.summary && b.model_only !== true) problems.push(`/documents/${slug}: envelope lacks model_only`);
    if (b.data.jel_inferred.some((j) => j.model_only !== true)) problems.push(`/documents/${slug}: inferred JEL not model_only`);
  }
  for (const slug of [...slugs].slice(0, 40)) await get(`/item?id=${encodeURIComponent(`doc:${slug}`)}`);
  console.log(`crawled ${seen.answers} answers (${seen.cards} document cards, ${(seen.bytes / 1e6).toFixed(1)} MB)`);
  assert.deepEqual(problems, []);
});
