// GET /<lang>/search/q?q=: suggestions for the global search overlay (components/SearchOverlay.tsx): the best pages
// (groves, topics, concepts, JEL, organisations, people, places) and the best documents, from the same FTS5 index as /search.
import { search } from '@/lib/db';
import { isLang, label } from '@/lib/i18n';

export const dynamic = 'force-dynamic';
const KIND_PATH: Record<string, string> = { grove: 'g', topic: 't', concept: 'k', jel: 'jel', org: 'o', person: 'a', place: 'c' };

export async function GET(req: Request, { params }: { params: Promise<{ lang: string }> }) {
  const { lang: l } = await params;
  const lang = isLang(l) ? l : 'en';
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim().slice(0, 120);
  const res = q.length >= 2 ? search(q, 6) : { nodes: [], rows: [], total: 0 };
  const body = {
    q,
    total: res.total,
    nodes: res.nodes.slice(0, 8).map((n) => ({ kind: n.kind, label: label(n, lang), n: n.n, href: `/${lang}/${KIND_PATH[n.kind] ?? n.kind}/${n.slug}` })),
    docs: res.rows.map((r) => ({ title: r.t, date: r.d, href: `/${lang}/p/${encodeURIComponent(r.s)}` })),
  };
  return Response.json(body, { headers: { 'cache-control': 'public, max-age=300' } });
}
