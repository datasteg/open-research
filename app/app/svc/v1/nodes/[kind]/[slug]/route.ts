// /svc/v1 (the datasteg API's service contract): internal, reached only by the api service.
import { svcGuard, svcLang } from '@/lib/svc';
import { answer, nodeView } from '@/lib/svcviews';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ kind: string; slug: string }> }) {
  const denied = svcGuard(req); if (denied) return denied;
  const { kind, slug } = await params;
  return answer(() => nodeView(decodeURIComponent(kind), decodeURIComponent(slug), svcLang(new URL(req.url))));
}
