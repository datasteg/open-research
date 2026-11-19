'use client';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { SearchOverlay } from './SearchOverlay';
import { ThemeToggle } from './ThemeToggle';
import { SiteMark } from './DatastegBar';
import type { Lang } from '@/lib/types';

const NAV: [string, string][] = [['grove', ''], ['topics', '/t'], ['jel', '/jel'], ['map', '/m'], ['people', '/a'], ['new', '/new'], ['about', '/about']];

/** The olive sprig: a stem, four leaves in the accent, one ripe olive. Drawn inline so it follows the theme. The masthead
 *  now draws it from the datasteg family icon set (lib/marks.json, the same drawing); this copy stays for other uses. */
export function Mark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 21 C8 16, 12 11, 20 4" stroke="var(--ink)" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <ellipse cx="7.6" cy="13.4" rx="1.6" ry="4.2" transform="rotate(-28 7.6 13.4)" fill="var(--accent)" />
      <ellipse cx="12.8" cy="14.6" rx="1.6" ry="4.2" transform="rotate(62 12.8 14.6)" fill="var(--accent)" />
      <ellipse cx="12.6" cy="7.4" rx="1.5" ry="4" transform="rotate(-22 12.6 7.4)" fill="var(--accent)" />
      <ellipse cx="17.4" cy="9.2" rx="1.4" ry="3.6" transform="rotate(66 17.4 9.2)" fill="var(--accent)" />
      <circle cx="9.6" cy="18.6" r="2.3" fill="var(--ripe)" />
    </svg>
  );
}

export function Masthead({ lang, labels }: { lang: Lang; labels: { nav: Record<string, string>; night: string; day: string; siteName: string } }) {
  const path = usePathname() ?? `/${lang}`;
  const search = useSearchParams()?.toString();
  const rest = path.replace(/^\/(en|ko)/, '');
  const other: Lang = lang === 'en' ? 'ko' : 'en';
  const active = (href: string) => (href === '' ? rest === '' || rest.startsWith('/g/') : rest === href || rest.startsWith(href + '/') || (href === '/t' && rest.startsWith('/k/')) || (href === '/m' && (rest.startsWith('/o/') || rest.startsWith('/c/'))));
  const setCookie = (l: Lang) => { document.cookie = `datasteg-lang=${l}; path=/; max-age=31536000; samesite=lax`; };
  return (
    <header className="or-masthead">
      <div className="or-wrap">
        <Link className="or-wordmark" href={`/${lang}`}><SiteMark id="open-research" size={24} className="ds-wordmark-mark" />{labels.siteName}</Link>
        <nav aria-label="Site">
          <ul className="or-nav">
            {NAV.map(([k, href]) => (
              <li key={k}><Link href={`/${lang}${href}`} aria-current={active(href) ? 'page' : undefined}>{labels.nav[k]}</Link></li>
            ))}
          </ul>
        </nav>
        <div className="or-masthead__end">
          <SearchOverlay lang={lang} />
          <span className="or-lang">
            {(['en', 'ko'] as Lang[]).map((l) => l === lang
              ? <span key={l} aria-current="true">{l.toUpperCase()}</span>
              : <a key={l} href={`/${other}${rest}${search ? `?${search}` : ''}`} hrefLang={other} onClick={() => setCookie(other)}>{l.toUpperCase()}</a>)}
          </span>
          <ThemeToggle labels={{ night: labels.night, day: labels.day }} />
        </div>
      </div>
    </header>
  );
}
