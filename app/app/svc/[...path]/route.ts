// /svc/v1 (the datasteg API's service contract): any other /svc path answers the contract's JSON 404, never the site's HTML page.
import { svcError, svcGuard } from '@/lib/svc';

export const dynamic = 'force-dynamic';

export function GET(req: Request) {
  const denied = svcGuard(req); if (denied) return denied;
  return svcError(404, 'not-found', 'Not found', 'No such open-research view. GET /svc/v1/manifest lists the views.');
}
