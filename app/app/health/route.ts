// GET /health: the container healthcheck (ds-deploy waits for 200). It names the data build and the atlas release.
import { meta } from '@/lib/db';

export const dynamic = 'force-dynamic';

export function GET() {
  let data: string | null = null, release: string | null = null;
  try { const m = meta(); data = m.built; release = m.surface.release; } catch { data = null; }
  return Response.json(
    { status: data ? 'ok' : 'no-data', service: 'open-research', version: process.env.APP_VERSION ?? 'dev', built: process.env.BUILD_TIME, data, release, time: new Date().toISOString() },
    { status: data ? 200 : 503, headers: { 'cache-control': 'no-store' } },
  );
}
