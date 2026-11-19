// The atlas, read from DATA_DIR/atlas.sqlite (written by scripts/build.py from the research archive's atlas export). Read-only,
// opened once per server process with node:sqlite; page summaries and paper records are brotli JSON blobs.
import { DatabaseSync } from 'node:sqlite';
import { brotliDecompressSync } from 'node:zlib';
import path from 'node:path';
import type { Card, Meta, NodeLite, NodePage, Row } from './types';

let db: DatabaseSync | null = null;
let metaCache: Meta | null = null;

function open(): DatabaseSync {
  if (!db) {
    const dir = process.env.DATA_DIR ?? path.join(process.cwd(), '..', 'data');
    db = new DatabaseSync(path.join(dir, 'atlas.sqlite'), { readOnly: true });
  }
  return db;
}

const un = <T,>(b: unknown): T => JSON.parse(brotliDecompressSync(b as Uint8Array).toString('utf8')) as T;

export function meta(): Meta {
  if (!metaCache) {
    const r = open().prepare('SELECT v FROM meta WHERE k = ?').get('meta') as { v: string };
    metaCache = JSON.parse(r.v) as Meta;
  }
  return metaCache;
}

type NodeRow = { id: number; kind: string; slug: string; en: string; ko: string | null; parent: number | null; n: number; sub?: string | null };

export function node(kind: string, slug: string): NodePage | null {
  const r = open().prepare('SELECT id, kind, slug, en, ko, parent, n, sub, page FROM nodes WHERE kind = ? AND slug = ?').get(kind, slug) as (NodeRow & { page: Uint8Array }) | undefined;
  if (!r) return null;
  const { page, ...rest } = r;
  return { ...rest, page: un(page) };
}

export function nodeById(id: number): NodePage | null {
  const r = open().prepare('SELECT id, kind, slug, en, ko, parent, n, sub, page FROM nodes WHERE id = ?').get(id) as (NodeRow & { page: Uint8Array }) | undefined;
  if (!r) return null;
  const { page, ...rest } = r;
  return { ...rest, page: un(page) };
}

/** id → {kind, slug, labels, count} for every id named on a page. */
export function lookup(ids: Iterable<number | null | undefined>): Map<number, NodeLite> {
  const list = [...new Set([...ids].filter((x): x is number => typeof x === 'number'))];
  const out = new Map<number, NodeLite>();
  for (let i = 0; i < list.length; i += 400) {
    const part = list.slice(i, i + 400);
    const rows = open().prepare(`SELECT id, kind, slug, en, ko, parent, n, sub FROM nodes WHERE id IN (${part.map(() => '?').join(',')})`).all(...part) as NodeRow[];
    for (const r of rows) out.set(r.id, r);
  }
  return out;
}

export function nodesOfKind(kind: string, limit = 500, offset = 0): NodeLite[] {
  return open().prepare('SELECT id, kind, slug, en, ko, parent, n, sub FROM nodes WHERE kind = ? ORDER BY n DESC, en LIMIT ? OFFSET ?').all(kind, limit, offset) as NodeRow[];
}

export function nodesOfSub(kind: string, sub: string, limit = 200, offset = 0): NodeLite[] {
  return open().prepare('SELECT id, kind, slug, en, ko, parent, n, sub FROM nodes WHERE kind = ? AND sub = ? ORDER BY n DESC, en LIMIT ? OFFSET ?').all(kind, sub, limit, offset) as NodeRow[];
}

export function subCounts(kind: string): Record<string, number> {
  const rows = open().prepare('SELECT sub, count(*) AS c FROM nodes WHERE kind = ? GROUP BY sub').all(kind) as { sub: string; c: number }[];
  return Object.fromEntries(rows.map((r) => [r.sub ?? '', r.c]));
}

export function countKind(kind: string): number {
  return (open().prepare('SELECT count(*) AS c FROM nodes WHERE kind = ?').get(kind) as { c: number }).c;
}

export function nodesByLetter(kind: string, letter: string, limit = 400): NodeLite[] {
  return open().prepare('SELECT id, kind, slug, en, ko, parent, n, sub FROM nodes WHERE kind = ? AND upper(substr(en, 1, 1)) = ? ORDER BY en LIMIT ?').all(kind, letter, limit) as NodeRow[];
}

const kindFilter = (kind?: string) => (kind ? ' AND d.kind = ?' : '');

/** The documents of a node, newest first. `r` 0 = primary or stated only. */
export function docsOf(nodeId: number, opts: { limit?: number; offset?: number; kind?: string; primary?: boolean } = {}): { rows: Row[]; total: number } {
  const { limit = 50, offset = 0, kind, primary } = opts;
  const where = `dn.node = ?${primary ? ' AND dn.r = 0' : ''}${kindFilter(kind)}`;
  const args: (string | number)[] = [nodeId, ...(kind ? [kind] : [])];
  const rows = open().prepare(`SELECT d.row FROM dn JOIN docs d ON d.idx = dn.idx WHERE ${where} ORDER BY dn.date DESC, dn.idx DESC LIMIT ? OFFSET ?`).all(...args, limit, offset) as { row: Uint8Array }[];
  const total = (open().prepare(`SELECT count(*) AS c FROM dn JOIN docs d ON d.idx = dn.idx WHERE ${where}`).get(...args) as { c: number }).c;
  return { rows: rows.map((r) => un<Row>(r.row)), total };
}

export function kindsOf(nodeId: number): Record<string, number> {
  const rows = open().prepare('SELECT d.kind AS k, count(*) AS c FROM dn JOIN docs d ON d.idx = dn.idx WHERE dn.node = ? GROUP BY d.kind').all(nodeId) as { k: string; c: number }[];
  return Object.fromEntries(rows.map((r) => [r.k, r.c]));
}

export function card(slug: string): Card | null {
  const r = open().prepare('SELECT card FROM docs WHERE slug = ?').get(slug) as { card: Uint8Array } | undefined;
  return r ? un<Card>(r.card) : null;
}

export function received(limit = 50, offset = 0, since?: string): { rows: Row[]; received: string[] } {
  const rows = (since
    ? open().prepare('SELECT row, received FROM docs WHERE received >= ? ORDER BY received DESC, idx DESC LIMIT ? OFFSET ?').all(since, limit, offset)
    : open().prepare('SELECT row, received FROM docs ORDER BY received DESC, idx DESC LIMIT ? OFFSET ?').all(limit, offset)) as { row: Uint8Array; received: string }[];
  return { rows: rows.map((r) => un<Row>(r.row)), received: rows.map((r) => r.received) };
}

export function countReceivedSince(since: string): number {
  return (open().prepare('SELECT count(*) AS c FROM docs WHERE received >= ?').get(since) as { c: number }).c;
}

export function redirect(kind: string, slug: string): { kind: string; slug: string } | null {
  const r = open().prepare('SELECT to_kind, to_slug FROM redirects WHERE kind = ? AND slug = ?').get(kind, slug) as { to_kind: string | null; to_slug: string | null } | undefined;
  return r && r.to_kind && r.to_slug ? { kind: r.to_kind, slug: r.to_slug } : null;
}

/** FTS5 query from free text: every word as a quoted prefix term, all required. */
function ftsQuery(q: string): string | null {
  const words = q.normalize('NFKC').match(/[\p{L}\p{N}]+/gu)?.slice(0, 8) ?? [];
  return words.length ? words.map((w) => `"${w}"*`).join(' ') : null;
}

export function search(q: string, limit = 40): { nodes: NodeLite[]; rows: Row[]; total: number } {
  const m = ftsQuery(q);
  if (!m) return { nodes: [], rows: [], total: 0 };
  try {
    const nodes = open().prepare(`SELECT n.id, n.kind, n.slug, n.en, n.ko, n.parent, n.n, n.sub FROM nodes_fts f JOIN nodes n ON n.id = f.rowid
      WHERE nodes_fts MATCH ? ORDER BY bm25(nodes_fts) - ln(1 + n.n) * 0.5 LIMIT 24`).all(m) as NodeRow[];
    const rows = open().prepare(`SELECT d.row FROM docs_fts f JOIN docs d ON d.idx = f.rowid WHERE docs_fts MATCH ?
      ORDER BY bm25(docs_fts, 4.0, 2.0, 1.0) LIMIT ?`).all(m, limit) as { row: Uint8Array }[];
    const total = (open().prepare('SELECT count(*) AS c FROM docs_fts WHERE docs_fts MATCH ?').get(m) as { c: number }).c;
    return { nodes, rows: rows.map((r) => un<Row>(r.row)), total };
  } catch {
    return { nodes: [], rows: [], total: 0 };
  }
}

// ---------------------------------------------------------------- map (scripts/build.py map_blob)
export interface MapCluster { x: number; y: number; iso: string; city: string | null; cen: string; cko: string | null; n: number; orgs: [number, number, string][] }
export interface MapBlob { w: number; h: number; views?: Record<string, number[]>; land: string; clusters: MapCluster[]; places: { id: number; n: number; x?: number; y?: number; group?: boolean }[]; unplaced: [number, number][]; basis: Record<string, number>; placed: number }
let mapCache: MapBlob | null = null;
export function mapData(): MapBlob {
  if (!mapCache) mapCache = JSON.parse((open().prepare('SELECT v FROM meta WHERE k = ?').get('map') as { v: string }).v) as MapBlob;
  return mapCache;
}

// ---------------------------------------------------------------- near-duplicate concepts (build.py near_duplicates)
/** Method or data concepts, one row per group head (variants hang under it), largest first; `q` filters by label. */
export function conceptHeads(sub: string, q: string, limit: number, offset: number): { rows: NodeLite[]; total: number } {
  const like = `%${q.replace(/[%_]/g, '')}%`;
  const where = `kind = 'concept' AND sub = ? AND id NOT IN (SELECT id FROM dups WHERE id != head)${q ? ' AND (en LIKE ? OR id IN (SELECT head FROM dups d JOIN nodes v ON v.id = d.id WHERE v.en LIKE ?))' : ''}`;
  const args = q ? [sub, like, like] : [sub];
  const rows = open().prepare(`SELECT id, kind, slug, en, ko, parent, n, sub FROM nodes WHERE ${where} ORDER BY n DESC, en LIMIT ? OFFSET ?`).all(...args, limit, offset) as NodeRow[];
  const total = (open().prepare(`SELECT count(*) AS c FROM nodes WHERE ${where}`).get(...args) as { c: number }).c;
  return { rows, total };
}

export function variantsOf(heads: number[]): Map<number, NodeLite[]> {
  const out = new Map<number, NodeLite[]>();
  if (!heads.length) return out;
  const rows = open().prepare(`SELECT d.head AS head, n.id, n.kind, n.slug, n.en, n.ko, n.parent, n.n, n.sub FROM dups d JOIN nodes n ON n.id = d.id
    WHERE d.head IN (${heads.map(() => '?').join(',')}) AND d.id != d.head ORDER BY n.n DESC`).all(...heads) as (NodeRow & { head: number })[];
  for (const { head, ...r } of rows) out.set(head, [...(out.get(head) ?? []), r]);
  return out;
}

export function dupCount(): Record<string, number> {
  const rows = open().prepare('SELECT sub, count(DISTINCT head) AS c FROM dups GROUP BY sub').all() as { sub: string; c: number }[];
  return Object.fromEntries(rows.map((r) => [r.sub, r.c]));
}

/** Topics, groves and concepts (methods and data sources included) whose label matches, for the Topics filter box. */
export function findTopics(q: string, limit = 12): NodeLite[] {
  const m = ftsQuery(q);
  if (!m) return [];
  try {
    return open().prepare(`SELECT n.id, n.kind, n.slug, n.en, n.ko, n.parent, n.n, n.sub FROM nodes_fts f JOIN nodes n ON n.id = f.rowid
      WHERE nodes_fts MATCH ? AND n.kind IN ('grove', 'topic', 'concept')
      ORDER BY CASE n.kind WHEN 'grove' THEN 0 WHEN 'topic' THEN 1 ELSE 2 END, bm25(nodes_fts) - ln(1 + n.n) * 0.6 LIMIT ?`).all(m, limit) as NodeRow[];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------- affiliations (build.py affiliations)
export interface AffGroup { org: number | null; name: string | null; people: number; docs: number }
export function affGroups(limit: number, offset: number): { rows: AffGroup[]; total: number } {
  const rows = open().prepare(`SELECT org, CASE WHEN org IS NULL THEN name END AS name, count(*) AS people, sum(n) AS docs FROM aff
    GROUP BY org, CASE WHEN org IS NULL THEN name END ORDER BY people DESC, docs DESC LIMIT ? OFFSET ?`).all(limit, offset) as unknown as AffGroup[];
  const total = (open().prepare('SELECT count(*) AS c FROM (SELECT 1 FROM aff GROUP BY org, CASE WHEN org IS NULL THEN name END)').get() as { c: number }).c;
  return { rows, total };
}

export function affCounts(): { known: number; tiers: Record<string, number>; people: number } {
  const rows = open().prepare('SELECT tier, count(*) AS c FROM aff JOIN nodes p ON p.id = aff.person GROUP BY tier').all() as { tier: string; c: number }[];
  const tiers = Object.fromEntries(rows.map((r) => [r.tier, r.c]));
  return { tiers, known: rows.reduce((a, r) => a + r.c, 0), people: countKind('person') };
}

/** People whose latest affiliation is `org` (or the unresolved name), or, with neither, people with none known. */
export function peopleOfAff(g: { org?: number; name?: string; unknown?: boolean }, limit: number, offset = 0): { rows: (NodeLite & { year?: number; tier?: string })[]; total: number } {
  const sel = 'SELECT p.id, p.kind, p.slug, p.en, p.ko, p.parent, p.n, p.sub';
  if (g.unknown) {
    const where = "p.kind = 'person' AND p.id NOT IN (SELECT person FROM aff)";
    const rows = open().prepare(`${sel} FROM nodes p WHERE ${where} ORDER BY p.n DESC, p.en LIMIT ? OFFSET ?`).all(limit, offset) as NodeRow[];
    return { rows, total: (open().prepare(`SELECT count(*) AS c FROM nodes p WHERE ${where}`).get() as { c: number }).c };
  }
  const where = g.org != null ? 'a.org = ?' : 'a.org IS NULL AND a.name = ?';
  const arg = g.org ?? g.name ?? '';
  const rows = open().prepare(`${sel}, a.year, a.tier FROM aff a JOIN nodes p ON p.id = a.person WHERE ${where} ORDER BY p.n DESC, p.en LIMIT ? OFFSET ?`).all(arg, limit, offset) as (NodeRow & { year: number; tier: string })[];
  return { rows, total: (open().prepare(`SELECT count(*) AS c FROM aff a JOIN nodes p ON p.id = a.person WHERE ${where}`).get(arg) as { c: number }).c };
}

/** The top people of several affiliation groups at once, for the grouped view. */
export function topPeopleOfOrgs(orgs: number[], per: number): Map<number, NodeLite[]> {
  const out = new Map<number, NodeLite[]>();
  if (!orgs.length) return out;
  const rows = open().prepare(`SELECT org, id, kind, slug, en, ko, parent, n, sub FROM (
      SELECT a.org, p.id, p.kind, p.slug, p.en, p.ko, p.parent, p.n, p.sub, row_number() OVER (PARTITION BY a.org ORDER BY p.n DESC, p.en) AS rk FROM aff a JOIN nodes p ON p.id = a.person
      WHERE a.org IN (${orgs.map(() => '?').join(',')})) WHERE rk <= ?`).all(...orgs, per) as (NodeRow & { org: number })[];
  for (const { org, ...r } of rows) out.set(org, [...(out.get(org) ?? []), r]);
  for (const v of out.values()) v.sort((a, b) => b.n - a.n);
  return out;
}

// ---------------------------------------------------------------- review 2 (build.py review2_stats, tiles_blob, people_index)
export interface Tile { iso: string; c: number; r: number; slug: string | null; en: string; ko: string | null; z: string[]; m: [number, number, number | null][] }
let tilesCache: Tile[] | null = null;
export function tiles(): Tile[] {
  if (!tilesCache) tilesCache = JSON.parse((open().prepare('SELECT v FROM meta WHERE k = ?').get('tiles') as { v: string }).v) as Tile[];
  return tilesCache;
}

export interface EconWin { s: number; w: number; dom: number; for: number; intl: number; unk: number; out: number | null; orgs: [number, number, string][]; topics: [number, number, number | null][] }
export interface Econ { win: EconWin[]; auth: [number, number][]; years: Record<string, [number, number]> }
export function econ(iso: string): Econ | null {
  const r = open().prepare('SELECT data FROM econ WHERE iso = ?').get(iso) as { data: Uint8Array } | undefined;
  return r ? un<Econ>(r.data) : null;
}

const pindexCache = new Map<string, string>();
/** The People search index as JSON text (build.py people_index), per page language. */
export function peopleIndex(lang: string): string {
  if (!pindexCache.has(lang)) pindexCache.set(lang, (open().prepare('SELECT v FROM meta WHERE k = ?').get(`pindex_${lang === 'ko' ? 'ko' : 'en'}`) as { v: string }).v);
  return pindexCache.get(lang)!;
}

/** People by documents in the last 24 months (by date published, counted back from the latest received date). */
export function mostActive(limit: number): (NodeLite & { n24: number })[] {
  return open().prepare(`SELECT p.id, p.kind, p.slug, p.en, p.ko, p.parent, p.n, p.sub, s.n24 FROM pstats s JOIN nodes p ON p.id = s.person
    ORDER BY s.n24 DESC, p.n DESC LIMIT ?`).all(limit) as (NodeRow & { n24: number })[];
}

export function personStats(id: number): { n: number; n24: number; sp: number } | null {
  return (open().prepare('SELECT n, n24, sp FROM pstats WHERE person = ?').get(id) as { n: number; n24: number; sp: number } | undefined) ?? null;
}

// ---------------------------------------------------------------- New: the chart and the list read the same filters
export interface NewQuery { by: 'received' | 'published'; range: number; fam: string[]; unit: string; kind: string; backfill: boolean; day: string }
export interface NewRow extends Row { rc: string; g: string; lg: string; bf: number; langs?: string[] }

function newWhere(q: NewQuery, end: string, withDay = true): { sql: string; args: (string | number)[]; col: string } {
  const col = q.by === 'published' ? 'date' : 'received';
  const start = new Date(Date.parse(end) - (q.range - 1) * 864e5).toISOString().slice(0, 10);
  const parts = [`${col} >= ?`, `${col} <= ?`, `length(${col}) >= 10`];
  const args: (string | number)[] = [start, `${end}~`];
  if (q.fam.length) { parts.push(`family IN (${q.fam.map(() => '?').join(',')})`); args.push(...q.fam); }
  if (q.unit) { parts.push('unit = ?'); args.push(q.unit); }
  if (q.kind) { parts.push('kind = ?'); args.push(q.kind); }
  if (!q.backfill) parts.push('bf = 0');
  if (withDay && q.day) { parts.push(`substr(${col}, 1, 10) = ?`); args.push(q.day); }
  return { sql: parts.join(' AND '), args, col };
}

/** Documents a day by publisher family over the window (the chart), the sources and kinds in it (the filters). */
export function newSeries(q: NewQuery, end: string) {
  const w = newWhere(q, end, false);
  const rows = open().prepare(`SELECT substr(${w.col}, 1, 10) AS d, family AS f, count(*) AS c FROM docs WHERE ${w.sql} GROUP BY d, f`).all(...w.args) as { d: string; f: string; c: number }[];
  const units = open().prepare(`SELECT unit AS u, count(*) AS c FROM docs WHERE ${newWhere({ ...q, unit: '' }, end, false).sql} GROUP BY unit ORDER BY c DESC`).all(...newWhere({ ...q, unit: '' }, end, false).args) as { u: string; c: number }[];
  const kinds = open().prepare(`SELECT kind AS k, count(*) AS c FROM docs WHERE ${newWhere({ ...q, kind: '' }, end, false).sql} GROUP BY kind ORDER BY c DESC`).all(...newWhere({ ...q, kind: '' }, end, false).args) as { k: string; c: number }[];
  const bfw = newWhere({ ...q, backfill: true }, end, false);
  const backfill = (open().prepare(`SELECT count(*) AS c FROM docs WHERE ${bfw.sql} AND bf = 1`).get(...bfw.args) as { c: number }).c;
  return { days: rows, units, kinds, backfill };
}

/** The list: whole days, newest first, from `before` (exclusive) until at least `min` rows. */
export function newRows(q: NewQuery, end: string, before: string | null, min = 60): { rows: NewRow[]; next: string | null } {
  const w = newWhere(q, end);
  const b = before ? ` AND substr(${w.col}, 1, 10) < ?` : '';
  const args = before ? [...w.args, before] : w.args;
  // the last day to include: the day of the min-th row (whole days only)
  const cut = open().prepare(`SELECT substr(${w.col}, 1, 10) AS d FROM docs WHERE ${w.sql}${b} ORDER BY ${w.col} DESC, idx DESC LIMIT 1 OFFSET ?`).get(...args, min - 1) as { d: string } | undefined;
  const lim = cut ? ` AND substr(${w.col}, 1, 10) >= ?` : '';
  const rows = open().prepare(`SELECT row, received, grp, lang, bf, substr(${w.col}, 1, 10) AS day FROM docs WHERE ${w.sql}${b}${lim} ORDER BY ${w.col} DESC, idx DESC LIMIT 2000`)
    .all(...args, ...(cut ? [cut.d] : [])) as { row: Uint8Array; received: string; grp: string; lang: string; bf: number; day: string }[];
  const out = rows.map((r) => ({ ...un<Row>(r.row), rc: r.received, g: r.grp, lg: r.lang, bf: r.bf }));
  let next: string | null = null;
  if (cut) {
    const more = open().prepare(`SELECT 1 FROM docs WHERE ${w.sql} AND substr(${w.col}, 1, 10) < ? LIMIT 1`).get(...w.args, cut.d);
    next = more ? cut.d : null;
  }
  return { rows: out, next };
}

// ---------------------------------------------------------------- /svc/v1 views (lib/svcviews.ts, the datasteg API's service contract)
export function nodeLite(kind: string, slug: string): NodeLite | null {
  return (open().prepare('SELECT id, kind, slug, en, ko, parent, n, sub FROM nodes WHERE kind = ? AND slug = ?').get(kind, slug) as NodeRow | undefined) ?? null;
}

/**
 * Nodes by label (the search's node ranking), of one kind or all; without a query, one kind by documents, JEL codes in
 * code order and people A–Z (rule O7: no rankings of people).
 */
export function findNodes(q: string, kind: string | null, limit: number, offset: number): { rows: NodeLite[]; total: number } {
  const sel = 'SELECT n.id, n.kind, n.slug, n.en, n.ko, n.parent, n.n, n.sub';
  if (q) {
    const m = ftsQuery(q);
    if (!m) return { rows: [], total: 0 };
    const kf = kind ? ' AND n.kind = ?' : '';
    const args = kind ? [m, kind] : [m];
    try {
      const rows = open().prepare(`${sel} FROM nodes_fts f JOIN nodes n ON n.id = f.rowid WHERE nodes_fts MATCH ?${kf}
        ORDER BY bm25(nodes_fts) - ln(1 + n.n) * 0.5 LIMIT ? OFFSET ?`).all(...args, limit, offset) as NodeRow[];
      const total = (open().prepare(`SELECT count(*) AS c FROM nodes_fts f JOIN nodes n ON n.id = f.rowid WHERE nodes_fts MATCH ?${kf}`).get(...args) as { c: number }).c;
      return { rows, total };
    } catch {
      return { rows: [], total: 0 };
    }
  }
  if (!kind) return { rows: [], total: 0 };
  const order = kind === 'person' ? 'n.en, n.id' : kind === 'jel' ? 'n.slug' : 'n.n DESC, n.en';
  // near-duplicate concepts hang under their group head, as on the Topics page (conceptHeads)
  const where = `n.kind = ?${kind === 'concept' ? ' AND n.id NOT IN (SELECT id FROM dups WHERE id != head)' : ''}`;
  const rows = open().prepare(`${sel} FROM nodes n WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`).all(kind, limit, offset) as NodeRow[];
  return { rows, total: (open().prepare(`SELECT count(*) AS c FROM nodes n WHERE ${where}`).get(kind) as { c: number }).c };
}

/** The group head of a near-duplicate concept (build.py near_duplicates), or null for a head or a concept in no group. */
export function dupHead(id: number): NodeLite | null {
  return (open().prepare('SELECT n.id, n.kind, n.slug, n.en, n.ko, n.parent, n.n, n.sub FROM dups d JOIN nodes n ON n.id = d.head WHERE d.id = ? AND d.head != d.id').get(id) as NodeRow | undefined) ?? null;
}

export interface DocQuery { q?: string; kind?: string; nodes?: number[]; from?: string; to?: string }

/**
 * The cards of the documents matching a query and filters: by FTS5 relevance with a query (the search page's ranking),
 * newest first without (a node page's order). `nodes` are ANDed; pass the most selective first.
 */
export function findDocs(f: DocQuery, limit: number, offset: number): { cards: Card[]; total: number } {
  const m = f.q ? ftsQuery(f.q) : null;
  if (f.q && !m) return { cards: [], total: 0 };
  const nodes = [...(f.nodes ?? [])];
  const parts: string[] = [];
  const args: (string | number)[] = [];
  if (f.kind) { parts.push('d.kind = ?'); args.push(f.kind); }
  if (f.from) { parts.push('d.date >= ?'); args.push(f.from); }
  if (f.to) { parts.push('d.date <= ?'); args.push(`${f.to}~`); }
  let pre = '', from = 'docs d', order = 'd.date DESC, d.idx DESC', idx = 'd.idx';
  const head: (string | number)[] = [];
  if (m) {
    // the matches first (MATERIALIZED): node:sqlite's planner would otherwise probe the FTS index once per filtered row
    pre = 'WITH m AS MATERIALIZED (SELECT rowid AS idx, bm25(docs_fts, 4.0, 2.0, 1.0) AS s FROM docs_fts WHERE docs_fts MATCH ?) ';
    from = 'm JOIN docs d ON d.idx = m.idx'; order = 'm.s'; idx = 'm.idx'; head.push(m);
  } else if (nodes.length) {
    from = 'dn JOIN docs d ON d.idx = dn.idx'; order = 'dn.date DESC, dn.idx DESC';
    parts.unshift('dn.node = ?'); head.push(nodes.shift()!);
  }
  for (const id of nodes) { parts.push(`${idx} IN (SELECT idx FROM dn WHERE node = ?)`); args.push(id); }
  const where = parts.length ? ` WHERE ${parts.join(' AND ')}` : '';
  const all = [...head, ...args];
  try {
    const rows = open().prepare(`${pre}SELECT d.card FROM ${from}${where} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...all, limit, offset) as { card: Uint8Array }[];
    const total = (open().prepare(`${pre}SELECT count(*) AS c FROM ${from}${where}`).get(...all) as { c: number }).c;
    return { cards: rows.map((r) => un<Card>(r.card)), total };
  } catch {
    return { cards: [], total: 0 };
  }
}

export function cardsOf(slugs: string[]): Map<string, Card> {
  const out = new Map<string, Card>();
  for (let i = 0; i < slugs.length; i += 400) {
    const part = slugs.slice(i, i + 400);
    if (!part.length) continue;
    const rows = open().prepare(`SELECT slug, card FROM docs WHERE slug IN (${part.map(() => '?').join(',')})`).all(...part) as { slug: string; card: Uint8Array }[];
    for (const r of rows) out.set(r.slug, un<Card>(r.card));
  }
  return out;
}
