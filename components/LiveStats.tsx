'use client';

import { useEffect, useState } from 'react';
import h from './home.module.css';

type Stats = { ready: boolean; requests_total?: number; requests_24h?: number; tokens_total?: number; deposits_total?: number };

const compact = (n?: number) => (n === undefined ? '—' : n.toLocaleString('en-US', { notation: n >= 100_000 ? 'compact' : 'standard', maximumFractionDigits: 1 }));

// Real numbers from the database. Shows "—" until the backend is connected, never placeholder figures.
export default function LiveStats() {
  const [s, setS] = useState<Stats | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => fetch('/api/stats').then((r) => r.json()).then((j) => alive && setS(j)).catch(() => {});
    load();
    const t = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  const ready = s?.ready;
  const items = [
    ['Requests served', ready ? compact(s?.requests_total) : '—'],
    ['Last 24 hours', ready ? compact(s?.requests_24h) : '—'],
    ['Tokens processed', ready ? compact(s?.tokens_total) : '—'],
    ['SOL deposits', ready ? compact(s?.deposits_total) : '—'],
  ];
  return (
    <div className={h.stats} aria-live="polite">
      {items.map(([label, value]) => (
        <div key={label} className={h.stat}>
          <div className={h.statNum}>{value}</div>
          <div className={h.statLabel}>{label}</div>
        </div>
      ))}
    </div>
  );
}
