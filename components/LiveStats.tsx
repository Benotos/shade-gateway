'use client';

import { useEffect, useRef, useState } from 'react';
import h from './home.module.css';

type Stats = { ready: boolean; requests_total?: number; requests_24h?: number; tokens_total?: number; deposits_total?: number };

const compact = (n: number) => n.toLocaleString('en-US', { notation: n >= 100_000 ? 'compact' : 'standard', maximumFractionDigits: 1 });

// Counts from the previous value to the new one. Real numbers only; "—" until the backend answers.
function Count({ value }: { value?: number }) {
  const [shown, setShown] = useState<number | undefined>(undefined);
  const from = useRef(0);
  useEffect(() => {
    if (value === undefined) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setShown(value); from.current = value; return; }
    const a = from.current, b = value, t0 = performance.now(), dur = 1400;
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min((now - t0) / dur, 1);
      const e = 1 - Math.pow(1 - p, 4);
      setShown(Math.round(a + (b - a) * e));
      if (p < 1) raf = requestAnimationFrame(step); else from.current = b;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{shown === undefined ? '—' : compact(shown)}</>;
}

export default function LiveStats() {
  const [s, setS] = useState<Stats | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => fetch('/api/stats').then((r) => r.json()).then((j) => alive && setS(j)).catch(() => {});
    load();
    const t = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  const ready = Boolean(s?.ready);
  const items: [string, number | undefined][] = [
    ['Requests served', ready ? s?.requests_total : undefined],
    ['In the last 24 hours', ready ? s?.requests_24h : undefined],
    ['Tokens processed', ready ? s?.tokens_total : undefined],
    ['SOL deposits credited', ready ? s?.deposits_total : undefined],
  ];
  return (
    <div className={h.stats} aria-live="polite">
      <div className={h.statsLive}><span className={h.liveDot} /> Live from the gateway</div>
      <div className={h.statsRow}>
        {items.map(([label, value]) => (
          <div key={label} className={h.stat}>
            <div className={h.statNum}><Count value={value} /></div>
            <div className={h.statLabel}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}