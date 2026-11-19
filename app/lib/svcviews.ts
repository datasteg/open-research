// The /svc/v1 views (the datasteg API's service contract): what the api service may serve from open-research, built with the
// same readers the pages use (lib/db.ts) and limited to what a page already shows. Documents go through the O2
// allow-list in lib/svcmap.ts; node pages are mapped field by field here. Counts are the atlas release's (O4). People
// are never ranked (O7): related people are listed A–Z without counts, and the People view is A–Z.
import { cardsOf, dupHead, econ, findDocs, findNodes, kindsOf, lookup, meta, nodeById, nodeLite, redirect, search, variantsOf } from './db';
import { UNIT } from './i18n';
import { newPayload, parseNew } from './newboard';
import family from './family.json';
import { SITE, cardMarkdown, docBrief, docCard, docItem, docPage, isContact, label, nodePage, type Ctx, type DocBrief, type DocItem } from './svcmap';
import { svcError, svcJson, svcLang } from './svc';
import type { Card, Lang, NodeLite, NodePage } from './types';

export const APP = 'open-research';
export const KINDS = ['grove', 'topic', 'concept', 'jel', 'org', 'person', 'place'] as const;
const DOC_KINDS = ['paper', 'speech', 'report', 'policy-note'];
const KIND_NAME: Record<string, string> = { grove: 'grove', topic: 'topic', concept: 'concept', jel: 'JEL code', org: 'organisation', person: 'person', place: 'place' };
const FAM_COLS = [
  { id: 'central_banks', label: 'Central banks' }, { id: 'bis_fsb', label: 'BIS and FSB' },
  { id: 'imf_wb_oecd', label: 'IMF, World Bank, OECD' }, { id: 'nber_suerf', label: 'NBER and SUERF' },
];
const MAX_OFFSET = 1000;
const HANGUL = /[\u3131-\uD79D]/;

/** A failed call: the route answers it with the contract's error envelope. */
export class SvcFail extends Error {
  constructor(public status: number, public type: string, public title: string, public detail: string) { super(detail); }
}
const bad = (detail: string) => new SvcFail(400, 'bad-parameter', 'Bad parameter', detail);

/** Run a view; a SvcFail becomes its error, anything else a 503 (never a stack trace). */
export function answer(fn: () => unknown): Response {
  try {
    return svcJson(fn());
  } catch (e) {
    if (e instanceof SvcFail) return svcError(e.status, e.type, e.title, e.detail);
    console.error('svc', e);
    return svcError(503, 'data-missing', 'Data unavailable', 'The atlas data could not be read. Try again later.');
  }
}

// ---------------------------------------------------------------- shared pieces
const release = () => meta().surface.release;
const english = (s: string) => !HANGUL.test(s);
const fmt = (n: number) => new Intl.NumberFormat('en-GB').format(n);
const cut = (s: string, n = 600) => (s.length <= n ? s : `${s.slice(0, n - 1).replace(/\s+\S*$/, '')}…`);

function groveOf(topicId: number) {
  const g = meta().groves.find((x) => x.topics.some((t) => t[0] === topicId));
  return g ? { slug: g.slug, en: g.en, ko: g.ko } : undefined;
}

function ctxFor(cards: Card[], lang: Lang, extra: Iterable<number | null | undefined> = []): Ctx {
  const ids: (number | null | undefined)[] = [...extra];
  for (const c of cards) {
    ids.push(...c.topics.map((x) => x[0]), ...c.jel_stated, ...c.jel_inferred.map((x) => x[0]), ...c.authors.map((a) => a.p), c.speaker?.p,
      ...c.orgs.map((o) => o[0]), c.publisher, ...c.places, ...c.keywords.map((k) => k.c));
  }
  return { lang, names: lookup(ids), unit: (u) => UNIT[u] ?? u, grove: groveOf, release: release() };
}

const NOTES = [
  'Metadata and links only (rule O2): no full text, abstracts, figures or quoted sentences; each document is on its publisher\'s site.',
  'Fields marked model_only were written by a language model (rule O3): never quote them as the document\'s words.',
];

function atlasSource() {
  const m = meta();
  return { publisher: 'datasteg open-research (research archive)', dataset: `Atlas release ${m.surface.release}`, vintage: m.built.slice(0, 10),
    terms: 'Metadata and links to the publishers; the documents belong to their publishers', url: `${SITE}/en/about` };
}

/** The atlas, then one source per series in the answer (publisher as the card names it). */
function sourcesOf(cards: Card[]) {
  const seen = new Map<string, { publisher: string; dataset: string }>();
  for (const c of cards) if (!seen.has(c.unit)) seen.set(c.unit, { publisher: c.institution ?? UNIT[c.unit] ?? c.unit, dataset: UNIT[c.unit] ?? c.unit });
  return [atlasSource(), ...seen.values()];
}

function envelope(view: string, page: string, summary: string, data: unknown, extra: Record<string, unknown> = {}) {
  const m = meta();
  return { app: APP, view, release: m.surface.release, built: m.built, page, sources: [atlasSource()], summary: cut(summary), data,
    notes: NOTES, terms: `${SITE}/en/about#rules`, ...extra };
}

function intParam(url: URL, k: string, def: number, min: number, max: number): number {
  const v = url.searchParams.get(k);
  if (v == null || v === '') return def;
  if (!/^\d+$/.test(v) || +v < min || +v > max) throw bad(`${k} must be a whole number from ${min} to ${max}; got "${v.slice(0, 20)}".`);
  return +v;
}
function strParam(url: URL, k: string, max: number, re?: RegExp, hint?: string): string {
  const v = (url.searchParams.get(k) ?? '').trim();
  if (v.length > max) throw bad(`${k} is at most ${max} characters.`);
  if (v && re && !re.test(v)) throw bad(`${k} "${v.slice(0, 40)}" is not valid${hint ? `: ${hint}` : ''}.`);
  return v;
}
function offsetOf(url: URL): number {
  const c = url.searchParams.get('cursor');
  if (!c) return 0;
  const o = /^[A-Za-z0-9_-]{1,16}$/.test(c) ? Number(Buffer.from(c, 'base64url').toString('utf8').replace(/^o/, '')) : NaN;
  if (!Number.isInteger(o) || o < 0 || o > MAX_OFFSET) throw bad('cursor is not one this service gave; drop it to start from the first page.');
  return o;
}
const cursorFor = (offset: number, limit: number, total: number) => (offset + limit < total && offset + limit <= MAX_OFFSET ? Buffer.from(`o${offset + limit}`).toString('base64url') : null);

/** A node by kind and slug; a merged slug answers the node it now lives in (O5), a retired or unknown one fails. */
function resolveNode(kind: string, slug: string, param: string): NodeLite & { redirected_from?: string } {
  const n = nodeLite(kind, slug);
  if (n) return n;
  const r = redirect(kind, slug);
  if (r) { const m = nodeLite(r.kind, r.slug); if (m) return { ...m, redirected_from: `${kind}/${slug}` }; }
  throw new SvcFail(404, 'unknown-node', `Unknown ${KIND_NAME[kind] ?? kind}`,
    `${param} "${slug.slice(0, 60)}" is not ${/^[aeiou]/i.test(KIND_NAME[kind] ?? kind) ? 'an' : 'a'} ${KIND_NAME[kind] ?? kind} in atlas release ${release()}. Find its id with GET /v1/open-research/nodes?kind=${kind}&q=<words>.`);
}

/** The topic filter takes a topic slug, or a grove or concept slug ("grove:climate", "concept:1031-price-stability" when ambiguous). */
function resolveTopic(v: string): NodeLite {
  const m = /^(topic|grove|concept):(.+)$/.exec(v);
  if (m) return resolveNode(m[1], m[2], 'topic');
  for (const k of ['topic', 'grove', 'concept']) { const n = nodeLite(k, v); if (n) return n; }
  return resolveNode('topic', v, 'topic');
}

const docItems = (cards: Card[], lang: Lang): DocItem[] => { const ctx = ctxFor(cards, lang); return cards.map((c) => docItem(c, ctx)); };
const docBriefs = (cards: Card[], lang: Lang): DocBrief[] => { const ctx = ctxFor(cards, lang); return cards.map((c) => docBrief(c, ctx)); };
/** A list's labels: the asked language, with the English one beside a Korean label. */
const labels = (en: string, ko: string | null | undefined, lang: Lang) => (lang === 'ko' && ko ? { label: ko, label_en: en } : { label: en });

const DOC_COLUMNS = [
  { id: 'slug', label: 'Id' }, { id: 'title', label: 'Title' }, { id: 'kind', label: 'Kind' }, { id: 'date', label: 'Date published' },
  { id: 'series', label: 'Series' }, { id: 'number', label: 'Number' }, { id: 'publisher', label: 'Publisher' },
  { id: 'authors', label: 'Authors or speaker' }, { id: 'url', label: 'Publisher\'s page' },
];
const docRow = (d: DocItem) => [d.slug, d.title, d.kind, d.date, d.series, d.number, d.publisher?.label ?? d.institution, (d.speaker ? [d.speaker, ...d.authors] : d.authors).join('; '), d.url];

function byline(d: { title: string; date: string | null; series: string; number: string | null }) {
  const t = english(d.title) ? `"${d.title}"` : 'a document with a non-English title';
  return `${t} (${d.series}${d.number ? ` ${d.number}` : ''}${d.date ? `, ${d.date}` : ''})`;
}

// ---------------------------------------------------------------- views
export function manifestView() {
  const m = meta();
  return { app: APP, surface: '1.0', release: m.surface.release, built: m.built, status: 'preview',
    views: ['documents', 'document', 'nodes', 'node', 'tree', 'new'], hooks: ['search', 'item', 'economy', 'economies'] };
}

/** GET /svc/v1/documents: documents by query and filters, as the search overlay and the node pages list them. */
export function documentsView(url: URL) {
  const lang = svcLang(url);
  const q = strParam(url, 'q', 200);
  const kind = strParam(url, 'kind', 20);
  if (kind && !DOC_KINDS.includes(kind)) throw bad(`kind must be one of ${DOC_KINDS.join(', ')}.`);
  const yr = /^\d{4}(-\d{2}(-\d{2})?)?$/;
  const from = strParam(url, 'from', 10, yr, 'use a year such as 2020 or a date such as 2020-06-30');
  const to = strParam(url, 'to', 10, yr, 'use a year such as 2024 or a date such as 2024-12-31');
  const limit = intParam(url, 'limit', 10, 1, 50);
  const offset = offsetOf(url);
  const filters: { param: string; node: NodeLite }[] = [];
  for (const [param, k] of [['org', 'org'], ['person', 'person'], ['jel', 'jel'], ['place', 'place'], ['topic', 'topic']] as const) {
    const v = strParam(url, param, 120);
    if (!v) continue;
    const n = param === 'topic' ? resolveTopic(v) : resolveNode(k, param === 'jel' ? v.toUpperCase() : param === 'place' && /^[a-z]{2,3}$/.test(v) ? v.toUpperCase() : v, param);
    filters.push({ param, node: n });
  }
  filters.sort((a, b) => a.node.n - b.node.n);
  const { cards, total } = findDocs({ q: q || undefined, kind: kind || undefined, nodes: filters.map((f) => f.node.id), from: from || undefined, to: to || undefined }, limit, offset);
  const items = docItems(cards, lang);
  const what = [
    q ? `matching "${english(q) ? q : '…'}"` : null,
    ...filters.map((f) => `${f.param === 'topic' ? KIND_NAME[f.node.kind] : KIND_NAME[f.param]} ${f.node.en}${f.node.kind === 'place' || f.node.kind === 'jel' ? '' : ` (${f.node.slug})`}`),
    kind ? `kind ${kind}` : null, from || to ? `published ${from || '…'} to ${to || '…'}` : null,
  ].filter(Boolean).join(', ');
  const order = q ? 'by relevance' : 'newest first';
  const summary = `${fmt(total)} documents${what ? ` (${what})` : ''} in the open-research atlas, release ${release()} built ${meta().built.slice(0, 10)}; ${items.length ? `${offset + 1}–${offset + items.length} shown ${order}` : 'none shown'}. ${items[0] ? `First: ${byline(items[0])}. ` : ''}Titles, authors, publishers and links to the publishers' pages only.`;
  const single = filters.length === 1 && !q ? nodePage(lang, filters[0].node) : null;
  const page = q ? `/${lang}/search?q=${encodeURIComponent(q)}` : single ?? `/${lang}/search`;
  return envelope('documents', page, summary, {
    query: { q: q || null, kind: kind || null, from: from || null, to: to || null, ...Object.fromEntries(filters.map((f) => [f.param, { kind: f.node.kind, slug: f.node.slug, label: label(f.node, lang) }])) },
    order: q ? 'relevance' : 'date_published_desc', total, offset, documents: items,
  }, { sources: sourcesOf(cards), table: { columns: DOC_COLUMNS, rows: items.map(docRow) }, cursor: cursorFor(offset, limit, total) });
}

/** GET /svc/v1/documents/{slug}: the document page as data. A document the atlas no longer holds is not served. */
export function documentView(slug: string, lang: Lang) {
  const card = docCard_(slug, lang);
  const d = card.view;
  const authors = d.people.map((p) => p.name);
  const by = authors.length ? ` by ${authors.slice(0, 3).join(', ')}${authors.length > 3 ? ` and ${authors.length - 3} more` : ''}` : '';
  const topic = d.topics[0] ? ` It sits in the topic ${card.names.get(card.c.topics[0][0])?.en ?? d.topics[0].slug}.` : '';
  const summary = `${d.kind[0].toUpperCase()}${d.kind.slice(1)} ${byline(d)}${by}, from ${card.c.institution ?? d.series}.${topic} Metadata from the open-research atlas, release ${release()}; the document itself is on the publisher's page${d.summary ? '; the one-line summary is model only' : ''}.`;
  return envelope('document', d.page, summary, d, { sources: sourcesOf([card.c]), ...(d.summary ? { model_only: true } : {}) });
}

function docCard_(slug: string, lang: Lang) {
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(slug)) throw new SvcFail(404, 'unknown-document', 'Unknown document', `"${slug.slice(0, 60)}" is not a document id. Ids look like imf-2026-238; GET /v1/open-research/documents?q=<words> finds them.`);
  const c = cardsOf([slug]).get(slug);
  if (!c) throw new SvcFail(404, 'unknown-document', 'Unknown document', `No document "${slug}" in atlas release ${release()} (never held, or removed). GET /v1/open-research/documents?q=<words> finds documents.`);
  const ctx = ctxFor([c], lang);
  return { c, names: ctx.names, view: docCard(c, ctx) };
}

/** The year table: documents a year by publisher family, as a node page's bars draw them. */
function yearTable(years: Record<string, number[]>) {
  const rows = Object.entries(years).sort((a, b) => +a[0] - +b[0]).map(([y, v]) => [+y, ...v.slice(0, 4), v.reduce((s, x) => s + x, 0)]);
  return { columns: [{ id: 'year', label: 'Year published' }, ...FAM_COLS.map((c) => ({ ...c, unit: 'documents' })), { id: 'total', label: 'Total', unit: 'documents' }], rows };
}

function yearStats(years: Record<string, number[]>) {
  const tot = Object.entries(years).map(([y, v]) => [+y, v.reduce((a, b) => a + b, 0)] as [number, number]);
  const peak = tot.reduce((a, b) => (b[1] > a[1] ? b : a), [0, 0] as [number, number]);
  return { first_year: tot.length ? Math.min(...tot.map((x) => x[0])) : null, peak_year: peak[0] || null, peak_year_documents: peak[1], documents_2025: tot.find((x) => x[0] === 2025)?.[1] ?? 0 };
}

const lite = (n: NodeLite | undefined, lang: Lang, v?: number) => (n ? { kind: n.kind, slug: n.slug, label: label(n, lang), ...(v != null ? { documents: v } : {}) } : null);
const nn = <T,>(xs: (T | null | undefined)[]) => xs.filter((x): x is T => x != null);

/** One node page as data (components/NodeView.tsx and the kind's page), with its newest documents (at most 10). */
function nodeDetail(n0: NodePage, lang: Lang, redirectedFrom?: string) {
  const n = n0;
  const p = n.page;
  const rel = p.rel ?? {};
  const kids = (p.children ?? []) as number[][];
  const ids: (number | null | undefined)[] = [...kids.map((k) => k[0]), ...Object.values(rel).flatMap((xs) => (xs ?? []).slice(0, 24).map((x) => x[0])),
    ...(p.concepts ?? []).map((c) => c[0]), ...(p.cotopics ?? []).map((c) => c[0]), ...(p.topics ?? []).map((t) => t[0]), p.broader, p.parent,
    ...(p.aff ? p.aff.timeline.map((r) => r.org) : []), p.aff?.latest.org];
  const names = lookup(ids);
  const N = (id: number | null | undefined) => (id != null ? names.get(id) : undefined);
  const bars = (k: keyof typeof rel, max = 10) => nn((rel[k] ?? []).slice(0, max).map(([id, v]) => lite(N(id), lang, v)));
  const people = nn((rel.person ?? []).slice(0, 10).map(([id]) => N(id))).map((x) => ({ slug: x.slug, label: label(x, lang) })).sort((a, b) => a.label.localeCompare(b.label));
  const kinds = kindsOf(n.id);
  const newest = findDocs({ nodes: [n.id] }, 10, 0).cards;
  const extra: Record<string, unknown> = {};
  let children: unknown[] = [];
  const ancestry = () => { const out: { slug: string; label: string }[] = []; let q = n.parent; for (let i = 0; i < 6 && q; i++) { const m = lookup([q]).get(q); if (!m) break; out.unshift({ slug: m.slug, label: label(m, lang) }); q = m.parent; } return out; };
  if (n.kind === 'grove') {
    const g = meta().groves.find((x) => x.id === n.id);
    Object.assign(extra, { description_en: p.data.desc_en ?? null, description_ko: p.data.desc_ko ?? null,
      growth: g?.growth ?? null, growth_basis: 'documents published 2023–2025 over 2020–2022, minus one', published_last_12_months: g?.n12 ?? null, published_last_24_months: g?.n24 ?? null });
    children = nn(kids.map(([id, v]) => lite(N(id), lang, v)));
  } else if (n.kind === 'topic') {
    const g = meta().groves.find((x) => x.id === p.grove);
    const concepts = (p.concepts ?? []).filter((c) => c[3] === 'topic' || c[3] === 'instrument');
    const inTopic = new Set(concepts.map((c) => c[0]));
    const sub = new Map<number, typeof concepts>();
    const roots: typeof concepts = [];
    for (const c of concepts) (c[4] != null && inTopic.has(c[4]) ? sub.set(c[4], [...(sub.get(c[4]) ?? []), c]) : roots.push(c));
    const cRef = (c: (typeof concepts)[number]) => { const x = N(c[0]); return x ? { kind: 'concept', slug: x.slug, label: label(x, lang), documents: c[1], membership: c[2] < 1 ? c[2] : 'seed' } : null; };
    const relC = rel.concept ?? [];
    Object.assign(extra, {
      grove: g ? { slug: g.slug, label: lang === 'ko' && g.ko ? g.ko : g.en } : null,
      description_en: p.data.desc_en ?? null, description_ko: p.data.desc_ko ?? null, jel_anchors: (p.data.jel as string[] | undefined) ?? [],
      related_topics: nn((p.cotopics ?? []).map(([id, k, lift]) => { const x = N(id); return x ? { slug: x.slug, label: label(x, lang), documents: k, lift } : null; })),
      methods: nn(relC.filter(([id]) => N(id)?.sub === 'method').slice(0, 10).map(([id, v]) => lite(N(id), lang, v))),
      data_sources: nn(relC.filter(([id]) => N(id)?.sub === 'data').slice(0, 8).map(([id, v]) => lite(N(id), lang, v))),
      concept_membership_basis: 'seed = set by the owner; a share = the share of the concept\'s documents whose top topic is this one (a rule placement)',
    });
    children = nn(roots.slice(0, 20).map((c) => { const r = cRef(c); const ns = nn((sub.get(c[0]) ?? []).slice(0, 6).map(cRef)); return r ? { ...r, ...(ns.length ? { narrower: ns } : {}) } : null; }));
  } else if (n.kind === 'concept') {
    Object.assign(extra, {
      concept_kind: p.data.kind ?? null, topics: nn((p.topics ?? []).map(([id]) => lite(N(id), lang))), broader: lite(N(p.broader), lang),
      appears_with: nn((rel.concept ?? []).slice(0, 24).map(([id, v]) => lite(N(id), lang, v))),
      variant_of: lite(dupHead(n.id) ?? undefined, lang),
      variants: (variantsOf([n.id]).get(n.id) ?? []).slice(0, 20).map((v) => lite(v, lang, v.n)),
    });
    children = nn(kids.slice(0, 20).map(([id, v]) => lite(N(id), lang, v)));
  } else if (n.kind === 'jel') {
    Object.assign(extra, { ancestry: ancestry(), stated_documents: p.stated_n ?? 0, inferred_documents: { count: p.inferred_n ?? 0, model_only: true },
      jel_note: 'Stated and inferred codes are never added together (O10); inferred codes are a guide.' });
    children = nn(kids.map(([id, s, i]) => { const x = N(id); return x ? { kind: 'jel', slug: x.slug, label: label(x, lang), stated: s, inferred: i } : null; }));
  } else if (n.kind === 'org') {
    const country = p.data.country ? nodeLite('place', p.data.country) : null;
    Object.assign(extra, { type: p.data.type ?? null, country: country ? { code: country.slug, label: label(country, lang) } : null, ancestry: ancestry(),
      basis: p.data.seed ? 'on the owner\'s organisation list; spellings gathered by rule' : 'named the same way in five or more documents; type and country read from the name by rule' });
    children = nn(kids.map(([id, v]) => lite(N(id), lang, v)));
  } else if (n.kind === 'person') {
    const tier: Record<string, string> = { stated: 'stated by the publisher', found: 'named in the text', series: 'from the staff series they write in', coauthored: 'from co-authored papers' };
    const modelTier = (t: string) => t === 'series' || t === 'coauthored';
    const orgOf = (r: { org: number | null; name: string | null }) => (r.org != null && N(r.org) ? { slug: N(r.org)!.slug, label: label(N(r.org)!, lang) } : r.name && !isContact(r.name) ? { slug: null, label: r.name } : null);
    const a = p.aff;
    Object.assign(extra, {
      affiliation: a ? {
        latest: { organisation: orgOf(a.latest), year: a.latest.year, evidence: tier[a.tier] ?? a.tier, ...(modelTier(a.tier) ? { model_only: true } : {}) },
        timeline: a.timeline.map((r) => ({ organisation: orgOf(r), from: r.y0, to: r.y1, documents: r.n, evidence: tier[r.tier] ?? r.tier, ...(modelTier(r.tier) ? { model_only: true } : {}) })),
      } : null,
      people_note: 'People as published: names and roles from the documents; no contact details and no rankings (O7). Corrections and removals: see About.',
    });
  } else if (n.kind === 'place') {
    type Site = { id: string; host: string; name: string; links: Record<string, string> };
    const sites = ((family as unknown as { sites: Site[] }).sites).filter((s) => s.id !== APP && s.links.economy && n.slug.length === 3);
    Object.assign(extra, { code: n.slug, region: n.sub ?? null,
      elsewhere: sites.map((s) => ({ site: s.name, url: `${s.host}${s.links.economy.replace('{lang}', lang).replace('{iso3}', n.slug)}` })) });
  }
  const ys = yearStats(p.years);
  const data = {
    kind: n.kind, slug: n.slug, label: label(n, lang), label_en: n.en, label_ko: n.ko, page: nodePage(lang, n), ...(redirectedFrom ? { redirected_from: redirectedFrom } : {}),
    documents: n.n, by_kind: kinds, ...ys, ...extra, children,
    related: { topics: bars('topic'), organisations: bars('org'), places: bars('place'), people_named: people },
    newest: docBriefs(newest, lang),
  };
  const first = data.newest[0];
  const summary = `${n.en} (${KIND_NAME[n.kind]}${n.kind === 'jel' || n.kind === 'place' ? ` ${n.slug}` : ''}): ${fmt(n.n)} documents in the open-research atlas, release ${release()} built ${meta().built.slice(0, 10)}${ys.first_year ? `, published from ${ys.first_year}` : ''}${ys.peak_year ? `, most in ${ys.peak_year} (${fmt(ys.peak_year_documents)})` : ''}. ${first ? `Newest: ${byline(first)}. ` : ''}Counts by year published; metadata and links only.`;
  return { data, summary, table: yearTable(p.years), sources: sourcesOf(newest) };
}

function loadNodePage(kind: string, slug: string): { n: NodePage; from?: string } {
  if (!(KINDS as readonly string[]).includes(kind)) throw new SvcFail(404, 'unknown-kind', 'Unknown node kind', `"${kind.slice(0, 30)}" is not a node kind. Use one of ${KINDS.join(', ')}.`);
  if (slug.length > 120) throw bad('slug is at most 120 characters.');
  const s = kind === 'jel' || (kind === 'place' && /^[a-z]{2,3}$/.test(slug)) ? slug.toUpperCase() : slug;
  const r = resolveNode(kind, s, 'slug');
  const n = nodeById(r.id);
  if (!n) throw new SvcFail(404, 'unknown-node', 'Unknown node', `No ${KIND_NAME[kind]} "${slug}".`);
  return { n, from: r.redirected_from };
}

/** GET /svc/v1/nodes/{kind}/{slug}: one node page. */
export function nodeView(kind: string, slug: string, lang: Lang, view = 'node') {
  const { n, from } = loadNodePage(kind, slug);
  const d = nodeDetail(n, lang, from);
  return envelope(view, d.data.page, d.summary, d.data, { sources: d.sources, table: d.table, ...(from ? { notes: [...NOTES, `"${from}" was merged into ${n.kind}/${n.slug} (rule O5).`] } : {}) });
}

const LIST_PAGE: Record<string, string> = { grove: '', topic: '/t', concept: '/t', jel: '/jel', org: '/m?tab=org#list', person: '/a', place: '/m?tab=place#list' };

/**
 * GET /svc/v1/nodes: the atlas tree. With kind and id, one node (as /nodes/{kind}/{id}); with kind or q, a list of
 * nodes (by documents; JEL in code order; people A–Z); with neither, the groves and their topics.
 */
export function nodesView(url: URL) {
  const lang = svcLang(url);
  const kind = strParam(url, 'kind', 20);
  if (kind && !(KINDS as readonly string[]).includes(kind)) throw bad(`kind must be one of ${KINDS.join(', ')}.`);
  const id = strParam(url, 'id', 120);
  if (id) {
    if (kind) return nodeView(kind, id, lang, 'nodes');
    for (const k of ['topic', 'grove', 'jel', 'place', 'org', 'concept', 'person']) {
      const s = k === 'jel' || k === 'place' ? id.toUpperCase() : id;
      if (nodeLite(k, s) || redirect(k, s)) return nodeView(k, s, lang, 'nodes');
    }
    throw new SvcFail(404, 'unknown-node', 'Unknown node', `No node "${id.slice(0, 60)}" in atlas release ${release()}. Pass kind as well, or search with GET /v1/open-research/nodes?q=<words>.`);
  }
  const q = strParam(url, 'q', 120);
  if (!kind && !q) return treeView(lang, 'nodes');
  const limit = intParam(url, 'limit', 25, 1, 100);
  const offset = offsetOf(url);
  const { rows, total } = findNodes(q, kind || null, limit, offset);
  const groves = meta().groves;
  const vars = kind === 'concept' && !q ? variantsOf(rows.map((r) => r.id)) : new Map<number, NodeLite[]>();
  const items = rows.map((n) => ({
    kind: n.kind, slug: n.slug, ...labels(n.en, n.ko, lang), en: n.en, documents: n.n, ...(n.sub ? { group: n.sub } : {}), page: nodePage(lang, n),
    ...(vars.get(n.id)?.length ? { variants: vars.get(n.id)!.slice(0, 10).map((v) => ({ slug: v.slug, ...labels(v.en, v.ko, lang), documents: v.n })) } : {}),
    ...(n.kind === 'grove' ? { children: (groves.find((g) => g.id === n.id)?.topics ?? []).map((t) => ({ kind: 'topic', slug: t[1], ...labels(t[2], t[3], lang), documents: t[4] })) } : {}),
  }));
  const order = q ? 'relevance' : kind === 'person' ? 'name' : kind === 'jel' ? 'code' : 'documents_desc';
  const what = `${kind ? `${KIND_NAME[kind]} nodes` : 'nodes'}${q ? ` matching "${english(q) ? q : '…'}"` : ''}`;
  const summary = `${fmt(total)} ${what} in the open-research atlas, release ${release()}; ${items.length ? `${offset + 1}–${offset + items.length} shown by ${order.replace('_desc', '').replace('_', ' ')}` : 'none shown'}${items[0] ? `, first ${items[0].en} (${fmt(items[0].documents)} documents)` : ''}. Counts are documents per node; a document counts once per node.`;
  const page = q ? `/${lang}/search?q=${encodeURIComponent(q)}` : `/${lang}${LIST_PAGE[kind] ?? ''}`;
  return envelope('nodes', page, summary, { query: { kind: kind || null, q: q || null }, order, total, offset, nodes: items.map(({ en, ...x }) => x) }, {
    table: { columns: [{ id: 'kind', label: 'Kind' }, { id: 'slug', label: 'Id' }, { id: 'label', label: 'Label' }, { id: 'documents', label: 'Documents', unit: 'documents' }], rows: items.map((x) => [x.kind, x.slug, x.label, x.documents]) },
    cursor: cursorFor(offset, limit, total),
  });
}

/** GET /svc/v1/tree: the groves and their topics, as the home page lists them. */
export function treeView(lang: Lang, view = 'tree') {
  const m = meta();
  const order = new Map(m.grove_order.map((k, i) => [k, i]));
  const groves = [...m.groves].sort((a, b) => (order.get(a.slug) ?? 0) - (order.get(b.slug) ?? 0)).map((g) => ({
    slug: g.slug, ...labels(g.en, g.ko, lang), en: g.en, documents: g.n, description: lang === 'ko' && g.desc_ko ? g.desc_ko : g.desc_en,
    growth: g.growth, published_last_24_months: g.n24, page: `/${lang}/g/${g.slug}`,
    topics: g.topics.map(([, slug, en, ko, n]) => ({ slug, ...labels(en, ko, lang), documents: n })),
  }));
  const topics = groves.reduce((a, g) => a + g.topics.length, 0);
  const big = [...groves].sort((a, b) => b.documents - a.documents)[0];
  const summary = `The open-research atlas, release ${m.surface.release} built ${m.built.slice(0, 10)}: ${fmt(m.docs)} documents in ${groves.length} groves and ${topics} topics; the largest grove is ${big.en} (${fmt(big.documents)}). A document can sit in up to three topics, so groves add up to more than the archive; ${fmt(m.unplaced)} are not placed yet. Growth compares documents published 2023–2025 with 2020–2022.`;
  return envelope(view, `/${lang}`, summary, { documents: m.docs, unplaced: m.unplaced, growth_basis: 'documents published 2023–2025 over 2020–2022, minus one', topic_page: `/${lang}/t/{slug}`, groves: groves.map(({ en, ...g }) => g) }, {
    table: {
      columns: [{ id: 'grove', label: 'Grove' }, { id: 'topic', label: 'Topic id' }, { id: 'label', label: 'Topic' }, { id: 'documents', label: 'Documents', unit: 'documents' }],
      rows: groves.flatMap((g) => g.topics.map((t) => [g.slug, t.slug, t.label, t.documents])),
    },
  });
}

/** GET /svc/v1/new: the New page's first view (received, last 30 days, backfill hidden, language versions folded). */
export function newView(url: URL) {
  const lang = svcLang(url);
  const limit = intParam(url, 'limit', 15, 1, 50);
  const pl = newPayload(lang, parseNew({}));
  const its = pl.items.slice(0, limit);
  const cards = cardsOf(its.map((x) => x.s));
  const ctx = ctxFor([...cards.values()], lang);
  const docs = nn(its.map((x) => { const c = cards.get(x.s); return c ? { ...docBrief(c, ctx), received: x.rc.slice(0, 10), languages: x.langs, ...(x.bf ? { backfill: true } : {}) } : null; }));
  const days = pl.days.map(([d, ...v]) => [d, ...v, v.reduce((a, b) => a + b, 0)]);
  const shown = days.reduce((a, r) => a + (r[5] as number), 0);
  const m = meta();
  const summary = `${fmt(shown)} documents received by the open-research archive in the 30 days to ${pl.end} (backfill hidden: documents received more than 90 days after publication), atlas release ${m.surface.release}. ${docs[0] ? `Latest: ${byline(docs[0])}, received ${docs[0].received}.` : ''} "New" means received, not published.`;
  return envelope('new', `/${lang}/new`, summary, {
    by: 'received', window_days: 30, end: pl.end, backfill_hidden: true, backfill_in_window: pl.backfill, received_in_window: shown,
    documents: docs,
  }, {
    sources: sourcesOf([...cards.values()]),
    table: { columns: [{ id: 'date', label: 'Date received' }, ...FAM_COLS.map((c) => ({ ...c, unit: 'documents' })), { id: 'total', label: 'Total', unit: 'documents' }], rows: days },
  });
}

// ---------------------------------------------------------------- hooks
/** GET /svc/v1/search: the masthead search's best pages and documents, as {items} (no envelope). */
export function searchHook(url: URL) {
  const lang = svcLang(url);
  const q = strParam(url, 'q', 200);
  const limit = intParam(url, 'limit', 10, 1, 20);
  if (q.length < 2) return { items: [] };
  const res = search(q, limit);
  const ql = q.toLowerCase();
  const nodes = res.nodes.slice(0, limit).map((n, i) => ({
    id: `node:${n.kind}/${n.slug}`, kind: 'node', type: n.kind, title: label(n, lang),
    snippet: `${KIND_NAME[n.kind][0].toUpperCase()}${KIND_NAME[n.kind].slice(1)}${n.kind === 'jel' || n.kind === 'place' ? ` ${n.slug}` : ''} · ${fmt(n.n)} documents`,
    page: nodePage(lang, n),
    score: [n.en, n.ko ?? '', n.slug].some((s) => s.toLowerCase() === ql) ? 1 : Math.max(0.3, +(0.9 - 0.04 * i).toFixed(2)),
  }));
  const docs = res.rows.map((r, i) => ({
    id: `doc:${r.s}`, kind: 'doc', type: r.k, title: r.t,
    snippet: [r.k, `${UNIT[r.u] ?? r.u}${r.no && r.u !== 'cb_reshub' && r.u !== 'bis_cbspeeches' ? ` ${r.no.replace(/^(publ|publications|review|events)_/, '')}` : ''}`, r.d,
      r.a.filter((x) => !isContact(x)).slice(0, 3).join(', ') + (r.an > 3 ? ` and ${r.an - 3} more` : '')].filter(Boolean).join(' · '),
    page: docPage(lang, r.s),
    score: r.t.toLowerCase() === ql ? 1 : Math.max(0.2, +(0.85 - 0.03 * i).toFixed(2)),
  }));
  return { items: [...nodes, ...docs].sort((a, b) => b.score - a.score).slice(0, limit) };
}

/** GET /svc/v1/item?id=doc:<slug> | node:<kind>/<slug>: the page as readable Markdown, for the cross-app fetch tool. */
export function itemHook(url: URL) {
  const lang = svcLang(url);
  const id = strParam(url, 'id', 200);
  const m = /^(doc|node):(.+)$/.exec(id);
  if (!m) throw new SvcFail(404, 'unknown-item', 'Unknown item', `"${id.slice(0, 60)}" is not an open-research item id. Use doc:<slug> (such as doc:imf-2026-238) or node:<kind>/<slug> (such as node:topic/monetary-policy).`);
  if (m[1] === 'doc') {
    const { c, view } = docCard_(m[2], lang);
    return envelope('item', view.page, documentSummary(view, c), { id, title: view.title, text: cardMarkdown(view), metadata: {
      kind: 'doc', document_kind: view.kind, date: view.date, series: view.series, number: view.number, publisher: view.publisher?.label ?? view.institution,
      url: view.url, ...('pdf_url' in view ? { pdf_url: view.pdf_url } : {}), page: view.page, model_only_fields: ['summary', 'jel_inferred', 'organisations with mark "model only"'],
    } }, { sources: sourcesOf([c]), ...(view.summary ? { model_only: true } : {}) });
  }
  const k = /^([a-z]+)\/(.+)$/.exec(m[2]);
  if (!k) throw new SvcFail(404, 'unknown-item', 'Unknown item', `Node items are node:<kind>/<slug>, kind one of ${KINDS.join(', ')}.`);
  const { n, from } = loadNodePage(k[1], k[2]);
  const d = nodeDetail(n, lang, from);
  return envelope('item', d.data.page, d.summary, { id: `node:${n.kind}/${n.slug}`, title: d.data.label, text: nodeMarkdown(d.data), metadata: {
    kind: 'node', node_kind: n.kind, slug: n.slug, documents: n.n, page: d.data.page,
  } }, { sources: d.sources });
}

function documentSummary(d: ReturnType<typeof docCard>, c: Card) {
  return cut(`${d.kind[0].toUpperCase()}${d.kind.slice(1)} ${byline(d)}${d.people.length ? ` by ${d.people.slice(0, 3).map((p) => p.name).join(', ')}${d.people.length > 3 ? ` and ${d.people.length - 3} more` : ''}` : ''}, from ${c.institution ?? d.series}. Metadata from the open-research atlas, release ${release()}; the document itself is on the publisher's page.`);
}

type NodeData = ReturnType<typeof nodeDetail>['data'];
function nodeMarkdown(d: NodeData): string {
  const s = (p: string) => `${SITE}${p}`;
  const x = d as NodeData & Record<string, any>;
  const L: string[] = [`# ${d.label}`, '', `${KIND_NAME[d.kind]} · ${fmt(d.documents)} documents · atlas release ${release()} · ${s(d.page)}`];
  if (x.description_en) L.push('', x.description_en);
  L.push('', `First year ${d.first_year ?? '–'} · peak year ${d.peak_year ?? '–'} (${fmt(d.peak_year_documents)}) · ${fmt(d.documents_2025)} in 2025 · by kind: ${Object.entries(d.by_kind).map(([k, v]) => `${k} ${fmt(v)}`).join(', ')}`);
  if (x.grove) L.push('', `Grove: ${x.grove.label}`);
  if (x.jel_anchors?.length) L.push(`JEL anchors: ${x.jel_anchors.join(' ')}`);
  if (x.stated_documents != null) L.push('', `Stated by the publisher: ${fmt(x.stated_documents)} · inferred by the model (model only): ${fmt(x.inferred_documents.count)}`);
  if (x.type) L.push('', `Type: ${x.type}${x.country ? ` · country ${x.country.label}` : ''}`);
  if (x.concept_kind) L.push('', `Concept kind: ${x.concept_kind}${x.broader ? ` · broader: ${x.broader.label}` : ''}${x.topics?.length ? ` · topics: ${x.topics.map((t: any) => t.label).join(', ')}` : ''}`);
  if (x.variant_of) L.push('', `A near-duplicate of ${x.variant_of.label} (${x.variant_of.slug}), flagged for merging in the next release.`);
  if (x.variants?.length) L.push('', `Near-duplicates under it: ${x.variants.map((v: any) => v.label).join('; ')}`);
  if (x.affiliation) {
    L.push('', `Latest affiliation: ${x.affiliation.latest.organisation?.label ?? 'unknown'} (${x.affiliation.latest.year}, ${x.affiliation.latest.evidence}${x.affiliation.latest.model_only ? ', model only' : ''})`);
    for (const r of x.affiliation.timeline) L.push(`- ${r.organisation?.label ?? '–'} ${r.from === r.to ? r.from : `${r.from}–${r.to}`} (${r.evidence})`);
  }
  const kids = d.children as { label: string; slug: string; documents?: number; stated?: number; inferred?: number }[];
  if (kids.length) L.push('', '## Children', ...kids.map((c) => `- ${c.label} (${c.slug})${c.documents != null ? `: ${fmt(c.documents)}` : ''}${c.stated != null ? `: stated ${fmt(c.stated)}, inferred ${fmt(c.inferred ?? 0)}` : ''}`));
  if (x.related_topics?.length) L.push('', '## Related topics (lift)', ...x.related_topics.map((t: any) => `- ${t.label}: ${fmt(t.documents)} · ${t.lift}×`));
  for (const [title, xs] of [['Topics', d.related.topics], ['Organisations', d.related.organisations], ['Places', d.related.places]] as const) {
    if (xs.length) L.push('', `## ${title} on these documents`, ...xs.map((r) => `- ${r!.label}: ${fmt(r!.documents ?? 0)}`));
  }
  if (d.related.people_named.length) L.push('', '## People named on these documents (A–Z, not a ranking)', d.related.people_named.map((p) => p.label).join(', '));
  if (d.newest.length) L.push('', '## Newest documents', ...d.newest.map((r) => `- [${r.title}](${s(r.page)}) · ${r.series}${r.number ? ` ${r.number}` : ''} · ${r.date ?? '–'}${r.url ? ` · ${r.url}` : ''}`));
  L.push('', 'Metadata and links only; counts by year published.');
  return L.join('\n').slice(0, 20000);
}

/** GET /svc/v1/economy/{iso3}: the place page and the map's economy panel for one economy. */
export function economyHook(iso: string, lang: Lang) {
  const code = iso.toUpperCase();
  const place = /^[A-Z]{3}$/.test(code) ? nodeLite('place', code) : null;
  const e = place ? econ(code) : null;
  const m = meta();
  if (!place) {
    return envelope('economy', `/${lang}/m`, `open-research has no place node for ${/^[A-Z]{3}$/.test(code) ? code : 'that code'} in atlas release ${m.surface.release}: no documents in the archive are mapped to it.`,
      { covered: false, code: /^[A-Z]{3}$/.test(code) ? code : null, name: null, headline: [], links: [{ label: 'Map of economies', page: `/${lang}/m` }] });
  }
  const wins = ['all years', `last 5 years to ${m.ref}`, `last 24 months to ${m.ref}`];
  const w = e?.win ?? [];
  const headline = nn([
    { label: 'Documents that study it', value: place.n, unit: 'documents', period: 'all years' },
    w[1] ? { label: 'Documents that study it', value: w[1].s, unit: 'documents', period: wins[1] } : null,
    w[2] ? { label: 'Documents that study it', value: w[2].s, unit: 'documents', period: wins[2] } : null,
    w[0] ? { label: 'Documents by organisations based there', value: w[0].w, unit: 'documents', period: wins[0] } : null,
    w[2] ? { label: 'Documents by organisations based there', value: w[2].w, unit: 'documents', period: wins[2] } : null,
    w[0]?.out != null ? { label: 'Outside view: share of the documents about it written by foreign or international organisations', value: +(w[0].out * 100).toFixed(1), unit: '%', period: wins[0] } : null,
    w[2]?.out != null ? { label: 'Outside view: share of the documents about it written by foreign or international organisations', value: +(w[2].out * 100).toFixed(1), unit: '%', period: wins[2] } : null,
  ]).slice(0, 8);
  const ids = [...(w[0]?.topics ?? []).map((t) => t[0]), ...(w[0]?.orgs ?? []).map((o) => o[0])];
  const names = lookup(ids);
  const newest = findDocs({ nodes: [place.id] }, 10, 0).cards;
  const data = {
    covered: true, code, name: label(place, lang), name_en: place.en, name_ko: place.ko, documents: place.n, headline,
    windows: w.map((x, i) => ({ period: wins[i], studied: x.s, written: x.w, writers_domestic: x.dom, writers_foreign: x.for, writers_international: x.intl, writers_unknown: x.unk,
      outside_share_pct: x.out == null ? null : +(x.out * 100).toFixed(1) })),
    top_topics: nn((w[0]?.topics ?? []).slice(0, 5).map(([id, n, r]) => { const x = names.get(id); return x ? { slug: x.slug, label: label(x, lang), documents: n, ratio_to_world: r } : null; })),
    writers: nn((w[0]?.orgs ?? []).slice(0, 10).map(([id, n, tag]) => { const x = names.get(id); return x ? { slug: x.slug, label: label(x, lang), documents: n, where: ({ dom: 'domestic', for: 'foreign', intl: 'international', unk: 'location unknown' } as Record<string, string>)[tag] ?? tag } : null; })),
    newest: docBriefs(newest, lang),
    links: [{ label: `Documents about ${place.en}`, page: nodePage(lang, place) }, { label: 'Its panel on the map of economies', page: `/${lang}/m?c=${code}` }],
    basis: 'Studied: documents about the economy. Written: documents by organisations headquartered there (publisher, authors\' affiliations, speaker\'s institution). Periods by date published, counted back from the latest received date.',
  };
  const out = w[0]?.out != null ? `; ${(w[0].out * 100).toFixed(1)}% of the documents about it with known writers come from foreign or international organisations` : '';
  const summary = `${place.en} (${code}) in the open-research atlas, release ${m.surface.release}: ${fmt(place.n)} documents study it${w[2] ? ` (${fmt(w[2].s)} published in the 24 months to ${m.ref})` : ''}${w[0] ? `, and organisations based there wrote ${fmt(w[0].w)}` : ''}${out}.`;
  return envelope('economy', nodePage(lang, place), summary, data, { sources: sourcesOf(newest) });
}

/** GET /svc/v1/economies: the places with ISO 3166-1 alpha-3 codes. */
export function economiesHook(lang: Lang) {
  const rows = findNodes('', 'place', 400, 0).rows.filter((n) => /^[A-Z]{3}$/.test(n.slug));
  const economies = rows.map((n) => ({ code: n.slug, name: label(n, lang), documents: n.n, page: nodePage(lang, n) }));
  return envelope('economies', `/${lang}/m`, `${economies.length} economies with ISO 3166-1 alpha-3 codes have a place page in the open-research atlas, release ${release()}; the most studied is ${rows[0]?.en ?? '–'} (${fmt(rows[0]?.n ?? 0)} documents).`, { economies });
}

