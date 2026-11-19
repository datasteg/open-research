'use client';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

const HOST = 'open-research.datasteg.com';
const ENDPOINT = 'https://stats.datasteg.com/count';

/** Counts a page view in GoatCounter (stats.datasteg.com, paths prefixed /or/)
 *  on every pathname change. One image request, no cookies, no script from another origin; only on the live host. */
export function PageCount() {
  const pathname = usePathname();
  const first = useRef(true);
  useEffect(() => {
    if (!pathname || window.location.hostname !== HOST) return;
    const referrer = first.current ? document.referrer : '';
    first.current = false;
    const timer = window.setTimeout(() => {
      const q = new URLSearchParams({ p: `/or${pathname}`, t: document.title, r: referrer, s: [screen.width, screen.height, window.devicePixelRatio || 1].join(','),
        b: navigator.webdriver ? '1' : '0', rnd: Math.random().toString(36).slice(2, 7) });
      new Image().src = `${ENDPOINT}?${q.toString()}`;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);
  return null;
}
