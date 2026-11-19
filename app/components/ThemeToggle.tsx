'use client';
import { useEffect, useState } from 'react';

export function ThemeToggle({ labels }: { labels: { night: string; day: string } }) {
  const [dark, setDark] = useState<boolean | null>(null);
  useEffect(() => {
    const d = document.documentElement.dataset.theme;
    setDark(d ? d === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches);
  }, []);
  const flip = () => {
    const next = !dark;
    document.documentElement.dataset.theme = next ? 'dark' : 'light';
    try { localStorage.setItem('oliveto-theme', next ? 'dark' : 'light'); } catch { /* ignore */ }
    setDark(next);
  };
  return (
    <button type="button" className="or-iconbtn" onClick={flip} aria-label={dark ? labels.day : labels.night} title={dark ? labels.day : labels.night}>
      {dark ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" /></svg>
      )}
    </button>
  );
}
