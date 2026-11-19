import Link from 'next/link';
import family from '@/lib/family.json';
import { day } from '@/lib/format';
import { t } from '@/lib/i18n';
import { meta } from '@/lib/db';
import type { Lang } from '@/lib/types';

type Site = { id: string; host: string; name: string; role: Record<Lang, string>; links: Record<string, string> };

/** The footer: what this page was built from (rule O4), the family of datasteg sites, the draft notice. */
export function Footer({ lang }: { lang: Lang }) {
  const L = t(lang);
  const m = meta();
  const f = family as unknown as { kicker: Record<Lang, string>; sites: Site[]; articles: Site };
  const sites = [...f.sites, f.articles].filter((s) => s.id !== 'open-research');
  return (
    <footer className="or-footer">
      <div className="or-wrap">
        <p>{lang === 'ko'
          ? '문서의 제목, 저자, 링크와 모델이 만든 요약·분류만 싣습니다. 본문과 PDF는 각 발행 기관의 페이지에 있습니다.'
          : 'Titles, authors, links and the model’s summaries and placements only. The documents themselves are on each publisher’s site.'}</p>
        <p className="or-footer__build">
          {L.release} {m.surface.release} · {L.built} {day(m.built.slice(0, 10), lang)}
        </p>
        <nav className="or-footer__links" aria-label={f.kicker[lang]}>
          <span>{f.kicker[lang]}:</span>
          {sites.map((s) => <a key={s.id} href={`${s.host}${(s.links.home ?? '/{lang}').replace('{lang}', lang)}`} title={s.role[lang]}>{s.name}</a>)}
          <Link href={`/${lang}/about`}>{L.nav.about}</Link>
          <a href="/feed">Atom</a>
        </nav>
        <p className="or-notice" style={{ maxWidth: 'none' }}>{L.draft}</p>
      </div>
    </footer>
  );
}
