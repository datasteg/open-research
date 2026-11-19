'use client';
import { useRef, useState, type ReactNode } from 'react';

/**
 * Tooltips for the grove trees: any [data-tip] link shows its text on hover or focus (lines split at \n, the first
 * in bold), at once, not after the browser's title delay. On a touch screen
 * the first tap shows the tooltip and the second tap follows the link.
 */
export function GroveTip({ children }: { children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; text: string; el: Element } | null>(null);
  const place = (el: Element) => {
    const b = box.current!.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    // keep a 300 px tooltip inside the orchard
    const x = Math.max(150, Math.min(b.width - 150, r.left + r.width / 2 - b.left));
    setTip({ x, y: r.top - b.top, text: el.getAttribute('data-tip') ?? '', el });
  };
  const target = (e: { target: EventTarget | null }) => (e.target as Element | null)?.closest?.('[data-tip]') ?? null;
  return (
    <div ref={box} className="or-grovetip"
      onPointerOver={(e) => { const el = target(e); if (el && e.pointerType !== 'touch') place(el); }}
      onPointerOut={(e) => { if (e.pointerType !== 'touch' && !target({ target: e.relatedTarget })) setTip(null); }}
      onFocus={(e) => { const el = target(e); if (el) place(el); }}
      onBlur={() => setTip(null)}
      onClickCapture={(e) => {
        const el = target(e);
        const touch = (e.nativeEvent as PointerEvent).pointerType === 'touch';
        // stop here, before the link's own click handler can navigate: the first tap only shows the name
        if (el && touch && tip?.el !== el) { e.preventDefault(); e.stopPropagation(); place(el); }
      }}>
      {children}
      {tip ? (
        <div className="or-grovetip__tip" style={{ left: tip.x, top: tip.y }} role="status">
          {tip.text.split('\n').map((line, i) => (i ? <span key={i}>{line}</span> : <b key={i}>{line}</b>))}
        </div>
      ) : null}
    </div>
  );
}
