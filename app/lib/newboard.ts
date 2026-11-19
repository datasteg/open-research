// The New page's data, shared by the page (first paint) and /<lang>/new/data (every filter change, "Load more").
import { lookup, meta, newRows, newSeries, type NewQuery } from './db';
import { label } from './i18n';
import type { Fam, Lang } from './types';

export const RANGES = [30, 90, 365];
export const FAMS_ALL: Fam[] = ['cb', 'bis', 'io', 'acad'];

export interface NewItem { s: string; t: string; d: string | null; rc: string; day: string; k: string; f: Fam; u: string; no: string | null; a: string[]; an: number; tp: string | null; g: string; langs: string[]; bf: number }
export interface NewPayload { end: string; q: NewQuery; days: [string, number, number, number, number][]; units: [string, number][]; kinds: [string, number][]; backfill: number; items: NewItem[]; next: string | null }

/** Query string → filters; unknown values fall back to the defaults (received, 30 days, backfill hidden). */
export function parseNew(sp: Record<string, string | undefined>): NewQuery {
  const range = Number(sp.range);
  const fam = (sp.fam ?? '').split(',').filter((f): f is Fam => (FAMS_ALL as string[]).includes(f));
  return {
    by: sp.by === 'published' ? 'published' : 'received',
    range: RANGES.includes(range) ? range : 30,
    fam, unit: /^[a-z_]{2,40}$/.test(sp.unit ?? '') ? sp.unit! : '', kind: /^[a-z-]{2,20}$/.test(sp.kind ?? '') ? sp.kind! : '',
    backfill: sp.backfill === '1', day: /^\d{4}-\d{2}-\d{2}$/.test(sp.day ?? '') ? sp.day! : '',
  };
}

const LORDER = ['en', 'fr', 'es', 'pt'];

/**
 * The chart's days and the list's first (or next) whole days. A paper's language versions (one series number) are
 * folded into one item carrying all its languages; the English one leads when there is one.
 */
export function newPayload(lang: Lang, q: NewQuery, before: string | null = null): NewPayload {
  const end = (meta().latest_received ?? new Date().toISOString()).slice(0, 10);
  const ser = before ? null : newSeries(q, end);
  const { rows, next } = newRows(q, end, before);
  const names = lookup(rows.flatMap((r) => r.tp?.slice(0, 1) ?? []));
  const items: NewItem[] = [];
  const byGroup = new Map<string, NewItem>();
  for (const r of rows) {
    const day = (q.by === 'published' ? r.d : r.rc)?.slice(0, 10) ?? '';
    const it: NewItem = { s: r.s, t: r.t, d: r.d, rc: r.rc, day, k: r.k, f: r.f, u: r.u, no: r.no, a: r.a, an: r.an, tp: r.tp?.[0] != null ? label(names.get(r.tp[0]), lang) || null : null, g: r.g, langs: [r.lg], bf: r.bf };
    const had = byGroup.get(r.g);
    if (had) {
      if (!had.langs.includes(r.lg)) had.langs.push(r.lg);
      if (r.lg === 'en' && had.langs[0] !== 'en') Object.assign(had, { s: r.s, t: r.t, a: r.a, an: r.an, d: r.d });
      had.langs.sort((x, y) => LORDER.indexOf(x) - LORDER.indexOf(y));
      continue;
    }
    byGroup.set(r.g, it);
    items.push(it);
  }
  const days: Record<string, [string, number, number, number, number]> = {};
  for (const x of ser?.days ?? []) {
    const row = (days[x.d] ??= [x.d, 0, 0, 0, 0]);
    const i = FAMS_ALL.indexOf(x.f as Fam);
    if (i >= 0) (row as number[])[i + 1] += x.c;
  }
  return {
    end, q, days: Object.values(days).sort((a, b) => a[0].localeCompare(b[0])),
    units: (ser?.units ?? []).map((u) => [u.u, u.c]), kinds: (ser?.kinds ?? []).map((k) => [k.k, k.c]), backfill: ser?.backfill ?? 0,
    items, next,
  };
}
