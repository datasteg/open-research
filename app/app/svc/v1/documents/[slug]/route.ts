// /svc/v1 (the datasteg API's service contract): internal, reached only by the api service.
import { svcGuard, svcLang } from '@/lib/svc';
import { answer, documentView } from '@/lib/svcviews';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const denied = svcGuard(req); if (denied) return denied;
  const { slug } = await params;
  return answer(() => documentView(decodeURIComponent(slug), svcLang(new URL(req.url))));
}
