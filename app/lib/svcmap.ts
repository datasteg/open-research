// What /svc/v1 may say about a document: an explicit allow-list (rules O2, O3, O7, O8; the datasteg API's service contract).
// Every output field is named here one by one, from the profile card (types.ts Card): titles, people as published,
// links to the publisher, the model's summary marked model only, keyword labels with counts, placements. Nothing else
// on a card, and nothing a future card gains (an abstract, the text, quotes), can leave through a view: a new field has
// to be added here by hand. Keyword labels and names that carry contact details (e-mail, phone, web addresses, which
// the model sometimes copies from a title page) are withheld (O7). Pure, with type imports only, so
// `node --test tests/svc-o2.test.mjs` runs it without Next.
import type { Card, Lang, NodeLite } from './types';

export const SITE = 'https://open-research.datasteg.com';
const KIND_PATH: Record<string, string> = { grove: 'g', topic: 't', concept: 'k', jel: 'jel', org: 'o', person: 'a', place: 'c' };
export const nodePage = (lang: Lang, n: { kind: string; slug: string }) => `/${lang}/${KIND_PATH[n.kind] ?? 'k'}/${encodeURIComponent(n.slug)}`;
export const docPage = (lang: Lang, slug: string) => `/${lang}/p/${encodeURIComponent(slug)}`;
export const label = (n: { en: string; ko: string | null }, lang: Lang) => (lang === 'ko' && n.ko ? n.ko : n.en);

/** Keys no /svc/v1 answer may carry anywhere (the O2 test walks every answer); only the item hook's Markdown `text` is exempt. */
export const FORBIDDEN_KEYS = ['abstract', 'abstracts', 'text', 'body', 'full_text', 'fulltext', 'content', 'contents', 'quote', 'quotes',
  'sentence', 'sentences', 'excerpt', 'excerpts', 'passage', 'passages', 'figure', 'figures', 'html', 'pdf', 'raw', 'email', 'phone'];

const CONTACT = /[\w.+-]+@[\w-]+\.[\w.-]+|https?:\/\/|\bwww\.|\b(?:tel|fax|phone)\b\s*[.:]|\+\d[\d ()-]{7,}\d/i;
/** An e-mail address, phone number or web address: contact details are never shown (O7). */
export const isContact = (s: string | null | undefined) => !!s && CONTACT.test(s);

/** Series whose numbers the page hides (internal ids), and the prefixes it strips. */
const HIDE_NUMBER = new Set(['cb_reshub', 'bis_cbspeeches']);
const cleanNumber = (c: Pick<Card, 'number' | 'unit'>) => (c.number && !HIDE_NUMBER.has(c.unit) ? c.number.replace(/^(publ|publications|review|events)_/, '') : null);

export interface Ctx {
  lang: Lang;
  /** every node id the card names (lookup()) */
  names: Map<number, NodeLite>;
  /** a unit id → its series name, as the page prints it */
  unit: (u: string) => string;
  /** a topic id → its grove */
  grove: (topicId: number) => { slug: string; en: string; ko: string } | undefined;
  release: string;
}

type Ref = { slug: string; label: string };
const ref = (n: NodeLite | undefined, lang: Lang): Ref | null => (n ? { slug: n.slug, label: label(n, lang) } : null);
const refPage = (n: NodeLite | undefined, lang: Lang) => (n ? { slug: n.slug, label: label(n, lang), page: nodePage(lang, n) } : null);

/** A speech lists its speaker as an author too: one name, once (the speaker role wins), as the page does. */
const authorsOf = (c: Card) => c.authors.filter((a) => a.name !== c.speaker?.name && !isContact(a.name));

export interface DocItem {
  slug: string; title: string; kind: string; date: string | null; series: string; number: string | null;
  publisher: Ref | null; institution: string | null; authors: string[]; authors_total: number; speaker: string | null;
  topics: Ref[]; jel_stated: string[]; jel_inferred?: { codes: string[]; model_only: true };
  url: string | null; pdf_url?: string; page: string;
}

/** One line of a document list (the search overlay, a node page, New): metadata and links only. */
export function docItem(c: Card, ctx: Ctx): DocItem {
  const N = (id: number | null | undefined) => (id != null ? ctx.names.get(id) : undefined);
  const authors = authorsOf(c).map((a) => a.name);
  const inferred = c.jel_inferred.map(([j]) => N(j)?.slug).filter((x): x is string => !!x);
  const out: DocItem = {
    slug: c.slug, title: c.title, kind: c.kind, date: c.date, series: ctx.unit(c.unit), number: cleanNumber(c),
    publisher: ref(N(c.publisher), ctx.lang), institution: N(c.publisher) ? null : c.institution ?? null,
    authors: authors.slice(0, 12), authors_total: authors.length, speaker: c.speaker && !isContact(c.speaker.name) ? c.speaker.name : null,
    topics: c.topics.slice(0, 3).map(([id]) => ref(N(id), ctx.lang)).filter((x): x is Ref => !!x),
    jel_stated: c.jel_stated.map((j) => N(j)?.slug).filter((x): x is string => !!x),
    url: c.url ?? null, page: docPage(ctx.lang, c.slug),
  };
  if (inferred.length) out.jel_inferred = { codes: inferred, model_only: true };
  if (c.pdf_url) out.pdf_url = c.pdf_url; // the publisher's own PDF link, shown on the page; no PDF is hosted (O2)
  return out;
}

export interface DocBrief {
  slug: string; title: string; kind: string; date: string | null; series: string; number: string | null;
  authors: string[]; authors_total: number; topic: Ref | null; url: string | null; page: string;
}

/** A shorter line for the lists nested in a node, the New list and an economy: who, what, when, where to read it. */
export function docBrief(c: Card, ctx: Ctx): DocBrief {
  const N = (id: number | null | undefined) => (id != null ? ctx.names.get(id) : undefined);
  const names = [...(c.speaker && !isContact(c.speaker.name) ? [c.speaker.name] : []), ...authorsOf(c).map((a) => a.name)];
  return {
    slug: c.slug, title: c.title, kind: c.kind, date: c.date, series: ctx.unit(c.unit), number: cleanNumber(c),
    authors: names.slice(0, 3), authors_total: names.length, topic: c.topics[0] ? ref(N(c.topics[0][0]), ctx.lang) : null,
    url: c.url ?? null, page: docPage(ctx.lang, c.slug),
  };
}

const TEXT_SOURCE: Record<string, string> = { 'text layer': 'the PDF text layer' };
const SAL = ['core', 'major', 'minor'];

/** The document page as data: every field below is on /<lang>/p/<slug>, and nothing else. */
export function docCard(c: Card, ctx: Ctx) {
  const { lang } = ctx;
  const N = (id: number | null | undefined) => (id != null ? ctx.names.get(id) : undefined);
  const kws = c.keywords.filter((k) => !isContact(k.label));
  const people = [
    ...(c.speaker && !isContact(c.speaker.name) ? [{ name: c.speaker.name, role: 'speaker', person: refPage(N(c.speaker.p), lang), mark: 'found' }] : []),
    ...authorsOf(c).map((a) => ({ name: a.name, role: 'author', person: refPage(N(a.p), lang), mark: 'found' })),
  ];
  const stated = new Set(c.jel_stated);
  return {
    slug: c.slug, title: c.title, kind: c.kind, date: c.date, received: c.received, family: c.family,
    series: ctx.unit(c.unit), number: cleanNumber(c), institution: c.institution ?? null,
    publisher: refPage(N(c.publisher), lang),
    url: c.url ?? null, ...(c.pdf_url ? { pdf_url: c.pdf_url } : {}),
    people,
    organisations: c.org_names.filter(([name]) => !isContact(name)).map(([name, role, found]) => {
      const o = c.orgs.find((x) => x[1] === role && N(x[0])?.en === name);
      return { name, role, organisation: refPage(o ? N(o[0]) : undefined, lang), mark: found ? 'found' : 'model only', ...(found ? {} : { model_only: true as const }) };
    }),
    also_named: c.people.filter((p) => !isContact(p.name)).map((p) => ({ name: p.name, role: p.role, mark: p.found ? 'found' : 'model only', ...(p.found ? {} : { model_only: true as const }) })),
    places: c.places.map((id) => N(id)).filter((n): n is NodeLite => !!n).map((n) => ({ code: n.slug, label: label(n, lang), page: nodePage(lang, n) })),
    period_studied: c.period?.from ? { from: c.period.from, to: c.period.to ?? c.period.from } : null,
    topics: c.topics.map(([id, score], i) => {
      const n = N(id);
      const g = ctx.grove(id);
      return n ? { slug: n.slug, label: label(n, lang), page: nodePage(lang, n), grove: g ? { slug: g.slug, label: lang === 'ko' && g.ko ? g.ko : g.en } : null, placement_score: score, primary: i === 0 } : null;
    }).filter((x) => !!x),
    jel_stated: c.jel_stated.map((j) => N(j)).filter((n): n is NodeLite => !!n).map((n) => ({ code: n.slug, label: label(n, lang) })),
    jel_inferred: c.jel_inferred.map(([j, conf]) => [N(j), conf] as const).filter((x): x is readonly [NodeLite, number] => !!x[0])
      .map(([n, conf]) => ({ code: n.slug, label: label(n, lang), confidence: conf, also_stated: stated.has(n.id), model_only: true as const })),
    jel_agree: c.jel_stated.length ? c.jel_agree ?? null : null,
    summary: c.summary ? { en: c.summary, model_only: true as const, note: 'One sentence written by a language model from the text. Do not quote it; check the document.' } : null,
    keywords: kws.map((k) => ({
      label: k.label, salience: SAL.includes(k.sal) ? k.sal : 'minor', kind: k.kind, occurrences: k.n ?? null, located: k.located,
      concept: k.c != null && N(k.c) ? { slug: N(k.c)!.slug, page: nodePage(lang, N(k.c)!) } : null,
    })),
    keywords_located: kws.filter((k) => k.located).length,
    keywords_withheld: c.keywords.length - kws.length,
    provenance: {
      profile_card: 'written by a language model',
      text_read_from: c.prov?.text_source ? TEXT_SOURCE[c.prov.text_source] ?? c.prov.text_source : null,
      published: c.date, received: c.received, atlas_release: ctx.release,
    },
    page: docPage(lang, c.slug),
  };
}
export type DocCard = ReturnType<typeof docCard>;

/** The card as readable Markdown, built from docCard()'s output only (so it cannot say more than the allow-list). */
export function cardMarkdown(d: DocCard): string {
  const L: string[] = [];
  const site = (p: string) => `${SITE}${p}`;
  L.push(`# ${d.title}`, '');
  L.push([d.kind, d.series + (d.number ? ` ${d.number}` : ''), d.date ? `published ${d.date}` : null].filter(Boolean).join(' · '));
  if (d.people.length) L.push('', `**Authors and speaker:** ${d.people.map((p) => (p.person ? `[${p.name}](${site(p.person.page)})` : p.name) + (p.role === 'speaker' ? ' (speaker)' : '')).join(', ')}`);
  if (d.publisher || d.institution) L.push('', `**Publisher:** ${d.publisher ? `[${d.publisher.label}](${site(d.publisher.page)})` : d.institution}`);
  if (d.url) L.push('', `**Publisher's page:** ${d.url}`);
  if ('pdf_url' in d && d.pdf_url) L.push('', `**Publisher's PDF:** ${d.pdf_url}`);
  L.push('', '## Where it sits in the atlas');
  if (d.topics.length) for (const t of d.topics) L.push(`- Topic: ${t!.grove ? `${t!.grove.label} › ` : ''}[${t!.label}](${site(t!.page)}) (placement score ${t!.placement_score}${t!.primary ? ', primary' : ''})`);
  else L.push('- Not placed in a topic yet');
  if (d.jel_stated.length) L.push(`- JEL stated by the publisher: ${d.jel_stated.map((j) => `${j.code} ${j.label}`).join('; ')}`);
  if (d.jel_inferred.length) L.push(`- JEL inferred by the model (model only): ${d.jel_inferred.map((j) => `${j.code} (${j.confidence})`).join(', ')}`);
  if (d.summary) L.push('', '## Summary (model only)', '', `${d.summary.en}`, '', `_${d.summary.note}_`);
  if (d.keywords.length) {
    L.push('', `## Keywords (${d.keywords_located} of ${d.keywords.length} located in the text)`);
    for (const s of SAL) {
      const ks = d.keywords.filter((k) => k.salience === s);
      if (ks.length) L.push(`- ${s}: ${ks.map((k) => `${k.label}${k.occurrences ? ` ×${k.occurrences}` : ''}${k.kind !== 'topic' ? ` (${k.kind})` : ''}${k.located ? '' : ' (no sentence)'}`).join('; ')}`);
    }
  }
  if (d.organisations.length || d.also_named.length) {
    L.push('', '## People and organisations');
    for (const o of d.organisations) L.push(`- ${o.organisation ? `[${o.organisation.label}](${site(o.organisation.page)})` : o.name} · ${o.role} · ${o.mark}`);
    for (const p of d.also_named) L.push(`- Also named: ${p.name} · ${p.role} · ${p.mark}`);
  }
  if (d.places.length || d.period_studied) {
    L.push('', '## Places and period');
    if (d.places.length) L.push(`- Places: ${d.places.map((p) => `[${p.label}](${site(p.page)})`).join(', ')}`);
    if (d.period_studied) L.push(`- Period studied: ${d.period_studied.from}${d.period_studied.to !== d.period_studied.from ? `–${d.period_studied.to}` : ''}`);
  }
  L.push('', '## Provenance', `Profile card ${d.provenance.profile_card}; text read from ${d.provenance.text_read_from ?? '–'}. Published ${d.provenance.published ?? '–'}, received ${d.provenance.received ?? '–'}, atlas release ${d.provenance.atlas_release}.`);
  L.push('', `Metadata and links only: the document itself is on the publisher's site. Atlas page: ${site(d.page)}`);
  return L.join('\n').slice(0, 20000);
}
