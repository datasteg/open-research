// GET /feed: Atom, the latest 50 documents the archive received, linked to their English pages.
import { received } from '@/lib/db';

export const dynamic = 'force-dynamic';
const SITE = 'https://open-research.datasteg.com';
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function GET() {
  const { rows, received: rec } = received(50);
  const updated = (rec[0] ?? new Date().toISOString().slice(0, 10)) + 'T00:00:00Z';
  const entries = rows.map((r, i) => `<entry><id>${SITE}/en/p/${esc(r.s)}</id><title>${esc(r.t ?? '')}</title><link href="${SITE}/en/p/${esc(r.s)}"/><updated>${rec[i]}T00:00:00Z</updated><author><name>${esc(r.a.join(', ') || r.u)}</name></author></entry>`).join('');
  const xml = `<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom"><id>${SITE}/feed</id><title>open-research: new in the atlas</title><link href="${SITE}/en/new"/><updated>${updated}</updated>${entries}</feed>`;
  return new Response(xml, { headers: { 'content-type': 'application/atom+xml; charset=utf-8', 'cache-control': 'public, max-age=600' } });
}
