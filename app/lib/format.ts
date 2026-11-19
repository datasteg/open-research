import type { Lang } from './types';

export const num = (n: number | null | undefined, l: Lang = 'en') => (n == null ? '–' : new Intl.NumberFormat(l === 'ko' ? 'ko-KR' : 'en-GB').format(n));

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 2 Sep 2025 / 2025년 9월 2일; a year-only or month-only date stays as precise as it is. */
export function day(iso: string | null | undefined, l: Lang): string {
  if (!iso) return '–';
  const [y, m, d] = iso.slice(0, 10).split('-').map((x) => parseInt(x, 10));
  if (!m) return l === 'ko' ? `${y}년` : `${y}`;
  if (!d || (d === 1 && iso.length <= 7)) return l === 'ko' ? `${y}년 ${m}월` : `${MONTHS[m - 1]} ${y}`;
  return l === 'ko' ? `${y}년 ${m}월 ${d}일` : `${d} ${MONTHS[m - 1]} ${y}`;
}

export const year = (iso: string | null | undefined) => (iso ? iso.slice(0, 4) : '–');

export const pct = (x: number, l: Lang = 'en') => `${new Intl.NumberFormat(l === 'ko' ? 'ko-KR' : 'en-GB', { maximumFractionDigits: 1 }).format(x * 100)}%`;
