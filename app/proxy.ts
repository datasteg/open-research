import { NextResponse, type NextRequest } from 'next/server';

const LANGS = ['en', 'ko'];
const COOKIE = 'datasteg-lang';

/** Korean if the browser lists Korean at all, otherwise English. */
function fromAcceptLanguage(header: string): string {
  const listed = header.split(',').map((part) => part.trim().toLowerCase().split(';')[0].split('-')[0]);
  return listed.includes('ko') ? 'ko' : 'en';
}

/** Every page lives under /en/ or /ko/. A path without one is redirected: the saved choice first, then the browser. */
export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const first = pathname.split('/')[1];
  if (LANGS.includes(first)) return NextResponse.next();
  const saved = req.cookies.get(COOKIE)?.value;
  const lang = saved && LANGS.includes(saved) ? saved : fromAcceptLanguage(req.headers.get('accept-language') ?? '');
  const url = req.nextUrl.clone();
  url.pathname = `/${lang}${pathname === '/' ? '' : pathname}`;
  url.search = search;
  return NextResponse.redirect(url, 307);
}

// /svc is the api service's internal surface (the datasteg API's service contract): no language redirect.
export const config = { matcher: ['/((?!health|feed|svc/|_next/|.*\\.[a-zA-Z0-9]+$).*)'] };
