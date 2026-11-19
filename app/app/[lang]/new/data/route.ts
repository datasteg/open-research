// GET /<lang>/new/data?by=&range=&fam=&unit=&kind=&backfill=&day=&before=: the New page's chart and list (lib/newboard.ts).
import { newPayload, parseNew } from '@/lib/newboard';
import { isLang } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ lang: string }> }) {
  const { lang: l } = await params;
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const before = /^\d{4}-\d{2}-\d{2}$/.test(sp.before ?? '') ? sp.before : null;
  return Response.json(newPayload(isLang(l) ? l : 'en', parseNew(sp), before), { headers: { 'cache-control': 'public, max-age=300' } });
}
