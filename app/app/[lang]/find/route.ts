// GET /<lang>/find?q=: the Topics filter box's matches (groves, topics, concepts, methods, data sources) as JSON.
import { findTopics } from '@/lib/db';
import { href } from '@/components/ui';
import { isLang, label } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ lang: string }> }) {
  const { lang: l } = await params;
  const lang = isLang(l) ? l : 'en';
  const q = (new URL(req.url).searchParams.get('q') ?? '').slice(0, 80);
  const rows = q.trim().length < 2 ? [] : findTopics(q, 12);
  const out = rows.map((n) => ({ href: href(lang, n), label: label(n, lang), kind: n.kind === 'concept' ? (n.sub === 'method' || n.sub === 'data' ? n.sub : 'concept') : n.kind, n: n.n }));
  return Response.json(out, { headers: { 'cache-control': 'public, max-age=300' } });
}
