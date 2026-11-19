// /svc/v1 (the datasteg API's service contract): internal, reached only by the api service.
import { svcGuard, svcLang } from '@/lib/svc';
import { answer, economyHook } from '@/lib/svcviews';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ iso3: string }> }) {
  const denied = svcGuard(req); if (denied) return denied;
  const { iso3 } = await params;
  return answer(() => economyHook(decodeURIComponent(iso3), svcLang(new URL(req.url))));
}
