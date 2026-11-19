// GET /<lang>/m/e/<ISO3>: one economy's panel on the map (build.py review2_stats), names in the page language.
import { econ, lookup, meta } from '@/lib/db';
import { isLang, label } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ lang: string; iso: string }> }) {
  const { lang: l, iso } = await params;
  const lang = isLang(l) ? l : 'en';
  const e = /^[A-Z]{3}$/.test(iso) ? econ(iso) : null;
  if (!e) return Response.json({ error: 'not found' }, { status: 404 });
  const names = lookup([...e.win.flatMap((w) => [...w.orgs.map((o) => o[0]), ...w.topics.map((t) => t[0])]), ...e.auth.map((a) => a[0])]);
  const nm = (id: number) => { const n = names.get(id); return n ? { slug: n.slug, label: label(n, lang) } : null; };
  const out = {
    years: e.years,
    ref: meta().ref,
    auth: e.auth.map(([id, n]) => ({ ...nm(id), n })).filter((x) => x.slug),
    win: e.win.map((w) => ({
      s: w.s, w: w.w, dom: w.dom, for: w.for, intl: w.intl, unk: w.unk, out: w.out,
      orgs: w.orgs.map(([id, n, tag]) => ({ ...nm(id), n, tag })).filter((x) => x.slug),
      topics: w.topics.map(([id, n, r]) => ({ ...nm(id), n, r })).filter((x) => x.slug),
    })),
  };
  return Response.json(out, { headers: { 'cache-control': 'public, max-age=600' } });
}
