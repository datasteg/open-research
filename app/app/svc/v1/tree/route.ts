// /svc/v1 (the datasteg API's service contract): internal, reached only by the api service.
import { svcGuard, svcLang } from '@/lib/svc';
import { answer, treeView } from '@/lib/svcviews';

export const dynamic = 'force-dynamic';

export function GET(req: Request) {
  const denied = svcGuard(req); if (denied) return denied;
  return answer(() => treeView(svcLang(new URL(req.url))));
}
