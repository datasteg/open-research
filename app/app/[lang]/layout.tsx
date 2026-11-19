import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import '../../../design/tokens.css';
import '../../../design/oliveto.css';
import '../site.css';
// the datasteg type (www's fonts, lib/ds-fonts.ts), loaded last: it points Oliveto's font tokens at Newsreader, Libre Franklin and JetBrains Mono
import '@/lib/ds-fonts';
import { DatastegBar } from '@/components/DatastegBar';
import { Footer } from '@/components/Footer';
import { Masthead } from '@/components/Masthead';
import { PageCount } from '@/components/PageCount';
import { isLang, t } from '@/lib/i18n';
import type { Lang } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l: Lang = isLang(lang) ? lang : 'en';
  return {
    metadataBase: new URL('https://open-research.datasteg.com'),
    // Not indexed for now; the header X-Robots-Tag says the same.
    robots: { index: false, follow: false },
    title: { default: `${t(l).tagline} · ${t(l).siteName}`, template: `%s — ${t(l).siteName}` },
    description: t(l).description,
    icons: { icon: '/icon.svg' },
    alternates: { languages: { en: '/en', ko: '/ko' } },
  };
}

// Before the first paint: the saved theme, else the system setting.
const THEME = `try{var t=localStorage.getItem('oliveto-theme');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t}catch(e){}`;

export default async function LangLayout({ children, params }: { children: ReactNode; params: Promise<{ lang: string }> }) {
  const { lang: raw } = await params;
  if (!isLang(raw)) notFound();
  const lang: Lang = raw;
  const L = t(lang);
  return (
    <html lang={lang} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME }} /></head>
      <body>
        <a className="or-skip" href="#main">{L.skip}</a>
        <DatastegBar lang={lang} site="open-research" />
        <Suspense><Masthead lang={lang} labels={{ nav: L.nav, night: L.night, day: L.day, siteName: L.siteName }} /></Suspense>
        <main id="main" tabIndex={-1}>{children}</main>
        <Footer lang={lang} />
        <Suspense><PageCount /></Suspense>
      </body>
    </html>
  );
}
