/** Monochrome line icons for the eleven groves and the two concept lists (24 × 24, stroke in currentColor). */
const P: Record<string, string> = {
  monetary: 'M3 9.5 12 4l9 5.5M5.5 10v8M10 10v8M14 10v8M18.5 10v8M3 20.5h18',
  prices: 'M3.5 12.5V4.5a1 1 0 0 1 1-1h8l8 8.2-9.3 9.3zM8 8h.01',
  stability: 'M12 3 19.5 6v5.6c0 4.3-3.2 7.9-7.5 9.4-4.3-1.5-7.5-5.1-7.5-9.4V6zM8.8 12.2l2.2 2.2 4.3-4.6',
  markets: 'M3 20.5h18M6 16V9M6 7V5M12 17v-4M12 11V7M18 14V8M18 6V4M4.5 9h3v7h-3zM10.5 7h3v6h-3zM16.5 6h3v8h-3z',
  international: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z',
  public: 'M4 20.5h16M6 20v-7M10 20v-7M14 20v-7M18 20v-7M4.5 12.5h15M7.5 12.5a4.5 4.5 0 0 1 9 0M12 5v3',
  growth: 'M12 21v-9.5M12 11.5c0-4.2 2.8-6.8 7.5-7 0 4.4-2.9 7-7.5 7zM12 14c0-3.4-2.3-5.6-6.5-5.7 0 3.6 2.4 5.7 6.5 5.7z',
  households: 'M3.5 11 12 4l8.5 7M5.5 9.5V20h13V9.5M10 20v-5.5h4V20',
  tech: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM9.5 8v8M9.5 8h3.7a2 2 0 0 1 0 4H9.5h4.2a2 2 0 0 1 0 4H9.5M11 6.5V8M11 16v1.5',
  climate: 'M10 14.2V5.5a2 2 0 0 1 4 0v8.7a4 4 0 1 1-4 0zM12 10v6.5M17.5 5.5h3M17.5 9h2',
  methods: 'M17.5 5H6.5l6 7-6 7h11',
  'list-methods': 'M3.5 19.5h17M4 19c3.5 0 4.2-13.5 8-13.5S16.5 19 20 19M12 5.5v14',
  'list-data': 'M12 3.5c3.9 0 7 1.3 7 3s-3.1 3-7 3-7-1.3-7-3 3.1-3 7-3zM5 6.5v11c0 1.7 3.1 3 7 3s7-1.3 7-3v-11M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3',
};

export function GroveIcon({ k, size = 28 }: { k: string; size?: number }) {
  return (
    <svg className="or-icon" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[k] ?? P.growth} />
    </svg>
  );
}
