// GET /<lang>/a/index?v=<build>: the People search index (build.py people_index), brotli or gzip once per process.
import { brotliCompressSync, gzipSync, constants } from 'node:zlib';
import { meta, peopleIndex } from '@/lib/db';
import { isLang } from '@/lib/i18n';

export const dynamic = 'force-dynamic';
const packed = new Map<string, Buffer>();

export async function GET(req: Request, { params }: { params: Promise<{ lang: string }> }) {
  const { lang: l } = await params;
  const lang = isLang(l) ? l : 'en';
  const accept = req.headers.get('accept-encoding') ?? '';
  const enc = /\bbr\b/.test(accept) ? 'br' : /\bgzip\b/.test(accept) ? 'gzip' : 'identity';
  const key = `${lang}:${enc}`;
  if (!packed.has(key)) {
    const raw = Buffer.from(peopleIndex(lang));
    packed.set(key, enc === 'br' ? brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } }) : enc === 'gzip' ? gzipSync(raw, { level: 9 }) : raw);
  }
  const headers: Record<string, string> = {
    'content-type': 'application/json; charset=utf-8',
    // the URL carries the data build (?v=), so a new build is a new URL
    'cache-control': new URL(req.url).searchParams.get('v') === meta().built ? 'public, max-age=86400, immutable' : 'public, max-age=300',
    vary: 'accept-encoding',
  };
  if (enc !== 'identity') headers['content-encoding'] = enc;
  return new Response(new Uint8Array(packed.get(key)!), { headers });
}
