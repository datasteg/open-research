// /svc/v1 (the datasteg API's service contract): internal, reached only by the api service.
import { svcGuard } from '@/lib/svc';
import { answer, documentsView } from '@/lib/svcviews';

export const dynamic = 'force-dynamic';

export function GET(req: Request) {
  const denied = svcGuard(req); if (denied) return denied;
  return answer(() => documentsView(new URL(req.url)));
}
