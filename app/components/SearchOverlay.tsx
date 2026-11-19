'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { Lang } from '@/lib/types';

type Hit = { kind: string; label: string; n: number; href: string };
type Doc = { title: string; date: string | null; href: string };
type Res = { q: string; total: number; nodes: Hit[]; docs: Doc[] };

const KIND: Record<Lang, Record<string, string>> = {
  en: { grove: 'Grove', topic: 'Topic', concept: 'Concept', jel: 'JEL', org: 'Organisation', person: 'Person', place: 'Place' },
  ko: { grove: '숲', topic: '주제', concept: '개념', jel: 'JEL', org: '기관', person: '사람', place: '지역' },
};
const TXT = {
  en: { open: 'Search (Ctrl+K)', label: 'Search the atlas', ph: 'Titles, people, organisations, concepts', pages: 'Pages', docs: 'Documents', all: 'All results for', none: 'No match. Try fewer or shorter words.', close: 'Close', hint: '↑↓ to move · Enter to open · Esc to close' },
  ko: { open: '검색 (Ctrl+K)', label: '지도 검색', ph: '제목, 사람, 기관, 개념', pages: '페이지', docs: '문서', all: '전체 결과 보기:', none: '맞는 결과가 없습니다. 단어를 줄이거나 더 짧게 입력해 주십시오.', close: '닫기', hint: '↑↓ 이동 · Enter 열기 · Esc 닫기' },
};

/**
 * The global search: a magnifier in the masthead (every page) and ⌘K / Ctrl+K open a modal <dialog> with suggestions
 * as you type (pages first, then documents, from /<lang>/search/q). Enter opens the highlighted suggestion, or the full
 * results page (/<lang>/search?q=) when none is highlighted. Without JavaScript the button does nothing and /search stays.
 */
export function SearchOverlay({ lang }: { lang: Lang }) {
  const T = TXT[lang];
  const router = useRouter();
  const dlg = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [res, setRes] = useState<Res | null>(null);
  const [sel, setSel] = useState(-1);
  const [mac, setMac] = useState(false);

  const show = () => { const d = dlg.current; if (d && !d.open) { d.showModal(); setTimeout(() => input.current?.select(), 0); } };
  const hide = () => dlg.current?.close();

  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform));
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (dlg.current?.open) hide(); else show(); }
      else if (e.key === '/' && !dlg.current?.open && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target as HTMLElement)?.isContentEditable)) { e.preventDefault(); show(); }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);

  useEffect(() => {
    const s = q.trim();
    if (s.length < 2) { setRes(null); setSel(-1); return; }
    const ac = new AbortController();
    const id = setTimeout(() => {
      fetch(`/${lang}/search/q?q=${encodeURIComponent(s)}`, { signal: ac.signal }).then((r) => (r.ok ? r.json() : null)).then((d: Res | null) => { if (d) { setRes(d); setSel(-1); } }).catch(() => {});
    }, 140);
    return () => { clearTimeout(id); ac.abort(); };
  }, [q, lang]);

  const items: { href: string }[] = res ? [...res.nodes, ...res.docs] : [];
  const go = (href: string) => { hide(); router.push(href); };
  const submit = () => { const s = q.trim(); if (sel >= 0 && items[sel]) go(items[sel].href); else if (s) go(`/${lang}/search?q=${encodeURIComponent(s)}`); };
  const fmt = new Intl.NumberFormat(lang === 'ko' ? 'ko-KR' : 'en-GB');

  return (
    <>
      <button type="button" className="or-iconbtn or-searchbtn" onClick={show} aria-label={T.open} title={T.open} aria-haspopup="dialog">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <kbd>{mac ? '⌘K' : 'Ctrl K'}</kbd>
      </button>
      <dialog ref={dlg} className="or-sdlg" aria-label={T.label} onClick={(e) => { if (e.target === e.currentTarget) hide(); }} onClose={() => setSel(-1)}>
        <form role="search" action={`/${lang}/search`} onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <label className="or-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input ref={input} name="q" type="search" value={q} autoComplete="off" placeholder={T.ph} aria-label={T.label}
              role="combobox" aria-expanded={!!items.length} aria-controls="or-sdlg-list" aria-activedescendant={sel >= 0 ? `or-sdlg-${sel}` : undefined}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(items.length - 1, s + 1)); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(-1, s - 1)); }
              }} />
          </label>
          <button type="button" className="or-btn or-btn--sm" onClick={hide}>{T.close}</button>
        </form>
        <div id="or-sdlg-list" role="listbox" className="or-sdlg__list">
          {res && res.nodes.length ? <p className="or-sdlg__h">{T.pages}</p> : null}
          {res?.nodes.map((h, i) => (
            <a key={h.href} id={`or-sdlg-${i}`} role="option" aria-selected={sel === i} href={h.href} onClick={(e) => { e.preventDefault(); go(h.href); }} onPointerEnter={() => setSel(i)}>
              <span className="k">{KIND[lang][h.kind] ?? h.kind}</span><span className="l">{h.label}</span><span className="n">{fmt.format(h.n)}</span>
            </a>
          ))}
          {res && res.docs.length ? <p className="or-sdlg__h">{T.docs}</p> : null}
          {res?.docs.map((d, j) => {
            const i = res.nodes.length + j;
            return (
              <a key={d.href} id={`or-sdlg-${i}`} role="option" aria-selected={sel === i} href={d.href} lang="en" onClick={(e) => { e.preventDefault(); go(d.href); }} onPointerEnter={() => setSel(i)}>
                <span className="k">{d.date ? d.date.slice(0, 4) : ''}</span><span className="l">{d.title}</span><span className="n" />
              </a>
            );
          })}
          {res && !items.length ? <p className="or-muted">{T.none}</p> : null}
        </div>
        <div className="or-sdlg__foot">
          {res && res.total ? (
            <a className="or-sdlg__all" href={`/${lang}/search?q=${encodeURIComponent(q.trim())}`} onClick={(e) => { e.preventDefault(); go(`/${lang}/search?q=${encodeURIComponent(q.trim())}`); }}>
              {T.all} “{q.trim()}” · {fmt.format(res.total)} →
            </a>
          ) : null}
          <p className="or-sdlg__hint">{T.hint}</p>
        </div>
      </dialog>
    </>
  );
}
